import { useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import { scheduleData } from '../../data/schedule'
import { getShiftClassName } from '../../utils/shift'
import {
  getDateLabels,
  getMonthScheduleView,
  getPersonMonthCalendarCells,
  getPersonShiftSummary,
  type ScheduleMonth
} from '../../utils/schedule'
import './index.scss'

const highlightedUserName = '华文达'
const formatDateRangePart = (date: string) => date.split('-').join('/')
const getDayPart = (date: string) => date.slice(3)
const dateColumnWidth = 74
const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
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

export default function Index() {
  const [activeMonth, setActiveMonth] = useState<ScheduleMonth>('05')
  const activeScheduleData = getMonthScheduleView(scheduleData, activeMonth)
  const highlightedPerson = activeScheduleData.people.find(person => person.name === highlightedUserName)
  const dateRangeText = `${formatDateRangePart(activeScheduleData.startDate)} - ${formatDateRangePart(activeScheduleData.endDate)}`
  const shiftSummary = highlightedPerson ? getPersonShiftSummary(highlightedPerson) : null
  const calendarCells = highlightedPerson
    ? getPersonMonthCalendarCells(scheduleData, activeMonth, highlightedUserName)
    : []
  const dateLabels = getDateLabels(activeScheduleData.startDate, activeScheduleData.dates)
  const scheduleTableStyle = `width: ${dateLabels.length * dateColumnWidth}rpx`

  return (
    <View className="page">
      <View className="header">
        <View>
          <Text className="title">倒班表</Text>
          <Text className="subtitle">{dateRangeText}</Text>
        </View>
        <Text className="desc">完整倒班周期 · MVP</Text>
      </View>

      <ScrollView scrollX className="month-tabs" enhanced showScrollbar={false}>
        {monthOptions.map(option => (
          <View
            key={option.value}
            className={`month-tab ${activeMonth === option.value ? 'active' : ''}`}
            onClick={() => setActiveMonth(option.value)}
          >
            <Text>{option.label}</Text>
          </View>
        ))}
      </ScrollView>

      <View className="current-user-card">
        <View className="current-user-main">
          <View>
            <Text className="eyebrow">当前高亮</Text>
            <View className="current-user-title-row">
              <Text className="current-user-name">{highlightedPerson?.name}</Text>
              <Text className="mine-badge">我</Text>
              <Text className="current-user-group">{highlightedPerson?.group}</Text>
            </View>
          </View>
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

      <View className="upcoming-card">
        <View className="section-title-row">
          <Text className="section-title">我的排班</Text>
          <Text className="section-hint">2026年{Number(activeMonth)}月</Text>
        </View>
        <View className="calendar-weekdays">
          {weekdayLabels.map(weekday => (
            <Text key={weekday} className="calendar-weekday">{weekday}</Text>
          ))}
        </View>
        <View className="calendar-grid">
          {calendarCells.map(cell => (
            <View
              key={cell.key}
              className={`calendar-cell ${cell.inCurrentMonth ? '' : 'calendar-cell-empty'}`}
            >
              {cell.day && (
                <>
                  <Text className={`calendar-day ${cell.inCurrentMonth ? '' : 'calendar-day-muted'}`}>
                    {cell.day}
                  </Text>
                  {cell.shift && (
                    <Text className={`${getShiftClassName(cell.shift)} ${cell.inCurrentMonth ? '' : 'shift-muted'}`}>
                      {cell.shift}
                    </Text>
                  )}
                </>
              )}
            </View>
          ))}
        </View>
      </View>

      <View className="table-card">
        <View className="table-toolbar">
          <View className="legend">
            {(['白班', '夜班', '休息'] as const).map(shift => (
              <View key={shift} className="legend-item">
                <Text className={getShiftClassName(shift)}>{shift}</Text>
              </View>
            ))}
          </View>
          <Text className="scroll-tip">左右滑动查看更多日期</Text>
        </View>

        <View className="table-shell">
          <View className="identity-column">
            <View className="identity-row identity-header">
              <Text className="identity-header-title">姓名</Text>
              <Text className="identity-subtitle">班组</Text>
            </View>
            {activeScheduleData.people.map(person => (
              <View
                key={person.name}
                className={`identity-row ${person.name === highlightedUserName ? 'highlight-identity' : ''}`}
              >
                <View>
                  <View className="identity-name-row">
                    <Text className="identity-name">{person.name}</Text>
                    {person.name === highlightedUserName && <Text className="mine-badge small">我</Text>}
                  </View>
                  <Text className="identity-group">{person.group}</Text>
                </View>
              </View>
            ))}
          </View>

          <ScrollView scrollX className="table-scroll" enhanced showScrollbar>
            <View className="schedule-table" style={scheduleTableStyle}>
              <View className="table-row table-header">
                {dateLabels.map(label => (
                  <View key={label.date} className="cell date-cell">
                    <Text className="date-main">{getDayPart(label.date)}</Text>
                    <Text className="date-weekday">{label.weekday}</Text>
                  </View>
                ))}
              </View>

              {activeScheduleData.people.map(person => (
                <View
                  key={person.name}
                  className={`table-row ${person.name === highlightedUserName ? 'highlight-row' : ''}`}
                >
                  {person.shifts.map((shift, index) => (
                    <View key={`${person.name}-${index}`} className="cell date-cell">
                      <Text className={getShiftClassName(shift)}>{shift}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  )
}
