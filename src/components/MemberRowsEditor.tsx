import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createMemberId, type Member } from '../data/roster'
import { Select } from './Select'

export interface MemberRow {
  key: string
  id: string
  name: string
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
    patternId: member.patternId,
    position: member.position ?? ''
  }))
}

export function createRow(patternId = '4F'): MemberRow {
  return { key: createMemberId(), id: createMemberId(), name: '', patternId, position: '' }
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
        ...(position ? { position } : {})
      }
    })
}

interface MemberRowsEditorProps {
  rows: MemberRow[]
  /** 可选班序，内置在前、自定义在后；决定下拉里能选什么 */
  patterns: PatternOption[]
  onChange: (rows: MemberRow[]) => void
  /**
   * 允许调整顺序（设置页用）。
   * 数组顺序就是全员矩阵的行顺序，所以这里不只是「看着舒服」。
   */
  sortable?: boolean
  /** 本人的 memberId：这一行只读，改名/换班序要去「个人信息」 */
  selfId?: string
  /** 排序模式：卡片压成 44px 紧凑行，只有把手能拖（与小程序同一套） */
  sorting?: boolean
}

/**
 * 成员表：姓名 + 班序（+ 排序）。
 *
 * 班序只能从已有的选（内置 13 条 + 用户自建的），不能在这里新建 ——
 * 新建班序要录 24 个格子，属于设置页「班序」区块的事。
 *
 * 排序留两条路：拖行首的把手（快，一次到位）、点 ↑ ↓（键盘可达，微调一格）。
 * 只做拖拽的话键盘用户完全没法排序，所以两个都要。
 */
export function MemberRowsEditor({
  rows,
  patterns,
  onChange,
  sortable = false,
  selfId,
  sorting = false
}: MemberRowsEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  /**
   * 触摸拖拽的现场。
   *
   * 桌面继续走 HTML5 原生拖拽（鼠标体验最好）；触屏上 `draggable` 基本不可用，
   * 所以手指按住把手时改走 Pointer Events：跟手找目标行、贴边自动滚。
   * 只跟手「目标行高亮」而不做整行让位动画 —— 行高在桌面/手机两套布局里不同，
   * 按固定行距做 translate 会在折行卡上错位。
   */
  const touchState = useRef<{ from: number; over: number; x: number; y: number } | null>(null)
  const autoScrollTimer = useRef<number | null>(null)

  useEffect(() => stopAutoScroll, [])

  const patternNames = new Map(patterns.map(option => [option.id, option.name]))

  function reorder(from: number, to: number) {
    if (from === to) return
    const next = [...rows]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  /** 行内校验（与小程序 rowError 同口径）：空名 / 与本人同名 / 与前面某行重名 */
  function errorOf(row: MemberRow, index: number): string {
    // 本人行只读、不参与成员表校验
    if (selfId && row.id === selfId) return ''
    const name = row.name.trim()
    if (!name) return '请填写姓名'

    const selfName = rows.find(item => item.id === selfId)?.name.trim() ?? ''
    if (selfName && name === selfName) return '与本人同名，矩阵里会分不清'

    const earlier = rows.findIndex((item, itemIndex) => itemIndex < index && item.name.trim() === name)
    if (earlier >= 0) return `与第 ${earlier + 1} 行重名`
    return ''
  }

  /** 指针落在哪一行：用 data-row-index，不依赖行高与滚动位置 */
  function rowIndexAt(x: number, y: number): number | null {
    const hit = document.elementFromPoint(x, y)
    const rowEl = hit?.closest<HTMLElement>('.member-row[data-row-index]')
    const parsed = rowEl ? Number(rowEl.dataset.rowIndex) : NaN
    return Number.isInteger(parsed) ? parsed : null
  }

  /** 拖到滚动区上下缘时手动滚：设置页的滚动容器是 .canvas-flow，不是 window */
  function autoScrollStep() {
    const state = touchState.current
    if (!state) return
    const scroller = document.querySelector<HTMLElement>('.canvas-flow')
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    const edge = 56
    if (state.y < rect.top + edge) scroller.scrollTop -= 10
    else if (state.y > rect.bottom - edge) scroller.scrollTop += 10
    // 页面滚过之后同一坐标可能落到别的行，重新算一次目标
    const next = rowIndexAt(state.x, state.y)
    if (next !== null && next !== state.over) {
      state.over = next
      setOverIndex(next)
    }
  }

  function stopAutoScroll() {
    if (autoScrollTimer.current !== null) {
      window.clearInterval(autoScrollTimer.current)
      autoScrollTimer.current = null
    }
  }

  function onHandlePointerDown(index: number, event: ReactPointerEvent<HTMLSpanElement>) {
    if (!sortable || event.pointerType === 'mouse') return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    touchState.current = { from: index, over: index, x: event.clientX, y: event.clientY }
    setDragIndex(index)
    setOverIndex(index)
    stopAutoScroll()
    autoScrollTimer.current = window.setInterval(autoScrollStep, 40)
  }

  function onHandlePointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
    const state = touchState.current
    if (!state) return
    event.preventDefault()
    state.x = event.clientX
    state.y = event.clientY
    const next = rowIndexAt(event.clientX, event.clientY)
    if (next !== null && next !== state.over) {
      state.over = next
      setOverIndex(next)
    }
  }

  function onHandlePointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
    const state = touchState.current
    if (!state) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    touchState.current = null
    stopAutoScroll()
    setDragIndex(null)
    setOverIndex(null)
    reorder(state.from, state.over)
  }

  function patch(index: number, next: Partial<MemberRow>) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row)))
  }

  function remove(index: number) {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index))
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  function drop(index: number) {
    const from = dragIndex
    setDragIndex(null)
    setOverIndex(null)
    if (from === null) return
    reorder(from, index)
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

  function flowScroller(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.canvas-flow')
  }

  function updateSort(clientY: number) {
    const state = sortRef.current
    if (!state) return
    const scroll = flowScroller()?.scrollTop ?? 0
    const raw = clientY - state.startY + (scroll - state.startScroll)
    const min = -state.from * SORT_STEP
    const max = (rows.length - 1 - state.from) * SORT_STEP
    const offset = Math.min(max, Math.max(min, raw))
    const target = Math.min(
      rows.length - 1,
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
    reorder(state.from, state.target)
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
    const pattern = patternNames.get(row.patternId) ?? row.patternId
    return position ? `${pattern} · ${position}` : pattern
  }

  if (sorting) {
    return (
      <section className="sort-block" aria-label="成员排序">
        <p className="sort-hint">按住左侧把手上下拖动；顺序就是全员矩阵的行顺序。</p>

        <div className="sort-list">
          {rows.map((row, index) => (
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

  // 有自建班序才分组：只有内置时多一行「内置」标题纯属噪音
  const patternGroups =
    custom.length === 0
      ? [{ options: patterns.map(option => ({ value: option.id, label: option.name })) }]
      : [
        { label: '内置', options: builtin.map(option => ({ value: option.id, label: option.name })) },
        { label: '自定义', options: custom.map(option => ({ value: option.id, label: option.name })) }
      ]

  return (
    <div className={`member-editor${sortable ? ' is-sortable' : ''}`}>
      <div className="member-editor-head">
        {sortable ? <span aria-hidden="true" /> : null}
        <span className="member-head-label">姓名</span>
        <span className="member-head-label">班序</span>
        <span className="member-head-label">岗位</span>
      </div>

      {rows.length === 0 ? (
        <p className="member-editor-empty">还没有人。点下面的「添加成员」开始。</p>
      ) : null}

      {rows.map((row, index) => {
        const isSelfRow = Boolean(selfId && row.id === selfId)
        const rowError = errorOf(row, index)
        return (
        <div className="member-row-wrap" key={row.key}>
        <div
          className={[
            'member-row',
            isSelfRow ? 'is-self' : '',
            rowError ? 'is-invalid' : '',
            dragIndex === index ? 'is-dragging' : '',
            overIndex === index && dragIndex !== null && dragIndex !== index ? 'is-drop-target' : ''
          ].filter(Boolean).join(' ')}
          data-row-index={index}
          onDragLeave={sortable ? () => setOverIndex(current => (current === index ? null : current)) : undefined}
          onDragOver={sortable
            ? event => {
              event.preventDefault()
              setOverIndex(index)
            }
            : undefined}
          onDrop={sortable
            ? event => {
              event.preventDefault()
              drop(index)
            }
            : undefined}
        >
          {sortable ? (
            <span
              aria-hidden="true"
              className="member-handle"
              draggable
              title="拖动调整顺序"
              onDragEnd={() => {
                setDragIndex(null)
                setOverIndex(null)
              }}
              onDragStart={() => setDragIndex(index)}
              onPointerDown={event => onHandlePointerDown(index, event)}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={() => {
                touchState.current = null
                stopAutoScroll()
                setDragIndex(null)
                setOverIndex(null)
              }}
            >
              ⠿
            </span>
          ) : null}

          {isSelfRow ? (
            <span className="member-locked member-field-name" title="本人的姓名与班序请在「个人信息」里改">
              <span className="member-locked-name">{row.name}</span>
              <span className="badge-self">本人</span>
            </span>
          ) : (
            <input
              aria-label={`第 ${index + 1} 位成员的姓名`}
              autoComplete="off"
              className="input member-field-name"
              maxLength={12}
              name={`member-name-${index}`}
              placeholder="姓名"
              spellCheck={false}
              value={row.name}
              onChange={event => patch(index, { name: event.target.value })}
            />
          )}

          {/* 班序与岗位包成一层：桌面 display: contents 继续按四列排，
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
              <input
                aria-label={`${row.name || `第 ${index + 1} 位成员`} 的岗位`}
                autoComplete="off"
                className="input member-field-position"
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
            {sortable ? (
              <>
                <button
                  aria-label={`把 ${row.name || `第 ${index + 1} 位成员`} 上移一位`}
                  className="btn btn-icon"
                  disabled={index === 0}
                  type="button"
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={`把 ${row.name || `第 ${index + 1} 位成员`} 下移一位`}
                  className="btn btn-icon"
                  disabled={index === rows.length - 1}
                  type="button"
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
              </>
            ) : null}
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

      <button className="btn btn-add" type="button" onClick={append}>添加成员</button>
    </div>
  )
}
