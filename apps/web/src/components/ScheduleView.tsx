import { Fragment } from 'react'
import {
  getOverrideKey,
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
  summary,
  onOpenShiftEditor
}: ScheduleViewProps) {
  const visibleDates = appliedMonthView.dates

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

      <section className="schedule-card">
        <div className="section-header">
          <h2>多视图</h2>
          <span className="muted-label">左右滑动查看更多日期</span>
        </div>

        <div className="schedule-grid" style={{ gridTemplateColumns: `128px repeat(${visibleDates.length}, 76px)` }}>
          <div className="table-head sticky-name">姓名</div>
          {visibleDates.map(date => <div className="table-head" key={date}>{date.slice(3)}</div>)}

          {appliedMonthView.people.slice(0, 8).map(person => (
            <Fragment key={person.name}>
              <div className="person-cell sticky-name">
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
