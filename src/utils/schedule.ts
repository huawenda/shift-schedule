import type { ScheduleData, SchedulePerson, ShiftType } from '../types/schedule'

export type ShiftSummary = Record<ShiftType, number>

export interface UpcomingShift {
  date: string
  shift: ShiftType
}

export interface DateLabel {
  date: string
  weekday: string
}

export type ScheduleMonth = '05' | '06'

const weekdays = ['日', '一', '二', '三', '四', '五', '六']

export function getPersonShiftSummary(person: SchedulePerson): ShiftSummary {
  return person.shifts.reduce<ShiftSummary>(
    (summary, shift) => {
      summary[shift] += 1
      return summary
    },
    { 白班: 0, 夜班: 0, 休息: 0 }
  )
}

export function filterPeopleByMode(
  people: SchedulePerson[],
  highlightedUserName: string,
  mineOnly: boolean
): SchedulePerson[] {
  if (!mineOnly) return people
  return people.filter(person => person.name === highlightedUserName)
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
