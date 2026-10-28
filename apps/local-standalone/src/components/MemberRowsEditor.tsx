import { useState } from 'react'
import { createMemberId, type Member } from '../data/roster'

export interface MemberRow {
  key: string
  id: string
  name: string
  patternId: string
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
    patternId: member.patternId
  }))
}

export function createRow(patternId = '4F'): MemberRow {
  return { key: createMemberId(), id: createMemberId(), name: '', patternId }
}

export function fromRows(rows: MemberRow[]): Member[] {
  return rows
    .filter(row => row.name.trim())
    .map(row => ({
      id: row.id,
      name: row.name.trim(),
      patternId: row.patternId
    }))
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
export function MemberRowsEditor({ rows, patterns, onChange, sortable = false }: MemberRowsEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

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

  return (
    <div className={`member-editor${sortable ? ' is-sortable' : ''}`}>
      <div className="member-editor-head">
        {sortable ? <span aria-hidden="true" /> : null}
        <span>姓名</span>
        <span>班序</span>
        <span>{sortable ? '排序 / 删除' : ''}</span>
      </div>

      {rows.length === 0 ? (
        <p className="member-editor-empty">还没有人。点下面的「添加成员」开始。</p>
      ) : null}

      {rows.map((row, index) => (
        <div
          className={[
            'member-row',
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

          <input
            aria-label={`第 ${index + 1} 位成员的姓名`}
            className="input"
            maxLength={12}
            placeholder="姓名"
            value={row.name}
            onChange={event => patch(index, { name: event.target.value })}
          />
          <select
            aria-label={`${row.name || `第 ${index + 1} 位成员`} 的班序`}
            className="input"
            value={row.patternId}
            onChange={event => patch(index, { patternId: event.target.value })}
          >
            {custom.length === 0
              ? patterns.map(option => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))
              : (
                <>
                  <optgroup label="内置">
                    {builtin.map(option => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="自定义">
                    {custom.map(option => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </optgroup>
                </>
              )}
          </select>

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
            <button className="btn btn-quiet" type="button" onClick={() => remove(index)}>删除</button>
          </div>
        </div>
      ))}

      <button className="btn btn-add" type="button" onClick={append}>添加成员</button>
    </div>
  )
}
