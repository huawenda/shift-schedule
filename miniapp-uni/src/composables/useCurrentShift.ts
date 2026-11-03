import { computed, onUnmounted, ref, type Ref } from 'vue'
import { formatMonthDay, parseDateKey, todayKey } from '../data/dateUtils'
import { SHIFT_META, type ShiftType } from '../data/shifts'

export interface ShiftMoment {
  kind: 'active' | 'upcoming' | 'idle'
  shift: ShiftType
  dateKey: string
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

/** 'YYYY-MM-DD' + 小时 → 本地 Date，分钟与秒归零 */
function atHour(dateKey: string, hour: number): Date {
  const date = parseDateKey(dateKey)
  date.setHours(hour, 0, 0, 0)
  return date
}

function clockText(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 超过 48 小时按「天 + 小时」显示，否则按「小时 + 分」显示 */
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

function makeMoment(
  kind: ShiftMoment['kind'],
  shift: ShiftType,
  dateKey: string,
  extra: Partial<ShiftMoment> & Pick<ShiftMoment, 'rangeText' | 'countdownLabel'>
): ShiftMoment {
  return {
    kind,
    shift,
    dateKey,
    countdown: null,
    countdownTail: null,
    progress: 0,
    ...extra
  }
}

/**
 * 当前 / 最近一班 —— 与桌面 `src/hooks/useCurrentShift.ts` 逐行同源。
 * 日期键用 'YYYY-MM-DD'；班次时段取 SHIFT_META 的 startHour / hours。
 * 夜班跨零点按「次日结束」算，每 30 秒刷新一次。
 */
export function buildMoment(dates: string[], shifts: ShiftType[], now: Date): ShiftMoment {
  const today = todayKey(now)
  const todayIndex = dates.indexOf(today)
  const todayShift = todayIndex >= 0 ? shifts[todayIndex] : undefined
  const todayMeta = todayShift ? SHIFT_META[todayShift] : undefined

  if (todayShift && todayMeta && todayMeta.startHour !== undefined && todayMeta.hours !== undefined) {
    const start = atHour(today, todayMeta.startHour)
    const end = new Date(start.getTime() + todayMeta.hours * HOUR)
    const crossesMidnight = todayMeta.startHour + todayMeta.hours >= 24
    const rangeText = `${clockText(start)} → ${crossesMidnight ? '次日 ' : ''}${clockText(end)} · ${todayMeta.hours} 小时`

    if (now >= start && now < end) {
      const span = splitSpan(end.getTime() - now.getTime())
      return makeMoment('active', todayShift, today, {
        rangeText,
        countdownLabel: '距下班',
        countdown: span.primary,
        countdownTail: span.secondary,
        progress: Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())))
      })
    }

    if (now < start) {
      const span = splitSpan(start.getTime() - now.getTime())
      return makeMoment('upcoming', todayShift, today, {
        rangeText,
        countdownLabel: '距上班',
        countdown: span.primary,
        countdownTail: span.secondary
      })
    }
  }

  for (let index = 0; index < dates.length; index += 1) {
    const dateKey = dates[index]
    if (dateKey <= today) continue
    const shift = shifts[index]
    const meta = SHIFT_META[shift]
    if (meta.startHour === undefined || meta.hours === undefined) continue

    const start = atHour(dateKey, meta.startHour)
    const span = splitSpan(Math.max(0, start.getTime() - now.getTime()))
    return makeMoment('upcoming', shift, dateKey, {
      rangeText: `${formatMonthDay(dateKey)} · ${clockText(start)} 开始 · ${meta.hours} 小时`,
      countdownLabel: '距上班',
      countdown: span.primary,
      countdownTail: span.secondary
    })
  }

  return makeMoment('idle', todayShift ?? '休息', today, {
    rangeText: '本月没有更多排班',
    countdownLabel: '本月'
  })
}

export function useCurrentShift(dates: Ref<string[]>, shifts: Ref<ShiftType[]>) {
  const tick = ref(Date.now())
  const timer = setInterval(() => {
    tick.value = Date.now()
  }, 30_000)
  onUnmounted(() => clearInterval(timer))

  return computed(() => buildMoment(dates.value, shifts.value, new Date(tick.value)))
}
