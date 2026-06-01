import { useEffect, useRef, useState } from 'react'
import { Image, Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { scheduleData } from '../../data/schedule'
import type { LeaveDuration, ShiftType } from '../../types/schedule'
import { canMarkLegalShift, normalizeLegalOverride } from '../../utils/legalOvertime'
import { mergeSharedCloudOverrides, shouldRefreshCloudOnUserSwitch } from '../../utils/cloudSync'
import { getShiftClassName, hasShiftOverrideChanged } from '../../utils/shift'
import { getEditableShiftOptionsForBase, getOvertimePresetOptions } from '../../utils/shiftEditRules'
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
import {
  getOverrideKey,
  loadCloudOverrides,
  syncCloudOverrides,
  type LeaveDurationOverrides,
  type LegalOverrides,
  type OvertimeOverrides,
  type ShiftOverrides
} from '../../services/cloudRecords'
import {
  loadCurrentUserProfile,
  loginWebAccount,
  registerWebAccount,
  UserProfileError,
  type CurrentUserProfile
} from '../../services/userProfile'
import {
  legalOverridesFileName,
  legalOverridesStorageKey,
  readLegalOverridesFromStorage,
  leaveDurationOverridesFileName,
  leaveDurationOverridesStorageKey,
  readLeaveDurationOverridesFromStorage,
  overtimeOverridesFileName,
  overtimeOverridesStorageKey,
  readOvertimeOverridesFromStorage,
  readShiftOverridesFromStorage,
  shiftOverridesFileName,
  shiftOverridesStorageKey,
  writePersistence
} from '../../services/localOverrides'
import { isH5Runtime } from '../../services/runtime'
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

function openStatsPage() {
  void Taro.navigateTo({ url: '/pages/stats/index' }).catch(() => {
    void Taro.redirectTo({ url: '/pages/stats/index' })
  })
}

const tableViewOptions: Array<{ label: string; value: TableView }> = [
  { label: '常规', value: 'shift' },
  { label: '姓名', value: 'name' }
]
const legendShiftOptions: ShiftType[] = ['白班', '夜班', '休息', '白特', '夜特', '事假']
const leaveDurationOptions: LeaveDuration[] = ['半天', '一天']

interface ShiftEditorState {
  personName: string
  date: string
  baseShift: ShiftType
  selectedShift: ShiftType | 'default'
  overtimeInput: string
  isLegal: boolean
  leaveDuration: LeaveDuration
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
  if (isH5Runtime) return '8px'

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
    夜特: 'name-shift-special-night',
    事假: 'name-shift-leave'
  }[shift]
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
  return shift !== '休息' && shift !== '事假'
}

function getEditorEffectiveShift(editor: ShiftEditorState): ShiftType {
  return editor.selectedShift === 'default' ? editor.baseShift : editor.selectedShift
}

function filterShiftOverridesByPersonName(overrides: ShiftOverrides, personName: string): ShiftOverrides {
  return Object.entries(overrides).reduce<ShiftOverrides>((result, [key, shift]) => {
    if (key.startsWith(`${personName}::`)) result[key] = shift
    return result
  }, {})
}

function filterOvertimeOverridesByPersonName(overrides: OvertimeOverrides, personName: string): OvertimeOverrides {
  return Object.entries(overrides).reduce<OvertimeOverrides>((result, [key, hours]) => {
    if (key.startsWith(`${personName}::`)) result[key] = hours
    return result
  }, {})
}

function filterLegalOverridesByPersonName(overrides: LegalOverrides, personName: string): LegalOverrides {
  return Object.entries(overrides).reduce<LegalOverrides>((result, [key, isLegal]) => {
    if (key.startsWith(`${personName}::`)) result[key] = isLegal
    return result
  }, {})
}

function filterLeaveDurationOverridesByPersonName(overrides: LeaveDurationOverrides, personName: string): LeaveDurationOverrides {
  return Object.entries(overrides).reduce<LeaveDurationOverrides>((result, [key, duration]) => {
    if (key.startsWith(`${personName}::`)) result[key] = duration
    return result
  }, {})
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
  const [legalOverrides, setLegalOverrides] = useState<LegalOverrides>(readLegalOverridesFromStorage)
  const [leaveDurationOverrides, setLeaveDurationOverrides] = useState<LeaveDurationOverrides>(readLeaveDurationOverridesFromStorage)
  const [shiftEditor, setShiftEditor] = useState<ShiftEditorState | null>(null)
  const [monthScrollLeft, setMonthScrollLeft] = useState(() => (
    getMonthTargetScrollLeft(currentScheduleMonth ?? '05', 0) ?? 0
  ))
  const [tableScrollLeft, setTableScrollLeft] = useState(0)
  const calendarTouchStart = useRef<{ x: number; y: number } | null>(null)
  const calendarAnimationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monthScrollLeftRef = useRef(monthScrollLeft)
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfile | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [profileAuthMode, setProfileAuthMode] = useState<'login' | 'register'>('login')
  const [profilePickerIndex, setProfilePickerIndex] = useState(0)
  const [profileUsername, setProfileUsername] = useState('')
  const [profilePassword, setProfilePassword] = useState('')
  const [profileInviteCode, setProfileInviteCode] = useState('')
  const [profileBinding, setProfileBinding] = useState(false)
  const [cloudSyncReady, setCloudSyncReady] = useState(false)
  const [cloudRefreshing, setCloudRefreshing] = useState(false)
  const [refreshHintVisible, setRefreshHintVisible] = useState(false)
  const [deletedOverrideKeys, setDeletedOverrideKeys] = useState<string[]>([])
  const isAdminUser = currentUserProfile?.isAdmin ?? false
  const boundPersonName = currentUserProfile?.profile?.personName ?? null
  const needsProfileBinding = profileReady && !isAdminUser && !boundPersonName
  const canSwitchUser = isAdminUser
  const userPickerButtonText = profileReady && boundPersonName ? '已绑定' : '待绑定'
  const effectiveScheduleData = applyShiftOverrides(shiftOverrides)
  const activeScheduleData = getMonthScheduleView(effectiveScheduleData, activeMonth)
  const currentUser = activeScheduleData.people.find(person => person.name === currentUserName)
    ?? activeScheduleData.people[0]
  const currentUserBadgeType = !isAdminUser
    ? 'self'
    : currentUser.name === defaultCurrentUserName ? 'admin' : 'user'
  const currentUserBadgeLabel = {
    admin: '管理员',
    self: '我',
    user: '用户'
  }[currentUserBadgeType]
  const currentUserBadgeClassName = `mine-badge ${currentUserBadgeType}`
  const userPickerOptions = scheduleData.people.map(person => `${person.name} / ${person.group}`)
  const currentUserIndex = Math.max(
    scheduleData.people.findIndex(person => person.name === currentUser.name),
    0
  )
  const dateRangeText = `${formatDateRangePart(activeScheduleData.startDate)} - ${formatDateRangePart(activeScheduleData.endDate)}`
  const currentUserOvertimeHours = currentUser
    ? activeScheduleData.dates.map(date => overtimeOverrides[getOverrideKey(currentUser.name, date)] ?? 0)
    : []
  const currentUserLegalFlags = currentUser
    ? activeScheduleData.dates.map(date => legalOverrides[getOverrideKey(currentUser.name, date)] === true)
    : []
  const shiftSummary = currentUser ? getPersonShiftSummary(currentUser, currentUserOvertimeHours, currentUserLegalFlags) : null
  const calendarCells = currentUser
    ? getPersonMonthCalendarCells(effectiveScheduleData, activeMonth, currentUser.name)
    : []
  const dateLabels = getDateLabels(activeScheduleData.startDate, activeScheduleData.dates)
  const scheduleTableStyle = `width: ${dateLabels.length * dateColumnWidth}rpx`
  const activeMonthIndex = monthOptions.findIndex(option => option.value === activeMonth)
  const activeMonthLabel = monthOptions[activeMonthIndex]?.label ?? `${Number(activeMonth)}月`

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
    let cancelled = false

    loadCurrentUserProfile()
      .then(profile => {
        if (cancelled) return

        setCurrentUserProfile(profile)
        if (!profile.isAdmin && profile.profile?.personName) {
          setCurrentUserName(profile.profile.personName)
        }
      })
      .catch(error => {
        console.warn('用户身份读取失败', error)
      })
      .finally(() => {
        if (!cancelled) setProfileReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!profileReady || isAdminUser || !boundPersonName) return

    setCurrentUserName(boundPersonName)
    setShiftOverrides(overrides => filterShiftOverridesByPersonName(overrides, boundPersonName))
    setOvertimeOverrides(overrides => filterOvertimeOverridesByPersonName(overrides, boundPersonName))
    setLegalOverrides(overrides => filterLegalOverridesByPersonName(overrides, boundPersonName))
    setLeaveDurationOverrides(overrides => filterLeaveDurationOverridesByPersonName(overrides, boundPersonName))
  }, [boundPersonName, isAdminUser, profileReady])

  useEffect(() => {
    let cancelled = false
    const canLoadCloud = profileReady && (isAdminUser || Boolean(boundPersonName))
    if (!canLoadCloud) return undefined

    setCloudSyncReady(false)
    loadCloudOverrides()
      .then(cloudOverrides => {
        if (cancelled) return

        setShiftOverrides(localOverrides => mergeSharedCloudOverrides(
          localOverrides,
          cloudOverrides.shiftOverrides
        ))
        setOvertimeOverrides(localOverrides => mergeSharedCloudOverrides(
          localOverrides,
          cloudOverrides.overtimeOverrides
        ))
        setLegalOverrides(localOverrides => mergeSharedCloudOverrides(
          localOverrides,
          cloudOverrides.legalOverrides
        ))
        setLeaveDurationOverrides(localOverrides => mergeSharedCloudOverrides(
          localOverrides,
          cloudOverrides.leaveDurationOverrides
        ))
      })
      .catch(error => {
        console.warn('云端排班记录读取失败', error)
      })
      .finally(() => {
        if (!cancelled) setCloudSyncReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [boundPersonName, isAdminUser, profileReady])

  useEffect(() => {
    writePersistence(shiftOverridesStorageKey, shiftOverridesFileName, shiftOverrides)
  }, [shiftOverrides])

  useEffect(() => {
    writePersistence(overtimeOverridesStorageKey, overtimeOverridesFileName, overtimeOverrides)
  }, [overtimeOverrides])

  useEffect(() => {
    writePersistence(legalOverridesStorageKey, legalOverridesFileName, legalOverrides)
  }, [legalOverrides])

  useEffect(() => {
    writePersistence(leaveDurationOverridesStorageKey, leaveDurationOverridesFileName, leaveDurationOverrides)
  }, [leaveDurationOverrides])

  useEffect(() => {
    if (!cloudSyncReady || !profileReady) return
    if (!isAdminUser && !boundPersonName) return

    const syncedPersonName = boundPersonName
    const nextShiftOverrides = isAdminUser || !syncedPersonName
      ? shiftOverrides
      : filterShiftOverridesByPersonName(shiftOverrides, syncedPersonName)
    const nextOvertimeOverrides = isAdminUser || !syncedPersonName
      ? overtimeOverrides
      : filterOvertimeOverridesByPersonName(overtimeOverrides, syncedPersonName)
    const nextLegalOverrides = isAdminUser || !syncedPersonName
      ? legalOverrides
      : filterLegalOverridesByPersonName(legalOverrides, syncedPersonName)
    const nextLeaveDurationOverrides = isAdminUser || !syncedPersonName
      ? leaveDurationOverrides
      : filterLeaveDurationOverridesByPersonName(leaveDurationOverrides, syncedPersonName)
    const nextDeletedOverrideKeys = isAdminUser || !syncedPersonName
      ? deletedOverrideKeys
      : deletedOverrideKeys.filter(key => key.startsWith(`${syncedPersonName}::`))

    syncCloudOverrides(nextShiftOverrides, nextOvertimeOverrides, nextLegalOverrides, nextLeaveDurationOverrides, nextDeletedOverrideKeys)
      .then(() => {
        if (nextDeletedOverrideKeys.length <= 0) return

        setDeletedOverrideKeys(keys => (
          isAdminUser || !syncedPersonName
            ? keys.filter(key => !nextDeletedOverrideKeys.includes(key))
            : keys.filter(key => !key.startsWith(`${syncedPersonName}::`))
        ))
      })
      .catch(error => {
        console.warn('云端排班记录同步失败', error)
      })
  }, [boundPersonName, cloudSyncReady, deletedOverrideKeys, isAdminUser, leaveDurationOverrides, legalOverrides, overtimeOverrides, profileReady, shiftOverrides])

  const applyCloudOverrides = (cloudOverrides: {
    shiftOverrides: ShiftOverrides
    overtimeOverrides: OvertimeOverrides
    legalOverrides: LegalOverrides
    leaveDurationOverrides: LeaveDurationOverrides
  }) => {
    setShiftOverrides(localOverrides => mergeSharedCloudOverrides(
      localOverrides,
      cloudOverrides.shiftOverrides
    ))
    setOvertimeOverrides(localOverrides => mergeSharedCloudOverrides(
      localOverrides,
      cloudOverrides.overtimeOverrides
    ))
    setLegalOverrides(localOverrides => mergeSharedCloudOverrides(
      localOverrides,
      cloudOverrides.legalOverrides
    ))
    setLeaveDurationOverrides(localOverrides => mergeSharedCloudOverrides(
      localOverrides,
      cloudOverrides.leaveDurationOverrides
    ))
  }

  const refreshCloudOverrides = () => {
    if (cloudRefreshing) return

    setRefreshHintVisible(true)
    setCloudRefreshing(true)
    loadCloudOverrides()
      .then(cloudOverrides => {
        applyCloudOverrides(cloudOverrides)
        Taro.showToast({ title: '云端同步完成', icon: 'none' })
      })
      .catch(error => {
        console.warn('手动云端同步失败', error)
        Taro.showToast({ title: '云端同步失败', icon: 'none' })
      })
      .finally(() => {
        setCloudRefreshing(false)
        setTimeout(() => {
          setRefreshHintVisible(false)
        }, 360)
      })
  }

  const refreshCloudOverridesForUserSwitch = (nextUserName: string) => {
    if (!shouldRefreshCloudOnUserSwitch(isAdminUser, currentUser.name, nextUserName)) return

    loadCloudOverrides()
      .then(cloudOverrides => {
        applyCloudOverrides(cloudOverrides)
      })
      .catch(error => {
        console.warn('切换用户时云端排班记录读取失败', error)
        Taro.showToast({ title: '云端同步失败，请下拉刷新', icon: 'none' })
      })
  }

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

  const openShiftEditor = (date: string, personName = currentUser?.name) => {
    if (!personName) return
    if (!isAdminUser && personName !== boundPersonName) {
      Taro.showToast({ title: '只能修改本人排班', icon: 'none' })
      return
    }

    const baseShift = getBaseShift(personName, date)
    if (!baseShift) return
    const overrideKey = getOverrideKey(personName, date)
    const currentShiftOverride = shiftOverrides[overrideKey]

    setShiftEditor({
      personName,
      date,
      baseShift,
      selectedShift: currentShiftOverride ?? 'default',
      overtimeInput: overtimeOverrides[overrideKey]?.toString() ?? '',
      isLegal: legalOverrides[overrideKey] === true,
      leaveDuration: leaveDurationOverrides[overrideKey] ?? '一天'
    })
  }

  const markOverrideDeleted = (key: string) => {
    setDeletedOverrideKeys(keys => keys.includes(key) ? keys : [...keys, key])
  }

  const unmarkOverrideDeleted = (key: string) => {
    setDeletedOverrideKeys(keys => keys.filter(item => item !== key))
  }

  const selectShiftEdit = (nextShift: ShiftType | 'default') => {
    setShiftEditor(editor => {
      if (!editor) return editor
      const effectiveShift = nextShift === 'default' ? editor.baseShift : nextShift
      return {
        ...editor,
        selectedShift: nextShift,
        isLegal: normalizeLegalOverride(effectiveShift, editor.isLegal),
        leaveDuration: effectiveShift === '事假' ? editor.leaveDuration : '一天'
      }
    })
  }

  const setShiftEditorOvertimeInput = (value: string) => {
    setShiftEditor(editor => editor ? { ...editor, overtimeInput: value } : editor)
  }

  const setShiftEditorLegal = (isLegal: boolean) => {
    setShiftEditor(editor => {
      if (!editor) return editor
      const effectiveShift = getEditorEffectiveShift(editor)
      return {
        ...editor,
        isLegal: normalizeLegalOverride(effectiveShift, isLegal)
      }
    })
  }

  const setShiftEditorLeaveDuration = (leaveDuration: LeaveDuration) => {
    setShiftEditor(editor => editor ? { ...editor, leaveDuration } : editor)
  }

  const saveShiftEditor = () => {
    if (!shiftEditor) return

    const key = getOverrideKey(shiftEditor.personName, shiftEditor.date)
    const resolvedShift = shiftEditor.selectedShift === 'default'
      ? shiftEditor.baseShift
      : shiftEditor.selectedShift
    const shouldUseBaseShift = shiftEditor.selectedShift === 'default'
      || resolvedShift === shiftEditor.baseShift
    const overtimeHours = canRecordOvertime(resolvedShift)
      ? normalizeOvertimeHours(shiftEditor.overtimeInput)
      : 0
    const isLegalOvertime = normalizeLegalOverride(resolvedShift, shiftEditor.isLegal)
    const leaveDuration = resolvedShift === '事假' ? shiftEditor.leaveDuration : null

    setShiftOverrides(overrides => {
      const nextOverrides = { ...overrides }
      if (shouldUseBaseShift) {
        delete nextOverrides[key]
      } else {
        nextOverrides[key] = resolvedShift
      }
      return nextOverrides
    })

    setOvertimeOverrides(overrides => {
      const nextOverrides = { ...overrides }
      if (overtimeHours > 0) {
        nextOverrides[key] = overtimeHours
      } else {
        delete nextOverrides[key]
      }
      return nextOverrides
    })

    setLegalOverrides(overrides => {
      const nextOverrides = { ...overrides }
      if (isLegalOvertime) {
        nextOverrides[key] = true
      } else {
        delete nextOverrides[key]
      }
      return nextOverrides
    })

    setLeaveDurationOverrides(overrides => {
      const nextOverrides = { ...overrides }
      if (leaveDuration) {
        nextOverrides[key] = leaveDuration
      } else {
        delete nextOverrides[key]
      }
      return nextOverrides
    })

    if (shouldUseBaseShift && overtimeHours <= 0 && !isLegalOvertime && !leaveDuration) {
      markOverrideDeleted(key)
    } else {
      unmarkOverrideDeleted(key)
    }

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

  const bindProfile = () => {
    const selectedPerson = scheduleData.people[profilePickerIndex]
    if (profileAuthMode === 'register' && !selectedPerson) return

    setProfileBinding(true)
    const authRequest = profileAuthMode === 'login'
      ? loginWebAccount({
        username: profileUsername,
        password: profilePassword
      })
      : registerWebAccount({
        username: profileUsername,
        password: profilePassword,
        personName: selectedPerson.name,
        inviteCode: profileInviteCode
      })

    authRequest
      .then(profile => {
        setCurrentUserProfile(profile)
        if (profile.profile?.personName) {
          setCurrentUserName(profile.profile.personName)
        }
      })
      .catch(error => {
        console.warn('账号登录失败', error)
        const message = error instanceof UserProfileError
          ? error.message
          : '登录失败，请稍后重试'
        Taro.showToast({ title: message, icon: 'none' })
      })
      .finally(() => {
        setProfileBinding(false)
      })
  }

  return (
    <View className={`page ${isH5Runtime ? 'page-h5' : ''}`}>
      <View className="frozen-panel">
        <View className="header" style={{ paddingTop: headerTopPadding }}>
          <View className="header-main">
            <View className="title-row">
              <View className="app-mark">
                <Image className="app-mark-icon" src="/icons/icon-192.png" mode="aspectFill" />
              </View>
              <View className="title-copy">
                <Text className="title">倒班表</Text>
                <Text className="subtitle">{dateRangeText}</Text>
              </View>
            </View>
          </View>
          <View className="header-month-chip">
            <Text className="header-month-value">{activeMonthLabel}</Text>
            <Text className="header-month-label">当前</Text>
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
          <View className="month-tabs-inner">
            {monthOptions.map(option => (
              <View
                key={option.value}
                className={`month-tab ${activeMonth === option.value ? 'active' : ''}`}
                onClick={() => setVisibleActiveMonth(option.value)}
              >
                <Text>{option.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View className="current-user-card">
          <View className="current-user-main">
            <View>
              <Text className="eyebrow">当前用户</Text>
              <View className="current-user-title-row">
                <Text className="current-user-name">{currentUser?.name}</Text>
                <Text className={currentUserBadgeClassName}>{currentUserBadgeLabel}</Text>
                <Text className="current-user-group">{currentUser?.group}</Text>
              </View>
            </View>
            {canSwitchUser ? (
              <View className="current-user-actions">
                <View className="user-picker-button" onClick={openStatsPage}>
                  <Text>统计</Text>
                </View>
                <Picker
                  mode="selector"
                  range={userPickerOptions}
                  value={currentUserIndex}
                  onChange={event => {
                    const nextUser = scheduleData.people[Number(event.detail.value)]
                    if (!nextUser) return

                    setCurrentUserName(nextUser.name)
                    refreshCloudOverridesForUserSwitch(nextUser.name)
                  }}
                >
                  <View className="user-picker-button">
                    <Text>切换</Text>
                  </View>
                </Picker>
              </View>
            ) : (
              <View className="current-user-actions">
                <View className="user-picker-button" onClick={openStatsPage}>
                  <Text>统计</Text>
                </View>
                <View className="user-picker-button locked">
                  <Text>{userPickerButtonText}</Text>
                </View>
              </View>
            )}
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
              <View className="summary-item summary-legal">
                <View className="summary-value-row">
                  <Text className="summary-value">{shiftSummary.法定 ?? 0}</Text>
                  {(shiftSummary.加班?.法定 ?? 0) > 0 && (
                    <Text className="summary-overtime legal">{formatOvertimeHours(shiftSummary.加班?.法定 ?? 0)}h</Text>
                  )}
                </View>
                <Text className="summary-label">法定</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        scrollY
        className="scrollable-content"
        enableFlex
        enhanced
        showScrollbar={false}
        refresherEnabled={!isH5Runtime}
        refresherTriggered={cloudRefreshing}
        refresherDefaultStyle="none"
        refresherBackground="#f5f7fb"
        onRefresherPulling={() => {
          if (!isH5Runtime) setRefreshHintVisible(true)
        }}
        onRefresherRestore={() => {
          if (!isH5Runtime && !cloudRefreshing) setRefreshHintVisible(false)
        }}
        onRefresherAbort={() => {
          if (!isH5Runtime && !cloudRefreshing) setRefreshHintVisible(false)
        }}
        onRefresherRefresh={() => {
          if (!isH5Runtime) refreshCloudOverrides()
        }}
      >
        <View className="scrollable-content-inner">
          <View className={`cloud-refresh-status ${refreshHintVisible ? 'visible' : ''}`}>
            <View className={`cloud-refresh-spinner ${cloudRefreshing ? 'spinning' : ''}`} />
            <Text>{cloudRefreshing ? '正在同步云端' : '下拉同步云端'}</Text>
          </View>
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
                {cell.inCurrentMonth &&
                  currentUser &&
                  (overtimeOverrides[getOverrideKey(currentUser.name, cell.key)] ?? 0) > 0 &&
                  legalOverrides[getOverrideKey(currentUser.name, cell.key)] !== true && (
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
                      <View className="calendar-shift-row">
                        <Text className={`${getShiftClassName(cell.shift)} ${cell.inCurrentMonth ? '' : 'shift-muted'}`}>
                          {cell.shift}
                        </Text>
                        {currentUser && legalOverrides[getOverrideKey(currentUser.name, cell.key)] === true && (
                          <Text className={`legal-shift-badge ${cell.inCurrentMonth ? '' : 'shift-muted'}`}>法</Text>
                        )}
                      </View>
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
                    {person.name === currentUser.name && (
                      <Text className={`${currentUserBadgeClassName} small`}>{currentUserBadgeLabel}</Text>
                    )}
                  </View>
                ) : (
                  <View>
                    <View className="identity-name-row">
                      <Text className="identity-name">{person.name}</Text>
                      {person.name === currentUser.name && (
                        <Text className={`${currentUserBadgeClassName} small`}>{currentUserBadgeLabel}</Text>
                      )}
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
                  {person.shifts.map((shift, index) => {
                    const date = activeScheduleData.dates[index]
                    const overrideKey = getOverrideKey(person.name, date)
                    const baseShift = getBaseShift(person.name, date)
                    const isEditedShift = Boolean(
                      baseShift && hasShiftOverrideChanged(baseShift, shiftOverrides[overrideKey])
                    )

                    return (
                      <View
                        key={`${person.name}-${index}`}
                        className="cell date-cell table-shift-cell"
                        onLongPress={() => openShiftEditor(date, person.name)}
                      >
                        {isEditedShift && <View className="table-edited-marker" />}
                        {tableView === 'name' ? (
                          <Text className={`name-view-person-name ${getNameViewShiftClassName(shift)}`}>
                            {person.name}
                          </Text>
                        ) : (
                          <Text className={getShiftClassName(shift)}>{shift}</Text>
                        )}
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          </View>
          </View>
        </View>
      </ScrollView>

      {shiftEditor && (
        <View className="editor-mask" onClick={() => setShiftEditor(null)}>
          <View className="shift-editor" onClick={event => event.stopPropagation()}>
            <View className="shift-editor-header">
              <View>
                <Text className="shift-editor-title">编辑</Text>
                <Text className="shift-editor-subtitle">
                  {shiftEditor.personName} · {shiftEditor.date}
                </Text>
              </View>
            </View>

            <View className="shift-editor-section">
              <Text className="shift-editor-label">默认班次</Text>
              <View
                className={`shift-editor-option ${shiftEditor.selectedShift === 'default' ? 'selected' : ''}`}
                onClick={() => selectShiftEdit('default')}
              >
                <Text className={getShiftClassName(shiftEditor.baseShift)}>
                  {shiftEditor.baseShift}
                </Text>
              </View>
            </View>

            <View className="shift-editor-section">
              <Text className="shift-editor-label">修改为</Text>
              <View className="shift-editor-options">
                {getEditableShiftOptionsForBase(shiftEditor.baseShift).map(shift => {
                  const selectedShift = shiftEditor.selectedShift === 'default' ? shiftEditor.baseShift : shiftEditor.selectedShift
                  const isSelected = selectedShift === shift
                  const isDisabled = shiftEditor.isLegal && shift === '事假'

                  return (
                    <View
                      key={shift}
                      className={`shift-editor-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                      onClick={() => {
                        if (!isDisabled) selectShiftEdit(shift === shiftEditor.baseShift ? 'default' : shift)
                      }}
                    >
                      <Text className={getShiftClassName(shift)}>{shift}</Text>
                    </View>
                  )
                })}
              </View>
            </View>

            {getEditorEffectiveShift(shiftEditor) === '事假' && (
              <View className="shift-editor-section">
                <Text className="shift-editor-label">事假时长</Text>
                <View className="legal-editor-row">
                  {leaveDurationOptions.map(duration => (
                    <View
                      key={duration}
                      className={`legal-editor-option ${shiftEditor.leaveDuration === duration ? 'selected' : ''}`}
                      onClick={() => setShiftEditorLeaveDuration(duration)}
                    >
                      <Text>{duration}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View className="shift-editor-section">
              <Text className="shift-editor-label">法定</Text>
              {canMarkLegalShift(getEditorEffectiveShift(shiftEditor)) ? (
                <View className="legal-editor-row">
                  <View
                    className={`legal-editor-option ${!shiftEditor.isLegal ? 'selected' : ''}`}
                    onClick={() => setShiftEditorLegal(false)}
                  >
                    <Text>否</Text>
                  </View>
                  <View
                    className={`legal-editor-option ${shiftEditor.isLegal ? 'selected' : ''}`}
                    onClick={() => setShiftEditorLegal(true)}
                  >
                    <Text>是</Text>
                  </View>
                </View>
              ) : (
                <Text className="overtime-disabled">该班次不可标记法定</Text>
              )}
            </View>

            <View className="shift-editor-section">
              <Text className="shift-editor-label">加班时长</Text>
              {canRecordOvertime(getEditorEffectiveShift(shiftEditor)) ? (
                <View className="overtime-editor-stack">
                  <View className="overtime-preset-row">
                    {getOvertimePresetOptions(getEditorEffectiveShift(shiftEditor), shiftEditor.isLegal).map(hours => {
                      const isSelected = normalizeOvertimeHours(shiftEditor.overtimeInput) === hours

                      return (
                        <View
                          key={hours}
                          className={`overtime-preset-option ${isSelected ? 'selected' : ''}`}
                          onClick={() => setShiftEditorOvertimeInput(formatOvertimeHours(hours))}
                        >
                          <Text>{formatOvertimeHours(hours)}h</Text>
                        </View>
                      )
                    })}
                  </View>
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
                </View>
              ) : (
                <Text className="overtime-disabled">该班次不记录加班</Text>
              )}
            </View>

            <View className="shift-editor-actions">
              <View className="shift-editor-save" onClick={saveShiftEditor}>
                <Text>保存</Text>
              </View>
              <View className="shift-editor-cancel" onClick={() => setShiftEditor(null)}>
                <Text>取消</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {needsProfileBinding && (
        <View className="editor-mask profile-binding-mask">
          <View className="profile-binding">
            <Text className="profile-binding-title">{profileAuthMode === 'login' ? '账号登录' : '注册账号'}</Text>
            <Text className="profile-binding-desc">
              {profileAuthMode === 'login'
                ? '使用你的账号登录。登录后权限会绑定到账号和对应姓名。'
                : '创建账号并绑定姓名。注册后只能修改该姓名的排班和加班记录。'}
            </Text>
            <View className="profile-auth-tabs">
              <View
                className={`profile-auth-tab ${profileAuthMode === 'login' ? 'active' : ''}`}
                onClick={() => setProfileAuthMode('login')}
              >
                <Text>登录</Text>
              </View>
              <View
                className={`profile-auth-tab ${profileAuthMode === 'register' ? 'active' : ''}`}
                onClick={() => setProfileAuthMode('register')}
              >
                <Text>注册</Text>
              </View>
            </View>
            <Input
              className="profile-binding-input"
              placeholder="账号"
              value={profileUsername}
              onInput={event => setProfileUsername(String(event.detail.value ?? ''))}
            />
            <Input
              className="profile-binding-input"
              password
              placeholder="密码"
              value={profilePassword}
              onInput={event => setProfilePassword(String(event.detail.value ?? ''))}
            />
            {profileAuthMode === 'register' && (
              <>
                <Picker
                  mode="selector"
                  range={userPickerOptions}
                  value={profilePickerIndex}
                  onChange={event => setProfilePickerIndex(Number(event.detail.value))}
                >
                  <View className="profile-binding-picker">
                    <Text>{userPickerOptions[profilePickerIndex]}</Text>
                  </View>
                </Picker>
                <Input
                  className="profile-binding-input"
                  password
                  placeholder="邀请码"
                  value={profileInviteCode}
                  onInput={event => setProfileInviteCode(String(event.detail.value ?? ''))}
                />
              </>
            )}
            <View className="profile-binding-actions">
              <View
                className={`profile-binding-confirm ${profileBinding || !profileUsername || !profilePassword || (profileAuthMode === 'register' && !profileInviteCode) ? 'disabled' : ''}`}
                onClick={() => {
                  if (
                    !profileBinding
                    && profileUsername
                    && profilePassword
                    && (profileAuthMode === 'login' || profileInviteCode)
                  ) bindProfile()
                }}
              >
                <Text>{profileBinding ? '处理中' : (profileAuthMode === 'login' ? '登录' : '注册')}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
