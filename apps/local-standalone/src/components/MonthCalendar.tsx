import { useMemo } from 'react'
import { getCalendarMeta } from '../data/calendarMeta'
import { getTemplateShift, overrideKey, patternLabelOf, type DayOverride, type Member, type Roster } from '../data/roster'
import { formatOvertimeHours } from '../data/overtime'
import type { Period } from '../data/period'
import { SHIFT_META, type ShiftType } from '../data/shifts'
import { formatDayNumber, todayKey, weekdayIndex } from '../data/dateUtils'
import { WEEKDAY_LABELS } from '../data/dateUtils'

interface MonthCalendarProps {
  roster: Roster
  member: Member | null
  period: Period
  /** 整天记录（班次 + 加班 + 法定） */
  recordMap: Map<string, DayOverride>
  onEdit: (member: Member, date: string) => void
}

/**
 * 个人日历：7 列，格子里放班次块 + 农历/节日角标。
 * 有加班的日子在班次块里补 `+2h`；法定日在右上角挂一个「法」角标。
 */
export function MonthCalendar({ roster, member, period, recordMap, onEdit }: MonthCalendarProps) {
  const today = todayKey()
  const leading = weekdayIndex(period.startDate)

  const metas = useMemo(
    () => new Map(period.dates.map(date => [date, getCalendarMeta(date)])),
    [period.dates]
  )

  if (!member) {
    return (
      <div className="empty">
        <p className="empty-title">先选一位成员</p>
        <p className="empty-text">左侧没有人可以看。去设置里添加成员，或在矩阵里点一个名字。</p>
      </div>
    )
  }

  const cells: Array<{ key: string; date: string | null }> = [
    ...Array.from({ length: leading }, (_, index) => ({ key: `blank-${index}`, date: null })),
    ...period.dates.map(date => ({ key: date, date }))
  ]
  while (cells.length % 7 !== 0) cells.push({ key: `tail-${cells.length}`, date: null })

  return (
    <section className="calendar" aria-label={`${member.name} 的月历`}>
      <header className="calendar-head">
        <div>
          <p className="calendar-name">{member.name}</p>
          <p className="calendar-sub">{patternLabelOf(roster, member)} · {period.startDate} 起</p>
        </div>
        <p className="calendar-tip">点日期改班 · 记加班</p>
      </header>

      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map(label => <span key={label}>{label}</span>)}
      </div>

      <div className="calendar-grid">
        {cells.map(cell => {
          if (!cell.date) return <div className="cal-cell is-blank" key={cell.key} />

          const date = cell.date
          const record = recordMap.get(overrideKey(member.id, date))
          const shift: ShiftType | null = record?.shift ?? getTemplateShift(roster, member, date)
          const edited = Boolean(record)
          const overtime = record?.overtimeHours ?? 0
          const meta = metas.get(date)
          const isToday = date === today

          const titleParts = [
            date,
            shift ? SHIFT_META[shift].label : '—',
            overtime > 0 ? `加班 ${formatOvertimeHours(overtime)}` : '',
            record?.isLegal ? '法定' : '',
            edited ? '已改' : ''
          ].filter(Boolean)

          return (
            <button
              className={`cal-cell${isToday ? ' is-today' : ''}`}
              key={cell.key}
              type="button"
              onClick={() => onEdit(member, date)}
              title={titleParts.join(' · ')}
            >
              <span className="cal-day">{formatDayNumber(date)}</span>
              <span className={`cal-meta${meta?.isFestival ? ' is-festival' : ''}`}>{meta?.label ?? ''}</span>
              {shift ? (
                <span className={`cal-shift t-${SHIFT_META[shift].tone}${edited ? ' is-edited' : ''}`}>
                  <span className="cal-shift-label">{SHIFT_META[shift].label}</span>
                  {overtime > 0 ? (
                    <span className="cal-ot">+{formatOvertimeHours(overtime)}</span>
                  ) : null}
                </span>
              ) : (
                <span className="cal-shift is-blank">—</span>
              )}
              {record?.isLegal ? <span className="cal-legal" aria-hidden="true">法</span> : null}
            </button>
          )
        })}
      </div>

      <p className="calendar-legend">
        <span className="cal-shift t-day legend-shift">
          <span className="cal-shift-label">白班</span>
          <span className="cal-ot">+2h</span>
        </span>
        <span className="legend-text">班次 + 加班小时</span>
        <span className="cal-legal legend-legal" aria-hidden="true">法</span>
        <span className="legend-text">法定节假日上班</span>
      </p>
    </section>
  )
}
