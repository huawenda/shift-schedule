import type { ScheduleMonth } from '@shift-schedule/core'
import { formatShortDate, monthOptions } from '../appConstants'

interface AppChromeProps {
  currentUserGroup: string
  currentUserName: string
  dayCount: number
  endDate: string
  isAdmin: boolean
  isBooting: boolean
  isSyncing: boolean
  selectedMonth: ScheduleMonth
  startDate: string
  statusText: string
  onLogout: () => void
  onMonthChange: (month: ScheduleMonth) => void
  onOpenStats: () => void
  onOpenUserPicker: () => void
  onRefresh: () => void
}

export function AppChrome({
  currentUserGroup,
  currentUserName,
  dayCount,
  endDate,
  isAdmin,
  isBooting,
  isSyncing,
  selectedMonth,
  startDate,
  statusText,
  onLogout,
  onMonthChange,
  onOpenStats,
  onOpenUserPicker,
  onRefresh
}: AppChromeProps) {
  const monthIndex = monthOptions.findIndex(option => option.value === selectedMonth)
  const previousMonth = monthIndex > 0 ? monthOptions[monthIndex - 1] : null
  const nextMonth = monthIndex >= 0 && monthIndex < monthOptions.length - 1 ? monthOptions[monthIndex + 1] : null
  const monthLabel = monthOptions.find(option => option.value === selectedMonth)?.label ?? `${selectedMonth}月`
  const user = (
    <>
      <b>{currentUserName}</b>
      <span className={`tag ${isAdmin ? 'admin' : ''}`}>{isAdmin ? '管理员' : currentUserGroup}</span>
    </>
  )

  return (
    <>
      <header className="masthead">
        <h1 className="brand">倒班表</h1>

        <div className="stepper">
          <button
            aria-label="上一个月"
            disabled={!previousMonth}
            type="button"
            onClick={() => previousMonth && onMonthChange(previousMonth.value)}
          >
            ‹
          </button>
          <span className="mon">{monthLabel}</span>
          <button
            aria-label="下一个月"
            disabled={!nextMonth}
            type="button"
            onClick={() => nextMonth && onMonthChange(nextMonth.value)}
          >
            ›
          </button>
        </div>

        <span className="range">{formatShortDate(startDate)} – {formatShortDate(endDate)} · {dayCount} 天</span>
        <span className="spacer" />

        <button className="act" type="button" onClick={onRefresh}>
          <span className={`live-dot ${isSyncing ? 'busy' : isBooting ? 'off' : ''}`} />
          <span className="sync-text">{isSyncing ? '同步中' : statusText}</span>
        </button>

        {isAdmin ? (
          <button
            aria-label="切换当前用户"
            className="who"
            type="button"
            onClick={onOpenUserPicker}
          >
            {user}
          </button>
        ) : (
          <span className="who">{user}</span>
        )}

        <button className="act act-ink" type="button" onClick={onOpenStats}>统计</button>
        <button className="act signout" type="button" onClick={onLogout}>退出</button>
      </header>

      <nav aria-label="切换月份" className="rail">
        {monthOptions.map(option => (
          <button
            aria-selected={option.value === selectedMonth}
            key={option.value}
            type="button"
            onClick={() => onMonthChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </nav>
    </>
  )
}
