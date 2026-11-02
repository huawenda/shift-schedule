import { useState } from 'react'
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
  selfId
}: MemberRowsEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const patternNames = new Map(patterns.map(option => [option.id, option.name]))

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
    if (from === null || from === index) return

    const next = [...rows]
    const [moved] = next.splice(from, 1)
    next.splice(index, 0, moved)
    onChange(next)
  }

  function append() {
    const nextPattern = patterns[rows.length % Math.max(patterns.length, 1)]?.id ?? '4F'
    onChange([...rows, createRow(nextPattern)])
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
        return (
        <div
          className={[
            'member-row',
            isSelfRow ? 'is-self' : '',
            dragIndex === index ? 'is-dragging' : '',
            overIndex === index && dragIndex !== null && dragIndex !== index ? 'is-drop-target' : ''
          ].filter(Boolean).join(' ')}
          key={row.key}
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
        )
      })}

      <button className="btn btn-add" type="button" onClick={append}>添加成员</button>
    </div>
  )
}
