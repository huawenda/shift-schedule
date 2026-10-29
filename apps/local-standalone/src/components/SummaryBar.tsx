import { getEffectiveShift, getOverrideMap, type Roster } from '../data/roster'
import { isWorkShift, type ShiftType } from '../data/shifts'
import type { Period } from '../data/period'
import { formatChineseDate, todayKey } from '../data/dateUtils'

interface SummaryBarProps {
  roster: Roster
  period: Period
}

interface Cell {
  label: string
  value: number | null
  hint: string
}

/**
 * 概览条：四格，只数人不算工时。
 * 这是「dashboard 感」的来源，也是以后统计页的接口位置。
 */
export function SummaryBar({ roster, period }: SummaryBarProps) {
  const today = todayKey()
  const inPeriod = period.dates.includes(today)
  const overrideMap = getOverrideMap(roster)

  const counts: Record<'day' | 'night' | 'rest' | 'work', number> = { day: 0, night: 0, rest: 0, work: 0 }

  if (inPeriod) {
    roster.members.forEach(member => {
      const shift: ShiftType | null = getEffectiveShift(roster, member, today, overrideMap)
      if (!shift) return
      if (shift === '白班') counts.day += 1
      if (shift === '夜班') counts.night += 1
      if (shift === '休息') counts.rest += 1
      if (isWorkShift(shift)) counts.work += 1
    })
  }

  const cells: Cell[] = [
    { label: '今日白班', value: inPeriod ? counts.day : null, hint: '人' },
    { label: '今日夜班', value: inPeriod ? counts.night : null, hint: '人' },
    { label: '今日休息', value: inPeriod ? counts.rest : null, hint: '人' },
    { label: '今日出勤', value: inPeriod ? counts.work : null, hint: '人（含白特 / 夜特）' }
  ]

  return (
    <section className="summary" aria-label="今日概览">
      {cells.map(cell => (
        <div className="summary-cell" key={cell.label}>
          <span className="summary-label">{cell.label}</span>
          <span className="summary-value">
            {cell.value === null ? '—' : cell.value}
            <span className="summary-unit">{cell.value === null ? '' : cell.hint}</span>
          </span>
        </div>
      ))}
      {inPeriod
        ? null
        : (
          <p className="summary-note">
            今天不在本月（{formatChineseDate(period.startDate)} - {formatChineseDate(period.endDate)}）范围内
          </p>
        )}
    </section>
  )
}
