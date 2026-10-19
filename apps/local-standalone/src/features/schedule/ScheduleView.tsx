import { useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import {
  formatScheduleMonthDay,
  getCalendarDateMeta,
  getDateLabels,
  getOverrideKey,
  getPersonMonthCalendarCells,
  scheduleData,
  type ScheduleMonth,
  type SchedulePerson,
  type ShiftSummary
} from '@local/core'
import { monthOptions } from '../../appConstants'
import { useCurrentShift } from '../../hooks/useCurrentShift'
import type { DayOverrides } from '../../services/dayRecords'
import { MonthCalendar } from './MonthCalendar'
import { ShiftPlaque } from './ShiftPlaque'
import { TeamMatrix, type TableMode } from './TeamMatrix'

interface MonthScheduleView {
  dates: string[]
  endDate: string
  people: SchedulePerson[]
  startDate: string
}

interface ScheduleViewProps {
  appliedCurrentUser: SchedulePerson
  appliedMonthView: MonthScheduleView
  chrome?: ReactNode
  confirmedKey?: string | null
  errorText?: string
  isAdmin: boolean
  isPersonPickerOpen: boolean
  overrides: DayOverrides
  people: SchedulePerson[]
  selectedMonth: ScheduleMonth
  statusText: string
  summary: ShiftSummary
  warningText?: string
  onCurrentUserChange: (personName: string) => void
  onMonthChange: (month: ScheduleMonth) => void
  onOpenShiftEditor: (personName: string, date: string) => void
  onPersonPickerClose: () => void
}

type TouchPoint = { x: number; y: number }

export function ScheduleView({
  appliedCurrentUser,
  appliedMonthView,
  chrome,
  errorText,
  isPersonPickerOpen,
  overrides,
  people,
  selectedMonth,
  summary,
  warningText,
  onCurrentUserChange,
  onMonthChange,
  onOpenShiftEditor,
  onPersonPickerClose
}: ScheduleViewProps) {
  const [tableMode, setTableMode] = useState<TableMode>('shift')
  const [slide, setSlide] = useState<'next' | 'prev' | null>(null)
  const pickerTouch = useRef<TouchPoint | null>(null)
  const touchStart = useRef<TouchPoint | null>(null)
  const suppressOpenUntil = useRef(0)

  const { dates } = appliedMonthView
  const moment = useCurrentShift(dates, appliedCurrentUser.shifts)
  const dateLabels = useMemo(() => getDateLabels(appliedMonthView.startDate, dates), [appliedMonthView.startDate, dates])
  const todayKey = formatScheduleMonthDay(new Date())
  const todayMeta = useMemo(() => {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return getCalendarDateMeta(`${now.getFullYear()}-${month}-${day}`)
  }, [todayKey])
  const monthLabel = `${appliedMonthView.startDate.slice(0, 4)}年${
    monthOptions.find(option => option.value === selectedMonth)?.label ?? `${selectedMonth} 月`
  }`

  /* 日历格要跟着本地改班走：getPersonMonthCalendarCells 读的是原始排班数据，
     所以把班次覆盖逐格贴回去。 */
  const calendarCells = useMemo(() => {
    const cells = getPersonMonthCalendarCells(scheduleData, selectedMonth, appliedCurrentUser.name)
    return cells.map(cell => {
      const override = overrides.shiftOverrides[getOverrideKey(appliedCurrentUser.name, cell.key)]
      return override ? { ...cell, shift: override } : cell
    })
  }, [appliedCurrentUser.name, overrides, selectedMonth])

  const overtimeDates = useMemo(() => new Set(
    dates.filter(date => (overrides.overtimeOverrides[getOverrideKey(appliedCurrentUser.name, date)] ?? 0) > 0)
  ), [appliedCurrentUser.name, dates, overrides.overtimeOverrides])

  const legalDates = useMemo(() => new Set(
    dates.filter(date => overrides.legalOverrides[getOverrideKey(appliedCurrentUser.name, date)] === true)
  ), [appliedCurrentUser.name, dates, overrides.legalOverrides])

  const overtimeKeys = useMemo(() => new Set(
    Object.keys(overrides.overtimeOverrides).filter(key => (overrides.overtimeOverrides[key] ?? 0) > 0)
  ), [overrides.overtimeOverrides])

  const legalKeys = useMemo(() => new Set(
    Object.keys(overrides.legalOverrides).filter(key => overrides.legalOverrides[key] === true)
  ), [overrides.legalOverrides])

  // 矩阵角标语义与日历一致：只有「加班」才打点（编辑过班次不算加班）。
  // 事假不记录加班，所以永远不会有点。

  useEffect(() => {
    if (!slide) return
    const timer = window.setTimeout(() => setSlide(null), 260)
    return () => window.clearTimeout(timer)
  }, [slide])

  function changeMonth(next: ScheduleMonth) {
    const from = monthOptions.findIndex(option => option.value === selectedMonth)
    const to = monthOptions.findIndex(option => option.value === next)
    setSlide(to > from ? 'next' : to < from ? 'prev' : null)
    onMonthChange(next)
  }

  const monthOrder = monthOptions.map(option => option.value)

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0]
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current
    const touch = event.changedTouches[0]
    touchStart.current = null
    if (!start || !touch) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) <= 56 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return

    const index = monthOrder.indexOf(selectedMonth)
    const next = monthOrder[deltaX < 0 ? index + 1 : index - 1]
    if (!next) return

    // 滑动翻月后短暂抑制格子点击，避免误触改班弹层
    suppressOpenUntil.current = Date.now() + 320
    onMonthChange(next as ScheduleMonth)
  }

  function handleOpenShiftEditor(personName: string, date: string) {
    if (Date.now() < suppressOpenUntil.current) return
    onOpenShiftEditor(personName, date)
  }

  return (
    <>
      {/* 顶栏 + 月轨冻结：滚动时只有值班牌和矩阵在动（桌面窗口里更像一个应用） */}
      <div className="app-topbar">{chrome}</div>

      {warningText ? <p className="error-banner warn">{warningText}</p> : null}
      {errorText ? <p className="error-banner">{errorText}</p> : null}

      <ShiftPlaque
        dates={dates}
        endDate={appliedMonthView.endDate}
        moment={moment}
        personGroup={appliedCurrentUser.group}
        personName={appliedCurrentUser.name}
        shifts={appliedCurrentUser.shifts}
        startDate={appliedMonthView.startDate}
        summary={summary}
        todayLabel={todayKey}
        todayMetaLabel={todayMeta.label}
      />

      <div className="board" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <MonthCalendar
          cells={calendarCells}
          legalDates={legalDates}
          monthLabel={monthLabel}
          overtimeDates={overtimeDates}
          selectedMonth={selectedMonth}
          slide={slide}
          todayKey={todayKey}
          onMonthChange={changeMonth}
          onOpen={date => onOpenShiftEditor(appliedCurrentUser.name, date)}
        />

        <TeamMatrix
          currentUserName={appliedCurrentUser.name}
          dateLabels={dateLabels}
          dates={dates}
          editedKeys={overtimeKeys}
          legalKeys={legalKeys}
          people={people}
          tableMode={tableMode}
          todayKey={todayKey}
          onOpen={onOpenShiftEditor}
          onTableModeChange={setTableMode}
        />
      </div>

      <p className="footnote">
        数据：{people.length} 人 · {dates.length} 天，结算周期 {appliedMonthView.startDate} 至 {appliedMonthView.endDate}。
        点任意格子改班；浅绿色块表示休息。
      </p>

      {isPersonPickerOpen ? (
        <div className="sheet-backdrop" role="presentation" onClick={onPersonPickerClose}>
          <section
            aria-label="切换当前用户"
            aria-modal="true"
            className="picker"
            role="dialog"
            onClick={event => event.stopPropagation()}
            onTouchEnd={event => {
              const start = pickerTouch.current
              pickerTouch.current = null
              const touch = event.changedTouches[0]
              if (!start || !touch) return
              if (touch.clientY - start.y > 80) onPersonPickerClose()
            }}
            onTouchStart={event => {
              const touch = event.touches[0]
              pickerTouch.current = touch ? { x: touch.clientX, y: touch.clientY } : null
            }}
          >
            <header className="picker-head">
              <h2>切换当前用户</h2>
              <button className="act" type="button" onClick={onPersonPickerClose}>关闭</button>
            </header>
            <div className="picker-list">
              {people.map(person => (
                <button
                  aria-selected={person.name === appliedCurrentUser.name}
                  key={person.name}
                  type="button"
                  onClick={() => {
                    onCurrentUserChange(person.name)
                    onPersonPickerClose()
                  }}
                >
                  <span>{person.name}<span className="muted"> · {person.group}</span></span>
                  <span className="tick" />
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

    </>
  )
}
