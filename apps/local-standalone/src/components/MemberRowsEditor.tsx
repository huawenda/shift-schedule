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
}

/**
 * 成员表：姓名 + 班序。
 *
 * 班序只能从已有的选（内置 13 条 + 用户自建的），不能在这里新建 ——
 * 新建班序要录 24 个格子，属于设置页「班序」区块的事。
 */
export function MemberRowsEditor({ rows, patterns, onChange }: MemberRowsEditorProps) {
  function patch(index: number, next: Partial<MemberRow>) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row)))
  }

  function remove(index: number) {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index))
  }

  function append() {
    const nextPattern = patterns[rows.length % Math.max(patterns.length, 1)]?.id ?? '4F'
    onChange([...rows, createRow(nextPattern)])
  }

  const builtin = patterns.filter(option => option.builtin)
  const custom = patterns.filter(option => !option.builtin)

  return (
    <div className="member-editor">
      <div className="member-editor-head">
        <span>姓名</span>
        <span>班序</span>
        <span />
      </div>

      {rows.length === 0 ? (
        <p className="member-editor-empty">还没有人。点下面的「添加成员」开始。</p>
      ) : null}

      {rows.map((row, index) => (
        <div className="member-row" key={row.key}>
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
          <button className="btn btn-quiet" type="button" onClick={() => remove(index)}>删除</button>
        </div>
      ))}

      <button className="btn btn-add" type="button" onClick={append}>添加成员</button>
    </div>
  )
}
