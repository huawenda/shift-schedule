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
  onRefresh
}: AppChromeProps) {
  return (
    <div className="app-chrome-sticky">
      <section className="hero-panel">
        <div className="hero-title-group">
          <img className="app-mark" src="/icons/icon2.png" alt="" aria-hidden="true" />
          <div>
            <h1>倒班表</h1>
            <p className="period">{formatDateForDisplay(startDate)} - {formatDateForDisplay(endDate)}</p>
          </div>
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
    </div>
  )
}
