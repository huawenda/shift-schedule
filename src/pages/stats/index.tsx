import { useState } from 'react'
import { Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { scheduleData } from '../../data/schedule'
import {
  readOvertimeOverridesFromStorage,
  readShiftOverridesFromStorage
} from '../../services/localOverrides'
import type { ShiftType } from '../../types/schedule'
import {
  getCurrentScheduleMonth,
  getMonthScheduleView,
  type ScheduleMonth
} from '../../utils/schedule'
import { getPersonMonthlyStats } from '../../utils/statistics'
import './index.scss'

const defaultPersonName = '华文达'
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

function getHeaderTopPadding(): string {
  try {
    const menuButton = Taro.getMenuButtonBoundingClientRect()
    const systemInfo = Taro.getSystemInfoSync()
    if (
      typeof menuButton?.top === 'number' &&
      typeof menuButton?.height === 'number' &&
      menuButton.top > 0 &&
      systemInfo.windowWidth > 0
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

function formatOvertimeHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

function getStatsShiftClassName(shift: ShiftType): string {
  return {
    白班: 'stats-shift-day',
    夜班: 'stats-shift-night',
    休息: 'stats-shift-rest',
    白特: 'stats-shift-special-day',
    夜特: 'stats-shift-special-night'
  }[shift]
}

export default function StatsPage() {
  const [headerTopPadding] = useState(getHeaderTopPadding)
  const [activeMonth, setActiveMonth] = useState<ScheduleMonth>(getCurrentScheduleMonth(scheduleData) ?? '05')
  const [personIndex, setPersonIndex] = useState(() => (
    Math.max(scheduleData.people.findIndex(person => person.name === defaultPersonName), 0)
  ))
  const [shiftOverrides] = useState(readShiftOverridesFromStorage)
  const [overtimeOverrides] = useState(readOvertimeOverridesFromStorage)
  const activeScheduleData = getMonthScheduleView(scheduleData, activeMonth)
  const currentPerson = scheduleData.people[personIndex] ?? scheduleData.people[0]
  const currentPersonIndex = Math.max(
    scheduleData.people.findIndex(person => person.name === currentPerson.name),
    0
  )
  const stats = getPersonMonthlyStats(
    activeScheduleData,
    currentPerson.name,
    overtimeOverrides,
    shiftOverrides
  )
  const personOptions = scheduleData.people.map(person => `${person.name} / ${person.group}`)
  const activeMonthIndex = Math.max(monthOptions.findIndex(option => option.value === activeMonth), 0)

  return (
    <View className="stats-page">
      <View className="stats-header" style={{ paddingTop: headerTopPadding }}>
        <View className="stats-back-button" onClick={() => Taro.navigateBack()}>
          <Text>返回</Text>
        </View>
        <View className="stats-header-copy">
          <Text className="stats-title">统计</Text>
          <Text className="stats-subtitle">
            {currentPerson.name} · 2026年{Number(activeMonth)}月
          </Text>
        </View>
      </View>

      <View className="stats-filter-card">
        <Picker
          mode="selector"
          range={monthOptions.map(option => option.label)}
          value={activeMonthIndex}
          onChange={event => {
            const nextMonth = monthOptions[Number(event.detail.value)]
            if (nextMonth) setActiveMonth(nextMonth.value)
          }}
        >
          <View className="stats-filter-item">
            <Text className="stats-filter-label">月份</Text>
            <Text className="stats-filter-value">{monthOptions[activeMonthIndex].label}</Text>
          </View>
        </Picker>
        <Picker
          mode="selector"
          range={personOptions}
          value={currentPersonIndex}
          onChange={event => setPersonIndex(Number(event.detail.value))}
        >
          <View className="stats-filter-item">
            <Text className="stats-filter-label">用户</Text>
            <Text className="stats-filter-value">{personOptions[currentPersonIndex]}</Text>
          </View>
        </Picker>
      </View>

      <ScrollView scrollY className="stats-content" enhanced showScrollbar={false}>
        {stats && (
          <>
            <View className="stats-card">
              <View className="stats-section-title-row">
                <Text className="stats-section-title">月度概览</Text>
                <Text className="stats-section-hint">加班 {formatOvertimeHours(stats.overtimeTotal)} 小时</Text>
              </View>
              <View className="stats-summary-grid">
                {(['白班', '夜班', '休息', '白特', '夜特'] as ShiftType[]).map(shift => (
                  <View key={shift} className={`stats-summary-item ${getStatsShiftClassName(shift)}`}>
                    <View className="stats-summary-value-row">
                      <Text className="stats-summary-value">{stats.shiftSummary[shift]}</Text>
                      {(stats.shiftSummary.加班?.[shift as keyof typeof stats.shiftSummary.加班] ?? 0) > 0 && (
                        <Text className="stats-summary-overtime">
                          {formatOvertimeHours(stats.shiftSummary.加班?.[shift as keyof typeof stats.shiftSummary.加班] ?? 0)}h
                        </Text>
                      )}
                    </View>
                    <Text className="stats-summary-label">{shift}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="stats-card">
              <View className="stats-section-title-row">
                <Text className="stats-section-title">每日明细</Text>
                <Text className="stats-section-hint">{activeScheduleData.startDate.slice(5)} - {activeScheduleData.endDate.slice(5)}</Text>
              </View>
              <View className="stats-daily-list">
                {stats.dailyRecords.map(record => (
                  <View key={record.date} className={`stats-daily-row ${record.overtimeHours > 0 ? 'has-overtime' : ''}`}>
                    <View className="stats-daily-date-wrap">
                      <Text className="stats-daily-date">{record.date}</Text>
                    </View>
                    <Text className={`stats-shift ${getStatsShiftClassName(record.shift)}`}>{record.shift}</Text>
                    <Text className={`stats-daily-overtime ${record.overtimeHours > 0 ? 'active' : ''}`}>
                      {record.overtimeHours > 0 ? `${formatOvertimeHours(record.overtimeHours)}h` : '0h'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}
