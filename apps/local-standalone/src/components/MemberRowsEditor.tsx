import { createMemberId, type Member } from '../data/roster'
import { PATTERN_IDS } from '../data/patterns'

export interface MemberRow {
  key: string
  id: string
  name: string
  patternId: string
  label: string
}

export function toRows(members: Member[]): MemberRow[] {
  return members.map(member => ({
    key: member.id,
    id: member.id,
    name: member.name,
    patternId: member.patternId,
    label: member.label ?? ''
  }))
}

export function createRow(patternId = '4F'): MemberRow {
  return { key: createMemberId(), id: createMemberId(), name: '', patternId, label: '' }
}

export function fromRows(rows: MemberRow[]): Member[] {
  return rows
    .filter(row => row.name.trim())
    .map(row => ({
      id: row.id,
      name: row.name.trim(),
      patternId: row.patternId as Member['patternId'],
      ...(row.label.trim() ? { label: row.label.trim() } : {})
    }))
}

interface MemberRowsEditorProps {
  rows: MemberRow[]
  onChange: (rows: MemberRow[]) => void
}

/**
 * 成员表：姓名 + 班序 + 可选别名。
 *
 * 班序是固定的 13 条，这里只做「选择」；人数不限，同一班序可以挂多人。
 */
export function MemberRowsEditor({ rows, onChange }: MemberRowsEditorProps) {
  function patch(index: number, next: Partial<MemberRow>) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row)))
  }

  function remove(index: number) {
    onChange(rows.filter((_, rowIndex) => rowIndex !== index))
  }

  function append() {
    const nextPattern = PATTERN_IDS[rows.length % PATTERN_IDS.length]
    onChange([...rows, createRow(nextPattern)])
  }

  const patternCount = new Map<string, number>()
  rows.forEach(row => {
    if (row.patternId) patternCount.set(row.patternId, (patternCount.get(row.patternId) ?? 0) + 1)
  })

  return (
    <div className="member-editor">
      <div className="member-editor-head">
        <span>姓名</span>
        <span>班序</span>
        <span>别名（可选）</span>
        <span />
      </div>

      {rows.length === 0 ? (
        <p className="member-editor-empty">还没有人。点下面的「添加成员」开始。</p>
      ) : null}

      {rows.map((row, index) => {
        const shared = row.patternId ? (patternCount.get(row.patternId) ?? 0) - 1 : 0
        return (
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
              {PATTERN_IDS.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            <input
              aria-label={`${row.name || `第 ${index + 1} 位成员`} 的别名`}
              className="input"
              maxLength={12}
              placeholder={shared > 0 ? `同班序还有 ${shared} 人` : '如「甲组」'}
              value={row.label}
              onChange={event => patch(index, { label: event.target.value })}
            />
            <button className="btn btn-quiet" type="button" onClick={() => remove(index)}>删除</button>
          </div>
        )
      })}

      <button className="btn btn-add" type="button" onClick={append}>添加成员</button>
    </div>
  )
}
