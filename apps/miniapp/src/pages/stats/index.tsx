import { useEffect, useRef, useState } from 'react'
import { Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { scheduleData } from '../../data/schedule'
import { loadCloudOverrides } from '../../services/cloudRecords'
import {
  readLeaveDurationOverridesFromStorage,
  readLegalOverridesFromStorage,
  readOvertimeOverridesFromStorage,
  readShiftOverridesFromStorage
} from '../../services/localOverrides'
import {
  getSalaryInputKey,
  loadSalaryInputs,
  readSalaryInputsFromStorage,
  saveSalaryInput,
  syncSalaryInputs,
  type SalaryInputRecords
} from '../../services/salaryInputs'
import { loadCurrentUserProfile, type CurrentUserProfile } from '../../services/userProfile'
import type { ShiftType } from '../../types/schedule'
import {
  getCurrentScheduleMonth,
  getMonthScheduleView,
  isFutureScheduleMonth,
  type ScheduleMonth
} from '../../utils/schedule'
import {
  calculateOvertimePay,
  calculateSalary,
  emptySalaryInputs,
  formatMoney,
  type SalaryInputValues
} from '../../utils/salary'
import {
  getAllPeopleMonthlyOvertimeStats,
  getOvertimeChartItems,
  getPersonMonthlyStats,
  type PersonOvertimeStats
} from '../../utils/statistics'
import { isH5Runtime } from '../../services/runtime'
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
type StatsViewMode = 'personal' | 'team'
type SalaryInputField = keyof SalaryInputValues
type TouchPoint = { x: number; y: number }
type SalarySaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

function getWindowWidth(): number {
  const taroWithWindowInfo = Taro as typeof Taro & {
    getWindowInfo?: () => { windowWidth?: number }
  }
  const windowWidth = taroWithWindowInfo.getWindowInfo?.().windowWidth
  if (typeof windowWidth === 'number' && windowWidth > 0) return windowWidth

  return Taro.getSystemInfoSync().windowWidth
}

function getHeaderTopPadding(): string {
  if (isH5Runtime) return '8px'

  try {
    const menuButton = Taro.getMenuButtonBoundingClientRect()
    const windowWidth = getWindowWidth()
    if (
      typeof menuButton?.top === 'number' &&
      typeof menuButton?.height === 'number' &&
      menuButton.top > 0 &&
      windowWidth > 0
    ) {
      const rpxScale = windowWidth / 750
      const titleLineHeight = 32 * 1.2 * rpxScale
      const alignedTop = menuButton.top + ((menuButton.height - titleLineHeight) / 2)
      return `${Math.max(alignedTop, 0)}px`
    }
  } catch {
    // Some devtool runtimes may not expose menu metrics during initial render.
  }

  return '48px'
}

function goBackToIndexPage() {
  const indexPageUrl = '/pages/index/index'

  try {
    if (Taro.getCurrentPages().length > 1) {
      void Taro.navigateBack().catch(() => {
        void Taro.redirectTo({ url: indexPageUrl })
      })
      return
    }
  } catch {
    // Some runtimes cannot report the route stack; fall back to a deterministic home route.
  }

  void Taro.redirectTo({ url: indexPageUrl }).catch(() => {
    void Taro.navigateTo({ url: indexPageUrl })
  })
}

function formatOvertimeHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

function getOvertimeHoursByType(items: ReturnType<typeof getOvertimeChartItems>, type: '平日' | '特勤' | '法定'): number {
  return items.find(item => item.type === type)?.hours ?? 0
}

function getDailyOvertimeMultiplier(record: { shift: ShiftType; isLegal?: boolean }): number {
  if (record.isLegal) return 3
  if (record.shift === '白特' || record.shift === '夜特') return 2
  if (record.shift === '白班' || record.shift === '夜班') return 1.5

  return 0
}

function getDailyPayClassName(record: { shift: ShiftType; isLegal?: boolean }): string {
  if (record.isLegal) return 'legal'
  if (record.shift === '白特' || record.shift === '夜特') return 'special'

  return ''
}

function getStatsShiftClassName(shift: ShiftType): string {
  return {
    白班: 'stats-shift-day',
    夜班: 'stats-shift-night',
    休息: 'stats-shift-rest',
    白特: 'stats-shift-special-day',
    夜特: 'stats-shift-special-night',
    事假: 'stats-shift-leave'
  }[shift]
}

function getStatsChartTypeClassName(type: string): string {
  return {
    平日: 'stats-overtime-weekday',
    特勤: 'stats-overtime-special',
    法定: 'stats-overtime-legal'
  }[type] ?? ''
}

function getOvertimeStackSegments(person: PersonOvertimeStats, maxHours: number) {
  return [
    {
      key: 'weekday',
      className: 'stats-overtime-weekday',
      hours: person.weekdayHours
    },
    {
      key: 'special',
      className: 'stats-overtime-special',
      hours: person.specialHours
    },
    {
      key: 'legal',
      className: 'stats-overtime-legal',
      hours: person.legalHours
    }
  ].map(segment => ({
    ...segment,
    width: maxHours > 0
      ? Math.max((segment.hours / maxHours) * 100, segment.hours > 0 ? 8 : 0)
      : 0,
    showLabel: segment.hours > 0
  }))
}

function getMonthlyOverviewRows(stats: NonNullable<ReturnType<typeof getPersonMonthlyStats>>) {
  return [
    {
      label: '白班',
      className: 'stats-shift-day',
      days: stats.shiftSummary.白班,
      hours: stats.shiftSummary.加班?.白班 ?? 0
    },
    {
      label: '夜班',
      className: 'stats-shift-night',
      days: stats.shiftSummary.夜班,
      hours: stats.shiftSummary.加班?.夜班 ?? 0
    },
    {
      label: '休息',
      className: 'stats-shift-rest',
      days: stats.shiftSummary.休息,
      hours: 0
    },
    {
      label: '白特',
      className: 'stats-shift-special-day',
      days: stats.shiftSummary.白特,
      hours: stats.shiftSummary.加班?.白特 ?? 0
    },
    {
      label: '夜特',
      className: 'stats-shift-special-night',
      days: stats.shiftSummary.夜特,
      hours: stats.shiftSummary.加班?.夜特 ?? 0
    },
    {
      label: '法定',
      className: 'stats-shift-legal',
      days: stats.shiftSummary.法定 ?? 0,
      hours: stats.shiftSummary.加班?.法定 ?? 0
    },
    {
      label: '事假',
      className: 'stats-shift-leave',
      days: stats.leaveSummary.days,
      hours: stats.leaveSummary.hours
    }
  ]
}

export default function StatsPage() {
  const [headerTopPadding] = useState(getHeaderTopPadding)
  const [viewMode, setViewMode] = useState<StatsViewMode>('personal')
  const [personalPageIndex, setPersonalPageIndex] = useState(0)
  const personalPageTouchStart = useRef<TouchPoint | null>(null)
  const salarySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editedSalaryKey = useRef<string | null>(null)
  const salaryEditVersion = useRef(0)
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfile | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [activeMonth, setActiveMonth] = useState<ScheduleMonth>(getCurrentScheduleMonth(scheduleData) ?? '05')
  const [salaryInputRecords, setSalaryInputRecords] = useState<SalaryInputRecords>(readSalaryInputsFromStorage)
  const [salarySyncReady, setSalarySyncReady] = useState(false)
  const [personIndex, setPersonIndex] = useState(() => (
    Math.max(scheduleData.people.findIndex(person => person.name === defaultPersonName), 0)
  ))
  const [shiftOverrides, setShiftOverrides] = useState(readShiftOverridesFromStorage)
  const [overtimeOverrides, setOvertimeOverrides] = useState(readOvertimeOverridesFromStorage)
  const [legalOverrides, setLegalOverrides] = useState(readLegalOverridesFromStorage)
  const [leaveDurationOverrides, setLeaveDurationOverrides] = useState(readLeaveDurationOverridesFromStorage)
  const [cloudStatsReady, setCloudStatsReady] = useState(false)
  const [cloudStatsRefreshing, setCloudStatsRefreshing] = useState(false)
  const [salarySaveStatus, setSalarySaveStatus] = useState<SalarySaveStatus>('idle')
  const availableMonthOptions = monthOptions.filter(option => !isFutureScheduleMonth(scheduleData, option.value))
  const monthPickerOptions = availableMonthOptions.map(option => option.label)
  const activeMonthIndex = Math.max(
    availableMonthOptions.findIndex(option => option.value === activeMonth),
    0
  )
  const activeScheduleData = getMonthScheduleView(scheduleData, activeMonth)
  const isAdminUser = currentUserProfile?.isAdmin ?? false
  const boundPersonName = currentUserProfile?.profile?.personName ?? null
  const boundPersonIndex = boundPersonName
    ? scheduleData.people.findIndex(person => person.name === boundPersonName)
    : -1
  const resolvedPersonIndex = !isAdminUser && boundPersonIndex >= 0
    ? boundPersonIndex
    : personIndex
  const currentPerson = scheduleData.people[resolvedPersonIndex] ?? scheduleData.people[0]
  const currentPersonIndex = Math.max(
    scheduleData.people.findIndex(person => person.name === currentPerson.name),
    0
  )
  const stats = getPersonMonthlyStats(
    activeScheduleData,
    currentPerson.name,
    overtimeOverrides,
    shiftOverrides,
    legalOverrides,
    leaveDurationOverrides
  )
  const personOptions = scheduleData.people.map(person => `${person.name} / ${person.group}`)
  const overtimeChartItems = stats ? getOvertimeChartItems(stats.shiftSummary.加班) : []
  const overtimeChartMax = Math.max(...overtimeChartItems.map(item => item.hours), 0)
  const salaryInputKey = getSalaryInputKey(currentPerson.name, activeMonth)
  const salaryInputs = salaryInputRecords[salaryInputKey] ?? emptySalaryInputs
  const salarySaveStatusLabel = salarySaveStatus === 'pending'
    ? '待保存'
    : salarySaveStatus === 'saving'
      ? '保存中'
      : salarySaveStatus === 'saved'
        ? '已保存'
        : salarySaveStatus === 'error'
          ? '保存失败'
          : ''
  const salaryCalculation = calculateSalary(salaryInputs, {
    weekdayHours: getOvertimeHoursByType(overtimeChartItems, '平日'),
    specialHours: getOvertimeHoursByType(overtimeChartItems, '特勤'),
    legalHours: getOvertimeHoursByType(overtimeChartItems, '法定'),
    leaveHours: stats?.leaveSummary.hours ?? 0
  })
  const allPeopleStats = getAllPeopleMonthlyOvertimeStats(
    activeScheduleData,
    overtimeOverrides,
    shiftOverrides,
    legalOverrides
  )
  const allPeopleChartMax = Math.max(...allPeopleStats.people.map(person => person.totalHours), 0)

  useEffect(() => {
    let cancelled = false

    loadCurrentUserProfile()
      .then(profile => {
        if (cancelled) return

        setCurrentUserProfile(profile)
        if (!profile.isAdmin && profile.profile?.personName) {
          const nextPersonIndex = scheduleData.people.findIndex(person => person.name === profile.profile?.personName)
          if (nextPersonIndex >= 0) {
            setPersonIndex(nextPersonIndex)
          }
        }
      })
      .catch(error => {
        console.warn('统计页用户身份读取失败', error)
      })
      .finally(() => {
        if (!cancelled) setProfileReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!profileReady) return undefined

    const canLoadCloudStats = isAdminUser || Boolean(boundPersonName)
    if (!canLoadCloudStats) {
      setCloudStatsReady(true)
      return undefined
    }

    setCloudStatsReady(false)
    loadCloudOverrides()
      .then(cloudOverrides => {
        if (cancelled) return

        setShiftOverrides(cloudOverrides.shiftOverrides)
        setOvertimeOverrides(cloudOverrides.overtimeOverrides)
        setLegalOverrides(cloudOverrides.legalOverrides)
        setLeaveDurationOverrides(cloudOverrides.leaveDurationOverrides)
      })
      .catch(error => {
        console.warn('统计页云端排班记录读取失败，已使用本地缓存', error)
      })
      .finally(() => {
        if (!cancelled) setCloudStatsReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [boundPersonName, isAdminUser, profileReady])

  useEffect(() => {
    let cancelled = false
    if (!profileReady || (!isAdminUser && !boundPersonName)) return undefined

    setSalarySyncReady(false)
    loadSalaryInputs()
      .then(records => {
        if (!cancelled) setSalaryInputRecords(records)
      })
      .catch(error => {
        console.warn('薪资输入读取失败，已使用本地缓存', error)
      })
      .finally(() => {
        if (!cancelled) setSalarySyncReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [boundPersonName, isAdminUser, profileReady])

  useEffect(() => {
    if (!salarySyncReady) return
    if (isH5Runtime) {
      const key = editedSalaryKey.current
      if (!key) return

      if (salarySaveTimer.current) clearTimeout(salarySaveTimer.current)
      const saveVersion = salaryEditVersion.current
      salarySaveTimer.current = setTimeout(() => {
        const values = salaryInputRecords[key] ?? emptySalaryInputs
        setSalarySaveStatus('saving')
        saveSalaryInput(key, values)
          .then(() => {
            if (editedSalaryKey.current === key && salaryEditVersion.current === saveVersion) {
              editedSalaryKey.current = null
              setSalarySaveStatus('saved')
            }
          })
          .catch(error => {
            console.warn('薪资输入保存失败', error)
            if (salaryEditVersion.current === saveVersion) {
              setSalarySaveStatus('error')
            }
          })
      }, 700)

      return () => {
        if (salarySaveTimer.current) {
          clearTimeout(salarySaveTimer.current)
          salarySaveTimer.current = null
        }
      }
    }

    syncSalaryInputs(salaryInputRecords).catch(error => {
      console.warn('薪资输入同步失败', error)
    })
  }, [salaryInputRecords, salarySyncReady])

  const setSalaryInputValue = (field: SalaryInputField, value: string) => {
    editedSalaryKey.current = salaryInputKey
    salaryEditVersion.current += 1
    setSalarySaveStatus('pending')
    setSalaryInputRecords(records => ({
      ...records,
      [salaryInputKey]: {
        ...(records[salaryInputKey] ?? emptySalaryInputs),
        [field]: value
      }
    }))
  }

  const refreshStatsCloudData = () => {
    if (cloudStatsRefreshing) return
    if (!profileReady || (!isAdminUser && !boundPersonName)) return

    setCloudStatsRefreshing(true)
    const pendingSalaryKey = editedSalaryKey.current
    const pendingSalaryValues = pendingSalaryKey ? salaryInputRecords[pendingSalaryKey] ?? emptySalaryInputs : null
    Promise.resolve()
      .then(() => {
        if (!pendingSalaryKey || !pendingSalaryValues) return undefined

        setSalarySaveStatus('saving')
        return saveSalaryInput(pendingSalaryKey, pendingSalaryValues).then(() => {
          if (editedSalaryKey.current === pendingSalaryKey) editedSalaryKey.current = null
          setSalarySaveStatus('saved')
        })
      })
      .then(() => Promise.all([
        loadCloudOverrides(),
        loadSalaryInputs()
      ]))
      .then(([cloudOverrides, salaryRecords]) => {
        setShiftOverrides(cloudOverrides.shiftOverrides)
        setOvertimeOverrides(cloudOverrides.overtimeOverrides)
        setLegalOverrides(cloudOverrides.legalOverrides)
        setLeaveDurationOverrides(cloudOverrides.leaveDurationOverrides)
        setSalaryInputRecords(salaryRecords)
        editedSalaryKey.current = null
        setSalarySaveStatus('idle')
        Taro.showToast({ title: '云端同步完成', icon: 'none' })
      })
      .catch(error => {
        console.warn('统计页手动云端同步失败', error)
        Taro.showToast({ title: '云端同步失败', icon: 'none' })
      })
      .finally(() => {
        setCloudStatsRefreshing(false)
      })
  }

  const handlePersonalPageTouchStart = (event: any) => {
    const touch = event.touches?.[0]
    personalPageTouchStart.current = touch
      ? { x: touch.clientX, y: touch.clientY }
      : null
  }

  const handlePersonalPageTouchEnd = (event: any) => {
    const start = personalPageTouchStart.current
    const touch = event.changedTouches?.[0]
    personalPageTouchStart.current = null
    if (!start || !touch) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    const horizontalIntent = Math.abs(deltaX) > 64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35
    if (!horizontalIntent) return

    if (deltaX < 0) {
      setPersonalPageIndex(index => Math.min(index + 1, 1))
    } else {
      setPersonalPageIndex(index => Math.max(index - 1, 0))
    }
  }

  const switchToPersonalSummary = () => {
    setViewMode('personal')
    setPersonalPageIndex(0)
  }

  const switchToDailyDetails = () => {
    setViewMode('personal')
    setPersonalPageIndex(1)
  }

  if (!profileReady || !cloudStatsReady) {
    return (
      <View className={`stats-page ${isH5Runtime ? 'stats-page-h5' : ''}`}>
        <View className="stats-header" style={{ paddingTop: headerTopPadding }}>
          <View className="stats-back-button" onClick={goBackToIndexPage}>
            <Text>返回</Text>
          </View>
          <View className="stats-header-copy">
            <Text className="stats-title">统计</Text>
            <Text className="stats-subtitle">
              {activeScheduleData.startDate.replace(/-/g, '/')} - {activeScheduleData.endDate.replace(/-/g, '/')}
            </Text>
          </View>
        </View>

        <View className="stats-loading-card">
          <View className="stats-loading-mark" />
          <Text className="stats-loading-title">
            {profileReady ? '同步统计数据' : '读取统计信息'}
          </Text>
          <Text className="stats-loading-text">
            {profileReady ? '正在读取云端最新排班记录' : '正在同步当前账号身份与绑定人员'}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View className={`stats-page ${isH5Runtime ? 'stats-page-h5' : ''}`}>
      <View className="stats-header" style={{ paddingTop: headerTopPadding }}>
        <View className="stats-back-button" onClick={goBackToIndexPage}>
          <Text>返回</Text>
        </View>
        <View className="stats-header-copy">
          <Text className="stats-title">统计</Text>
          <Text className="stats-subtitle">
            {activeScheduleData.startDate.replace(/-/g, '/')} - {activeScheduleData.endDate.replace(/-/g, '/')}
          </Text>
        </View>
        {isH5Runtime && (
          <View
            className={`stats-sync-button ${cloudStatsRefreshing ? 'loading' : ''}`}
            onClick={refreshStatsCloudData}
          >
            <Text>{cloudStatsRefreshing ? '同步中' : '同步'}</Text>
          </View>
        )}
      </View>

      <View className="stats-view-tabs">
        {isAdminUser ? (
          <>
            <View
              className={`stats-view-tab ${viewMode === 'personal' ? 'active' : ''}`}
              onClick={switchToPersonalSummary}
            >
              <Text>个人统计</Text>
            </View>
            <View
              className={`stats-view-tab ${viewMode === 'team' ? 'active' : ''}`}
              onClick={() => setViewMode('team')}
            >
              <Text>全员统计</Text>
            </View>
          </>
        ) : (
          <>
            <View
              className={`stats-view-tab ${viewMode === 'personal' && personalPageIndex === 0 ? 'active' : ''}`}
              onClick={switchToPersonalSummary}
            >
              <Text>综合统计</Text>
            </View>
            <View
              className={`stats-view-tab ${viewMode === 'personal' && personalPageIndex === 1 ? 'active' : ''}`}
              onClick={switchToDailyDetails}
            >
              <Text>每日明细</Text>
            </View>
          </>
        )}
      </View>

      <View className={`stats-filter-card ${viewMode === 'personal' ? 'has-person-filter' : ''}`}>
        <Picker
          mode="selector"
          range={monthPickerOptions}
          value={activeMonthIndex}
          onChange={event => {
            const nextMonth = availableMonthOptions[Number(event.detail.value)]?.value
            if (nextMonth) {
              setActiveMonth(nextMonth)
            }
          }}
        >
          <View className="stats-filter-item">
            <Text className="stats-filter-label">月份</Text>
            <Text className="stats-filter-value">{availableMonthOptions[activeMonthIndex]?.label ?? ''}</Text>
          </View>
        </Picker>
        {viewMode === 'personal' && isAdminUser && (
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
        )}
        {viewMode === 'personal' && !isAdminUser && (
          <View className="stats-filter-item">
            <Text className="stats-filter-label">用户</Text>
            <Text className="stats-filter-value">
              {boundPersonName ? personOptions[currentPersonIndex] : (profileReady ? '未绑定' : '读取中')}
            </Text>
          </View>
        )}
      </View>

      {isAdminUser && viewMode === 'personal' && (
        <View className="stats-page-indicator">
          {[0, 1].map(index => (
            <View
              key={index}
              className={`stats-page-indicator-dot ${personalPageIndex === index ? 'active' : ''}`}
              onClick={() => setPersonalPageIndex(index)}
            />
          ))}
        </View>
      )}

      {viewMode === 'personal' && stats && (
        <View
          className="stats-personal-pages"
          onTouchStart={handlePersonalPageTouchStart}
          onTouchEnd={handlePersonalPageTouchEnd}
        >
          <View
            className="stats-personal-track"
            style={`transform: translate3d(-${personalPageIndex * 50}%, 0, 0);`}
          >
          <View className="stats-personal-page">
            <View className="stats-personal-page-inner">
            <ScrollView scrollY className="stats-content stats-personal-scroll" enableFlex enhanced showScrollbar={false}>
              <View className="stats-content-inner">
                <View className="stats-card">
              <View className="stats-section-title-row">
                <Text className="stats-section-title">月度概览</Text>
                <Text className="stats-section-hint">加班 {formatOvertimeHours(stats.overtimeTotal)} 小时</Text>
              </View>
              <View className="stats-overview-table">
                <View className="stats-overview-row stats-overview-header">
                  <Text>项目</Text>
                  <Text>天数</Text>
                  <Text>小时</Text>
                </View>
                {getMonthlyOverviewRows(stats).map(row => (
                  <View key={row.label} className="stats-overview-row">
                    <View className="stats-overview-name">
                      <Text className={`stats-overview-tag ${row.className}`}>{row.label}</Text>
                    </View>
                    <Text className="stats-overview-value">{row.days}</Text>
                    <Text className={`stats-overview-value ${row.hours > 0 ? 'active' : ''}`}>
                      {formatOvertimeHours(row.hours)}h
                    </Text>
                  </View>
                ))}
              </View>
                </View>

                <View className="stats-card">
              <View className="stats-section-title-row">
                <Text className="stats-section-title">加班分布</Text>
                <Text className="stats-section-hint">按类型统计</Text>
              </View>
              <View className="stats-bar-chart">
                {overtimeChartItems.map(item => {
                  const barHeight = overtimeChartMax > 0
                    ? Math.max((item.hours / overtimeChartMax) * 100, item.hours > 0 ? 8 : 0)
                    : 0

                  return (
                    <View key={item.type} className="stats-bar-item">
                      <Text className={`stats-bar-value ${item.hours > 0 ? 'active' : ''}`}>
                        {formatOvertimeHours(item.hours)}h
                      </Text>
                      <View className="stats-bar-track">
                        <View
                          className={`stats-bar-fill ${getStatsChartTypeClassName(item.type)}`}
                          style={{ height: `${barHeight}%` }}
                        />
                      </View>
                      <Text className="stats-bar-label">{item.type}</Text>
                    </View>
                  )
                })}
              </View>
                </View>

                <View className="stats-card salary-card">
              <View className="stats-section-title-row salary-title-row">
                <Text className="stats-section-title">薪资计算</Text>
                {isH5Runtime && salarySaveStatusLabel && (
                  <Text className={`salary-save-status ${salarySaveStatus}`}>{salarySaveStatusLabel}</Text>
                )}
              </View>

              <View className="salary-section">
                <View className="salary-section-head">
                  <Text className="salary-block-title">基本项</Text>
                  <Text className="salary-section-total">小计 ¥{formatMoney(salaryCalculation.basicPayTotal)}</Text>
                </View>
                <View className="salary-input-grid">
                  {[
                    { label: '底薪', field: 'baseSalary' as const },
                    { label: '绩效津贴', field: 'performanceAllowance' as const },
                    { label: '岗位津贴', field: 'positionAllowance' as const }
                  ].map(item => (
                    <View key={item.field} className="salary-input-item">
                      <Text className="salary-input-label">{item.label}</Text>
                      <View className="salary-input-box">
                        <Text className="salary-input-prefix">¥</Text>
                        <Input
                          className="salary-input"
                          type="digit"
                          value={salaryInputs[item.field]}
                          placeholder="0"
                          onInput={event => setSalaryInputValue(item.field, String(event.detail.value))}
                        />
                      </View>
                    </View>
                  ))}
                </View>
                <Text className="salary-rate-line">时薪 ¥{formatMoney(salaryCalculation.hourlyWage)}</Text>
              </View>

              <View className="salary-section">
                <View className="salary-section-head">
                  <Text className="salary-block-title">加班工资</Text>
                  <Text className="salary-section-total">小计 ¥{formatMoney(salaryCalculation.overtimePayTotal)}</Text>
                </View>
                <View className="salary-result-grid">
                  <View className="salary-result-item">
                    <Text className="salary-result-label">平日加班</Text>
                    <Text className="salary-result-value">¥{formatMoney(salaryCalculation.weekdayOvertimePay)}</Text>
                  </View>
                  <View className="salary-result-item">
                    <Text className="salary-result-label">周末加班</Text>
                    <Text className="salary-result-value">¥{formatMoney(salaryCalculation.specialOvertimePay)}</Text>
                  </View>
                  <View className="salary-result-item legal">
                    <Text className="salary-result-label">法定加班</Text>
                    <Text className="salary-result-value">¥{formatMoney(salaryCalculation.legalOvertimePay)}</Text>
                  </View>
                </View>
              </View>

              <View className="salary-section">
                <View className="salary-section-head">
                  <Text className="salary-block-title">扣款项</Text>
                  <Text className="salary-section-total deduction">小计 ¥{formatMoney(salaryCalculation.deductionTotal)}</Text>
                </View>
                <View className="salary-deduction-grid">
                  <View className="salary-result-item deduction">
                    <Text className="salary-result-label">事假扣款</Text>
                    <Text className="salary-result-value">¥{formatMoney(salaryCalculation.leaveDeduction)}</Text>
                  </View>
                  <View className="salary-input-item">
                    <Text className="salary-input-label">其他扣款</Text>
                    <View className="salary-input-box">
                      <Text className="salary-input-prefix">¥</Text>
                      <Input
                        className="salary-input"
                        type="digit"
                        value={salaryInputs.otherDeductions}
                        placeholder="0"
                        onInput={event => setSalaryInputValue('otherDeductions', String(event.detail.value))}
                      />
                    </View>
                  </View>
                </View>
              </View>

              <View className="salary-section salary-summary-section">
                <View className="salary-section-head">
                  <Text className="salary-block-title">汇总</Text>
                </View>
                <View className="salary-final-grid">
                  <View className="salary-summary-item">
                    <Text className="salary-summary-label">应付工资</Text>
                    <Text className="salary-summary-value">¥{formatMoney(salaryCalculation.payableSalary)}</Text>
                  </View>
                  <View className="salary-summary-item primary">
                    <Text className="salary-summary-label">实付工资</Text>
                    <Text className="salary-summary-value">¥{formatMoney(salaryCalculation.netSalary)}</Text>
                  </View>
                </View>
              </View>
                </View>
              </View>
            </ScrollView>
            </View>
          </View>
          <View className="stats-personal-page">
            <View className="stats-personal-page-inner">
            <ScrollView scrollY className="stats-content stats-personal-scroll" enableFlex enhanced showScrollbar={false}>
              <View className="stats-content-inner">
                <View className="stats-card">
                  <View className="stats-section-title-row">
                    <Text className="stats-section-title">每日明细</Text>
                    <Text className="stats-section-hint">{activeScheduleData.startDate.slice(5)} - {activeScheduleData.endDate.slice(5)}</Text>
                  </View>
                  <View className="stats-daily-list">
                    <View className="stats-daily-row stats-daily-header">
                      <Text>日期</Text>
                      <Text>班次</Text>
                      <Text>金额</Text>
                      <Text>小时</Text>
                    </View>
                    {stats.dailyRecords.map(record => {
                      const dailyOvertimePay = calculateOvertimePay(
                        salaryInputs,
                        record.overtimeHours,
                        getDailyOvertimeMultiplier(record)
                      )

                      return (
                        <View key={record.date} className={`stats-daily-row ${record.overtimeHours > 0 ? 'has-overtime' : ''}`}>
                          <View className="stats-daily-date-wrap">
                            <Text className="stats-daily-date">{record.date}</Text>
                          </View>
                          <View className="stats-daily-shift-cell">
                            <Text className={`stats-shift ${getStatsShiftClassName(record.shift)} ${record.isLegal ? 'has-legal' : ''}`}>
                              {record.isLegal && (
                                <Text className="stats-legal-shift-badge">法</Text>
                              )}
                              {record.shift}
                            </Text>
                          </View>
                          <Text className={`stats-daily-pay ${getDailyPayClassName(record)} ${record.overtimeHours > 0 ? '' : 'placeholder'}`}>
                            {record.overtimeHours > 0 ? `+${formatMoney(dailyOvertimePay)}` : '+0.00'}
                          </Text>
                          <Text className={`stats-daily-overtime ${record.overtimeHours > 0 ? 'active' : ''}`}>
                            {record.overtimeHours > 0 ? `${formatOvertimeHours(record.overtimeHours)}h` : '0h'}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                </View>
              </View>
            </ScrollView>
            </View>
          </View>
          </View>
        </View>
      )}
      {viewMode === 'team' && (
        <ScrollView scrollY className="stats-content" enableFlex enhanced showScrollbar={false}>
          <View className="stats-content-inner">
            <>
            <View className="stats-card">
              <View className="stats-section-title-row">
                <Text className="stats-section-title">全员概览</Text>
                <Text className="stats-section-hint">共 {allPeopleStats.people.length} 人</Text>
              </View>
              <View className="stats-team-overview-grid">
                <View className="stats-team-overview-item">
                  <Text className="stats-team-overview-value">{formatOvertimeHours(allPeopleStats.maxOvertime)}h</Text>
                  <Text className="stats-team-overview-label">最高</Text>
                </View>
                <View className="stats-team-overview-item">
                  <Text className="stats-team-overview-value">{formatOvertimeHours(allPeopleStats.minOvertime)}h</Text>
                  <Text className="stats-team-overview-label">最低</Text>
                </View>
                <View className="stats-team-overview-item">
                  <Text className="stats-team-overview-value">{formatOvertimeHours(allPeopleStats.averageOvertime)}h</Text>
                  <Text className="stats-team-overview-label">平均</Text>
                </View>
              </View>
            </View>

            <View className="stats-card">
              <View className="stats-section-title-row">
                <Text className="stats-section-title">加班排名</Text>
                <Text className="stats-section-hint">平日 / 特勤 / 法定</Text>
              </View>
              <View className="stats-team-legend">
                <Text className="stats-team-legend-item weekday">平日</Text>
                <Text className="stats-team-legend-item special">特勤</Text>
                <Text className="stats-team-legend-item legal">法定</Text>
              </View>
              <View className="stats-team-chart">
                {allPeopleStats.ranking.map(person => (
                  <View key={person.personName} className="stats-team-chart-row">
                    <Text className={`stats-ranking-rank ${person.rank <= 3 ? 'top' : ''}`}>{person.rank}</Text>
                    <View className="stats-team-chart-person">
                      <Text className="stats-team-chart-name">{person.personName}</Text>
                      <Text className="stats-team-chart-group">{person.group}</Text>
                    </View>
                    <View className="stats-team-chart-track">
                      {getOvertimeStackSegments(person, allPeopleChartMax).map(segment => (
                        <View
                          key={segment.key}
                          className={`stats-team-chart-segment ${segment.className}`}
                          style={{ width: `${segment.width}%` }}
                        >
                          {segment.showLabel && (
                            <Text className="stats-team-chart-segment-label">
                              {formatOvertimeHours(segment.hours)}h
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                    <Text className="stats-team-chart-total">{formatOvertimeHours(person.totalHours)}h</Text>
                  </View>
                ))}
              </View>
            </View>
            </>
          </View>
        </ScrollView>
      )}
    </View>
  )
}
