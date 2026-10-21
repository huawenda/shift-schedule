import { useEffect, useMemo, useState } from 'react'
import { shiftWindows, weekdayLabels, type ShiftWindow } from '../appConstants'
import { formatScheduleMonthDay } from '../utils/schedule'
import type { ShiftType } from '../types/schedule'

const minuteMs = 60 * 1000
const hourMs = 60 * minuteMs
const dayMs = 24 * hourMs

export interface CountdownSpan {
  value: string
  unit: string
}

export interface ShiftMoment {
  kind: 'active' | 'upcoming' | 'idle'
  shift: ShiftType
  dateKey: string
  weekdayLabel: string
  rangeText: string
  countdownLabel: string
  countdown: CountdownSpan | null
  countdownTail: CountdownSpan | null
  /** 0~1 的比例，与 Web 端一致；渲染时由组件换算成百分比。 */
  progress: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 'MM/DD' → 当年的该时刻。小程序与 Web 共用同一套「按月日」取时刻逻辑。 */
function toDate(dateKey: string, hour: number): Date {
  const [month, day] = dateKey.split('/').map(Number)
  const now = new Date()
  return new Date(now.getFullYear(), month - 1, day, hour, 0, 0, 0)
}

function clockText(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// 分钟补零（「07 分」），与 Web 端 splitSpan 逐字一致。
function splitSpan(spanMs: number): { primary: CountdownSpan; secondary: CountdownSpan | null } {
  if (spanMs >= dayMs * 2) {
    const days = Math.floor(spanMs / dayMs)
    return {
      primary: { value: String(days), unit: '天' },
      secondary: { value: String(Math.floor((spanMs - days * dayMs) / hourMs)), unit: '小时' }
    }
  }

  const hours = Math.floor(spanMs / hourMs)
  return {
    primary: { value: String(hours), unit: '小时' },
    secondary: { value: pad(Math.floor((spanMs - hours * hourMs) / minuteMs)), unit: '分' }
  }
}

function clampProgress(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

function buildMoment(dates: string[], shifts: ShiftType[], now: Date): ShiftMoment {
  const todayKey = formatScheduleMonthDay(now)
  const todayIndex = dates.indexOf(todayKey)
  const todayShift = todayIndex >= 0 ? shifts[todayIndex] : null
  const todayWindow = todayShift ? shiftWindows[todayShift] : undefined
  const weekdayLabelOf = (dateKey: string) => weekdayLabels[toDate(dateKey, 12).getDay()]

  if (todayShift && todayWindow) {
    const { startHour, hours } = todayWindow as ShiftWindow
    const start = toDate(todayKey, startHour)
    const end = toDate(todayKey, startHour + hours)
    const crossesMidnight = startHour + hours >= 24
    const rangeText = `${clockText(start)} → ${crossesMidnight ? '次日 ' : ''}${clockText(end)} · ${hours} 小时`

    if (now.getTime() >= start.getTime() && now.getTime() < end.getTime()) {
      const span = splitSpan(end.getTime() - now.getTime())
      return {
        kind: 'active',
        shift: todayShift,
        dateKey: todayKey,
        weekdayLabel: weekdayLabelOf(todayKey),
        rangeText,
        countdownLabel: '距下班',
        countdown: span.primary,
        countdownTail: span.secondary,
        progress: clampProgress((now.getTime() - start.getTime()) / (end.getTime() - start.getTime()))
      }
    }

    if (now.getTime() < start.getTime()) {
      const span = splitSpan(start.getTime() - now.getTime())
      return {
        kind: 'upcoming',
        shift: todayShift,
        dateKey: todayKey,
        weekdayLabel: weekdayLabelOf(todayKey),
        rangeText,
        countdownLabel: '距上班',
        countdown: span.primary,
        countdownTail: span.secondary,
        progress: 0
      }
    }
  }

  for (let index = Math.max(todayIndex, 0) + 1; index < dates.length; index += 1) {
    const dateKey = dates[index]
    const shift = shifts[index]
    const window = shiftWindows[shift]

    if (!window) continue

    const start = toDate(dateKey, window.startHour)
    const span = splitSpan(Math.max(0, start.getTime() - now.getTime()))
    return {
      kind: 'upcoming',
      shift,
      dateKey,
      weekdayLabel: weekdayLabelOf(dateKey),
      rangeText: `${dateKey} · ${clockText(start)} 开始 · ${window.hours} 小时`,
      countdownLabel: '距上班',
      countdown: span.primary,
      countdownTail: span.secondary,
      progress: 0
    }
  }

  return {
    kind: 'idle',
    shift: todayShift ?? '休息',
    dateKey: todayKey,
    weekdayLabel: weekdayLabelOf(todayKey),
    rangeText: '本月没有更多排班',
    countdownLabel: '本月',
    countdown: null,
    countdownTail: null,
    progress: 0
  }
}

export function useCurrentShift(dates: string[], shifts: ShiftType[]): ShiftMoment {
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 30_000)

    return () => clearInterval(timer)
  }, [])

  return useMemo(() => buildMoment(dates, shifts, new Date(tick)), [dates, shifts, tick])
}