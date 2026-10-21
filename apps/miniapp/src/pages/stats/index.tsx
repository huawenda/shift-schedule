import { useEffect, useRef, useState } from 'react'
import { Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { scheduleData } from '../../data/schedule'
import { getShiftClass } from '../../appConstants'
import ShiftMark from '../../components/ShiftMark'
import UserPickerSheet from '../../components/UserPickerSheet'
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
  calculateSalary,
  emptySalaryInputs,
  formatMoney,
  roundMoney,
  type SalaryInputValues
} from '../../utils/salary'
import {
  getAllPeopleMonthlyOvertimeStats,
  getOvertimeChartItems,
  getPersonMonthlyStats,
  type PersonOvertimeStats
} from '../../utils/statistics'
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
  const miniProgramGlobal = globalThis as typeof globalThis & {
    wx?: {
      getWindowInfo?: () => { windowWidth?: number }
    }
  }
  const nativeWindowWidth = miniProgramGlobal.wx?.getWindowInfo?.().windowWidth
  if (typeof nativeWindowWidth === 'number' && nativeWindowWidth > 0) return nativeWindowWidth

  const taroWithWindowInfo = Taro as typeof Taro & {
    getWindowInfo?: () => { windowWidth?: number }
  }
  const windowWidth = taroWithWindowInfo.getWindowInfo?.().windowWidth
  if (typeof windowWidth === 'number' && windowWidth > 0) return windowWidth

  return 375
}

function getHeaderTopPadding(): string {
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

// 与 Web 端一致：金额越大字号越重，≥400 用 .is-big，100–400 用 .is-mid。
function getDailyPayClassName(pay: number): string {
  if (pay >= 400) return 'is-big'
  if (pay >= 100) return 'is-mid'

  return ''
}

// 加班图表 / 排名分段的配色修饰词（Web 端 .fill 与 .rank-track i 共用）。
function getStatsChartTypeClassName(type: string): string {
  return {
    平日: 'weekday',
    特勤: 'special',
    法定: 'legal'
  }[type] ?? ''
}

function getOvertimeStackSegments(person: PersonOvertimeStats, maxHours: number) {
  return [
    {
      key: 'weekday',
      className: 'weekday',
      hours: person.weekdayHours
    },
    {
      key: 'special',
      className: 'special',
      hours: person.specialHours
    },
    {
      key: 'legal',
      className: 'legal',
      hours: person.legalHours
    }
  ].map(segment => ({
    ...segment,
    width: maxHours > 0
      ? Math.max((segment.hours / maxHours) * 100, segment.hours > 0 ? 8 : 0)
      : 0,
    showLabel: segment.hours > 0 && maxHours > 0 && segment.hours / maxHours > 0.14
  }))
}

// swatchClass 为空表示这一行用红点（法定）而不是色票。
function getMonthlyOverviewRows(stats: NonNullable<ReturnType<typeof getPersonMonthlyStats>>) {
  return [
    {
      label: '白班',
      swatchClass: getShiftClass('白班'),
      days: stats.shiftSummary.白班,
      hours: stats.shiftSummary.加班?.白班 ?? 0
    },
    {
      label: '夜班',
      swatchClass: getShiftClass('夜班'),
      days: stats.shiftSummary.夜班,
      hours: stats.shiftSummary.加班?.夜班 ?? 0
    },
    {
      label: '休息',
      swatchClass: getShiftClass('休息'),
      days: stats.shiftSummary.休息,
      hours: 0
    },
    {
      label: '白特',
      swatchClass: getShiftClass('白特'),
      days: stats.shiftSummary.白特,
      hours: stats.shiftSummary.加班?.白特 ?? 0
    },
    {
      label: '夜特',
      swatchClass: getShiftClass('夜特'),
      days: stats.shiftSummary.夜特,
      hours: stats.shiftSummary.加班?.夜特 ?? 0
    },
    {
      label: '法定',
      swatchClass: '',
      days: stats.shiftSummary.法定 ?? 0,
      hours: stats.shiftSummary.加班?.法定 ?? 0
    },
    {
      label: '事假',
      swatchClass: getShiftClass('事假'),
      days: stats.leaveSummary.days,
      hours: stats.leaveSummary.hours
    }
  ]
}

export default function StatsPage() {
  const [headerTopPadding] = useState(getHeaderTopPadding)
  const [viewMode, setViewMode] = useState<StatsViewMode>('personal')
  const [personalPageIndex, setPersonalPageIndex] = useState(0)
  const [userPickerOpen, setUserPickerOpen] = useState(false)
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
  const monthLabel = availableMonthOptions[activeMonthIndex]?.label ?? ''
  const monthlyOverviewRows = stats ? getMonthlyOverviewRows(stats) : []
  const totalDays = monthlyOverviewRows.reduce((total, row) => total + row.days, 0)
  const overtimeChartItems = stats ? getOvertimeChartItems(stats.shiftSummary.加班) : []
  const overtimeChartMax = Math.max(...overtimeChartItems.map(item => item.hours), 0)
  const salaryInputKey = getSalaryInputKey(currentPerson.name, activeMonth)
  const salaryInputs = salaryInputRecords[salaryInputKey] ?? emptySalaryInputs
  const salarySaveStatusLabel = salarySaveStatus === 'pending'
    ? '待保存…'
    : salarySaveStatus === 'saving'
      ? '保存中…'
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
  const teamOvertimeTotal = allPeopleStats.people.reduce((sum, person) => sum + person.totalHours, 0)
  const statsRangeText = `${activeScheduleData.startDate.replace(/-/g, '/')} – ${activeScheduleData.endDate.replace(/-/g, '/')}`

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
    const key = editedSalaryKey.current
    if (!key) return undefined

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
      <View className="stats-page">
        <View className="stats-shell">
          <View className="stats-head" style={{ paddingTop: headerTopPadding }}>
            <View className="back" onClick={goBackToIndexPage}>
              <Text>← 返回</Text>
            </View>
            <Text className="stats-head-title">统计</Text>
            <Text className="range">{statsRangeText}</Text>
          </View>

          <View className="stats-loading">
            <Text>{profileReady ? '同步统计数据' : '读取统计信息'}</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className="stats-page">
      <View className="stats-shell">
        <View className="stats-head" style={{ paddingTop: headerTopPadding }}>
          <View className="back" onClick={goBackToIndexPage}>
            <Text>← 返回</Text>
          </View>
          <Text className="stats-head-title">统计</Text>
          <Text className="range">{statsRangeText}</Text>
          <View className="stats-spacer" />
          <View className="act" onClick={refreshStatsCloudData}>
            <View className={`live-dot ${cloudStatsRefreshing ? 'busy' : ''}`} />
            <Text>{cloudStatsRefreshing ? '同步中…' : '同步'}</Text>
          </View>
        </View>

        <View className="stats-tabs">
          <View
            className={`stats-tab ${viewMode === 'personal' && personalPageIndex === 0 ? 'is-active' : ''}`}
            onClick={switchToPersonalSummary}
          >
            <Text>综合统计</Text>
            {viewMode === 'personal' && personalPageIndex === 0 ? (
              <View className="stats-tab-underline" />
            ) : null}
          </View>
          <View
            className={`stats-tab ${viewMode === 'personal' && personalPageIndex === 1 ? 'is-active' : ''}`}
            onClick={switchToDailyDetails}
          >
            <Text>每日明细</Text>
            {viewMode === 'personal' && personalPageIndex === 1 ? (
              <View className="stats-tab-underline" />
            ) : null}
          </View>
          {isAdminUser ? (
            <View
              className={`stats-tab ${viewMode === 'team' ? 'is-active' : ''}`}
              onClick={() => setViewMode('team')}
            >
              <Text>全员统计</Text>
              {viewMode === 'team' ? <View className="stats-tab-underline" /> : null}
            </View>
          ) : null}
          <View className="stats-spacer" />
          {salarySaveStatusLabel && viewMode === 'personal' ? (
            <Text className={`save-state ${salarySaveStatus === 'error' ? 'error' : ''}`}>
              {salarySaveStatusLabel}
            </Text>
          ) : null}
        </View>

        <View className="stats-filters">
          <View className="filter">
            <Text className="k">月份</Text>
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
              <View className="v is-tappable">
                <Text>{monthLabel}</Text>
              </View>
            </Picker>
          </View>

          {viewMode === 'team' ? (
            <View className="filter">
              <Text className="k">范围</Text>
              <Text className="v">{allPeopleStats.people.length} 人</Text>
            </View>
          ) : null}

          {viewMode === 'personal' ? (
            <View className="filter">
              <Text className="k">用户</Text>
              {isAdminUser ? (
                <View className="v is-tappable" onClick={() => setUserPickerOpen(true)}>
                  <Text>{currentPerson.name}</Text>
                  <Text className="muted"> / {currentPerson.group}</Text>
                </View>
              ) : (
                <Text className="v">
                  {boundPersonName ? currentPerson.name : (profileReady ? '未绑定' : '读取中')}
                </Text>
              )}
            </View>
          ) : null}

          <View className="filter">
            <Text className="k">加班合计</Text>
            <Text className="v">
              {viewMode === 'team'
                ? formatOvertimeHours(teamOvertimeTotal)
                : formatOvertimeHours(stats?.overtimeTotal ?? 0)} h
            </Text>
          </View>
        </View>

        {isAdminUser && viewMode === 'personal' && stats ? (
          <View className="stats-page-indicator">
            {[0, 1].map(index => (
              <View
                key={index}
                className={`stats-page-indicator-dot ${personalPageIndex === index ? 'active' : ''}`}
                onClick={() => setPersonalPageIndex(index)}
              />
            ))}
          </View>
        ) : null}

        {viewMode === 'personal' && stats ? (
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
                  <ScrollView
                    scrollY
                    className="stats-scroll"
                    enableFlex
                    enhanced
                    showScrollbar={false}
                  >
                    <View className="zones">
                      <View className="page-section">
                        <View className="sec-head">
                          <Text className="sec-title">月度概览</Text>
                          <Text className="sec-sub">
                            {formatOvertimeHours(totalDays)} 天 · 加班{' '}
                            {formatOvertimeHours(stats.overtimeTotal)} 小时
                          </Text>
                        </View>

                        <View className="ovw">
                          <View className="ovw-row is-head">
                            <Text className="ovw-name">项目</Text>
                            <Text className="ovw-num ovw-num-days">天数</Text>
                            <Text className="ovw-num ovw-num-hrs">加班</Text>
                          </View>
                          {monthlyOverviewRows.map(row => (
                            <View key={row.label} className="ovw-row">
                              <View className="ovw-name">
                                {row.swatchClass ? (
                                  <View className={`swatch ${row.swatchClass}`} />
                                ) : (
                                  <View className="legal-dot" />
                                )}
                                <Text>{row.label}</Text>
                              </View>
                              <Text className="ovw-days">{row.days}</Text>
                              <Text className={`ovw-hrs ${row.hours > 0 ? 'active' : ''}`}>
                                {formatOvertimeHours(row.hours)} h
                              </Text>
                            </View>
                          ))}
                          <View className="ovw-total">
                            <Text>本月加班合计</Text>
                            <Text>{formatOvertimeHours(stats.overtimeTotal)} h</Text>
                          </View>
                        </View>
                      </View>

                      <View className="page-section">
                        <View className="sec-head">
                          <Text className="sec-title">加班分布</Text>
                          <Text className="sec-sub">按类型</Text>
                        </View>

                        <View className="bars">
                          {overtimeChartMax === 0 ? (
                            <View className="bars-empty">
                              <Text>本月没有加班记录</Text>
                            </View>
                          ) : (
                            <>
                              <View className="bars-plot">
                                {overtimeChartItems.map(item => (
                                  <View key={item.type} className="col">
                                    <Text className="v">{formatOvertimeHours(item.hours)} h</Text>
                                    <View
                                      className={`fill ${getStatsChartTypeClassName(item.type)}`}
                                      style={{
                                        height: `${Math.max(3, (item.hours / overtimeChartMax) * 100)}%`
                                      }}
                                    />
                                  </View>
                                ))}
                              </View>
                              <View className="bars-axis">
                                {overtimeChartItems.map(item => (
                                  <Text key={item.type}>{item.type}</Text>
                                ))}
                              </View>
                            </>
                          )}
                        </View>
                      </View>

                      <View className="payslip">
                        <View className="sec-head">
                          <Text className="sec-title">薪资计算</Text>
                          <Text className="sec-sub">
                            时薪 ¥{formatMoney(salaryCalculation.hourlyWage)} · 月计薪 21.75 天 × 8 小时
                          </Text>
                        </View>

                        <View className="pay-grid">
                          <View className="pay-block">
                            <View className="pay-block-head">
                              <Text className="pay-block-title">基本项</Text>
                              <Text className="sum">小计 ¥{formatMoney(salaryCalculation.basicPayTotal)}</Text>
                            </View>
                            {([
                              { label: '底薪', field: 'baseSalary' as const },
                              { label: '绩效津贴', field: 'performanceAllowance' as const },
                              { label: '岗位津贴', field: 'positionAllowance' as const }
                            ]).map(item => (
                              <View key={item.field} className="pay-row pay-input">
                                <Text className="pay-row-label">{item.label}</Text>
                                <View className="amount">
                                  <Text className="cur">¥</Text>
                                  <Input
                                    className="pay-amount-input"
                                    type="digit"
                                    value={salaryInputs[item.field]}
                                    placeholder="0"
                                    onInput={event => setSalaryInputValue(item.field, String(event.detail.value))}
                                  />
                                </View>
                              </View>
                            ))}
                          </View>

                          <View className="pay-block">
                            <View className="pay-block-head">
                              <Text className="pay-block-title">加班工资</Text>
                              <Text className="sum">小计 ¥{formatMoney(salaryCalculation.overtimePayTotal)}</Text>
                            </View>
                            <View className="pay-row">
                              <Text className="pay-row-label">平日加班 ×1.5</Text>
                              <Text className="pay-row-value">
                                ¥{formatMoney(salaryCalculation.weekdayOvertimePay)}
                              </Text>
                            </View>
                            <View className="pay-row">
                              <Text className="pay-row-label">特勤加班 ×2</Text>
                              <Text className="pay-row-value">
                                ¥{formatMoney(salaryCalculation.specialOvertimePay)}
                              </Text>
                            </View>
                            <View className="pay-row">
                              <Text className="pay-row-label">法定加班 ×3</Text>
                              <Text className="pay-row-value">
                                ¥{formatMoney(salaryCalculation.legalOvertimePay)}
                              </Text>
                            </View>
                          </View>

                          <View className="pay-block">
                            <View className="pay-block-head">
                              <Text className="pay-block-title">扣款项</Text>
                              <Text className="sum deduction">
                                小计 ¥{formatMoney(salaryCalculation.deductionTotal)}
                              </Text>
                            </View>
                            <View className="pay-row">
                              <Text className="pay-row-label">事假扣款</Text>
                              <Text className="pay-row-value">
                                ¥{formatMoney(salaryCalculation.leaveDeduction)}
                              </Text>
                            </View>
                            <View className="pay-row pay-input">
                              <Text className="pay-row-label">其他扣款</Text>
                              <View className="amount">
                                <Text className="cur">¥</Text>
                                <Input
                                  className="pay-amount-input"
                                  type="digit"
                                  value={salaryInputs.otherDeductions}
                                  placeholder="0"
                                  onInput={event => setSalaryInputValue('otherDeductions', String(event.detail.value))}
                                />
                              </View>
                            </View>
                          </View>

                          <View className="pay-net">
                            <View>
                              <Text className="k">实付工资</Text>
                              <Text className="v">¥{formatMoney(salaryCalculation.netSalary)}</Text>
                            </View>
                            <View className="side">
                              <Text>应付</Text>
                              <Text className="b">¥{formatMoney(salaryCalculation.payableSalary)}</Text>
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
                  <ScrollView
                    scrollY
                    className="stats-scroll"
                    enableFlex
                    enhanced
                    showScrollbar={false}
                  >
                    <View className="page-section daily-zone">
                      <View className="sec-head">
                        <Text className="sec-title">每日明细</Text>
                        <Text className="sec-sub">加班按当日倍率计薪</Text>
                      </View>

                      <View className="daily">
                        <View className="daily-row is-head">
                          <Text className="date">日期</Text>
                          <Text>班次</Text>
                          <Text className="hrs">加班</Text>
                          <Text className="pay">金额</Text>
                        </View>
                        {stats.dailyRecords.map(record => {
                          // 与 Web 端一致：用已四舍五入的时薪计算当日加班金额，
                          // 而不是拿底薪现算时薪（否则会出现分位差异）。
                          const dailyPay = roundMoney(
                            salaryCalculation.hourlyWage *
                              record.overtimeHours *
                              getDailyOvertimeMultiplier(record)
                          )

                          return (
                            <View
                              key={record.date}
                              className={`daily-row ${record.shift === '休息' ? 'is-rest' : ''} ${record.overtimeHours > 0 ? 'has-overtime' : ''}`}
                            >
                              <Text className="date">{record.date}</Text>
                              <View className="day-shift">
                                <ShiftMark shift={record.shift} />
                                {record.isLegal ? <View className="legal-dot" /> : null}
                              </View>
                              <Text className={`hrs ${record.overtimeHours > 0 ? '' : 'placeholder'}`}>
                                {record.overtimeHours > 0 ? `${formatOvertimeHours(record.overtimeHours)} h` : '—'}
                              </Text>
                              <Text className={`pay ${record.overtimeHours > 0 ? getDailyPayClassName(dailyPay) : 'placeholder'}`}>
                                <Text className="pay-cur">¥</Text>
                                <Text className="pay-num">{formatMoney(dailyPay)}</Text>
                              </Text>
                            </View>
                          )
                        })}
                      </View>
                    </View>
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {viewMode === 'team' ? (
          <ScrollView
            scrollY
            className="stats-scroll stats-scroll-team"
            enableFlex
            enhanced
            showScrollbar={false}
          >
            <View className="zones">
              <View className="page-section">
                <View className="sec-head">
                  <Text className="sec-title">全员加班分布</Text>
                  <Text className="sec-sub">{allPeopleStats.people.length} 人 · {monthLabel}结算周期</Text>
                </View>

                <View className="team-trio">
                  <View className="trio-cell">
                    <Text className="k">最高</Text>
                    <Text className="v">{formatOvertimeHours(allPeopleStats.maxOvertime)} h</Text>
                  </View>
                  <View className="trio-cell">
                    <Text className="k">平均</Text>
                    <Text className="v">{formatOvertimeHours(allPeopleStats.averageOvertime)} h</Text>
                  </View>
                  <View className="trio-cell">
                    <Text className="k">最低</Text>
                    <Text className="v">{formatOvertimeHours(allPeopleStats.minOvertime)} h</Text>
                  </View>
                </View>
              </View>

              <View className="page-section">
                <View className="sec-head">
                  <Text className="sec-title">排名</Text>
                  <Text className="sec-sub">平日 1.5× · 特勤 2× · 法定 3×</Text>
                </View>

                <View className="rank">
                  {allPeopleStats.ranking.map(person => (
                    <View key={person.personName} className={`rank-row ${person.rank <= 3 ? 'top' : ''}`}>
                      <Text className="no">{String(person.rank).padStart(2, '0')}</Text>
                      <View className="rank-name">
                        <Text className="b">{person.personName}</Text>
                        <Text className="g">{person.group}</Text>
                      </View>
                      <View className="rank-track">
                        {person.totalHours > 0 ? (
                          getOvertimeStackSegments(person, allPeopleChartMax).map(segment => (
                            <View
                              key={segment.key}
                              className={`seg ${segment.className}`}
                              style={{ width: `${segment.width}%` }}
                            >
                              {segment.showLabel ? (
                                <Text>{formatOvertimeHours(segment.hours)}</Text>
                              ) : null}
                            </View>
                          ))
                        ) : (
                          <Text className="muted">无加班</Text>
                        )}
                      </View>
                      <Text className="total">{formatOvertimeHours(person.totalHours)} h</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>
        ) : null}
      </View>

      {userPickerOpen ? (
        <UserPickerSheet
          people={scheduleData.people}
          selectedName={currentPerson.name}
          onSelect={nextName => {
            setUserPickerOpen(false)
            const nextIndex = scheduleData.people.findIndex(person => person.name === nextName)
            if (nextIndex >= 0) setPersonIndex(nextIndex)
          }}
          onClose={() => setUserPickerOpen(false)}
        />
      ) : null}
    </View>
  )
}