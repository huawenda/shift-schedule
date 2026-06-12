import { useRef, useState, type ReactNode, type TouchEvent } from 'react'
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
import { shiftLabels } from '../../appConstants'
import { useBackDismiss } from '../../hooks/useBackDismiss'
import { getShiftClassName } from '../../scheduleHelpers'
import type { CloudOverrides } from '../../services/cloudRecords'
import type { CurrentUserProfile } from '../../services/userProfile'

type ScheduleTableView = 'shift' | 'name'

interface PersonSchedule {
  group: string
  name: string
  shifts: ShiftType[]
}

const tableViewOptions: Array<{ label: string; value: ScheduleTableView }> = [
  { label: '常规', value: 'shift' },
  { label: '姓名', value: 'name' }
]

function getNameViewShiftClassName(shift: ShiftType): string {
  return {
    白班: 'name-shift-day',
    夜班: 'name-shift-night',
    休息: 'name-shift-rest',
    白特: 'name-shift-special-day',
    夜特: 'name-shift-special-night',
    事假: 'name-shift-leave'
  }[shift]
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
  chrome?: ReactNode
  overrides: CloudOverrides
  people: PersonSchedule[]
  profile: CurrentUserProfile | null
  selectedMonth: ScheduleMonth
  summary: ShiftSummary
  onCurrentUserChange: (personName: string) => void
  onMonthChange: (month: ScheduleMonth) => void
  onOpenShiftEditor: (personName: string, date: string) => void
  onStatsOpen: () => void
}

type TouchPoint = { x: number; y: number }
const scheduleMonthOrder: ScheduleMonth[] = ['05', '06', '07', '08', '09', '10', '11', '12']

export function ScheduleView({
  appliedCurrentUser,
  appliedMonthView,
  chrome,
  overrides,
  people,
  profile,
  selectedMonth,
  summary,
  onCurrentUserChange,
  onMonthChange,
  onOpenShiftEditor,
  onStatsOpen
}: ScheduleViewProps) {
  const [tableView, setTableView] = useState<ScheduleTableView>('shift')
  const [isUserPickerOpen, setIsUserPickerOpen] = useState(false)
  const calendarTouchStart = useRef<TouchPoint | null>(null)
  const calendarSwipeHandled = useRef(false)
  const visibleDates = appliedMonthView.dates
  const dateLabels = getDateLabels(appliedMonthView.startDate, visibleDates)
  const calendarCells = getPersonMonthCalendarCells(scheduleData, selectedMonth, appliedCurrentUser.name)
  const todayMonthDay = formatScheduleMonthDay(new Date())

  useBackDismiss(isUserPickerOpen, () => setIsUserPickerOpen(false))

  function handleCalendarTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0]
    calendarTouchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  function handleCalendarTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = calendarTouchStart.current
    const touch = event.changedTouches[0]
    calendarTouchStart.current = null
    if (!start || !touch) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) <= 56 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return

    const currentIndex = scheduleMonthOrder.indexOf(selectedMonth)
    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1
    const nextMonth = scheduleMonthOrder[nextIndex]
    if (nextMonth) {
      calendarSwipeHandled.current = true
      onMonthChange(nextMonth)
      window.setTimeout(() => {
        calendarSwipeHandled.current = false
      }, 0)
    }
  }

  return (
    <>
      <div className="schedule-sticky-top">
        {chrome}
        <CurrentUserCard
          appliedCurrentUser={appliedCurrentUser}
          isAdmin={profile?.isAdmin === true}
          summary={summary}
          onOpenStats={onStatsOpen}
          onOpenUserPicker={() => setIsUserPickerOpen(true)}
        />
      </div>

      <section className="calendar-card" onTouchStart={handleCalendarTouchStart} onTouchEnd={handleCalendarTouchEnd}>
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
            const hasShiftChange = Boolean(overrides.shiftOverrides[overrideKey])
            const hasOvertime = (overrides.overtimeOverrides[overrideKey] ?? 0) > 0
            const isLegal = overrides.legalOverrides[overrideKey] === true
            const hasLeaveDuration = Boolean(overrides.leaveDurationOverrides[overrideKey])
            const hasRecord = hasShiftChange || hasOvertime || isLegal || hasLeaveDuration

            return (
              <button
                className={`calendar-cell ${cell.inCurrentMonth ? '' : 'calendar-cell-empty'} ${cell.key === todayMonthDay ? 'today-calendar-cell' : ''} ${hasRecord ? 'record-calendar-cell' : ''} ${hasShiftChange ? 'edited-calendar-cell' : ''}`}
                disabled={!cell.inCurrentMonth}
                key={cell.key}
                type="button"
                onClick={() => {
                  if (calendarSwipeHandled.current) return
                  if (cell.inCurrentMonth) onOpenShiftEditor(appliedCurrentUser.name, cell.key)
                }}
              >
                {cell.inCurrentMonth && hasShiftChange ? <span className="edited-marker" /> : null}
                {cell.inCurrentMonth && hasOvertime && !isLegal ? <span className="overtime-marker" /> : null}
                  <span className="calendar-cell-content">
                    <span className="calendar-date-wrap">
                    <span className="calendar-lunar-spacer" aria-hidden="true" />
                    <span className="calendar-day">{cell.day}</span>
                    <span className={`calendar-lunar ${cell.meta.isHoliday ? 'calendar-lunar-holiday' : ''}`}>
                      {cell.meta.label.split('').map((char, charIndex) => (
                        <span key={`${cell.key}-${charIndex}`}>{char}</span>
                      ))}
                    </span>
                  </span>
                {shift ? (
                  <span className="calendar-shift-row">
                    <span className={`shift-chip ${getShiftClassName(shift)}`}>{shift}</span>
                    {cell.inCurrentMonth && isLegal ? <span className="legal-shift-badge">法</span> : null}
                  </span>
                ) : null}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="schedule-card">
        <div className="table-toolbar">
          <div className="table-toolbar-main">
            <h2>多视图</h2>
            <div className="table-view-switch" role="group" aria-label="切换表格视图">
              {tableViewOptions.map(option => (
                <button
                  className={`table-view-option ${tableView === option.value ? 'active' : ''}`}
                  key={option.value}
                  type="button"
                  onClick={() => setTableView(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="table-toolbar-sub">
            <div className="legend" aria-label="班次图例">
              {shiftLabels.map(shift => (
                <span className="legend-item" key={shift}>
                  <span className={`shift-chip ${getShiftClassName(shift)}`}>{shift}</span>
                </span>
              ))}
            </div>
            <span className="muted-label">左右滑动查看更多日期</span>
          </div>
        </div>

        <div className="table-shell">
          <div className="identity-column">
            <div className="identity-row identity-header">
              <strong>{tableView === 'name' ? '班次' : '姓名'}</strong>
              {tableView === 'shift' ? <span>班次</span> : null}
            </div>
            {appliedMonthView.people.map(person => (
              <div
                className={`identity-row ${person.name === appliedCurrentUser.name ? 'current-person-cell' : ''}`}
                key={person.name}
              >
                {tableView === 'shift' ? <strong>{person.name}</strong> : null}
                <span>{person.group}</span>
              </div>
            ))}
          </div>
          <div className="table-scroll">
            <div className="schedule-table">
              <div className="table-row table-header">
                {dateLabels.map(label => (
                  <div className={`table-head date-head ${label.date === todayMonthDay ? 'today-date-head' : ''}`} key={label.date}>
                    <strong>{label.date.slice(3)}</strong>
                    <span>{label.weekday}</span>
                  </div>
                ))}
              </div>

              {appliedMonthView.people.map(person => (
                <div className={`table-row ${person.name === appliedCurrentUser.name ? 'current-person-row' : ''}`} key={person.name}>
                  {visibleDates.map((date, index) => {
                    const shift = person.shifts[index]
                    const key = getOverrideKey(person.name, date)
                    const isEdited = Boolean(overrides.shiftOverrides[key])

                    return (
                      <button className="shift-cell date-cell" key={`${person.name}-${date}`} type="button" onClick={() => onOpenShiftEditor(person.name, date)}>
                        {isEdited ? <span className="edited-dot" /> : null}
                        {tableView === 'name' ? (
                          <span className={`name-view-person-name ${getNameViewShiftClassName(shift)}`}>{person.name}</span>
                        ) : (
                          <span className="table-shift-wrap">
                            <span className={`shift-chip ${getShiftClassName(shift)}`}>{shift}</span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {isUserPickerOpen ? (
        <div className="user-picker-backdrop" role="presentation" onClick={() => setIsUserPickerOpen(false)}>
          <section className="user-picker" role="dialog" aria-modal="true" aria-label="切换用户" onClick={event => event.stopPropagation()}>
            <div className="user-picker-header">
              <h2>切换用户</h2>
              <button className="ghost-button" type="button" onClick={() => setIsUserPickerOpen(false)}>关闭</button>
            </div>
            <div className="user-picker-list">
              {people.map(person => (
                <button
                  className={person.name === appliedCurrentUser.name ? 'active' : ''}
                  key={person.name}
                  type="button"
                  onClick={() => {
                    onCurrentUserChange(person.name)
                    setIsUserPickerOpen(false)
                  }}
                >
                  <strong>{person.name} / {person.group}</strong>
                  <span className="picker-check" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}

export function CurrentUserCard({
  appliedCurrentUser,
  isAdmin,
  summary,
  onOpenStats,
  onOpenUserPicker
}: {
  appliedCurrentUser: PersonSchedule
  isAdmin: boolean
  summary: ShiftSummary
  onOpenStats: () => void
  onOpenUserPicker: () => void
}) {
  return (
    <section className="current-user-card">
      <div className="section-header">
        <div>
          <span className="muted-label">当前用户</span>
          <h2 className="current-user-title">
            <span>{appliedCurrentUser.name}</span>
            {isAdmin ? <span className="admin-badge inline">管理员</span> : null}
            <span>{appliedCurrentUser.group}</span>
          </h2>
        </div>
        <div className="user-switch-control">
          <button className="user-switch-button stats-entry-button" type="button" onClick={onOpenStats}>统计</button>
          {isAdmin ? (
            <button className="user-switch-button" type="button" onClick={onOpenUserPicker}>切换</button>
          ) : null}
        </div>
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
  )
}
