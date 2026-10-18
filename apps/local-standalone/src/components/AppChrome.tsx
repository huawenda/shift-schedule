import { useRef, type ChangeEvent } from 'react'
import type { ScheduleMonth } from '@local/core'
import { formatShortDate, monthOptions } from '../appConstants'

interface AppChromeProps {
  endDate: string
  isAdmin?: boolean
  isBooting: boolean
  isRefreshing: boolean
  personGroup: string
  personName: string
  selectedMonth: ScheduleMonth
  startDate: string
  statusText?: string
  onExportBackup: () => void
  onImportBackup: (file: File) => void
  onMonthChange: (month: ScheduleMonth) => void
  onOpenPersonPicker: () => void
  onOpenStats: () => void
  onRefresh: () => void
}

function dayCount(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
}

export function AppChrome({
  endDate,
  isAdmin = true,
  isBooting,
  isRefreshing,
  personGroup,
  personName,
  selectedMonth,
  startDate,
  statusText = '已同步',
  onExportBackup,
  onImportBackup,
  onMonthChange,
  onOpenPersonPicker,
  onOpenStats,
  onRefresh
}: AppChromeProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const monthIndex = monthOptions.findIndex(option => option.value === selectedMonth)
  const previousMonth = monthIndex > 0 ? monthOptions[monthIndex - 1] : null
  const nextMonth = monthIndex >= 0 && monthIndex < monthOptions.length - 1 ? monthOptions[monthIndex + 1] : null
  const monthLabel = monthOptions.find(option => option.value === selectedMonth)?.label ?? `${selectedMonth}月`
  const isBusy = isRefreshing || isBooting

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 先清空 value，连续选同一个文件也能再次触发 change
    event.target.value = ''
    if (file) onImportBackup(file)
  }

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

        <span className="range">
          {formatShortDate(startDate)} – {formatShortDate(endDate)} · {dayCount(startDate, endDate)} 天
        </span>
        <span className="spacer" />

        <button className="act" type="button" disabled={isBusy} onClick={onRefresh}>
          <span className={`live-dot ${isBusy ? 'busy' : ''}`} />
          <span className="sync-text">{isRefreshing ? '读取中' : statusText}</span>
        </button>

        <button aria-label="切换当前用户" className="who" type="button" onClick={onOpenPersonPicker}>
          <b>{personName}</b>
          <span className={`tag ${isAdmin ? 'admin' : ''}`}>{isAdmin ? '管理员' : personGroup}</span>
        </button>

        <button className="act act-ink" type="button" onClick={onOpenStats}>统计</button>
        <button className="act" type="button" onClick={onExportBackup}>导出</button>
        <button className="act" type="button" onClick={() => fileInputRef.current?.click()}>导入</button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          aria-label="导入排班备份文件"
          hidden
          onChange={handleFileChange}
        />
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
