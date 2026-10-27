import { useMemo } from 'react'
import { getCalendarMeta } from '../data/calendarMeta'
import { getEffectiveShift, isEdited, patternLabelOf, type Member } from '../data/roster'
import type { Period } from '../data/period'
import { SHIFT_META, type ShiftType } from '../data/shifts'
import { formatDayNumber, todayKey, weekdayIndex } from '../data/dateUtils'
import { WEEKDAY_LABELS } from '../data/dateUtils'

interface MonthCalendarProps {
  member: Member | null
  period: Period
  overrideMap: Map<string, ShiftType>
  onEdit: (member: Member, date: string) => void
}

/**
 * 个人日历：7 列，格子里放班次块 + 农历/节日角标。
 * 只有一名成员时它就是「我的月历」；多人时可以在这里切换查看对象。
 */
export function MonthCalendar({ member, period, overrideMap, onEdit }: MonthCalendarProps) {
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
          <p className="calendar-sub">{patternLabelOf(member)} · {period.startDate} 起</p>
        </div>
        <p className="calendar-tip">点日期改班</p>
      </header>

      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map(label => <span key={label}>{label}</span>)}
      </div>

      <div className="calendar-grid">
        {cells.map(cell => {
          if (!cell.date) return <div className="cal-cell is-blank" key={cell.key} />

          const date = cell.date
          const shift = getEffectiveShift(member, date, overrideMap)
          const edited = isEdited(member.id, date, overrideMap)
          const meta = metas.get(date)
          const isToday = date === today

          return (
            <button
              className={`cal-cell${isToday ? ' is-today' : ''}`}
              key={cell.key}
              type="button"
              onClick={() => onEdit(member, date)}
              title={shift ? `${date} ${SHIFT_META[shift].label}${edited ? '（已改）' : ''}` : date}
            >
              <span className="cal-day">{formatDayNumber(date)}</span>
              <span className={`cal-meta${meta?.isFestival ? ' is-festival' : ''}`}>{meta?.label ?? ''}</span>
              {shift ? (
                <span className={`cal-shift t-${SHIFT_META[shift].tone}${edited ? ' is-edited' : ''}`}>
                  {SHIFT_META[shift].label}
                </span>
              ) : (
                <span className="cal-shift is-blank">—</span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
