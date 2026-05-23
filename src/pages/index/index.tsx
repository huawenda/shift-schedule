import { useState } from 'react'
import { ScrollView, Switch, Text, View } from '@tarojs/components'
import { scheduleData } from '../../data/schedule'
import { getShiftClassName } from '../../utils/shift'
import {
  filterPeopleByMode,
  getDateLabels,
  getMonthScheduleView,
  getPersonShiftSummary,
  getUpcomingShifts,
  type ScheduleMonth
} from '../../utils/schedule'
import './index.scss'

const highlightedUserName = '华文达'
const formatDateRangePart = (date: string) => date.split('-').join('/')
const getDayPart = (date: string) => date.slice(3)
const dateColumnWidth = 74
const monthOptions: Array<{ label: string; value: ScheduleMonth }> = [
  { label: '5月', value: '05' },
  { label: '6月', value: '06' }
]

export default function Index() {
  const [mineOnly, setMineOnly] = useState(false)
  const [activeMonth, setActiveMonth] = useState<ScheduleMonth>('05')
  const activeScheduleData = getMonthScheduleView(scheduleData, activeMonth)
  const highlightedPerson = activeScheduleData.people.find(person => person.name === highlightedUserName)
  const dateRangeText = `${formatDateRangePart(activeScheduleData.startDate)} - ${formatDateRangePart(activeScheduleData.endDate)}`
  const shiftSummary = highlightedPerson ? getPersonShiftSummary(highlightedPerson) : null
  const upcomingShifts = highlightedPerson
    ? getUpcomingShifts(activeScheduleData.dates, highlightedPerson, 7)
    : []
  const dateLabels = getDateLabels(activeScheduleData.startDate, activeScheduleData.dates)
  const visiblePeople = filterPeopleByMode(activeScheduleData.people, highlightedUserName, mineOnly)
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

      <View className="month-tabs">
        {monthOptions.map(option => (
          <View
            key={option.value}
            className={`month-tab ${activeMonth === option.value ? 'active' : ''}`}
            onClick={() => setActiveMonth(option.value)}
          >
            <Text>{option.label}</Text>
          </View>
        ))}
      </View>

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
          <View className="mine-toggle">
            <Text>只看我</Text>
            <Switch
              checked={mineOnly}
              color="#2563eb"
              onChange={event => setMineOnly(event.detail.value)}
            />
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
          <Text className="section-hint">{activeMonth === '05' ? '5月前 7 天' : '6月前 7 天'}</Text>
        </View>
        <ScrollView scrollX className="upcoming-scroll" enhanced showScrollbar={false}>
          <View className="upcoming-list">
            {upcomingShifts.map(item => (
              <View key={item.date} className="upcoming-item">
                <Text className="upcoming-date">{getDayPart(item.date)}</Text>
                <Text className={getShiftClassName(item.shift)}>{item.shift}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
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
            {visiblePeople.map(person => (
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

              {visiblePeople.map(person => (
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
