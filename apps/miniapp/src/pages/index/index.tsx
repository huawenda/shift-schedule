import { useEffect, useRef, useState } from 'react'
import { Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { scheduleData } from '../../data/schedule'
import { defaultCurrentUserName, monthOptions, weekdayLabels } from '../../appConstants'
import MonthCalendar from '../../components/MonthCalendar'
import ShiftEditorSheet, { type ShiftEditorState } from '../../components/ShiftEditorSheet'
import ShiftPlaque from '../../components/ShiftPlaque'
import TeamMatrix, { type TableMode } from '../../components/TeamMatrix'
import UserPickerSheet from '../../components/UserPickerSheet'
import { useCurrentShift } from '../../hooks/useCurrentShift'
import type { LeaveDuration, ShiftType } from '../../types/schedule'
import { normalizeLegalOverride } from '../../utils/legalOvertime'
import { mergeSharedCloudOverrides, shouldRefreshCloudOnUserSwitch } from '../../utils/cloudSync'
import { getEditableShiftOptionsForBase, getOvertimePresetOptions } from '../../utils/shiftEditRules'
import {
  formatScheduleMonthDay,
  getCalendarDateMeta,
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
  bindCurrentUserProfile,
  loadCurrentUserProfile,
  UserProfileError,
  type CurrentUserProfile
} from '../../services/userProfile'
import appIcon from '../../assets/icon2.png'
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
import './index.scss'

const formatDateRangePart = (date: string) => date.split('-').join('/')

// ——— 横向滚动定位用的几何常量 ———
// 这些值必须与 styles 里的 px 对齐：矩阵单元格宽 ds.$cell-w(38px)、姓名列 ds.$name-col(84px)、
// 版心内边距 ds.$page-pad(14px)、月份标签宽/间距（见 web-ui.scss 的 .rail-item）。
// Taro 在 designWidth 375 / deviceRatio 2 下把 1 源 px 编成 2rpx，所以这里一律 ×2 写成 rpx。
const rpx = (px: number) => px * 2
const dateColumnWidth = rpx(38)
const identityColumnWidth = rpx(84)
const pageHorizontalPadding = rpx(14)
const monthTabWidth = rpx(52)
const monthTabGap = rpx(4)
const monthTabsHorizontalPadding = rpx(6)
const monthVisiblePadding = rpx(4)
type CalendarAnimation = '' | 'calendar-slide-next' | 'calendar-slide-previous'

function openStatsPage() {
  void Taro.navigateTo({ url: '/pages/stats/index' }).catch(() => {
    void Taro.redirectTo({ url: '/pages/stats/index' })
  })
}

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
    const windowWidth = getWindowWidth()
    if (
      typeof menuButton?.top === 'number'
      && typeof menuButton?.height === 'number'
      && menuButton.top > 0
      && windowWidth > 0
    ) {
      const rpxScale = windowWidth / 750
      const titleLineHeight = rpx(20) * rpxScale
      const alignedTop = menuButton.top + ((menuButton.height - titleLineHeight) / 2)
      return `${Math.max(alignedTop, 0)}px`
    }
  } catch {
    // Some devtool runtimes may not expose menu metrics during initial render.
  }

  return '48px'
}

function getRpxScale(): number {
  return getWindowWidth() / 750
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
  const [tableView, setTableView] = useState<TableMode>('shift')
  const [userPickerOpen, setUserPickerOpen] = useState(false)
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
  const [tableScrollLeft, setTableScrollLeft] = useState<number | undefined>(undefined)
  const calendarAnimationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monthScrollLeftRef = useRef(monthScrollLeft)
  const tableScrollLeftRef = useRef(0)
  const tableScrollResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfile | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [profilePickerIndex, setProfilePickerIndex] = useState(0)
  const [profileBinding, setProfileBinding] = useState(false)
  const [cloudSyncReady, setCloudSyncReady] = useState(false)
  const [cloudRefreshing, setCloudRefreshing] = useState(false)
  const [refreshHintVisible, setRefreshHintVisible] = useState(false)
  const [deletedOverrideKeys, setDeletedOverrideKeys] = useState<string[]>([])
  const isAdminUser = currentUserProfile?.isAdmin ?? false
  const boundPersonName = currentUserProfile?.profile?.personName ?? null
  const needsProfileBinding = profileReady && !isAdminUser && !boundPersonName
  const effectiveScheduleData = applyShiftOverrides(shiftOverrides)
  const activeScheduleData = getMonthScheduleView(effectiveScheduleData, activeMonth)
  const currentUser = activeScheduleData.people.find(person => person.name === currentUserName)
    ?? activeScheduleData.people[0]
  const activeMonthLabel = `${monthOptions.find(option => option.value === activeMonth)?.label ?? ''}`
  const monthLabel = activeScheduleData.startDate
    ? `${activeScheduleData.startDate.slice(0, 4)}年${activeMonthLabel}`
    : activeMonthLabel
  const dateLabels = getDateLabels(activeScheduleData.startDate, activeScheduleData.dates)
  const currentUserOvertimeHours = currentUser
    ? activeScheduleData.dates.map(date => overtimeOverrides[getOverrideKey(currentUser.name, date)] ?? 0)
    : []
  const currentUserLegalFlags = currentUser
    ? activeScheduleData.dates.map(date => legalOverrides[getOverrideKey(currentUser.name, date)] === true)
    : []
  const shiftSummary = currentUser
    ? getPersonShiftSummary(currentUser, currentUserOvertimeHours, currentUserLegalFlags)
    : null
  const calendarCells = currentUser
    ? getPersonMonthCalendarCells(effectiveScheduleData, activeMonth, currentUser.name)
    : []
  const activeMonthIndex = monthOptions.findIndex(option => option.value === activeMonth)
  const moment = useCurrentShift(
    activeScheduleData.dates,
    currentUser ? currentUser.shifts : []
  )
  const overtimeDates = new Set(
    currentUser
      ? activeScheduleData.dates.filter((date, index) => {
          const key = getOverrideKey(currentUser.name, date)
          return currentUserLegalFlags[index] === true || (currentUserOvertimeHours[index] ?? 0) > 0
        })
      : []
  )
  const legalDates = new Set(
    currentUser
      ? activeScheduleData.dates.filter((date, index) => currentUserLegalFlags[index] === true)
      : []
  )
  const shiftsByPerson = activeScheduleData.people.reduce<Record<string, ShiftType[]>>((result, person) => {
    result[person.name] = person.shifts
    return result
  }, {})
  const matrixOvertimeKeys = new Set(
    activeScheduleData.people.flatMap(person => (
      activeScheduleData.dates
        .filter(date => {
          const key = getOverrideKey(person.name, date)
          return (overtimeOverrides[key] ?? 0) > 0 || legalOverrides[key] === true
        })
        .map(date => getOverrideKey(person.name, date))
    ))
  )
  const matrixLegalKeys = new Set(
    activeScheduleData.people.flatMap(person => (
      activeScheduleData.dates
        .filter(date => legalOverrides[getOverrideKey(person.name, date)] === true)
        .map(date => getOverrideKey(person.name, date))
    ))
  )
  const userPickerOptions = scheduleData.people.map(person => `${person.name} / ${person.group}`)
  const todayWeekday = todayDate.getDay()
  const setProgrammaticTableScrollLeft = (scrollLeft: number) => {
    tableScrollLeftRef.current = scrollLeft
    setTableScrollLeft(scrollLeft)

    if (tableScrollResetTimer.current) {
      clearTimeout(tableScrollResetTimer.current)
    }
    tableScrollResetTimer.current = setTimeout(() => {
      setTableScrollLeft(undefined)
      tableScrollResetTimer.current = null
    }, 320)
  }

  useEffect(() => {
    if (activeScheduleData.dates.includes(todayMonthDay)) {
      setProgrammaticTableScrollLeft(getCenteredTableScrollLeft(todayMonthDay, activeScheduleData.dates))
    } else {
      setProgrammaticTableScrollLeft(0)
    }
  }, [activeMonth, todayMonthDay])

  useEffect(() => () => {
    if (calendarAnimationTimer.current) {
      clearTimeout(calendarAnimationTimer.current)
    }
    if (tableScrollResetTimer.current) {
      clearTimeout(tableScrollResetTimer.current)
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
    if (!selectedPerson || profileBinding) return

    setProfileBinding(true)
    bindCurrentUserProfile(selectedPerson.name)
      .then(profile => {
        const nextProfile = {
          openid: currentUserProfile?.openid ?? profile._openid ?? null,
          isAdmin: currentUserProfile?.isAdmin ?? false,
          profile
        }
        setCurrentUserProfile(nextProfile)
        setCurrentUserName(profile.personName)
      })
      .catch(error => {
        console.warn('用户绑定失败', error)
        const message = error instanceof UserProfileError
          ? error.message
          : '绑定失败，请稍后重试'
        Taro.showToast({ title: message, icon: 'none' })
      })
      .finally(() => {
        setProfileBinding(false)
      })
  }
const shiftSummaryForPlaque = shiftSummary ?? {}
  // formatScheduleMonthDay 已产出 'MM/DD'，Web 端直接把它当 todayLabel 传下去；
  // 不能再走 formatShortDate（那函数吃的是 'YYYY-MM-DD'，传 'MM/DD' 会切出空串）。
  const todayDateKey = formatScheduleMonthDay(todayDate)
  const todayFullDate = `${todayDate.getFullYear()}-${todayDateKey.slice(0, 2)}-${todayDateKey.slice(3)}`
  const todayMetaLabel = getCalendarDateMeta(todayFullDate).label

  return (
    <View className="page">
      <View className="app-shell">
        <View className="masthead" style={{ paddingTop: headerTopPadding }}>
          <Text className="brand">倒班表</Text>
          <View className="stepper">
            <View
              className={`stepper-btn ${activeMonthIndex <= 0 ? 'disabled' : ''}`}
              onClick={() => activeMonthIndex > 0 && switchMonthBySwipe('previous')}
            >
              <Text>‹</Text>
            </View>
            <Text className="mon">{activeMonthLabel}</Text>
            <View
              className={`stepper-btn ${activeMonthIndex >= monthOptions.length - 1 ? 'disabled' : ''}`}
              onClick={() => activeMonthIndex < monthOptions.length - 1 && switchMonthBySwipe('next')}
            >
              <Text>›</Text>
            </View>
          </View>
          <View className="masthead-spacer" />
          <View
            className={`who ${isAdminUser ? 'admin' : ''}`}
            onClick={() => isAdminUser && setUserPickerOpen(true)}
          >
            <Text className="who-name">{currentUser?.name ?? ''}</Text>
            {isAdminUser ? (
              <Text className="who-tag">管理员</Text>
            ) : (
              <Text className="who-tag">{currentUser?.group ?? ''}</Text>
            )}
          </View>
          <View className="masthead-actions">
            <View className="act" onClick={refreshCloudOverrides}>
              <View
                className={`live-dot ${cloudRefreshing ? 'busy' : profileReady ? '' : 'off'}`}
              />
              <Text>{cloudRefreshing ? '同步中' : '同步'}</Text>
            </View>
            <View className="act act-ink" onClick={openStatsPage}>
              <Text>统计</Text>
            </View>
          </View>
        </View>

        <ScrollView
          scrollX
          enhanced
          showScrollbar={false}
          className="rail"
          scrollLeft={monthScrollLeft}
          scrollWithAnimation
        >
          <View className="rail-inner">
            {monthOptions.map(option => (
              <View
                key={option.value}
                className={`rail-item ${option.value === activeMonth ? 'is-active' : ''}`}
                onClick={() => setVisibleActiveMonth(option.value)}
              >
                <Text>{option.label}</Text>
                {option.value === activeMonth ? <View className="rail-underline" /> : null}
              </View>
            ))}
          </View>
        </ScrollView>

        <View className={`cloud-refresh-status ${refreshHintVisible ? 'visible' : ''}`}>
          <View className={`cloud-refresh-spinner ${cloudRefreshing ? 'spinning' : ''}`} />
          <Text>{refreshHintVisible ? '云端同步完成' : ''}</Text>
        </View>

        <ScrollView
          scrollY
          enhanced
          showScrollbar={false}
          className="scrollable-content"
          refresherEnabled
          refresherTriggered={cloudRefreshing}
          refresherDefaultStyle="none"
          refresherBackground="#f4f4f0"
          onRefresherRefresh={refreshCloudOverrides}
          onScrollToLower={refreshCloudOverrides}
        >
          <View className="scrollable-content-inner">
            <View className="plaque-wrap">
              <ShiftPlaque
                moment={moment}
                shiftName={moment.shift ?? '—'}
                summary={shiftSummaryForPlaque}
                startDate={activeScheduleData.startDate}
                endDate={activeScheduleData.endDate}
                personName={currentUser?.name ?? ''}
                personGroup={currentUser?.group ?? ''}
                dates={activeScheduleData.dates}
                shifts={currentUser?.shifts ?? []}
                todayLabel={todayDateKey}
                todayWeekday={weekdayLabels[todayWeekday]}
                todayMetaLabel={todayMetaLabel}
              />
            </View>

            <View className="board">
              <MonthCalendar
                monthLabel={monthLabel}
                cells={calendarCells}
                todayKey={todayDateKey}
                overtimeDates={overtimeDates}
                legalDates={legalDates}
                slideClassName={
                  calendarAnimation === 'calendar-slide-next'
                    ? 'cal-slide-next'
                    : calendarAnimation === 'calendar-slide-previous'
                      ? 'cal-slide-prev'
                      : ''
                }
                onOpenShiftEditor={date => openShiftEditor(date)}
                onSwipe={deltaX => {
                  if (Math.abs(deltaX) < 50) return
                  switchMonthBySwipe(deltaX < 0 ? 'next' : 'previous')
                }}
              />

              <TeamMatrix
                people={activeScheduleData.people}
                dates={activeScheduleData.dates}
                shiftsByPerson={shiftsByPerson}
                dateLabels={dateLabels}
                mode={tableView}
                currentPersonName={currentUser?.name ?? ''}
                todayKey={todayDateKey}
                overtimeKeys={matrixOvertimeKeys}
                legalKeys={matrixLegalKeys}
                scrollLeft={tableScrollLeft}
                onOpenShiftEditor={(date, personName) => openShiftEditor(date, personName)}
                onModeChange={nextMode => setTableView(nextMode)}
              />
            </View>

            <View className="page-footer">
              <Text className="footnote">
                数据：{activeScheduleData.people.length} 人 · {activeScheduleData.dates.length} 天，
                结算周期 {formatDateRangePart(activeScheduleData.startDate)} 至{' '}
                {formatDateRangePart(activeScheduleData.endDate)}。
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>

      {needsProfileBinding ? (
        <View className="sheet-backdrop">
          <View className="bind-sheet">
            <Text className="bind-title">绑定姓名</Text>
            <Text className="bind-desc">
              首次使用需要绑定到排班表中的姓名，之后将固定显示本人的排班与统计。
            </Text>
            <Picker
              mode="selector"
              range={userPickerOptions}
              value={profilePickerIndex}
              onChange={event => setProfilePickerIndex(Number(event.detail.value))}
            >
              <View className="bind-picker">
                <Text>{userPickerOptions[profilePickerIndex] ?? ''}</Text>
                <Text>›</Text>
              </View>
            </Picker>
            <View
              className={`bind-confirm ${profileBinding ? 'is-disabled' : ''}`}
              onClick={() => !profileBinding && bindProfile()}
            >
              <Text>{profileBinding ? '处理中' : '绑定'}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {shiftEditor ? (
        <ShiftEditorSheet
          editor={shiftEditor}
          editableOptions={getEditableShiftOptionsForBase(shiftEditor.baseShift)}
          leaveOptions={getEditorEffectiveShift(shiftEditor) === '事假'}
          overtimePresets={getOvertimePresetOptions(
            getEditorEffectiveShift(shiftEditor),
            shiftEditor.isLegal
          )}
          isSaving={false}
          onSelectShift={selectShiftEdit}
          onSelectLeaveDuration={setShiftEditorLeaveDuration}
          onSelectLegal={setShiftEditorLegal}
          onOvertimeInput={setShiftEditorOvertimeInput}
          onSave={saveShiftEditor}
          onClose={() => setShiftEditor(null)}
        />
      ) : null}

      {userPickerOpen ? (
        <UserPickerSheet
          people={scheduleData.people}
          selectedName={currentUser?.name ?? ''}
          onSelect={nextName => {
            setUserPickerOpen(false)
            refreshCloudOverridesForUserSwitch(nextName)
            setCurrentUserName(nextName)
          }}
          onClose={() => setUserPickerOpen(false)}
        />
      ) : null}
    </View>
  )
}