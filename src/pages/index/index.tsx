import { useEffect, useRef, useState } from 'react'
import { Picker, ScrollView, Text, View } from '@tarojs/components'
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
  type ScheduleMonth
} from '../../utils/schedule'
import './index.scss'

const defaultCurrentUserName = '华文达'
const formatDateRangePart = (date: string) => date.split('-').join('/')
const getDayPart = (date: string) => date.slice(3)
const dateColumnWidth = 74
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
    休息: 'name-shift-rest'
  }[shift]
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
  const [monthScrollLeft, setMonthScrollLeft] = useState(() => (
    getMonthTargetScrollLeft(currentScheduleMonth ?? '05', 0) ?? 0
  ))
  const calendarTouchStart = useRef<{ x: number; y: number } | null>(null)
  const calendarAnimationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monthScrollLeftRef = useRef(monthScrollLeft)
  const activeScheduleData = getMonthScheduleView(scheduleData, activeMonth)
  const currentUser = activeScheduleData.people.find(person => person.name === currentUserName)
    ?? activeScheduleData.people[0]
  const userPickerOptions = scheduleData.people.map(person => `${person.name} / ${person.group}`)
  const currentUserIndex = Math.max(
    scheduleData.people.findIndex(person => person.name === currentUser.name),
    0
  )
  const dateRangeText = `${formatDateRangePart(activeScheduleData.startDate)} - ${formatDateRangePart(activeScheduleData.endDate)}`
  const shiftSummary = currentUser ? getPersonShiftSummary(currentUser) : null
  const calendarCells = currentUser
    ? getPersonMonthCalendarCells(scheduleData, activeMonth, currentUser.name)
    : []
  const dateLabels = getDateLabels(activeScheduleData.startDate, activeScheduleData.dates)
  const scheduleTableStyle = `width: ${dateLabels.length * dateColumnWidth}rpx`
  const activeMonthIndex = monthOptions.findIndex(option => option.value === activeMonth)

  useEffect(() => () => {
    if (calendarAnimationTimer.current) {
      clearTimeout(calendarAnimationTimer.current)
    }
  }, [])

  const setVisibleActiveMonth = (month: ScheduleMonth) => {
    const nextScrollLeft = getMonthTargetScrollLeft(month, monthScrollLeftRef.current)
    if (nextScrollLeft !== null) {
      monthScrollLeftRef.current = nextScrollLeft
      setMonthScrollLeft(nextScrollLeft)
    }
    setActiveMonth(month)
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
                <Text className="summary-value">{shiftSummary.白班}</Text>
                <Text className="summary-label">白班</Text>
              </View>
              <View className="summary-item summary-night">
                <Text className="summary-value">{shiftSummary.夜班}</Text>
                <Text className="summary-label">夜班</Text>
              </View>
              <View className="summary-item summary-rest">
                <Text className="summary-value">{shiftSummary.休息}</Text>
                <Text className="summary-label">休息</Text>
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
                className={`calendar-cell ${cell.inCurrentMonth ? '' : 'calendar-cell-empty'} ${cell.key === todayMonthDay ? 'today-calendar-cell' : ''}`}
              >
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
              {(['白班', '夜班', '休息'] as const).map(shift => (
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

          <ScrollView scrollX className="table-scroll" enhanced showScrollbar>
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
    </View>
  )
}
