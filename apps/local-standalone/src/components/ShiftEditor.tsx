import { useEffect, useState } from 'react'
import type { DayOverride, Member } from '../data/roster'
import { canRecordOvertime, formatOvertimeHours } from '../data/overtime'
import { SHIFT_META, SHIFT_TYPES, shiftToneClass, type ShiftType } from '../data/shifts'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'

interface ShiftEditorProps {
  member: Member
  date: string
  currentShift: ShiftType | null
  templateShift: ShiftType | null
  /** 这一天已有的整天记录 —— 只用来提示「改班会不会连带清掉加班」 */
  record?: DayOverride
  onApply: (shift: ShiftType | null) => void
  onClose: () => void
}

/**
 * 全员矩阵用的改班弹层：只能改班次，不能记加班（加班只在个人日历里录）。
 * 只有真的和模板不同才会落记录；改回模板值等于删除（由数据层保证）。
 *
 * 例外：这天原本有加班/法定时，改成休息或事假会连带清掉它们，这里提前提示。
 */
export function ShiftEditor({
  member,
  date,
  currentShift,
  templateShift,
  record,
  onApply,
  onClose
}: ShiftEditorProps) {
  const [selected, setSelected] = useState<ShiftType | null>(currentShift)
  const edited = Boolean(record)

  const extraText = [
    record?.overtimeHours ? `+${formatOvertimeHours(record.overtimeHours)} 加班` : '',
    record?.isLegal ? '法定' : ''
  ].filter(Boolean).join('、')

  const willClearExtra = Boolean(
    extraText &&
      selected &&
      !canRecordOvertime(selected) &&
      (record?.overtimeHours || record?.isLegal)
  )

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

        {willClearExtra ? (
          <p className="dialog-warn" role="status">
            这天有 {extraText} 记录，改为「{selected ? SHIFT_META[selected].label : ''}」会一并清除。
            加班请在「个人日历」里录入。
          </p>
        ) : null}

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
