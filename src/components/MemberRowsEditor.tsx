import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createMemberId, type Member, type MemberGroup } from '../data/roster'
import { Select } from './Select'
import { Input } from '@/components/ui/input'

/** 「未分组」不是真实分组，用哨兵值表达 tab/筛选条件 */
export const UNGROUPED_MEMBERS = '__ungrouped__'

export interface MemberRow {
  key: string
  id: string
  name: string
  /** 空串 = 未分组 */
  groupId: string
  patternId: string
  position: string
}

/** 班序下拉的一项。内置与自定义由调用方决定怎么分组传入 */
export interface PatternOption {
  id: string
  name: string
  builtin: boolean
}

export function toRows(members: Member[]): MemberRow[] {
  return members.map(member => ({
    key: member.id,
    id: member.id,
    name: member.name,
    groupId: member.groupId ?? '',
    patternId: member.patternId,
    position: member.position ?? ''
  }))
}

export function createRow(patternId = '4F', groupId = ''): MemberRow {
  return { key: createMemberId(), id: createMemberId(), name: '', groupId, patternId, position: '' }
}

export function fromRows(rows: MemberRow[]): Member[] {
  return rows
    .filter(row => row.name.trim())
    .map(row => {
      const position = row.position.trim()
      return {
        id: row.id,
        name: row.name.trim(),
        patternId: row.patternId,
        ...(position ? { position } : {}),
        ...(row.groupId ? { groupId: row.groupId } : {})
      }
    })
}

interface MemberRowsEditorProps {
  rows: MemberRow[]
  /** 可选班序，内置在前、自定义在后；决定下拉里能选什么 */
  patterns: PatternOption[]
  /** 可选分组；未分组的人显示「未分组」 */
  groups: MemberGroup[]
  /**
   * 只渲染这个分组的人；不传 = 全部。
   * 传 `UNGROUPED_MEMBERS` 表示只看未分组的人。
   */
  visibleGroup?: string
  /**
   * 是否显示「分组」列。只在「全部」tab 为 true；
   * 其它 tab 的归属由 tab 本身表达，再显示一列同组名是重复信息。
   */
  showGroupField?: boolean
  /** 由调用方接管「添加成员」（设置页要按当前 tab 落组）；不传时保持内部追加（向导） */
  onAdd?: () => void
  /** 当前 tab 没有成员时的空态文案 */
  emptyText?: string
  onChange: (rows: MemberRow[]) => void
  /** 本人的 memberId：这一行只读，改名/换班序要去「个人信息」 */
  selfId?: string
  /** 排序模式：卡片压成 44px 紧凑行，只有把手能拖（与小程序同一套） */
  sorting?: boolean
  /**
   * 提供时在「添加成员」旁多一个「从 Excel 导入」。
   * 真正选文件、解析、落盘都在调用方（设置页），这里只出按钮。
   */
  onImport?: () => void
}

/**
 * 成员表：姓名 + 分组（只在「全部」显示）+ 班序 + 岗位（+ 组内排序）。
 *
 * 班序只能从已有的选（内置 20 条 + 用户自建的），不能在这里新建 ——
 * 新建班序要录 24 个格子，属于设置页「班序」区块的事。
 *
 * 排序只有一条路：先点「排序」进排序模式，再拖行首的把手。
 * 普通行不放把手，避免让人以为随时能拖。
 */
export function MemberRowsEditor({
  rows,
  patterns,
  groups,
  visibleGroup,
  showGroupField = groups.length > 0,
  onAdd,
  emptyText,
  onChange,
  selfId,
  sorting = false,
  onImport
}: MemberRowsEditorProps) {
  const patternNames = new Map(patterns.map(option => [option.id, option.name]))
  const groupNames = new Map(groups.map(group => [group.id, group.name]))

  /** 当前 tab 可见的行；其余操作都以它们的 key 映射回完整草稿 */
  const visibleRows = rows.filter(row => {
    if (visibleGroup === undefined) return true
    if (visibleGroup === UNGROUPED_MEMBERS) return !row.groupId
    return row.groupId === visibleGroup
  })
  const fullIndexByKey = new Map(rows.map((row, index) => [row.key, index]))

  /**
   * 可见行内部换位：把新顺序回填到这些行在整张表里占的槽位。
   * 组内排序因此不会把别的分组的人插进来，也不依赖「组一定连续」这个前提。
   */
  function reorderVisible(from: number, to: number) {
    if (from === to) return
    const moved = visibleRows[from]
    if (!moved) return

    const nextVisible = [...visibleRows]
    nextVisible.splice(from, 1)
    nextVisible.splice(to, 0, moved)

    const slots = visibleRows.map(row => fullIndexByKey.get(row.key)!)
    const nextRows = [...rows]
    slots.forEach((slot, index) => {
      nextRows[slot] = nextVisible[index]
    })
    onChange(nextRows)
  }

  /** 行内校验：空名 / 与本人同名 / 与任意一行重名（可能藏在别的分组 tab 里） */
  function errorOf(row: MemberRow): string {
    // 本人行只读、不参与成员表校验
    if (selfId && row.id === selfId) return ''
    const name = row.name.trim()
    if (!name) return '请填写姓名'

    const selfName = rows.find(item => item.id === selfId)?.name.trim() ?? ''
    if (selfName && name === selfName) return '与本人同名，矩阵里会分不清'

    // 不只看「前面的行」：分组 tab 里同名的另一条可能在别的 tab，
    // 也要在当前行给出错误，否则吸底保存条灰着却看不到原因。
    const duplicate = rows.find(item => item.id !== row.id && item.name.trim() === name)
    if (duplicate) {
      const group = groupNames.get(duplicate.groupId) ?? '未分组'
      return `与「${group}」的「${name}」重名`
    }
    return ''
  }

  /** 可见行下标 → 完整草稿下标；改完再交回整表 */
  function patch(index: number, next: Partial<MemberRow>) {
    const row = visibleRows[index]
    const fullIndex = row ? fullIndexByKey.get(row.key) : undefined
    if (fullIndex === undefined) return
    onChange(rows.map((item, rowIndex) => (rowIndex === fullIndex ? { ...item, ...next } : item)))
  }

  function remove(index: number) {
    const row = visibleRows[index]
    if (!row) return
    onChange(rows.filter(item => item.key !== row.key))
  }

  function append() {
    const nextPattern = patterns[rows.length % Math.max(patterns.length, 1)]?.id ?? '4F'
    onChange([...rows, createRow(nextPattern)])
  }

  /* ------------------------------------------------------------ 排序模式
   *
   * 与小程序同一套：卡片压成 44px 紧凑行，行高 44 + 间距 8 = 52 的固定步长，
   * 被拖行跟手、夹在它和目标之间的行让出一条；拖到滚动区上下缘自动滚。
   */
  const SORT_STEP = 52
  const [sortDrag, setSortDrag] = useState<{ from: number; target: number; offset: number } | null>(null)
  const sortRef = useRef<{ from: number; target: number; startY: number; startScroll: number; y: number } | null>(null)
  /** 排序拖拽贴边时的自动滚动计时器 */
  const autoScrollTimer = useRef<number | null>(null)

  function stopAutoScroll() {
    if (autoScrollTimer.current !== null) {
      window.clearInterval(autoScrollTimer.current)
      autoScrollTimer.current = null
    }
  }

  useEffect(() => stopAutoScroll, [])

  function flowScroller(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.canvas-flow')
  }

  function updateSort(clientY: number) {
    const state = sortRef.current
    if (!state) return
    const scroll = flowScroller()?.scrollTop ?? 0
    const raw = clientY - state.startY + (scroll - state.startScroll)
    const min = -state.from * SORT_STEP
    const max = (visibleRows.length - 1 - state.from) * SORT_STEP
    const offset = Math.min(max, Math.max(min, raw))
    const target = Math.min(
      visibleRows.length - 1,
      Math.max(0, Math.round((state.from * SORT_STEP + offset) / SORT_STEP))
    )
    state.target = target
    state.y = clientY
    setSortDrag({ from: state.from, target, offset })
  }

  function sortAutoStep() {
    const state = sortRef.current
    if (!state) return
    const scroller = flowScroller()
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    const edge = 56
    if (state.y < rect.top + edge) scroller.scrollTop -= 10
    else if (state.y > rect.bottom - edge) scroller.scrollTop += 10
    updateSort(state.y)
  }

  function onSortPointerDown(index: number, event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    sortRef.current = {
      from: index,
      target: index,
      startY: event.clientY,
      startScroll: flowScroller()?.scrollTop ?? 0,
      y: event.clientY
    }
    setSortDrag({ from: index, target: index, offset: 0 })
    stopAutoScroll()
    autoScrollTimer.current = window.setInterval(sortAutoStep, 40)
  }

  function onSortPointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
    if (!sortRef.current) return
    event.preventDefault()
    updateSort(event.clientY)
  }

  function onSortPointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
    const state = sortRef.current
    if (!state) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    sortRef.current = null
    setSortDrag(null)
    stopAutoScroll()
    reorderVisible(state.from, state.target)
  }

  function cancelSortDrag() {
    sortRef.current = null
    setSortDrag(null)
    stopAutoScroll()
  }

  /** 被拖行跟手，夹在它和目标之间的行让出一条行距 */
  function sortTransform(index: number): string {
    if (!sortDrag) return ''
    if (index === sortDrag.from) return `translateY(${sortDrag.offset}px)`
    if (sortDrag.from < sortDrag.target && index > sortDrag.from && index <= sortDrag.target) {
      return `translateY(-${SORT_STEP}px)`
    }
    if (sortDrag.from > sortDrag.target && index >= sortDrag.target && index < sortDrag.from) {
      return `translateY(${SORT_STEP}px)`
    }
    return ''
  }

  function sortMeta(row: MemberRow): string {
    const position = row.position.trim()
    const group = showGroupField ? groupNames.get(row.groupId) : ''
    const pattern = patternNames.get(row.patternId) ?? row.patternId
    return [group, pattern, position].filter(Boolean).join(' · ')
  }

  if (sorting) {
    return (
      <section className="sort-block" aria-label="成员排序">

        <div className="sort-list">
          {visibleRows.map((row, index) => (
            <div
              className={[
                'sort-row',
                row.id === selfId ? 'is-self' : '',
                sortDrag?.from === index ? 'is-dragging' : ''
              ].filter(Boolean).join(' ')}
              key={row.key}
              style={{ transform: sortTransform(index) }}
            >
              <span
                className="sort-handle"
                onPointerCancel={cancelSortDrag}
                onPointerDown={event => onSortPointerDown(index, event)}
                onPointerMove={onSortPointerMove}
                onPointerUp={onSortPointerUp}
              >
                ⠿
              </span>
              <span className="sort-name">{row.name}</span>
              {row.id === selfId ? <span className="badge-self">本人</span> : null}
              <span className="sort-meta">{sortMeta(row)}</span>
            </div>
          ))}
        </div>
      </section>
    )
  }

  const builtin = patterns.filter(option => option.builtin)
  const custom = patterns.filter(option => !option.builtin)
  const groupOptions = [
    { value: '', label: '未分组' },
    ...groups.map(group => ({ value: group.id, label: group.name }))
  ]

  // 有自建班序才分组：只有内置时多一行「内置」标题纯属噪音
  const patternGroups =
    custom.length === 0
      ? [{ options: patterns.map(option => ({ value: option.id, label: option.name })) }]
      : [
        { label: '内置', options: builtin.map(option => ({ value: option.id, label: option.name })) },
        { label: '自定义', options: custom.map(option => ({ value: option.id, label: option.name })) }
      ]

  return (
    <div className={`member-editor${showGroupField ? ' is-grouped' : ''}`}>
      <div className="member-editor-head">
        <span className="member-head-label">姓名</span>
        {showGroupField ? <span className="member-head-label">分组</span> : null}
        <span className="member-head-label">班序</span>
        <span className="member-head-label">岗位</span>
      </div>

      {visibleRows.length === 0 ? (
        <p className="member-editor-empty">
          {emptyText ?? '还没有人。点下面的「添加成员」开始。'}
        </p>
      ) : null}

      {visibleRows.map((row, index) => {
        const isSelfRow = Boolean(selfId && row.id === selfId)
        const rowError = errorOf(row)
        return (
        <div className="member-row-wrap" key={row.key}>
        <div
          className={[
            'member-row',
            isSelfRow ? 'is-self' : '',
            rowError ? 'is-invalid' : ''
          ].filter(Boolean).join(' ')}
          data-row-index={index}
        >

          {isSelfRow ? (
            <span className="member-locked member-field-name" title="本人的姓名与班序请在「个人信息」里改">
              <span className="member-locked-name">{row.name}</span>
              <span className="badge-self">本人</span>
            </span>
          ) : (
            <Input
              aria-label={`第 ${index + 1} 位成员的姓名`}
              autoComplete="off"
              className="member-field-name"
              maxLength={12}
              name={`member-name-${index}`}
              placeholder="姓名"
              spellCheck={false}
              value={row.name}
              onChange={event => patch(index, { name: event.target.value })}
            />
          )}

          {/* 分组是部门归属，不是身份：本人那一行也可以改 */}
          {showGroupField ? (
            <Select
              ariaLabel={`${row.name || `第 ${index + 1} 位成员`} 的分组`}
              className="member-field-group"
              groups={[{ options: groupOptions }]}
              value={row.groupId}
              onChange={next => patch(index, { groupId: next })}
            />
          ) : null}

          {/* 班序与岗位包成一层：桌面 display: contents 继续按列排，
              手机上则作为一个两列网格落到卡片的第二行 */}
          <div className="member-fields">
            {isSelfRow ? (
              <span className="member-locked member-locked-pattern member-field-pattern">
                {patternNames.get(row.patternId) ?? row.patternId}
              </span>
            ) : (
              <Select
                ariaLabel={`${row.name || `第 ${index + 1} 位成员`} 的班序`}
                className="member-field-pattern"
                groups={patternGroups}
                value={row.patternId}
                onChange={next => patch(index, { patternId: next })}
              />
            )}

            {isSelfRow ? (
              <span
                className="member-locked member-locked-position member-field-position"
                title="本人的岗位请在「个人信息」里改"
              >
                {row.position || '—'}
              </span>
            ) : (
              <Input
                aria-label={`${row.name || `第 ${index + 1} 位成员`} 的岗位`}
                autoComplete="off"
                className="member-field-position"
                maxLength={12}
                name={`member-position-${index}`}
                placeholder="岗位（可选）"
                spellCheck={false}
                value={row.position}
                onChange={event => patch(index, { position: event.target.value })}
              />
            )}
          </div>

          <div className="member-row-actions">
            <button
              className="btn btn-quiet"
              disabled={isSelfRow}
              title={isSelfRow ? '本人不能在这里删除，请到「个人信息」里更换' : undefined}
              type="button"
              onClick={() => remove(index)}
            >
              删除
            </button>
          </div>
        </div>

        {/* 错误提示挂在字段行外面：红边只描字段，文案不会跟着被框住，
            两个错误行也不会连成一块 */}
        {rowError ? <p className="member-row-error" role="alert">{rowError}</p> : null}
        </div>
        )
      })}

      <div className="member-editor-actions">
        <button className="btn btn-add" type="button" onClick={onAdd ?? append}>添加成员</button>
        {onImport ? (
          <button className="btn btn-add" type="button" onClick={onImport}>从 Excel 导入</button>
        ) : null}
      </div>
    </div>
  )
}
