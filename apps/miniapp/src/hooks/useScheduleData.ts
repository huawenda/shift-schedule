import { useEffect, useMemo, useState } from 'react'
import Taro from '@tarojs/taro'
import { defaultCurrentUserName } from '../appConstants'
import { scheduleData } from '../data/schedule'
import type { LeaveDuration, ShiftType } from '../types/schedule'
import { normalizeLegalOverride } from '../utils/legalOvertime'
import { mergeSharedCloudOverrides } from '../utils/cloudSync'
import {
  formatScheduleMonthDay,
  getCalendarDateMeta,
  getCurrentScheduleMonth,
  getMonthScheduleView,
  getPersonMonthCalendarCells,
  getPersonShiftSummary,
  normalizeOvertimeHours,
  type ScheduleMonth
} from '../utils/schedule'
import {
  getOverrideKey,
  loadCloudOverrides,
  syncCloudOverrides,
  type LeaveDurationOverrides,
  type LegalOverrides,
  type OvertimeOverrides,
  type ShiftOverrides
} from '../services/cloudRecords'
import {
  bindCurrentUserProfile,
  loadCurrentUserProfile,
  type CurrentUserProfile
} from '../services/userProfile'
import {
  leaveDurationOverridesFileName,
  leaveDurationOverridesStorageKey,
  legalOverridesFileName,
  legalOverridesStorageKey,
  overtimeOverridesFileName,
  overtimeOverridesStorageKey,
  readLeaveDurationOverridesFromStorage,
  readLegalOverridesFromStorage,
  readOvertimeOverridesFromStorage,
  readShiftOverridesFromStorage,
  shiftOverridesFileName,
  shiftOverridesStorageKey,
  writePersistence
} from '../services/localOverrides'

export interface ShiftDraft {
  personName: string
  date: string
  baseShift: ShiftType
  selectedShift: ShiftType | 'default'
  overtimeInput: string
  isLegal: boolean
  leaveDuration: LeaveDuration
}

function filterByPerson<T>(overrides: Record<string, T>, personName: string): Record<string, T> {
  return Object.entries(overrides).reduce<Record<string, T>>((result, [key, value]) => {
    if (key.startsWith(`${personName}::`)) result[key] = value
    return result
  }, {})
}

/**
 * 排班数据层（与 UI 无关）。
 *
 * 原来的实现全部挤在 pages/index/index.tsx 里（1000 行，UI 与同步逻辑混在一起），
 * 这次重写把数据层抽出来，三个 tab 页共用同一套状态与同步规则。
 *
 * 两条必须保留的铁律（见项目记忆）：
 * 1. mergeSharedCloudOverrides 的语义是「云端为准、整体替换本地」，
 *    所以云端读取失败时必须禁止上行，否则会把本地快照当成云端现状写回去。
 * 2. 普通用户只能读写本人记录，过滤在前端做一次（后端策略另有一道）。
 */
export function useScheduleData() {
  const todayDate = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => formatScheduleMonthDay(todayDate), [todayDate])
  const todayFullDate = useMemo(
    () => `${todayDate.getFullYear()}-${todayKey.slice(0, 2)}-${todayKey.slice(3)}`,
    [todayDate, todayKey]
  )
  const todayMeta = useMemo(() => getCalendarDateMeta(todayFullDate), [todayFullDate])

  const [activeMonth, setActiveMonth] = useState<ScheduleMonth>(
    () => getCurrentScheduleMonth(scheduleData, new Date()) ?? '05'
  )
  const [currentUserName, setCurrentUserName] = useState(defaultCurrentUserName)
  const [shiftOverrides, setShiftOverrides] = useState<ShiftOverrides>(readShiftOverridesFromStorage)
  const [overtimeOverrides, setOvertimeOverrides] = useState<OvertimeOverrides>(readOvertimeOverridesFromStorage)
  const [legalOverrides, setLegalOverrides] = useState<LegalOverrides>(readLegalOverridesFromStorage)
  const [leaveDurationOverrides, setLeaveDurationOverrides] = useState<LeaveDurationOverrides>(readLeaveDurationOverridesFromStorage)
  const [deletedOverrideKeys, setDeletedOverrideKeys] = useState<string[]>([])
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [cloudSyncReady, setCloudSyncReady] = useState(false)
  const [cloudSyncBlocked, setCloudSyncBlocked] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const isAdmin = profile?.isAdmin ?? false
  const boundPersonName = profile?.profile?.personName ?? null
  const needsBinding = profileReady && !isAdmin && !boundPersonName

  const effectiveScheduleData = useMemo(() => ({
    ...scheduleData,
    people: scheduleData.people.map(person => ({
      ...person,
      shifts: person.shifts.map((shift, index) => (
        shiftOverrides[getOverrideKey(person.name, scheduleData.dates[index])] ?? shift
      ))
    }))
  }), [shiftOverrides])

  const monthView = useMemo(
    () => getMonthScheduleView(effectiveScheduleData, activeMonth),
    [effectiveScheduleData, activeMonth]
  )

  const currentUser = useMemo(
    () => monthView.people.find(person => person.name === currentUserName) ?? monthView.people[0],
    [monthView, currentUserName]
  )

  const todayOvertime = currentUser && currentUser.shifts.length > 0
    ? monthView.dates.map(date => overtimeOverrides[getOverrideKey(currentUser.name, date)] ?? 0)
    : []
  const todayLegal = currentUser && currentUser.shifts.length > 0
    ? monthView.dates.map(date => legalOverrides[getOverrideKey(currentUser.name, date)] === true)
    : []

  const summary = useMemo(
    () => (currentUser ? getPersonShiftSummary(currentUser, todayOvertime, todayLegal) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, overtimeOverrides, legalOverrides]
  )

  const calendarCells = useMemo(
    () => (currentUser ? getPersonMonthCalendarCells(effectiveScheduleData, activeMonth, currentUser.name) : []),
    [effectiveScheduleData, activeMonth, currentUser]
  )

  const overtimeDates = useMemo(() => new Set(
    currentUser
      ? monthView.dates.filter((date, index) => {
        const key = getOverrideKey(currentUser.name, date)
        return todayLegal[index] === true || (todayOvertime[index] ?? 0) > 0
      })
      : []
  ), [currentUser, monthView.dates, todayLegal, todayOvertime])

  const legalDates = useMemo(() => new Set(
    currentUser ? monthView.dates.filter((date, index) => todayLegal[index] === true) : []
  ), [currentUser, monthView.dates, todayLegal])

  // —— 身份 ——
  useEffect(() => {
    let cancelled = false
    loadCurrentUserProfile()
      .then(nextProfile => {
        if (cancelled) return
        setProfile(nextProfile)
        if (!nextProfile.isAdmin && nextProfile.profile?.personName) {
          setCurrentUserName(nextProfile.profile.personName)
        }
      })
      .catch(error => console.warn('用户身份读取失败', error))
      .finally(() => { if (!cancelled) setProfileReady(true) })
    return () => { cancelled = true }
  }, [])

  // 普通用户只看本人记录
  useEffect(() => {
    if (!profileReady || isAdmin || !boundPersonName) return
    setCurrentUserName(boundPersonName)
    setShiftOverrides(overrides => filterByPerson(overrides, boundPersonName))
    setOvertimeOverrides(overrides => filterByPerson(overrides, boundPersonName))
    setLegalOverrides(overrides => filterByPerson(overrides, boundPersonName))
    setLeaveDurationOverrides(overrides => filterByPerson(overrides, boundPersonName))
  }, [boundPersonName, isAdmin, profileReady])

  // —— 云端下行 ——
  useEffect(() => {
    let cancelled = false
    const canLoadCloud = profileReady && (isAdmin || Boolean(boundPersonName))
    if (!canLoadCloud) return undefined

    setCloudSyncReady(false)
    loadCloudOverrides()
      .then(cloud => {
        if (cancelled) return
        setShiftOverrides(local => mergeSharedCloudOverrides(local, cloud.shiftOverrides))
        setOvertimeOverrides(local => mergeSharedCloudOverrides(local, cloud.overtimeOverrides))
        setLegalOverrides(local => mergeSharedCloudOverrides(local, cloud.legalOverrides))
        setLeaveDurationOverrides(local => mergeSharedCloudOverrides(local, cloud.leaveDurationOverrides))
      })
      .catch(error => {
        // 读失败必须保持本地原样并封锁上行，否则等于把本地快照写回云端。
        console.warn('云端记录读取失败，已保留本地数据并暂停上行同步', error)
        setCloudSyncBlocked(true)
      })
      .finally(() => { if (!cancelled) setCloudSyncReady(true) })

    return () => { cancelled = true }
  }, [boundPersonName, isAdmin, profileReady])

  // —— 本地持久化 ——
  useEffect(() => { writePersistence(shiftOverridesStorageKey, shiftOverridesFileName, shiftOverrides) }, [shiftOverrides])
  useEffect(() => { writePersistence(overtimeOverridesStorageKey, overtimeOverridesFileName, overtimeOverrides) }, [overtimeOverrides])
  useEffect(() => { writePersistence(legalOverridesStorageKey, legalOverridesFileName, legalOverrides) }, [legalOverrides])
  useEffect(() => {
    writePersistence(leaveDurationOverridesStorageKey, leaveDurationOverridesFileName, leaveDurationOverrides)
  }, [leaveDurationOverrides])

  // —— 云端上行 ——
  useEffect(() => {
    if (!cloudSyncReady || !profileReady) return
    if (cloudSyncBlocked) return
    if (!isAdmin && !boundPersonName) return

    const scoped = isAdmin || !boundPersonName
    const syncShift = scoped ? shiftOverrides : filterByPerson(shiftOverrides, boundPersonName)
    const syncOvertime = scoped ? overtimeOverrides : filterByPerson(overtimeOverrides, boundPersonName)
    const syncLegal = scoped ? legalOverrides : filterByPerson(legalOverrides, boundPersonName)
    const syncLeave = scoped ? leaveDurationOverrides : filterByPerson(leaveDurationOverrides, boundPersonName)
    const syncDeleted = scoped
      ? deletedOverrideKeys
      : deletedOverrideKeys.filter(key => key.startsWith(`${boundPersonName}::`))

    syncCloudOverrides(syncShift, syncOvertime, syncLegal, syncLeave, syncDeleted)
      .then(() => {
        if (syncDeleted.length <= 0) return
        setDeletedOverrideKeys(keys => (
          scoped
            ? keys.filter(key => !syncDeleted.includes(key))
            : keys.filter(key => !key.startsWith(`${boundPersonName}::`))
        ))
      })
      .catch(error => console.warn('云端记录同步失败', error))
  }, [
    boundPersonName, cloudSyncBlocked, cloudSyncReady, deletedOverrideKeys,
    isAdmin, leaveDurationOverrides, legalOverrides, overtimeOverrides, profileReady, shiftOverrides
  ])

  function applyCloud(cloud: {
    shiftOverrides: ShiftOverrides
    overtimeOverrides: OvertimeOverrides
    legalOverrides: LegalOverrides
    leaveDurationOverrides: LeaveDurationOverrides
  }) {
    setShiftOverrides(local => mergeSharedCloudOverrides(local, cloud.shiftOverrides))
    setOvertimeOverrides(local => mergeSharedCloudOverrides(local, cloud.overtimeOverrides))
    setLegalOverrides(local => mergeSharedCloudOverrides(local, cloud.legalOverrides))
    setLeaveDurationOverrides(local => mergeSharedCloudOverrides(local, cloud.leaveDurationOverrides))
  }

  async function refresh() {
    if (refreshing) return false
    setRefreshing(true)
    try {
      const cloud = await loadCloudOverrides()
      applyCloud(cloud)
      setCloudSyncBlocked(false)
      return true
    } catch (error) {
      console.warn('手动刷新失败', error)
      return false
    } finally {
      setRefreshing(false)
    }
  }

  async function bindProfile(personName: string) {
    const nextProfile = await bindCurrentUserProfile(personName)
    setProfile({
      openid: profile?.openid ?? nextProfile._openid ?? null,
      isAdmin: profile?.isAdmin ?? false,
      profile: nextProfile
    })
    setCurrentUserName(nextProfile.personName)
    return nextProfile
  }

  function saveShift(draft: ShiftDraft) {
    const key = getOverrideKey(draft.personName, draft.date)
    const resolvedShift = draft.selectedShift === 'default' ? draft.baseShift : draft.selectedShift
    const usesBase = draft.selectedShift === 'default' || resolvedShift === draft.baseShift
    const canRecordOvertime = resolvedShift !== '休息' && resolvedShift !== '事假'
    const overtimeHours = canRecordOvertime ? normalizeOvertimeHours(draft.overtimeInput) : 0
    const isLegal = normalizeLegalOverride(resolvedShift, draft.isLegal)
    const leaveDuration = resolvedShift === '事假' ? draft.leaveDuration : null

    setShiftOverrides(overrides => {
      const next = { ...overrides }
      if (usesBase) delete next[key]
      else next[key] = resolvedShift
      return next
    })
    setOvertimeOverrides(overrides => {
      const next = { ...overrides }
      if (overtimeHours > 0) next[key] = overtimeHours
      else delete next[key]
      return next
    })
    setLegalOverrides(overrides => {
      const next = { ...overrides }
      if (isLegal) next[key] = true
      else delete next[key]
      return next
    })
    setLeaveDurationOverrides(overrides => {
      const next = { ...overrides }
      if (leaveDuration) next[key] = leaveDuration
      else delete next[key]
      return next
    })

    const shouldDelete = usesBase && overtimeHours <= 0 && !isLegal && !leaveDuration
    setDeletedOverrideKeys(keys => (
      shouldDelete
        ? (keys.includes(key) ? keys : [...keys, key])
        : keys.filter(item => item !== key)
    ))
  }

  function openDraft(personName: string, date: string): ShiftDraft | null {
    if (!isAdmin && personName !== boundPersonName) {
      Taro.showToast({ title: '只能修改本人排班', icon: 'none' })
      return null
    }
    const person = scheduleData.people.find(item => item.name === personName)
    const dateIndex = scheduleData.dates.indexOf(date)
    if (!person || dateIndex < 0) return null
    const baseShift = person.shifts[dateIndex]
    if (!baseShift) return null

    const key = getOverrideKey(personName, date)
    return {
      personName,
      date,
      baseShift,
      selectedShift: shiftOverrides[key] ?? 'default',
      overtimeInput: overtimeOverrides[key]?.toString() ?? '',
      isLegal: legalOverrides[key] === true,
      leaveDuration: leaveDurationOverrides[key] ?? '一天'
    }
  }

  return {
    // 数据
    activeMonth,
    setActiveMonth,
    monthView,
    currentUser,
    currentUserName,
    setCurrentUserName,
    summary,
    calendarCells,
    overtimeDates,
    legalDates,
    overrides: { shiftOverrides, overtimeOverrides, legalOverrides, leaveDurationOverrides },
    todayKey,
    todayMeta,
    todayDate,
    // 身份
    profile,
    profileReady,
    isAdmin,
    boundPersonName,
    needsBinding,
    bindProfile,
    // 同步
    refreshing,
    cloudSyncBlocked,
    refresh,
    // 编辑
    openDraft,
    saveShift
  }
}
