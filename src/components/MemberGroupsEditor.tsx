import { useRef, useState } from 'react'
import {
  MAX_GROUP_NAME_LENGTH,
  MAX_MEMBER_GROUPS,
  createGroupId,
  validateGroupName,
  type MemberGroup
} from '../data/roster'
import { useDismissOnBack } from '../hooks/useDismissOnBack'
import { useDialogFocus } from '../hooks/useDialogFocus'

interface MemberGroupsEditorProps {
  groups: MemberGroup[]
  /** 分组 id → 当前草稿里的人数（不按已保存的花名册算，跟着表格实时变） */
  counts: Record<string, number>
  onSaveGroup: (group: MemberGroup) => void
  onRemoveGroup: (groupId: string) => void
  onNotice: (text: string) => void
  /** 设置页的新建入口在 tab 条上，管理区里不再重复一个「新建分组」 */
  showAdd?: boolean
}

/**
 * 分组管理区：改名即时生效，删除只把组内成员变成未分组，不删人。
 *
 * 组名改动与班序同一套节奏：改的是「部门叫什么」，不该还要回到成员表点保存。
 * 删除不用班序那种「输入名字才放行」的重确认，只说清会影响几个人。
 */
export function MemberGroupsEditor({
  groups,
  counts,
  onSaveGroup,
  onRemoveGroup,
  onNotice,
  showAdd = true
}: MemberGroupsEditorProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  /** 只存 id：改名后马上点删除时，弹层标题不会还挂着旧名字 */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const pendingDelete = pendingDeleteId ? groups.find(group => group.id === pendingDeleteId) : undefined
  /** 回车失焦与 Esc 失焦走的是同一条 onBlur：Esc 要撤销，不能被当成提交 */
  const cancelledRef = useRef<string | null>(null)
  const dialogRef = useDialogFocus<HTMLElement>()
  useDismissOnBack(Boolean(pendingDeleteId), () => setPendingDeleteId(null))

  const atLimit = groups.length >= MAX_MEMBER_GROUPS
  const usageOf = (groupId: string) => counts[groupId] ?? 0

  function dropDraft(groupId: string) {
    setDrafts(current => {
      if (!(groupId in current)) return current
      const next = { ...current }
      delete next[groupId]
      return next
    })
  }

  /** 失焦 / 回车时提交；非法就退回原名，并把原因说出来 */
  function commitName(group: MemberGroup) {
    const draft = drafts[group.id]
    dropDraft(group.id)

    if (cancelledRef.current === group.id) {
      cancelledRef.current = null
      return
    }
    if (draft === undefined) return

    const value = draft.trim()
    if (!value) {
      onNotice('组名不能为空，已恢复原名。')
      return
    }
    if (value === group.name) return

    const error = validateGroupName(value, groups, group.id)
    if (error) {
      onNotice(error)
      return
    }

    onSaveGroup({ id: group.id, name: value })
    onNotice(`已把分组改名为「${value}」。`)
  }

  function addGroup() {
    const name = newName.trim()
    const error = validateGroupName(name, groups)
    if (error) {
      onNotice(error)
      return
    }

    onSaveGroup({ id: createGroupId(), name })
    onNotice(`已新建分组「${name}」。`)
    setNewName('')
    setAdding(false)
  }

  function confirmDelete() {
    if (!pendingDeleteId) return
    onRemoveGroup(pendingDeleteId)
    setPendingDeleteId(null)
  }

  return (
    <div className="group-block">
      {groups.length === 0 ? (
        <p className="member-editor-empty">还没有分组。用 tab 条末尾的「新建分组」开始。</p>
      ) : (
        <div className="group-rows">
          {groups.map((group, index) => {
            const usage = usageOf(group.id)
            return (
              <div className="group-row" key={group.id}>
                <input
                  aria-label={`第 ${index + 1} 个分组的名称`}
                  autoComplete="off"
                  className="input group-name-input"
                  maxLength={MAX_GROUP_NAME_LENGTH}
                  name={`group-name-${index}`}
                  placeholder="组名，例如部门名"
                  spellCheck={false}
                  value={drafts[group.id] ?? group.name}
                  onBlur={() => commitName(group)}
                  onChange={event => setDrafts(current => ({ ...current, [group.id]: event.target.value }))}
                  onFocus={() => {
                    // 上一次 Esc 留下的撤销标记不能吃掉下一次编辑
                    if (cancelledRef.current === group.id) cancelledRef.current = null
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.blur()
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelledRef.current = group.id
                      dropDraft(group.id)
                      event.currentTarget.blur()
                    }
                  }}
                />
                <span className={`group-usage${usage === 0 ? ' is-empty' : ''}`}>
                  {usage > 0 ? `${usage} 人` : '未使用'}
                </span>
                <button className="btn btn-quiet" type="button" onClick={() => setPendingDeleteId(group.id)}>
                  删除
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showAdd ? (
        adding ? (
          <form
            className="group-add"
            onSubmit={event => {
              event.preventDefault()
              addGroup()
            }}
          >
            <input
              aria-label="新分组的名称"
              autoComplete="off"
              autoFocus
              className="input"
              maxLength={MAX_GROUP_NAME_LENGTH}
              name="group-new-name"
              placeholder="组名，例如部门名"
              spellCheck={false}
              value={newName}
              onChange={event => setNewName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setNewName('')
                  setAdding(false)
                }
              }}
            />
            <button className="btn btn-primary" type="submit">添加</button>
            <button
              className="btn btn-quiet"
              type="button"
              onClick={() => {
                setNewName('')
                setAdding(false)
              }}
            >
              取消
            </button>
          </form>
        ) : (
          <button
            className="btn btn-add"
            disabled={atLimit}
            title={atLimit ? `分组最多 ${MAX_MEMBER_GROUPS} 个，删掉一个再加` : undefined}
            type="button"
            onClick={() => setAdding(true)}
          >
            新建分组
          </button>
        )
      ) : null}

      {showAdd && atLimit ? (
        <p className="settings-hint">分组已达 {MAX_MEMBER_GROUPS} 个上限，删掉一个才能再加。</p>
      ) : null}

      {pendingDelete ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={() => setPendingDeleteId(null)}>
          <section
            aria-label="删除分组"
            aria-modal="true"
            className="dialog dialog-narrow"
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
            onMouseDown={event => event.stopPropagation()}
          >
            <header className="dialog-head">
              <div>
                <h2 className="dialog-title">删除分组「{pendingDelete.name}」？</h2>
                <p className="dialog-sub">此操作不可撤销</p>
              </div>
              <button className="btn btn-quiet" type="button" onClick={() => setPendingDeleteId(null)}>
                关闭
              </button>
            </header>

            <div className="dialog-body">
              {usageOf(pendingDelete.id) > 0 ? (
                <p className="settings-hint">
                  组内 {usageOf(pendingDelete.id)} 位成员会变为「未分组」，成员本身与其改班记录都不会被删除。
                </p>
              ) : (
                <p className="settings-hint">这个分组里还没有成员，删除后只影响分组本身。</p>
              )}
            </div>

            <footer className="dialog-foot">
              <span />
              <div className="dialog-actions">
                <button className="btn" type="button" onClick={() => setPendingDeleteId(null)}>取消</button>
                <button className="btn btn-danger" type="button" onClick={confirmDelete}>删除分组</button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  )
}
