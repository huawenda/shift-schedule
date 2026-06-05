import { NavLink } from 'react-router-dom'
import type { ScheduleMonth } from '@shift-schedule/core'
import { formatDateForDisplay, monthOptions } from '../appConstants'
import type { CurrentUserProfile } from '../services/userProfile'

interface AppChromeProps {
  endDate: string
  isBooting: boolean
  isSyncing: boolean
  profile: CurrentUserProfile | null
  selectedMonth: ScheduleMonth
  startDate: string
  statusText: string
  onLogout: () => void
  onMonthChange: (month: ScheduleMonth) => void
  onRefresh: () => void
  onStatsOpen: () => void
}

export function AppChrome({
  endDate,
  isBooting,
  isSyncing,
  profile,
  selectedMonth,
  startDate,
  statusText,
  onLogout,
  onMonthChange,
  onRefresh,
  onStatsOpen
}: AppChromeProps) {
  return (
    <>
      <section className="hero-panel">
        <div>
          <h1>倒班表</h1>
          <p className="period">{formatDateForDisplay(startDate)} - {formatDateForDisplay(endDate)}</p>
        </div>
        <button className="sync-button" type="button" disabled={isSyncing || isBooting} onClick={onRefresh}>
          {isSyncing ? '同步中' : '同步'}
        </button>
      </section>

      <nav className="month-tabs" aria-label="选择月份">
        {monthOptions.map(month => (
          <button
            className={`month-tab ${selectedMonth === month.value ? 'active' : ''}`}
            key={month.value}
            type="button"
            onClick={() => onMonthChange(month.value)}
          >
            {month.label}
          </button>
        ))}
      </nav>

      <section className="status-strip">
        <span>{statusText}</span>
        {profile?.profile ? (
          <button type="button" onClick={onLogout}>退出</button>
        ) : null}
      </section>

      <nav className="view-tabs" aria-label="切换视图">
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/schedule">
          排班
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/stats" onClick={onStatsOpen}>
          统计
        </NavLink>
      </nav>
    </>
  )
}
