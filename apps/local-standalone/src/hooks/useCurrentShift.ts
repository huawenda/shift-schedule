import { useEffect, useMemo, useState } from 'react'
import { formatScheduleMonthDay, type ShiftType } from '@local/core'
import { shiftWindows, weekdayLabels } from '../appConstants'

export interface ShiftMoment {
  kind: 'active' | 'upcoming' | 'idle'
  shift: ShiftType
  dateKey: string
  weekdayLabel: string
  rangeText: string
  countdownLabel: string
  countdown: { value: string; unit: string } | null
  countdownTail: { value: string; unit: string } | null
  progress: number
}

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 'MM/DD' + 小时 → 本地 Date（沿用当前年份） */
function toDate(dateKey: string, hour: number): Date {
  const [month, day] = dateKey.split('/').map(Number)
  return new Date(new Date().getFullYear(), month - 1, day, hour, 0, 0, 0)
}

function clockText(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function splitSpan(ms: number) {
  if (ms >= 48 * HOUR) {
    const days = Math.floor(ms / DAY)
    const hours = Math.floor((ms - days * DAY) / HOUR)
    return {
      primary: { value: String(days), unit: '天' },
      secondary: { value: String(hours), unit: '小时' }
    }
  }

  const hours = Math.floor(ms / HOUR)
  const minutes = Math.floor((ms - hours * HOUR) / MINUTE)
  return {
    primary: { value: String(hours), unit: '小时' },
    secondary: { value: pad(minutes), unit: '分' }
  }
}

function moment(
  kind: ShiftMoment['kind'],
  shift: ShiftType,
  dateKey: string,
  extra: Partial<ShiftMoment> & Pick<ShiftMoment, 'rangeText' | 'countdownLabel'>
): ShiftMoment {
  const weekdayLabel = weekdayLabels[toDate(dateKey, 12).getDay()]
  return {
    kind,
    shift,
    dateKey,
    weekdayLabel,
    countdown: null,
    countdownTail: null,
    progress: 0,
    ...extra
  }
}

function buildMoment(dates: string[], shifts: ShiftType[], now: Date): ShiftMoment {
  const todayKey = formatScheduleMonthDay(now)
  const todayIndex = dates.indexOf(todayKey)
  const todayShift = todayIndex >= 0 ? shifts[todayIndex] : undefined
  const todayWindow = todayShift ? shiftWindows[todayShift] : undefined

  if (todayShift && todayWindow) {
    const start = toDate(todayKey, todayWindow.startHour)
    const end = new Date(start.getTime() + todayWindow.hours * HOUR)
    const crossesMidnight = todayWindow.startHour + todayWindow.hours >= 24
    const endText = `${crossesMidnight ? '次日 ' : ''}${clockText(end)}`
    const rangeText = `${clockText(start)} → ${endText} · ${todayWindow.hours} 小时`

    if (now >= start && now < end) {
      const span = splitSpan(end.getTime() - now.getTime())
      return moment('active', todayShift, todayKey, {
        rangeText,
        countdownLabel: '距下班',
        countdown: span.primary,
        countdownTail: span.secondary,
        progress: Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())))
      })
    }

    if (now < start) {
      const span = splitSpan(start.getTime() - now.getTime())
      return moment('upcoming', todayShift, todayKey, {
        rangeText,
        countdownLabel: '距上班',
        countdown: span.primary,
        countdownTail: span.secondary
      })
    }
  }

  for (let index = 0; index < dates.length; index += 1) {
    const dateKey = dates[index]
    if (dateKey <= todayKey) continue
    const shift = shifts[index]
    const window = shiftWindows[shift]
    if (!window) continue

    const start = toDate(dateKey, window.startHour)
    const span = splitSpan(Math.max(0, start.getTime() - now.getTime()))
    return moment('upcoming', shift, dateKey, {
      rangeText: `${dateKey} · ${clockText(start)} 开始 · ${window.hours} 小时`,
      countdownLabel: '距上班',
      countdown: span.primary,
      countdownTail: span.secondary
    })
  }

  return moment('idle', todayShift ?? '休息', todayKey, {
    rangeText: '本月没有更多排班',
    countdownLabel: '本月'
  })
}

/** 当前/最近一班：跨零点的夜班按「次日结束」计算剩余时间，每 30 秒刷新。 */
export function useCurrentShift(dates: string[], shifts: ShiftType[]): ShiftMoment {
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  return useMemo(() => buildMoment(dates, shifts, new Date(tick)), [dates, shifts, tick])
}
