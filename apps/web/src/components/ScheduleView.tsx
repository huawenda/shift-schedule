import { Fragment } from 'react'
import {
  formatScheduleMonthDay,
  getDateLabels,
  getOverrideKey,
  getPersonMonthCalendarCells,
  scheduleData,
  type ShiftSummary,
  type ShiftType,
  type ScheduleMonth
} from '@shift-schedule/core'
import { shiftLabels } from '../appConstants'
import { getShiftClassName } from '../scheduleHelpers'
import type { CloudOverrides } from '../services/cloudRecords'
import type { CurrentUserProfile } from '../services/userProfile'

interface PersonSchedule {
  group: string
  name: string
  shifts: ShiftType[]
}

interface MonthScheduleView {
  dates: string[]
  endDate: string
  people: PersonSchedule[]
  startDate: string
}

interface ScheduleViewProps {
  appliedCurrentUser: PersonSchedule
  appliedMonthView: MonthScheduleView
  overrides: CloudOverrides
  profile: CurrentUserProfile | null
  selectedMonth: ScheduleMonth
  summary: ShiftSummary
  onOpenShiftEditor: (personName: string, date: string) => void
}

export function ScheduleView({
  appliedCurrentUser,
  appliedMonthView,
  overrides,
  profile,
  selectedMonth,
  summary,
  onOpenShiftEditor
}: ScheduleViewProps) {
  const visibleDates = appliedMonthView.dates
  const dateLabels = getDateLabels(appliedMonthView.startDate, visibleDates)
  const calendarCells = getPersonMonthCalendarCells(scheduleData, selectedMonth, appliedCurrentUser.name)
  const todayMonthDay = formatScheduleMonthDay(new Date())

  return (
    <>
      <section className="current-user-card">
        <div className="section-header">
          <div>
            <span className="muted-label">当前用户</span>
            <h2>{appliedCurrentUser.name} / {appliedCurrentUser.group}</h2>
          </div>
          {profile?.isAdmin ? <span className="admin-badge">管理员</span> : null}
        </div>

        <div className="summary-grid">
          {shiftLabels.map(shift => (
            <div className={`summary-item ${getShiftClassName(shift)}`} key={shift}>
              <strong>{summary[shift] ?? 0}</strong>
              <span>{shift}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="calendar-card">
        <div className="section-header">
          <h2>排班日历</h2>
          <span className="muted-label">2026年{Number(selectedMonth)}月</span>
        </div>

        <div className="calendar-weekdays" aria-hidden="true">
          {['日', '一', '二', '三', '四', '五', '六'].map(weekday => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {calendarCells.map(cell => {
            const overrideKey = getOverrideKey(appliedCurrentUser.name, cell.key)
            const shift = overrides.shiftOverrides[overrideKey] ?? cell.shift
            const isEdited = Boolean(overrides.shiftOverrides[overrideKey])
            const hasOvertime = (overrides.overtimeOverrides[overrideKey] ?? 0) > 0
            const isLegal = overrides.legalOverrides[overrideKey] === true

            return (
              <button
                className={`calendar-cell ${cell.inCurrentMonth ? '' : 'calendar-cell-empty'} ${cell.key === todayMonthDay ? 'today-calendar-cell' : ''} ${isEdited ? 'edited-calendar-cell' : ''}`}
                disabled={!cell.inCurrentMonth}
                key={cell.key}
                type="button"
                onClick={() => {
                  if (cell.inCurrentMonth) onOpenShiftEditor(appliedCurrentUser.name, cell.key)
                }}
              >
                {cell.inCurrentMonth && isEdited ? <span className="edited-marker" /> : null}
                {cell.inCurrentMonth && hasOvertime && !isLegal ? <span className="overtime-marker" /> : null}
                <span className="calendar-date-wrap">
                  <span className="calendar-day">{cell.day}</span>
                  <span className={`calendar-lunar ${cell.meta.isHoliday ? 'calendar-lunar-holiday' : ''}`}>
                    {cell.meta.label}
                  </span>
                </span>
                {shift ? (
                  <span className="calendar-shift-row">
                    <span className={`shift-chip ${getShiftClassName(shift)}`}>{shift}</span>
                    {cell.inCurrentMonth && isLegal ? <span className="legal-shift-badge">法</span> : null}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </section>

      <section className="schedule-card">
        <div className="section-header">
          <h2>多视图</h2>
          <span className="muted-label">左右滑动查看更多日期</span>
        </div>

        <div
          className="schedule-grid"
          style={{ gridTemplateColumns: `var(--schedule-name-column, 128px) repeat(${visibleDates.length}, var(--schedule-date-column, 76px))` }}
        >
          <div className="table-head sticky-name">姓名</div>
          {dateLabels.map(label => (
            <div className={`table-head date-head ${label.date === todayMonthDay ? 'today-date-head' : ''}`} key={label.date}>
              <strong>{label.date.slice(3)}</strong>
              <span>{label.weekday}</span>
            </div>
          ))}

          {appliedMonthView.people.map(person => (
            <Fragment key={person.name}>
              <div className={`person-cell sticky-name ${person.name === appliedCurrentUser.name ? 'current-person-cell' : ''}`}>
                <strong>{person.name}</strong>
                <span>{person.group}</span>
              </div>
              {visibleDates.map((date, index) => {
                const shift = person.shifts[index]
                const key = getOverrideKey(person.name, date)
                const isEdited = Boolean(
                  overrides.shiftOverrides[key] ||
                  overrides.overtimeOverrides[key] ||
                  overrides.legalOverrides[key] ||
                  overrides.leaveDurationOverrides[key]
                )

                return (
                  <button className="shift-cell" key={`${person.name}-${date}`} type="button" onClick={() => onOpenShiftEditor(person.name, date)}>
                    {isEdited ? <span className="edited-dot" /> : null}
                    <span className={`shift-chip ${getShiftClassName(shift)}`}>{shift}</span>
                  </button>
                )
              })}
            </Fragment>
          ))}
        </div>
      </section>
    </>
  )
}
