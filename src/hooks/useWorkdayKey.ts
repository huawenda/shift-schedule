import { useMemo } from 'react'
import { addDays, formatDateKey, parseDateKey, todayKey } from '../data/dateUtils'
import { getEffectiveShift, getOverrideMap, getSelf, type Roster } from '../data/roster'
import { useCurrentShift, type ShiftMoment } from './useCurrentShift'

/**
 * 「工作日」：正在进行的班次属于哪一天。
 *
 * 夜班 20:00 → 次日 08:00，过了 00:00 人还在 11/05 的班上，
 * 所以 00:00–08:00 的工作日仍是 11/05；没有进行中的班次才回落到日历今天。
 */
export function workdayKeyOf(moment: ShiftMoment, now: Date = new Date()): string {
  return moment.kind === 'active' ? moment.dateKey : todayKey(now)
}

/**
 * 本人当前的工作日。
 *
 * 只看昨天与今天两班：现有班次最长 12 小时，跨日班只可能从前一天开始。
 * 看的是本人，不受矩阵分组筛选影响 —— 切到别的组，工作日仍然跟着自己的班走。
 */
export function useWorkdayKey(roster: Roster): string {
  const today = todayKey()
  const yesterday = formatDateKey(addDays(parseDateKey(today), -1))
  const self = getSelf(roster)
  const overrideMap = useMemo(() => getOverrideMap(roster), [roster])
  const dates = useMemo(() => [yesterday, today], [today, yesterday])
  const shifts = useMemo(
    () => dates.map(date => (self ? getEffectiveShift(roster, self, date, overrideMap) ?? '休息' : '休息')),
    [dates, overrideMap, roster, self]
  )
  const moment = useCurrentShift(dates, shifts)
  return workdayKeyOf(moment, new Date())
}
