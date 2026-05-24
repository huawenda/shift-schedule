import { Solar } from 'lunar-javascript'
import type { ScheduleData, SchedulePerson, ShiftType } from '../types/schedule'

export interface ShiftSummary {
  白班: number
  夜班: number
  休息: number
  特勤: number
}

export interface UpcomingShift {
  date: string
  shift: ShiftType
}

export interface DateLabel {
  date: string
  weekday: string
}

export interface CalendarCell {
  key: string
  day: string
  shift?: ShiftType
  inCurrentMonth: boolean
  meta: CalendarDateMeta
}

export interface CalendarDateMeta {
  label: string
  isHoliday: boolean
}

export type ScheduleMonth = '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12'

const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const cycleLength = 24
const maxVisibleFestivalNameLength = 3

function formatFestivalLabel(festival: string): string {
  if (festival.endsWith('节') && festival.length === 3) {
    return festival.slice(0, -1)
  }

  return festival
}

export function getPersonShiftSummary(person: SchedulePerson): ShiftSummary {
  return person.shifts.reduce<ShiftSummary>(
    (summary, shift) => {
      if (shift === '白特') {
        summary.白班 += 1
        summary.特勤 += 1
      } else if (shift === '夜特') {
        summary.夜班 += 1
        summary.特勤 += 1
      } else {
        summary[shift] += 1
      }
      return summary
    },
    { 白班: 0, 夜班: 0, 休息: 0, 特勤: 0 }
  )
}

export function formatScheduleMonthDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}/${day}`
}

export function getCurrentScheduleMonth(
  scheduleData: ScheduleData,
  date: Date = new Date()
): ScheduleMonth | null {
  const today = formatScheduleMonthDay(date)
  if (!scheduleData.dates.includes(today)) return null

  return today.slice(0, 2) as ScheduleMonth
}

export function getCalendarDateMeta(date: string): CalendarDateMeta {
  const [year, month, day] = date.split('-').map(Number)
  const solar = Solar.fromYmd(year, month, day)
  const lunar = solar.getLunar()
  const festival = [
    ...solar.getFestivals(),
    ...lunar.getFestivals()
  ].find(name => name.length <= maxVisibleFestivalNameLength)
  const jieQi = lunar.getJieQi()

  if (festival) {
    return {
      label: formatFestivalLabel(festival),
      isHoliday: true
    }
  }

  if (jieQi) {
    return {
      label: jieQi,
      isHoliday: true
    }
  }

  const lunarDay = lunar.getDayInChinese()

  return {
    label: lunarDay === '初一' ? `${lunar.getMonthInChinese()}月` : lunarDay,
    isHoliday: false
  }
}

export function getUpcomingShifts(
  dates: string[],
  person: SchedulePerson,
  count: number
): UpcomingShift[] {
  return dates.slice(0, count).map((date, index) => ({
    date,
    shift: person.shifts[index]
  }))
}

export function getDateLabels(startDate: string, dates: string[]): DateLabel[] {
  const start = new Date(`${startDate}T00:00:00`)

  return dates.map((date, index) => {
    const current = new Date(start)
    current.setDate(start.getDate() + index)

    return {
      date,
      weekday: weekdays[current.getDay()]
    }
  })
}

export function getMonthScheduleView(scheduleData: ScheduleData, month: ScheduleMonth): ScheduleData {
  const firstIndex = scheduleData.dates.findIndex(date => date.startsWith(`${month}/`))
  let lastIndex = -1

  for (let index = scheduleData.dates.length - 1; index >= 0; index -= 1) {
    if (scheduleData.dates[index].startsWith(`${month}/`)) {
      lastIndex = index
      break
    }
  }

  if (firstIndex < 0 || lastIndex < firstIndex) {
    return {
      startDate: scheduleData.startDate,
      endDate: scheduleData.endDate,
      dates: [],
      people: scheduleData.people.map(person => ({ ...person, shifts: [] }))
    }
  }

  const monthStartDay = scheduleData.dates[firstIndex].slice(3)
  const monthEndDay = scheduleData.dates[lastIndex].slice(3)

  return {
    startDate: `2026-${month}-${monthStartDay}`,
    endDate: `2026-${month}-${monthEndDay}`,
    dates: scheduleData.dates.slice(firstIndex, lastIndex + 1),
    people: scheduleData.people.map(person => ({
      ...person,
      shifts: person.shifts.slice(firstIndex, lastIndex + 1)
    }))
  }
}

function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatMonthDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}/${day}`
}

function formatFullDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, offset: number): Date {
  const result = new Date(date)
  result.setDate(date.getDate() + offset)
  return result
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo
}

export function getPersonMonthCalendarCells(
  scheduleData: ScheduleData,
  month: ScheduleMonth,
  personName: string
): CalendarCell[] {
  const monthView = getMonthScheduleView(scheduleData, month)
  const person = scheduleData.people.find(item => item.name === personName)
  const firstIndex = scheduleData.dates.findIndex(date => date === monthView.dates[0])

  if (!person || firstIndex < 0 || monthView.dates.length === 0) return []

  const start = parseDate(monthView.startDate)
  const leadingEmptyCount = start.getDay()
  const filledCells: CalendarCell[] = monthView.dates.map((date, index) => {
    const absoluteIndex = firstIndex + index

    return {
      key: date,
      day: date.slice(3),
      shift: person.shifts[positiveModulo(absoluteIndex, cycleLength)],
      inCurrentMonth: true,
      meta: getCalendarDateMeta(formatFullDate(addDays(start, index)))
    }
  })
  const leadingCells: CalendarCell[] = Array.from({ length: leadingEmptyCount }, (_, index) => {
    const offset = index - leadingEmptyCount
    const date = addDays(start, offset)
    const absoluteIndex = firstIndex + offset
    const key = formatMonthDay(date)

    return {
      key,
      day: key.slice(3),
      shift: person.shifts[positiveModulo(absoluteIndex, cycleLength)],
      inCurrentMonth: false,
      meta: getCalendarDateMeta(formatFullDate(date))
    }
  })
  const trailingEmptyCount = (7 - ((leadingCells.length + filledCells.length) % 7)) % 7
  const trailingCells: CalendarCell[] = Array.from({ length: trailingEmptyCount }, (_, index) => {
    const offset = monthView.dates.length + index
    const date = addDays(start, offset)
    const absoluteIndex = firstIndex + offset
    const key = formatMonthDay(date)

    return {
      key,
      day: key.slice(3),
      shift: person.shifts[positiveModulo(absoluteIndex, cycleLength)],
      inCurrentMonth: false,
      meta: getCalendarDateMeta(formatFullDate(date))
    }
  })

  return [...leadingCells, ...filledCells, ...trailingCells]
}
