import { useEffect, useRef, useState, type WheelEvent } from 'react'
import {
  MAX_GROUP_NAME_LENGTH,
  MAX_MEMBER_GROUPS,
  validateGroupName,
  type MemberGroup
} from '../data/roster'
import { useDismissOnBack } from '../hooks/useDismissOnBack'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UNGROUPED_MEMBERS } from './MemberRowsEditor'
import { Input } from '@/components/ui/input'

interface MemberGroupTabsProps {
  groups: MemberGroup[]
  /** null = 全部；UNGROUPED_MEMBERS = 未分组；其余为分组 id */
  activeTab: string | null
  allCount: number
  ungroupedCount: number
  /** 分组 id → 草稿人数 */
  counts: Record<string, number>
  managing: boolean
  onSelect: (tab: string | null) => void
  onCreate: (name: string) => void
  onToggleManage: () => void
  onNotice: (text: string) => void
}

/**
 * 成员卡片顶部的分组 tab。
 *
 * tab 只负责「看谁、加谁」；分组改名/删除收在右侧「分组管理」里，
 * 避免每个 tab 都挂一串小按钮，点错就改掉了组名。
 *
 * 这里用 aria-pressed 的按钮组而不是 role="tablist"：
 * 视觉上像 tab，交互仍是「点一下过滤列表」，与矩阵页的分组胶囊同一套语义。
 */
export function MemberGroupTabs({
  groups,
  activeTab,
  allCount,
  ungroupedCount,
  counts,
  managing,
  onSelect,
  onCreate,
  onToggleManage,
  onNotice
}: MemberGroupTabsProps) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  // 弹层开关就是 creating
  const dialogOpen = creating
  useDismissOnBack(creating, () => setCreating(false))

  /**
   * 分组一多，tab 条横向溢出。触屏可以直接左右滑，鼠标没有这个手势 ——
   * 把纵向滚轮转成横滚，滚到两端时把事件交还给页面，不劫持整页滚动。
   */
  function onTabWheel(event: WheelEvent<HTMLDivElement>) {
    const strip = tabsRef.current
    if (!strip) return
    const max = strip.scrollWidth - strip.clientWidth
    if (max <= 0) return
    const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX
    const next = strip.scrollLeft + delta
    if ((next <= 0 && strip.scrollLeft <= 0) || (next >= max && strip.scrollLeft >= max)) return
    event.preventDefault()
    strip.scrollLeft = Math.min(max, Math.max(0, next))
  }

  /** 选中的分组若在可视区之外，自动滚进来，别让它被裁掉 */
  useEffect(() => {
    const strip = tabsRef.current
    const active = strip?.querySelector<HTMLElement>('.member-tab.is-on')
    if (!strip || !active) return
    const stripRect = strip.getBoundingClientRect()
    const tabRect = active.getBoundingClientRect()
    if (tabRect.left < stripRect.left) strip.scrollLeft -= stripRect.left - tabRect.left
    else if (tabRect.right > stripRect.right) strip.scrollLeft += tabRect.right - stripRect.right
  }, [activeTab, groups.length])

  // Radix 打开后会把焦点给第一个可聚焦元素，这里显式把它按在输入框上
  useEffect(() => {
    if (creating) nameRef.current?.focus()
  }, [creating])

  const atLimit = groups.length >= MAX_MEMBER_GROUPS
  // 没有分组时「全部」就是唯一的块，不再多一个同内容的「未分组」tab
  const showUngrouped = groups.length > 0 && (ungroupedCount > 0 || activeTab === UNGROUPED_MEMBERS)

  function submit() {
    const value = name.trim()
    const error = validateGroupName(value, groups)
    if (error) {
      onNotice(error)
      return
    }
    onCreate(value)
    setName('')
    setCreating(false)
  }

  return (
    <>
      <div className="member-tabs-row">
        <div className="member-tabs" role="group" aria-label="成员分组" ref={tabsRef} onWheel={onTabWheel}>
          <button
            aria-pressed={activeTab === null}
            className={`member-tab${activeTab === null ? ' is-on' : ''}`}
            type="button"
            onClick={() => onSelect(null)}
          >
            <span>全部</span>
            <span className="member-tab-count">{allCount}</span>
          </button>

          {groups.map(group => (
            <button
              aria-pressed={activeTab === group.id}
              className={`member-tab${activeTab === group.id ? ' is-on' : ''}`}
              key={group.id}
              type="button"
              onClick={() => onSelect(group.id)}
            >
              <span>{group.name}</span>
              <span className="member-tab-count">{counts[group.id] ?? 0}</span>
            </button>
          ))}

          {showUngrouped ? (
            <button
              aria-pressed={activeTab === UNGROUPED_MEMBERS}
              className={`member-tab${activeTab === UNGROUPED_MEMBERS ? ' is-on' : ''}`}
              type="button"
              onClick={() => onSelect(UNGROUPED_MEMBERS)}
            >
              <span>未分组</span>
              <span className="member-tab-count">{ungroupedCount}</span>
            </button>
          ) : null}
        </div>

        <div className="member-tabs-actions">
          <button
            className="member-tab-action"
            disabled={atLimit}
            title={atLimit ? `分组最多 ${MAX_MEMBER_GROUPS} 个，删掉一个再加` : undefined}
            type="button"
            onClick={() => setCreating(true)}
          >
            + 新建分组
          </button>
          {groups.length > 0 ? (
            <button
              aria-expanded={managing}
              className="member-tab-action"
              type="button"
              onClick={onToggleManage}
            >
              {managing ? '收起管理' : '分组管理'}
            </button>
          ) : null}
        </div>
      </div>

      {creating ? (
        <Dialog open={dialogOpen} onOpenChange={next => { if (!next) setCreating(false) }}>
          <DialogContent aria-label="新建分组" className="gap-0 p-0 sm:max-w-[380px]">
            <DialogHeader className="dialog-head p-4">
              <div>
                <DialogTitle className="dialog-title">新建分组</DialogTitle>
                <DialogDescription className="dialog-sub">组名可自定，例如部门名</DialogDescription>
              </div>
            </DialogHeader>

            <div className="dialog-body">
              <label className="confirm-label">
                <span>组名</span>
                <Input
                  aria-label="新分组的名称"
                  autoComplete="off"
                  autoFocus
                  maxLength={MAX_GROUP_NAME_LENGTH}
                  name="group-new-name"
                  placeholder="例如：生产部"
                  ref={nameRef}
                  spellCheck={false}
                  value={name}
                  onChange={event => setName(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      submit()
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      setCreating(false)
                    }
                  }}
                />
              </label>
              <p className="settings-hint">
                组名最多 {MAX_GROUP_NAME_LENGTH} 个字，分组最多 {MAX_MEMBER_GROUPS} 个。
              </p>
            </div>

            <DialogFooter className="mx-0 mb-0">
              <Button variant="outline" onClick={() => setCreating(false)}>取消</Button>
              <Button onClick={submit}>创建</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
