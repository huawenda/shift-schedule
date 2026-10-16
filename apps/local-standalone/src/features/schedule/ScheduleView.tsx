import { useEffect, useRef, useState, type ReactNode, type RefObject, type TouchEvent } from 'react'
import {
  formatScheduleMonthDay,
  getOverrideKey,
  getPersonMonthCalendarCells,
  scheduleData,
  type ShiftSummary,
  type ShiftType,
  type ScheduleMonth
} from '@local/core'
import { shiftLabels } from '../../appConstants'
import { useDialog } from '../../hooks/useDialog'
import { getShiftClassName } from '../../scheduleHelpers'
import type { DayOverrides } from '../../services/dayRecords'

type RosterView = 'shift' | 'name'

interface PersonSchedule {
  group: string
  name: string
  shifts: ShiftType[]
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
  confirmedKey?: string | null
  errorText?: string
  isAdmin: boolean
  isPersonPickerOpen: boolean
  overrides: DayOverrides
  people: PersonSchedule[]
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
const scheduleMonthOrder: ScheduleMonth[] = ['05', '06', '07', '08', '09', '10', '11', '12']

export function ScheduleView({
  appliedCurrentUser,
  appliedMonthView,
  chrome,
  confirmedKey,
  errorText,
  isAdmin,
  isPersonPickerOpen,
  overrides,
  people,
  selectedMonth,
  statusText,
  summary,
  warningText,
  onCurrentUserChange,
  onMonthChange,
  onOpenShiftEditor,
  onPersonPickerClose
}: ScheduleViewProps) {
  const [rosterView, setRosterView] = useState<RosterView>('shift')
  const [swiped, setSwiped] = useState(false)
  const touchStart = useRef<TouchPoint | null>(null)
  const matrixScrollRef = useRef<HTMLDivElement | null>(null)
  const pickerRef = useDialog(isPersonPickerOpen, onPersonPickerClose)

  const today = formatScheduleMonthDay(new Date())
  const calendarCells = getPersonMonthCalendarCells(scheduleData, selectedMonth, appliedCurrentUser.name)

  /* 滚轮横向滚动：矩阵是唯一的宽内容，桌面端鼠标只有纵向滚轮，
     不转换的话必须去拖底部的滚动条或者 Shift+滚轮，两者都很难发现。
     只在「矩阵真的装不下」时才拦截：能一屏放下时不劫持纵向滚动，
     否则用户会发现整页滚不动。 */
  useEffect(() => {
    const node = matrixScrollRef.current
    if (!node) return

    function handleWheel(event: WheelEvent) {
      const maxScroll = node!.scrollWidth - node!.clientWidth
      if (maxScroll <= 1) return

      const deltaX = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0
      const deltaY = event.deltaY

      // 触控板的横向手势原样放行，不做转换。
      if (deltaX !== 0) return
      // 纯纵向滚动，且当前已经在左端继续向下滚/右端继续向上滚 → 交还页面。
      if (node!.scrollLeft <= 0 && deltaY < 0) return
      if (node!.scrollLeft >= maxScroll - 1 && deltaY > 0) return

      event.preventDefault()
      node!.scrollLeft += deltaY
    }

    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [])

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

    const index = scheduleMonthOrder.indexOf(selectedMonth)
    const next = scheduleMonthOrder[deltaX < 0 ? index + 1 : index - 1]
    if (!next) return

    setSwiped(true)
    onMonthChange(next)
    window.setTimeout(() => setSwiped(false), 0)
  }

  return (
    <>
      {chrome}
      <SummaryBar summary={summary} statusText={statusText} />

      {errorText ? <p className="notice notice-error" role="alert">{errorText}</p> : null}
      {warningText ? <p className="notice notice-warn">{warningText}</p> : null}

      <div className="content" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <aside className="side-col">
          <div className="section-head">
            <h2 className="section-title">排班日历</h2>
            <span className="section-meta">{appliedCurrentUser.name}</span>
          </div>
          <div className="panel" style={{ padding: 'var(--sp-3)' }}>
            <div className="calendar">
              {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                <div className="calendar-weekday" key={day} aria-hidden="true">{day}</div>
              ))}
              {calendarCells.map(cell => (
                <CalendarCell
                  confirmed={confirmedKey === getOverrideKey(appliedCurrentUser.name, cell.key)}
                  key={cell.key}
                  cell={cell}
                  today={cell.key === today}
                  overrides={overrides}
                  personName={appliedCurrentUser.name}
                  onOpen={onOpenShiftEditor}
                  onSkip={() => swiped}
                />
              ))}
            </div>
          </div>
        </aside>

        <div className="main-col">
          <div className="section-head">
            <h2 className="section-title">排班表</h2>
            <div className="segmented" role="tablist" aria-label="表格显示方式">
              <button
                role="tab"
                type="button"
                aria-selected={rosterView === 'shift'}
                onClick={() => setRosterView('shift')}
              >
                按班次
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={rosterView === 'name'}
                onClick={() => setRosterView('name')}
              >
                按姓名
              </button>
            </div>
          </div>

          <div className="matrix">
            <div className="matrix-rail">
              <div className="rail-cell rail-head">姓名</div>
              {appliedMonthView.people.map(person => (
                <div
                  className={`rail-cell ${person.name === appliedCurrentUser.name ? 'is-current' : ''}`}
                  key={person.name}
                >
                  <span className="rail-name">{person.name}</span>
                  <span className="rail-group">{person.group}</span>
                </div>
              ))}
            </div>

            <div className="matrix-scroll" ref={matrixScrollRef}>
              <div className="matrix-head" role="row">
                {appliedMonthView.dates.map(date => (
                  <div
                    className={`date-head ${date === today ? 'is-today' : ''}`}
                    key={date}
                    role="columnheader"
                  >
                    <span className="date-head-day">{date.slice(3)}</span>
                    <span className="date-head-week">{weekdayOf(date)}</span>
                  </div>
                ))}
              </div>

              {appliedMonthView.people.map(person => (
                <div
                  className={`roster-row ${person.name === appliedCurrentUser.name ? 'is-current' : ''}`}
                  key={person.name}
                  role="row"
                >
                  {appliedMonthView.dates.map((date, dateIndex) => (
                    <RosterCell
                      confirmed={confirmedKey === getOverrideKey(person.name, date)}
                      date={date}
                      isCurrent={person.name === appliedCurrentUser.name}
                      key={`${person.name}-${date}`}
                      overrides={overrides}
                      personName={person.name}
                      shift={person.shifts[dateIndex]}
                      view={rosterView}
                      onOpen={onOpenShiftEditor}
                      onSkip={() => swiped}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="matrix-legend">
            {shiftLabels.map(shift => (
              <span className="legend-item" key={shift}>
                <span className={`legend-swatch ${getShiftClassName(shift)}`} />
                {shift}
              </span>
            ))}
            <span className="legend-item">底边灰条 = 有加班</span>
          </div>
        </div>
      </div>

      {isPersonPickerOpen ? (
        <PersonPicker
          appliedCurrentUser={appliedCurrentUser}
          onClose={onPersonPickerClose}
          onSelect={onCurrentUserChange}
          people={people}
          sheetRef={pickerRef}
        />
      ) : null}
    </>
  )
}

function PersonPicker({
  appliedCurrentUser,
  onClose,
  onSelect,
  people,
  sheetRef
}: {
  appliedCurrentUser: PersonSchedule
  onClose: () => void
  onSelect: (personName: string) => void
  people: PersonSchedule[]
  sheetRef: RefObject<HTMLElement>
}) {
  return (
    <div className="scrim" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="切换人员"
        ref={sheetRef}
        onClick={event => event.stopPropagation()}
      >
        <header className="sheet-head">
          <div>
            <h2 className="sheet-title">切换人员</h2>
            <p className="sheet-sub">共 {people.length} 人</p>
          </div>
          <button className="btn btn-ghost" type="button" onClick={onClose}>关闭</button>
        </header>
        <div className="picker-list">
          {people.map(person => (
            <button
              className="picker-item"
              type="button"
              aria-selected={person.name === appliedCurrentUser.name}
              key={person.name}
              onClick={() => {
                onSelect(person.name)
                onClose()
              }}
            >
              <span>{person.name}</span>
              <span className="picker-group">{person.group}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function RosterCell({
  confirmed,
  date,
  isCurrent,
  overrides,
  personName,
  shift,
  view,
  onOpen,
  onSkip
}: {
  confirmed: boolean
  date: string
  isCurrent: boolean
  overrides: DayOverrides
  personName: string
  shift: ShiftType | undefined
  view: RosterView
  onOpen: (personName: string, date: string) => void
  onSkip: () => boolean
}) {
  if (!shift) return <div className="roster-cell" />

  const key = getOverrideKey(personName, date)
  const isEdited = Boolean(overrides.shiftOverrides[key])
  const isLegal = overrides.legalOverrides[key] === true
  const hasOvertime = (overrides.overtimeOverrides[key] ?? 0) > 0

  const className = [
    'roster-cell',
    getShiftClassName(shift),
    view === 'name' ? 'is-name' : '',
    isCurrent ? 'is-current' : '',
    isEdited ? 'is-edited' : '',
    isLegal ? 'is-legal' : '',
    hasOvertime ? 'has-overtime' : '',
    confirmed ? 'is-confirmed' : ''
  ].filter(Boolean).join(' ')

  return (
    <button
      className={className}
      type="button"
      title={`${personName} ${date} ${shift}`}
      onClick={() => {
        if (onSkip()) return
        onOpen(personName, date)
      }}
    >
      {view === 'name' ? personName : shift}
    </button>
  )
}

function CalendarCell({
  cell,
  confirmed,
  overrides,
  personName,
  today,
  onOpen,
  onSkip
}: {
  cell: { day: string; inCurrentMonth: boolean; key: string; meta: { isHoliday: boolean; label: string }; shift?: ShiftType }
  confirmed: boolean
  overrides: DayOverrides
  personName: string
  today: boolean
  onOpen: (personName: string, date: string) => void
  onSkip: () => boolean
}) {
  const key = getOverrideKey(personName, cell.key)
  const shift = overrides.shiftOverrides[key] ?? cell.shift
  const isLegal = overrides.legalOverrides[key] === true
  const hasOvertime = (overrides.overtimeOverrides[key] ?? 0) > 0

  if (!cell.inCurrentMonth) {
    /* 周期外日期照常渲染，只是整体降调：去掉班次色块和可点性，
       只留下日期数字与淡色标记 —— 这些天不是本月排班范围，
       颜色给足了会让人以为它们也参与统计。 */
    return (
      <button
        className={[
          'calendar-cell',
          'is-outside',
          shift ? getShiftClassName(shift) : '',
          isLegal ? 'is-legal' : '',
          today ? 'is-today' : ''
        ].filter(Boolean).join(' ')}
        type="button"
        title={`${cell.key} ${shift ?? ''}（非本月）`}
        onClick={() => {
          if (onSkip()) return
          onOpen(personName, cell.key)
        }}
      >
        <span className="calendar-day">{cell.day}</span>
        <span className={`calendar-lunar ${cell.meta.isHoliday ? 'is-festival' : ''}`}>
          {cell.meta.label}
        </span>
        {shift ? <span className="calendar-bar" /> : null}
      </button>
    )
  }

  return (
    <button
      className={[
        'calendar-cell',
        shift ? getShiftClassName(shift) : '',
        isLegal ? 'is-legal' : '',
        today ? 'is-today' : '',
        confirmed ? 'is-confirmed' : ''
      ].filter(Boolean).join(' ')}
      type="button"
      title={`${cell.key} ${shift ?? ''}${isLegal ? ' 法定' : ''}`}
      onClick={() => {
        if (onSkip()) return
        onOpen(personName, cell.key)
      }}
    >
      <span className="calendar-day">{cell.day}</span>
      <span className={`calendar-lunar ${cell.meta.isHoliday ? 'is-festival' : ''}`}>
        {cell.meta.label}
      </span>
      {shift ? <span className="calendar-bar" /> : null}
      {hasOvertime || isLegal ? (
        <span className="calendar-marks">
          {hasOvertime ? <span className="calendar-mark" /> : null}
          {isLegal ? <span className="calendar-mark is-legal" /> : null}
        </span>
      ) : null}
    </button>
  )
}

function SummaryBar({ summary, statusText }: { summary: ShiftSummary; statusText: string }) {
  return (
    <div className="summary-bar">
      {shiftLabels.map(shift => (
        <div className={`summary-item ${getShiftClassName(shift)}`} key={shift}>
          <span className="summary-value">{summary[shift] ?? 0}</span>
          <span className="summary-label">{shift}</span>
        </div>
      ))}
      <div className="summary-rule" />
      <div className="summary-item">
        <span className="summary-label">{statusText}</span>
      </div>
    </div>
  )
}

const weekdays = ['日', '一', '二', '三', '四', '五', '六']

function weekdayOf(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return weekdays[new Date(year, month - 1, day).getDay()]
}