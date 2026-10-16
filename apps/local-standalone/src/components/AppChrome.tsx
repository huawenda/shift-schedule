import { useRef, type ChangeEvent } from 'react'
import type { ScheduleMonth } from '@local/core'
import appMark from '../assets/icon2.png'
import { formatDateForDisplay, monthOptions } from '../appConstants'

interface AppChromeProps {
  endDate: string
  isBooting: boolean
  isRefreshing: boolean
  selectedMonth: ScheduleMonth
  startDate: string
  statusText: string
  onExportBackup: () => void
  onImportBackup: (file: File) => void
  onMonthChange: (month: ScheduleMonth) => void
  onRefresh: () => void
}

export function AppChrome({
  endDate,
  isBooting,
  isRefreshing,
  selectedMonth,
  startDate,
  statusText,
  onExportBackup,
  onImportBackup,
  onMonthChange,
  onRefresh
}: AppChromeProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 先清空 value，这样连续选同一个文件也能再次触发 change
    event.target.value = ''
    if (file) onImportBackup(file)
  }

  return (
    <div className="app-chrome-sticky">
      <section className="hero-panel">
        <div className="hero-title-group">
          <img className="app-mark" src={appMark} alt="" aria-hidden="true" />
          <div>
            <h1>倒班表</h1>
            <p className="period">{formatDateForDisplay(startDate)} - {formatDateForDisplay(endDate)}</p>
          </div>
        </div>
        <button className="sync-button" type="button" disabled={isRefreshing || isBooting} onClick={onRefresh}>
          {isRefreshing ? '读取中' : '刷新'}
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
        <span className="local-actions">
          <button type="button" onClick={onExportBackup}>导出备份</button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>导入备份</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </span>
      </section>
    </div>
  )
}
