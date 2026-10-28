import { useEffect, useMemo, useState } from 'react'
import type { DayOverride, DayRecordInput, Member } from '../data/roster'
import {
  MAX_OVERTIME_HOURS,
  OVERTIME_STEP,
  canRecordOvertime,
  formatOvertimeHours,
  getOvertimePresets,
  normalizeOvertimeHours
} from '../data/overtime'
import { SHIFT_META, SHIFT_TYPES, shiftToneClass, type ShiftType } from '../data/shifts'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'

interface DayEditorProps {
  member: Member
  date: string
  /** 这一天的有效班次（改过就是改后的，否则是模板） */
  currentShift: ShiftType | null
  templateShift: ShiftType | null
  /** 已存在的整天记录，没有则为 undefined */
  record?: DayOverride
  onApply: (input: DayRecordInput) => void
  onRestore: () => void
  onClose: () => void
}

const LEGAL_OPTIONS: Array<{ value: boolean; label: string }> = [
  { value: false, label: '否' },
  { value: true, label: '是' }
]

/**
 * 日历专用的「改班 + 加班 + 法定」弹层。
 *
 * 与矩阵弹层（`ShiftEditor`）的区别：这里能记加班与法定标记。
 * 加班与法定只对有工时的班次开放，选到休息/事假时两段整体禁用并清零。
 */
export function DayEditor({
  member,
  date,
  currentShift,
  templateShift,
  record,
  onApply,
  onRestore,
  onClose
}: DayEditorProps) {
  const [shift, setShift] = useState<ShiftType | null>(currentShift)
  const [overtimeText, setOvertimeText] = useState(() => {
    const hours = record?.overtimeHours
    return hours && hours > 0 ? String(hours) : ''
  })
  const [isLegal, setIsLegal] = useState(record?.isLegal === true)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const overtimeAllowed = Boolean(shift && canRecordOvertime(shift))
  const legalAllowed = overtimeAllowed
  const overtimeHours = overtimeAllowed ? normalizeOvertimeHours(overtimeText) : 0
  const presets = useMemo(
    () => (shift ? getOvertimePresets(shift, legalAllowed && isLegal) : []),
    [shift, isLegal, legalAllowed]
  )

  const hasRecord = Boolean(record)
  const dirty =
    shift !== currentShift ||
    overtimeHours !== (record?.overtimeHours ?? 0) ||
    (legalAllowed && isLegal) !== (record?.isLegal === true)

  /** 换到不支持加班的班次时，把两段的值原地清掉（避免切回去又冒出来） */
  function pickShift(next: ShiftType) {
    setShift(next)
    if (!canRecordOvertime(next)) {
      setOvertimeText('')
      setIsLegal(false)
    }
  }

  function pickPreset(hours: number) {
    setOvertimeText(overtimeHours === hours ? '' : String(hours))
  }

  function commit() {
    if (!shift) return
    onApply({
      shift,
      overtimeHours: overtimeAllowed && overtimeHours > 0 ? overtimeHours : undefined,
      isLegal: legalAllowed && isLegal ? true : undefined
    })
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-label="修改当天记录"
        aria-modal="true"
        className="dialog dialog-day"
        role="dialog"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="dialog-head">
          <div>
            <h2 className="dialog-title">{member.name}</h2>
            <p className="dialog-sub">
              {formatMonthDay(date)} · 周{weekdayLabel(date)} · 模板{' '}
              {templateShift ? SHIFT_META[templateShift].label : '—'}
            </p>
          </div>
          <button className="btn btn-quiet" type="button" onClick={onClose}>关闭</button>
        </header>

        <div className="dialog-options" role="group" aria-label="选择班次">
          {SHIFT_TYPES.map(item => (
            <button
              aria-pressed={shift === item}
              className={`option ${shiftToneClass(item)}${shift === item ? ' is-on' : ''}`}
              key={item}
              type="button"
              onClick={() => pickShift(item)}
            >
              {SHIFT_META[item].label}
            </button>
          ))}
        </div>

        <div className={`dialog-section${overtimeAllowed ? '' : ' is-disabled'}`}>
          <div className="section-head">
            <span className="section-title">加班</span>
            <span className="section-note">
              {overtimeAllowed ? `${OVERTIME_STEP}h 步长，最多 ${MAX_OVERTIME_HOURS}h` : '休息与事假不记加班'}
            </span>
          </div>

          <div className="ot-row">
            <div className="ot-presets" role="group" aria-label="加班预设">
              {presets.map(hours => (
                <button
                  aria-pressed={overtimeHours === hours}
                  className={`chip-mini${overtimeHours === hours ? ' is-on' : ''}`}
                  disabled={!overtimeAllowed}
                  key={hours}
                  type="button"
                  onClick={() => pickPreset(hours)}
                >
                  {formatOvertimeHours(hours)}
                </button>
              ))}
              {presets.length === 0 ? <span className="ot-empty">—</span> : null}
            </div>

            <label className="ot-input">
              <input
                aria-label="加班小时数"
                className="input input-compact"
                disabled={!overtimeAllowed}
                inputMode="decimal"
                min={0}
                max={MAX_OVERTIME_HOURS}
                step={OVERTIME_STEP}
                type="number"
                value={overtimeText}
                onChange={event => setOvertimeText(event.target.value)}
              />
              <span className="ot-unit">小时</span>
            </label>
          </div>
        </div>

        <div className={`dialog-section${legalAllowed ? '' : ' is-disabled'}`}>
          <div className="section-head">
            <span className="section-title">法定节假日上班</span>
            <span className="section-note">影响统计里的加班倍率</span>
          </div>
          <div className="segmented segmented-sm" role="group" aria-label="是否法定">
            {LEGAL_OPTIONS.map(option => (
              <button
                aria-pressed={isLegal === option.value}
                className={`segmented-item${(legalAllowed && isLegal) === option.value ? ' is-on' : ''}`}
                disabled={!legalAllowed}
                key={option.label}
                type="button"
                onClick={() => setIsLegal(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <footer className="dialog-foot">
          <button className="btn btn-quiet" disabled={!hasRecord} type="button" onClick={onRestore}>
            恢复默认
          </button>
          <div className="dialog-actions">
            <button className="btn" type="button" onClick={onClose}>取消</button>
            <button className="btn btn-primary" disabled={!shift || !dirty} type="button" onClick={commit}>
              保存
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
