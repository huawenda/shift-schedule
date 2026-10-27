import { useEffect, useState } from 'react'
import type { Member } from '../data/roster'
import { SHIFT_META, SHIFT_TYPES, shiftToneClass, type ShiftType } from '../data/shifts'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'

interface ShiftEditorProps {
  member: Member
  date: string
  currentShift: ShiftType | null
  templateShift: ShiftType | null
  onApply: (shift: ShiftType | null) => void
  onClose: () => void
}

/**
 * 改班弹层：六个班次 + 恢复默认。
 * 只有真的和模板不同才会落记录，改回模板值等于删除（由数据层保证）。
 */
export function ShiftEditor({ member, date, currentShift, templateShift, onApply, onClose }: ShiftEditorProps) {
  const [selected, setSelected] = useState<ShiftType | null>(currentShift)
  const edited = Boolean(currentShift && templateShift && currentShift !== templateShift)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="修改班次"
        aria-modal="true"
        className="dialog"
        role="dialog"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <h2 className="dialog-title">{member.name}</h2>
            <p className="dialog-sub">
              {formatMonthDay(date)} · 周{weekdayLabel(date)} · 模板 {templateShift ? SHIFT_META[templateShift].label : '—'}
            </p>
          </div>
          <button className="btn btn-quiet" type="button" onClick={onClose}>关闭</button>
        </header>

        <div className="dialog-options" role="group" aria-label="选择班次">
          {SHIFT_TYPES.map(shift => (
            <button
              aria-pressed={selected === shift}
              className={`option ${shiftToneClass(shift)}${selected === shift ? ' is-on' : ''}`}
              key={shift}
              type="button"
              onClick={() => setSelected(shift)}
            >
              {SHIFT_META[shift].label}
            </button>
          ))}
        </div>

        <footer className="dialog-foot">
          <button
            className="btn btn-quiet"
            disabled={!edited}
            type="button"
            onClick={() => onApply(null)}
          >
            恢复默认
          </button>
          <div className="dialog-actions">
            <button className="btn" type="button" onClick={onClose}>取消</button>
            <button
              className="btn btn-primary"
              disabled={!selected}
              type="button"
              onClick={() => selected && onApply(selected)}
            >
              保存
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
