import { useEffect, useMemo, useState } from 'react'
import {
  formatScheduleMonthDay,
  getCalendarDateMeta,
  getDateLabels,
  getOverrideKey,
  type CalendarCell,
  type ScheduleData,
  type ScheduleMonth,
  type SchedulePerson,
  type ShiftSummary
} from '@shift-schedule/core'
import { AppChrome } from '../../components/AppChrome'
import { monthOptions } from '../../appConstants'
import { useBackDismiss } from '../../hooks/useBackDismiss'
import { useCurrentShift } from '../../hooks/useCurrentShift'
import type { CloudOverrides } from '../../services/cloudRecords'
import { MonthCalendar } from './MonthCalendar'
import { ShiftPlaque } from './ShiftPlaque'
import { TeamMatrix, type TableMode } from './TeamMatrix'

interface ScheduleViewProps {
  appliedCurrentUser: SchedulePerson
  appliedMonthView: ScheduleData
  calendarCells: CalendarCell[]
  isAdmin: boolean
  isBooting: boolean
  isSyncing: boolean
  overrides: CloudOverrides
  people: SchedulePerson[]
  selectedMonth: ScheduleMonth
  statusText: string
  summary: ShiftSummary
  onCurrentUserChange: (name: string) => void
  onLogout: () => void
  onMonthChange: (month: ScheduleMonth) => void
  onOpenShiftEditor: (personName: string, date: string) => void
  onOpenStats: () => void
  onRefresh: () => void
}

export function ScheduleView({
  appliedCurrentUser,
  appliedMonthView,
  calendarCells,
  isAdmin,
  isBooting,
  isSyncing,
  overrides,
  people,
  selectedMonth,
  statusText,
  summary,
  onCurrentUserChange,
  onLogout,
  onMonthChange,
  onOpenShiftEditor,
  onOpenStats,
  onRefresh
}: ScheduleViewProps) {
  const [tableMode, setTableMode] = useState<TableMode>('shift')
  const [isUserPickerOpen, setIsUserPickerOpen] = useState(false)
  const [slide, setSlide] = useState<'next' | 'prev' | null>(null)

  useBackDismiss(isUserPickerOpen, () => setIsUserPickerOpen(false))

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
  const monthLabel = `${appliedMonthView.startDate.slice(0, 4)}年${monthOptions.find(option => option.value === selectedMonth)?.label ?? `${selectedMonth} 月`}`

  const overtimeDates = useMemo(() => new Set(
    dates.filter(date => (overrides.overtimeOverrides[getOverrideKey(appliedCurrentUser.name, date)] ?? 0) > 0)
  ), [appliedCurrentUser.name, dates, overrides.overtimeOverrides])

  const editedKeys = useMemo(() => {
    const keys = new Set<string>([
      ...Object.keys(overrides.shiftOverrides),
      ...Object.keys(overrides.overtimeOverrides),
      ...Object.keys(overrides.legalOverrides),
      ...Object.keys(overrides.leaveDurationOverrides)
    ])
    return keys
  }, [overrides])

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

  return (
    <>
      <AppChrome
        currentUserGroup={appliedCurrentUser.group}
        currentUserName={appliedCurrentUser.name}
        dayCount={dates.length}
        endDate={appliedMonthView.endDate}
        isAdmin={isAdmin}
        isBooting={isBooting}
        isSyncing={isSyncing}
        selectedMonth={selectedMonth}
        startDate={appliedMonthView.startDate}
        statusText={statusText}
        onLogout={onLogout}
        onMonthChange={changeMonth}
        onOpenStats={onOpenStats}
        onOpenUserPicker={() => setIsUserPickerOpen(true)}
        onRefresh={onRefresh}
      />

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

      <div className="board">
        <MonthCalendar
          cells={calendarCells}
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
          editedKeys={editedKeys}
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

      {isUserPickerOpen ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setIsUserPickerOpen(false)}>
          <section
            aria-label="切换当前用户"
            aria-modal="true"
            className="picker"
            role="dialog"
            onClick={event => event.stopPropagation()}
          >
            <header className="picker-head">
              <h2>切换当前用户</h2>
              <button className="act" type="button" onClick={() => setIsUserPickerOpen(false)}>关闭</button>
            </header>
            <div className="picker-list">
              {people.map(person => (
                <button
                  aria-selected={person.name === appliedCurrentUser.name}
                  key={person.name}
                  type="button"
                  onClick={() => {
                    onCurrentUserChange(person.name)
                    setIsUserPickerOpen(false)
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
