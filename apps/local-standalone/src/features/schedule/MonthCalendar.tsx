import { useRef } from 'react'
import type { CalendarCell, ScheduleMonth } from '@local/core'
import { monthOptions, shiftInitial, shiftLabels } from '../../appConstants'
import { getShiftClass } from '../../scheduleHelpers'

interface MonthCalendarProps {
  cells: CalendarCell[]
  monthLabel: string
  overtimeDates: Set<string>
  selectedMonth: ScheduleMonth
  slide: 'next' | 'prev' | null
  todayKey: string
  onMonthChange: (month: ScheduleMonth) => void
  onOpen: (date: string) => void
}

export function MonthCalendar({
  cells,
  monthLabel,
  overtimeDates,
  selectedMonth,
  slide,
  todayKey,
  onMonthChange,
  onOpen
}: MonthCalendarProps) {
  const monthIndex = monthOptions.findIndex(option => option.value === selectedMonth)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  function shiftMonth(offset: number) {
    const next = monthOptions[monthIndex + offset]
    if (next) onMonthChange(next.value)
  }

  return (
    <section aria-label="排班日历" className="cal-wrap">
      <div className="sec-head">
        <h2>排班日历</h2>
        <span className="sub">{monthLabel} · 点日期改班</span>
      </div>

      <div
        className={`cal ${slide === 'next' ? 'cal-slide-next' : slide === 'prev' ? 'cal-slide-prev' : ''}`}
        onTouchEnd={event => {
          const start = touchStart.current
          touchStart.current = null
          const touch = event.changedTouches[0]
          if (!start || !touch) return
          const deltaX = touch.clientX - start.x
          const deltaY = touch.clientY - start.y
          if (Math.abs(deltaX) > 56 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
            shiftMonth(deltaX < 0 ? 1 : -1)
          }
        }}
        onTouchStart={event => {
          const touch = event.touches[0]
          touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
        }}
      >
        {['日', '一', '二', '三', '四', '五', '六'].map(weekday => (
          <span className="wd" key={weekday}>{weekday}</span>
        ))}

        {cells.map((cell, index) => {
          const shift = cell.shift
          const isToday = cell.key === todayKey
          const hasOvertime = overtimeDates.has(cell.key)

          return (
            <button
              aria-label={`${cell.key} ${shift ?? '未排班'}${hasOvertime ? ' 有加班' : ''}`}
              className={[
                'cell',
                shift ? getShiftClass(shift) : '',
                cell.inCurrentMonth ? '' : 'is-ghost',
                isToday ? 'is-today' : '',
                hasOvertime ? 'has-overtime' : ''
              ].filter(Boolean).join(' ')}
              key={`${cell.key}-${index}`}
              type="button"
              onClick={() => onOpen(cell.key)}
            >
              <span className="d">{cell.day}</span>
              <span className={`lunar ${cell.meta.isHoliday ? 'holiday' : ''}`}>{cell.meta.label}</span>
              <span className="s">{shift ? shiftInitial[shift] : ''}</span>
            </button>
          )
        })}
      </div>

      <div className="cal-foot">
        <div className="legend">
          {shiftLabels.map(shift => (
            <span key={shift}>
              <i className={`swatch ${getShiftClass(shift)}`} />
              {shift}
            </span>
          ))}
          <span><i className="legal-dot" />加班</span>
        </div>
      </div>
    </section>
  )
}
