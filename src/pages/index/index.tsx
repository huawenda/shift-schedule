import { useEffect, useRef, useState } from 'react'
import { Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { scheduleData } from '../../data/schedule'
import type { ShiftType } from '../../types/schedule'
import { getShiftClassName } from '../../utils/shift'
import {
  formatScheduleMonthDay,
  getDateLabels,
  getCurrentScheduleMonth,
  getMonthScheduleView,
  getPersonMonthCalendarCells,
  getPersonShiftSummary,
  normalizeOvertimeHours,
  type ScheduleMonth
} from '../../utils/schedule'
import './index.scss'

const defaultCurrentUserName = '华文达'
const formatDateRangePart = (date: string) => date.split('-').join('/')
const getDayPart = (date: string) => date.slice(3)
const dateColumnWidth = 74
const identityColumnWidth = 148
const monthTabWidth = 104
const monthTabGap = 8
const monthTabsHorizontalPadding = 12
const pageHorizontalPadding = 36
const monthVisiblePadding = 8
const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
type TableView = 'shift' | 'name'
type CalendarAnimation = '' | 'calendar-slide-next' | 'calendar-slide-previous'
const monthOptions: Array<{ label: string; value: ScheduleMonth }> = [
  { label: '5月', value: '05' },
  { label: '6月', value: '06' },
  { label: '7月', value: '07' },
  { label: '8月', value: '08' },
  { label: '9月', value: '09' },
  { label: '10月', value: '10' },
  { label: '11月', value: '11' },
  { label: '12月', value: '12' }
]
const tableViewOptions: Array<{ label: string; value: TableView }> = [
  { label: '常规', value: 'shift' },
  { label: '姓名', value: 'name' }
]
const editableShiftOptions: ShiftType[] = ['白班', '夜班', '休息', '白特', '夜特']
const legendShiftOptions: ShiftType[] = ['白班', '夜班', '休息', '白特', '夜特']
const shiftOverridesStorageKey = 'shift-scheduler:shift-overrides:v1'
const overtimeOverridesStorageKey = 'shift-scheduler:overtime-overrides:v1'
const shiftOverridesFileName = 'shift-overrides-v1.json'
const overtimeOverridesFileName = 'overtime-overrides-v1.json'

type ShiftOverrides = Record<string, ShiftType>
type OvertimeOverrides = Record<string, number>
interface ShiftEditorState {
  personName: string
  date: string
  baseShift: ShiftType
  overtimeInput: string
}

function getCenteredTableScrollLeft(date: string, dates: string[]): number {
  const dateIndex = dates.indexOf(date)
  if (dateIndex < 0) return 0

  const scale = getRpxScale()
  const tableVisibleWidth = 750 - pageHorizontalPadding - identityColumnWidth
  const columnCenter = (dateIndex * dateColumnWidth) + (dateColumnWidth / 2)
  return Math.max(0, columnCenter - (tableVisibleWidth / 2)) * scale
}

function getHeaderTopPadding(): string {
  try {
    const menuButton = Taro.getMenuButtonBoundingClientRect()
    const systemInfo = Taro.getSystemInfoSync()
    if (
      typeof menuButton?.top === 'number'
      && typeof menuButton?.height === 'number'
      && menuButton.top > 0
      && systemInfo.windowWidth > 0
    ) {
      const rpxScale = systemInfo.windowWidth / 750
      const titleLineHeight = 32 * 1.2 * rpxScale
      const alignedTop = menuButton.top + ((menuButton.height - titleLineHeight) / 2)
      return `${Math.max(alignedTop, 0)}px`
    }
  } catch {
    // Some devtool runtimes may not expose menu metrics during initial render.
  }

  return '48px'
}

function getRpxScale(): number {
  return Taro.getSystemInfoSync().windowWidth / 750
}

function getMonthTargetScrollLeft(month: ScheduleMonth, currentScrollLeftPx: number): number | null {
  const monthIndex = monthOptions.findIndex(option => option.value === month)
  if (monthIndex < 0) return null

  const scale = getRpxScale()
  const currentScrollLeft = currentScrollLeftPx / scale
  const visibleWidth = 750 - pageHorizontalPadding - monthTabsHorizontalPadding
  const tabStart = monthIndex * (monthTabWidth + monthTabGap)
  const tabEnd = tabStart + monthTabWidth
  const visibleStart = currentScrollLeft
  const visibleEnd = visibleStart + visibleWidth

  if (tabStart >= visibleStart && tabEnd <= visibleEnd) {
    return null
  }

  if (tabEnd > visibleEnd) {
    return Math.max(0, tabEnd - visibleWidth + monthVisiblePadding) * scale
  }

  return Math.max(0, tabStart - monthVisiblePadding) * scale
}

function getNameViewShiftClassName(shift: ShiftType): string {
  return {
    白班: 'name-shift-day',
    夜班: 'name-shift-night',
    休息: 'name-shift-rest',
    白特: 'name-shift-special-day',
    夜特: 'name-shift-special-night'
  }[shift]
}

function getOverrideKey(personName: string, date: string): string {
  return `${personName}::${date}`
}

function applyShiftOverrides(overrides: ShiftOverrides) {
  return {
    ...scheduleData,
    people: scheduleData.people.map(person => ({
      ...person,
      shifts: person.shifts.map((shift, index) => (
        overrides[getOverrideKey(person.name, scheduleData.dates[index])] ?? shift
      ))
    }))
  }
}

function getBaseShift(personName: string, date: string): ShiftType | null {
  const person = scheduleData.people.find(item => item.name === personName)
  const dateIndex = scheduleData.dates.indexOf(date)
  if (!person || dateIndex < 0) return null

  return person.shifts[dateIndex]
}

function formatOvertimeHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

function canRecordOvertime(shift: ShiftType): boolean {
  return shift !== '休息'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isShiftType(value: unknown): value is ShiftType {
  return editableShiftOptions.includes(value as ShiftType)
}

function readShiftOverridesFromStorage(): ShiftOverrides {
  const storedValue = readStorage(shiftOverridesStorageKey)
  return parseShiftOverrides(isRecord(storedValue) ? storedValue : readJsonBackup(shiftOverridesFileName))
}

function readOvertimeOverridesFromStorage(): OvertimeOverrides {
  const storedValue = readStorage(overtimeOverridesStorageKey)
  return parseOvertimeOverrides(isRecord(storedValue) ? storedValue : readJsonBackup(overtimeOverridesFileName))
}

function readStorage(key: string): unknown {
  try {
    return Taro.getStorageSync(key)
  } catch {
    return null
  }
}

function parseShiftOverrides(value: unknown): ShiftOverrides {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<ShiftOverrides>((overrides, [key, value]) => {
      if (isShiftType(value)) overrides[key] = value
      return overrides
    }, {})
}

function parseOvertimeOverrides(value: unknown): OvertimeOverrides {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<OvertimeOverrides>((overrides, [key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        overrides[key] = normalizeOvertimeHours(value)
      }
      return overrides
    }, {})
}

function getBackupFilePath(fileName: string): string | null {
  const env = Taro.env as { USER_DATA_PATH?: string } | undefined
  return env?.USER_DATA_PATH ? `${env.USER_DATA_PATH}/${fileName}` : null
}

function readJsonBackup(fileName: string): unknown {
  try {
    const filePath = getBackupFilePath(fileName)
    if (!filePath) return null

    const content = Taro.getFileSystemManager().readFileSync(filePath, 'utf8')
    return typeof content === 'string' ? JSON.parse(content) : null
  } catch {
    return null
  }
}

function writePersistence(key: string, fileName: string, value: unknown) {
  try {
    Taro.setStorageSync(key, value)
  } catch {
    // Local persistence should never block editing in runtimes with restricted storage.
  }

  try {
    const filePath = getBackupFilePath(fileName)
    if (!filePath) return

    Taro.getFileSystemManager().writeFileSync(filePath, JSON.stringify(value), 'utf8')
  } catch {
    // The file backup is best-effort because some runtimes only expose storage.
  }
}

export default function Index() {
  const todayDate = new Date()
  const todayMonthDay = formatScheduleMonthDay(todayDate)
  const currentScheduleMonth = getCurrentScheduleMonth(scheduleData, todayDate)
  const [activeMonth, setActiveMonth] = useState<ScheduleMonth>(currentScheduleMonth ?? '05')
  const [currentUserName, setCurrentUserName] = useState(defaultCurrentUserName)
  const [tableView, setTableView] = useState<TableView>('shift')
  const [calendarAnimation, setCalendarAnimation] = useState<CalendarAnimation>('')
  const [headerTopPadding] = useState(getHeaderTopPadding)
  const [shiftOverrides, setShiftOverrides] = useState<ShiftOverrides>(readShiftOverridesFromStorage)
  const [overtimeOverrides, setOvertimeOverrides] = useState<OvertimeOverrides>(readOvertimeOverridesFromStorage)
  const [shiftEditor, setShiftEditor] = useState<ShiftEditorState | null>(null)
  const [monthScrollLeft, setMonthScrollLeft] = useState(() => (
    getMonthTargetScrollLeft(currentScheduleMonth ?? '05', 0) ?? 0
  ))
  const [tableScrollLeft, setTableScrollLeft] = useState(0)
  const calendarTouchStart = useRef<{ x: number; y: number } | null>(null)
  const calendarAnimationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monthScrollLeftRef = useRef(monthScrollLeft)
  const effectiveScheduleData = applyShiftOverrides(shiftOverrides)
  const activeScheduleData = getMonthScheduleView(effectiveScheduleData, activeMonth)
  const currentUser = activeScheduleData.people.find(person => person.name === currentUserName)
    ?? activeScheduleData.people[0]
  const userPickerOptions = scheduleData.people.map(person => `${person.name} / ${person.group}`)
  const currentUserIndex = Math.max(
    scheduleData.people.findIndex(person => person.name === currentUser.name),
    0
  )
  const dateRangeText = `${formatDateRangePart(activeScheduleData.startDate)} - ${formatDateRangePart(activeScheduleData.endDate)}`
  const currentUserOvertimeHours = currentUser
    ? activeScheduleData.dates.map(date => overtimeOverrides[getOverrideKey(currentUser.name, date)] ?? 0)
    : []
  const shiftSummary = currentUser ? getPersonShiftSummary(currentUser, currentUserOvertimeHours) : null
  const calendarCells = currentUser
    ? getPersonMonthCalendarCells(effectiveScheduleData, activeMonth, currentUser.name)
    : []
  const dateLabels = getDateLabels(activeScheduleData.startDate, activeScheduleData.dates)
  const scheduleTableStyle = `width: ${dateLabels.length * dateColumnWidth}rpx`
  const activeMonthIndex = monthOptions.findIndex(option => option.value === activeMonth)

  useEffect(() => {
    if (activeScheduleData.dates.includes(todayMonthDay)) {
      setTableScrollLeft(getCenteredTableScrollLeft(todayMonthDay, activeScheduleData.dates))
    } else {
      setTableScrollLeft(0)
    }
  }, [activeMonth, todayMonthDay])

  useEffect(() => () => {
    if (calendarAnimationTimer.current) {
      clearTimeout(calendarAnimationTimer.current)
    }
  }, [])

  useEffect(() => {
    writePersistence(shiftOverridesStorageKey, shiftOverridesFileName, shiftOverrides)
  }, [shiftOverrides])

  useEffect(() => {
    writePersistence(overtimeOverridesStorageKey, overtimeOverridesFileName, overtimeOverrides)
  }, [overtimeOverrides])

  const setVisibleActiveMonth = (month: ScheduleMonth) => {
    const nextScrollLeft = getMonthTargetScrollLeft(month, monthScrollLeftRef.current)
    if (nextScrollLeft !== null) {
      monthScrollLeftRef.current = nextScrollLeft
      setMonthScrollLeft(nextScrollLeft)
    }
    setActiveMonth(month)
  }

  const jumpTableToDate = (date: string) => {
    setTableScrollLeft(getCenteredTableScrollLeft(date, activeScheduleData.dates))
  }

  const openShiftEditor = (date: string) => {
    if (!currentUser) return

    const baseShift = getBaseShift(currentUser.name, date)
    if (!baseShift) return

    setShiftEditor({
      personName: currentUser.name,
      date,
      baseShift,
      overtimeInput: overtimeOverrides[getOverrideKey(currentUser.name, date)]?.toString() ?? ''
    })
  }

  const applyShiftEdit = (nextShift: ShiftType | 'default') => {
    if (!shiftEditor) return

    const key = getOverrideKey(shiftEditor.personName, shiftEditor.date)
    setShiftOverrides(overrides => {
      const nextOverrides = { ...overrides }

      if (nextShift === 'default' || nextShift === shiftEditor.baseShift) {
        delete nextOverrides[key]
      } else {
        nextOverrides[key] = nextShift
      }

      return nextOverrides
    })

    const resolvedShift = nextShift === 'default' ? shiftEditor.baseShift : nextShift
    if (!canRecordOvertime(resolvedShift)) {
      setOvertimeOverrides(overrides => {
        const nextOverrides = { ...overrides }
        delete nextOverrides[key]
        return nextOverrides
      })
    }
    setShiftEditor(null)
  }

  const setShiftEditorOvertimeInput = (value: string) => {
    setShiftEditor(editor => editor ? { ...editor, overtimeInput: value } : editor)
  }

  const applyOvertimeEdit = () => {
    if (!shiftEditor) return

    const key = getOverrideKey(shiftEditor.personName, shiftEditor.date)
    const currentShift = shiftOverrides[key] ?? shiftEditor.baseShift
    const overtimeHours = canRecordOvertime(currentShift)
      ? normalizeOvertimeHours(shiftEditor.overtimeInput)
      : 0

    setOvertimeOverrides(overrides => {
      const nextOverrides = { ...overrides }
      if (overtimeHours > 0) {
        nextOverrides[key] = overtimeHours
      } else {
        delete nextOverrides[key]
      }
      return nextOverrides
    })
    setShiftEditor(null)
  }

  const switchMonthBySwipe = (direction: 'previous' | 'next') => {
    const nextIndex = direction === 'next' ? activeMonthIndex + 1 : activeMonthIndex - 1
    const nextMonth = monthOptions[nextIndex]
    if (!nextMonth) return

    if (calendarAnimationTimer.current) {
      clearTimeout(calendarAnimationTimer.current)
    }

    setCalendarAnimation(direction === 'next' ? 'calendar-slide-next' : 'calendar-slide-previous')
    setVisibleActiveMonth(nextMonth.value)
    calendarAnimationTimer.current = setTimeout(() => {
      setCalendarAnimation('')
      calendarAnimationTimer.current = null
    }, 260)
  }

  return (
    <View className="page">
      <View className="frozen-panel">
        <View className="header" style={{ paddingTop: headerTopPadding }}>
          <View>
            <Text className="title">倒班表</Text>
            <Text className="subtitle">{dateRangeText}</Text>
          </View>
        </View>

        <ScrollView
          scrollX
          scrollLeft={monthScrollLeft}
          scrollWithAnimation
          className="month-tabs"
          enhanced
          showScrollbar={false}
          onScroll={event => {
            const scrollLeft = (event as unknown as { detail: { scrollLeft: number } }).detail.scrollLeft
            monthScrollLeftRef.current = scrollLeft
          }}
        >
          {monthOptions.map(option => (
            <View
              key={option.value}
              className={`month-tab ${activeMonth === option.value ? 'active' : ''}`}
              onClick={() => setVisibleActiveMonth(option.value)}
            >
              <Text>{option.label}</Text>
            </View>
          ))}
        </ScrollView>

        <View className="current-user-card">
          <View className="current-user-main">
            <View>
              <Text className="eyebrow">当前用户</Text>
              <View className="current-user-title-row">
                <Text className="current-user-name">{currentUser?.name}</Text>
                <Text className="mine-badge">我</Text>
                <Text className="current-user-group">{currentUser?.group}</Text>
              </View>
            </View>
            <Picker
              mode="selector"
              range={userPickerOptions}
              value={currentUserIndex}
              onChange={event => {
                const nextUser = scheduleData.people[Number(event.detail.value)]
                if (nextUser) setCurrentUserName(nextUser.name)
              }}
            >
              <View className="user-picker-button">
                <Text>切换</Text>
              </View>
            </Picker>
          </View>

          {shiftSummary && (
            <View className="summary-grid">
              <View className="summary-item summary-day">
                <View className="summary-value-row">
                  <Text className="summary-value">{shiftSummary.白班}</Text>
                  {(shiftSummary.加班?.白班 ?? 0) > 0 && (
                    <Text className="summary-overtime">{formatOvertimeHours(shiftSummary.加班?.白班 ?? 0)}h</Text>
                  )}
                </View>
                <Text className="summary-label">白班</Text>
              </View>
              <View className="summary-item summary-night">
                <View className="summary-value-row">
                  <Text className="summary-value">{shiftSummary.夜班}</Text>
                  {(shiftSummary.加班?.夜班 ?? 0) > 0 && (
                    <Text className="summary-overtime">{formatOvertimeHours(shiftSummary.加班?.夜班 ?? 0)}h</Text>
                  )}
                </View>
                <Text className="summary-label">夜班</Text>
              </View>
              <View className="summary-item summary-rest">
                <Text className="summary-value">{shiftSummary.休息}</Text>
                <Text className="summary-label">休息</Text>
              </View>
              <View className="summary-item summary-white-special">
                <View className="summary-value-row">
                  <Text className="summary-value">{shiftSummary.白特}</Text>
                  {(shiftSummary.加班?.白特 ?? 0) > 0 && (
                    <Text className="summary-overtime">{formatOvertimeHours(shiftSummary.加班?.白特 ?? 0)}h</Text>
                  )}
                </View>
                <Text className="summary-label">白特</Text>
              </View>
              <View className="summary-item summary-night-special">
                <View className="summary-value-row">
                  <Text className="summary-value">{shiftSummary.夜特}</Text>
                  {(shiftSummary.加班?.夜特 ?? 0) > 0 && (
                    <Text className="summary-overtime">{formatOvertimeHours(shiftSummary.加班?.夜特 ?? 0)}h</Text>
                  )}
                </View>
                <Text className="summary-label">夜特</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      <ScrollView scrollY className="scrollable-content" enhanced showScrollbar={false}>
        <View
          className="upcoming-card"
          onTouchStart={event => {
            const touch = (event as unknown as { changedTouches: Array<{ clientX: number; clientY: number }> }).changedTouches[0]
            if (!touch) return
            calendarTouchStart.current = { x: touch.clientX, y: touch.clientY }
          }}
          onTouchEnd={event => {
            const start = calendarTouchStart.current
            const touch = (event as unknown as { changedTouches: Array<{ clientX: number; clientY: number }> }).changedTouches[0]
            calendarTouchStart.current = null
            if (!start || !touch) return

            const deltaX = touch.clientX - start.x
            const deltaY = touch.clientY - start.y
            if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return

            switchMonthBySwipe(deltaX < 0 ? 'next' : 'previous')
          }}
        >
        <View className="calendar-panel">
          <View className="section-title-row">
            <Text className="section-title">排班日历</Text>
            <Text className="section-hint">2026年{Number(activeMonth)}月</Text>
          </View>
          <View className="calendar-weekdays">
            {weekdayLabels.map(weekday => (
              <Text key={weekday} className="calendar-weekday">{weekday}</Text>
            ))}
          </View>
          <View className={`calendar-grid ${calendarAnimation}`}>
            {calendarCells.map(cell => (
              <View
                key={cell.key}
                className={`calendar-cell ${cell.inCurrentMonth ? '' : 'calendar-cell-empty'} ${cell.key === todayMonthDay ? 'today-calendar-cell' : ''} ${currentUser && shiftOverrides[getOverrideKey(currentUser.name, cell.key)] ? 'edited-calendar-cell' : ''}`}
                onClick={() => {
                  if (cell.inCurrentMonth) jumpTableToDate(cell.key)
                }}
                onLongPress={() => {
                  if (cell.inCurrentMonth) openShiftEditor(cell.key)
                }}
              >
                {cell.inCurrentMonth && currentUser && shiftOverrides[getOverrideKey(currentUser.name, cell.key)] && (
                  <View className="edited-marker" />
                )}
                {cell.inCurrentMonth && currentUser && (overtimeOverrides[getOverrideKey(currentUser.name, cell.key)] ?? 0) > 0 && (
                  <View className="overtime-marker" />
                )}
                {cell.day && (
                  <View className="calendar-cell-content">
                    <View className="calendar-date-wrap">
                      <View className="calendar-lunar-spacer" />
                      <Text className={`calendar-day ${cell.inCurrentMonth ? '' : 'calendar-day-muted'}`}>
                        {cell.day}
                      </Text>
                      <View className={`calendar-lunar ${cell.inCurrentMonth ? '' : 'calendar-lunar-muted'} ${cell.meta.isHoliday ? 'calendar-lunar-holiday' : ''}`}>
                        {cell.meta.label.split('').map((char, charIndex) => (
                          <Text key={`${cell.key}-${charIndex}`} className="calendar-lunar-char">
                            {char}
                          </Text>
                        ))}
                      </View>
                    </View>
                    {cell.shift && (
                      <Text className={`${getShiftClassName(cell.shift)} ${cell.inCurrentMonth ? '' : 'shift-muted'}`}>
                        {cell.shift}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
        </View>

        <View className="table-card">
        <View className="table-toolbar">
          <View className="table-toolbar-main">
            <Text className="table-card-title">多视图</Text>
            <View className="table-view-switch">
              {tableViewOptions.map(option => (
                <View
                  key={option.value}
                  className={`table-view-option ${tableView === option.value ? 'active' : ''}`}
                  onClick={() => setTableView(option.value)}
                >
                  <Text>{option.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className="table-toolbar-sub">
            <View className="legend">
              {legendShiftOptions.map(shift => (
                <View key={shift} className="legend-item">
                  <Text className={getShiftClassName(shift)}>{shift}</Text>
                </View>
              ))}
            </View>
            <Text className="scroll-tip">左右滑动查看更多日期</Text>
          </View>
        </View>

        <View className="table-shell">
          <View className="identity-column">
            <View className="identity-row identity-header">
              <Text className="identity-header-title">{tableView === 'name' ? '班次' : '姓名'}</Text>
              {tableView === 'shift' && <Text className="identity-subtitle">班次</Text>}
            </View>
            {activeScheduleData.people.map(person => (
              <View
                key={person.name}
                className={`identity-row ${person.name === currentUser.name ? 'highlight-identity' : ''}`}
              >
                {tableView === 'name' ? (
                  <View className="identity-name-row">
                    <Text className="identity-group only-group">{person.group}</Text>
                    {person.name === currentUser.name && <Text className="mine-badge small">我</Text>}
                  </View>
                ) : (
                  <View>
                    <View className="identity-name-row">
                      <Text className="identity-name">{person.name}</Text>
                      {person.name === currentUser.name && <Text className="mine-badge small">我</Text>}
                    </View>
                    <Text className="identity-group">{person.group}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          <ScrollView
            scrollX
            scrollLeft={tableScrollLeft}
            scrollWithAnimation
            className="table-scroll"
            enhanced
            showScrollbar
          >
            <View className="schedule-table" style={scheduleTableStyle}>
              <View className="table-row table-header">
                {dateLabels.map(label => (
                  <View
                    key={label.date}
                    className={`cell date-cell ${label.date === todayMonthDay ? 'today-date-cell' : ''}`}
                  >
                    <Text className="date-main">{getDayPart(label.date)}</Text>
                    <Text className="date-weekday">{label.weekday}</Text>
                  </View>
                ))}
              </View>

              {activeScheduleData.people.map(person => (
                <View key={person.name} className={`table-row ${person.name === currentUser.name ? 'highlight-row' : ''}`}>
                  {person.shifts.map((shift, index) => (
                    <View
                      key={`${person.name}-${index}`}
                      className="cell date-cell"
                    >
                      {tableView === 'name' ? (
                        <Text className={`name-view-person-name ${getNameViewShiftClassName(shift)}`}>
                          {person.name}
                        </Text>
                      ) : (
                        <Text className={getShiftClassName(shift)}>{shift}</Text>
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
        </View>
      </ScrollView>

      {shiftEditor && (
        <View className="editor-mask" onClick={() => setShiftEditor(null)}>
          <View className="shift-editor" onClick={event => event.stopPropagation()}>
            <View className="shift-editor-header">
              <View>
                <Text className="shift-editor-title">修改班次</Text>
                <Text className="shift-editor-subtitle">
                  {shiftEditor.personName} · {shiftEditor.date}
                </Text>
              </View>
            </View>

            <View className="shift-editor-section">
              <Text className="shift-editor-label">默认班次</Text>
              <View className="shift-editor-option" onClick={() => applyShiftEdit('default')}>
                <Text className={getShiftClassName(shiftEditor.baseShift)}>
                  {shiftEditor.baseShift}
                </Text>
              </View>
            </View>

            <View className="shift-editor-section">
              <Text className="shift-editor-label">修改为</Text>
              <View className="shift-editor-options">
                {editableShiftOptions.map(shift => (
                  <View
                    key={shift}
                    className="shift-editor-option"
                    onClick={() => applyShiftEdit(shift)}
                  >
                    <Text className={getShiftClassName(shift)}>{shift}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="shift-editor-section">
              <Text className="shift-editor-label">加班时长</Text>
              {canRecordOvertime(shiftOverrides[getOverrideKey(shiftEditor.personName, shiftEditor.date)] ?? shiftEditor.baseShift) ? (
                <View className="overtime-editor-row">
                  <Input
                    className="overtime-input"
                    type="digit"
                    value={shiftEditor.overtimeInput}
                    placeholder="0"
                    onInput={event => {
                      setShiftEditorOvertimeInput(String(event.detail.value))
                    }}
                  />
                  <Text className="overtime-unit">小时</Text>
                  <Text className="overtime-hint">最小单位0.5</Text>
                </View>
              ) : (
                <Text className="overtime-disabled">休息班次不记录加班</Text>
              )}
            </View>

            <View className="shift-editor-actions">
              <View className="shift-editor-save" onClick={applyOvertimeEdit}>
                <Text>保存</Text>
              </View>
              <View className="shift-editor-cancel" onClick={() => setShiftEditor(null)}>
                <Text>取消</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
