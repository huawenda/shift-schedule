import { useRef, type ChangeEvent } from 'react'
import type { ScheduleMonth } from '@local/core'
import { monthOptions } from '../appConstants'

interface AppChromeProps {
  endDate: string
  isBooting: boolean
  isRefreshing: boolean
  personName: string
  personGroup: string
  selectedMonth: ScheduleMonth
  startDate: string
  onExportBackup: () => void
  onImportBackup: (file: File) => void
  onMonthChange: (month: ScheduleMonth) => void
  onOpenPersonPicker: () => void
  onOpenStats: () => void
  onRefresh: () => void
}

const monthIndex = (month: ScheduleMonth) => monthOptions.findIndex(item => item.value === month)

export function AppChrome({
  endDate,
  isBooting,
  isRefreshing,
  personName,
  personGroup,
  selectedMonth,
  startDate,
  onExportBackup,
  onImportBackup,
  onMonthChange,
  onOpenPersonPicker,
  onOpenStats,
  onRefresh
}: AppChromeProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const index = monthIndex(selectedMonth)
  const isBusy = isRefreshing || isBooting

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 先清空 value，连续选同一个文件也能再次触发 change
    event.target.value = ''
    if (file) onImportBackup(file)
  }

  function step(offset: number) {
    const next = monthOptions[index + offset]
    if (next) onMonthChange(next.value)
  }

  return (
    <div>
      <header className="top-bar">
        <div className="brand">
          <span className="brand-name">倒班表</span>
          <span className="brand-period">
            {formatPeriod(startDate)} – {formatPeriod(endDate)}
          </span>
        </div>

        <div className="stepper">
          <button
            type="button"
            aria-label="上一个月"
            disabled={index <= 0}
            onClick={() => step(-1)}
          >
            ◀
          </button>
          <span className="stepper-value">{monthOptions[index]?.label ?? '—'}</span>
          <button
            type="button"
            aria-label="下一个月"
            disabled={index >= monthOptions.length - 1}
            onClick={() => step(1)}
          >
            ▶
          </button>
        </div>

        <div className="top-bar-spacer" />

        <div className="top-bar-actions">
          <button className="person-chip" type="button" onClick={onOpenPersonPicker}>
            {personName}
            <span className="person-chip-caret">{personGroup}</span>
            <span className="person-chip-caret" aria-hidden="true">▾</span>
          </button>

          <button className="btn" type="button" disabled={isBusy} onClick={onRefresh}>
            {isRefreshing ? '读取中…' : '刷新'}
          </button>

          <button className="btn" type="button" onClick={onOpenStats}>统计</button>

          <button className="btn" type="button" onClick={onExportBackup}>导出</button>
          <button className="btn" type="button" onClick={() => fileInputRef.current?.click()}>导入</button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            aria-label="导入排班备份文件"
            hidden
            onChange={handleFileChange}
          />
        </div>
      </header>
    </div>
  )
}

function formatPeriod(date: string) {
  const [, month, day] = date.split('-')
  return `${month}/${day}`
}