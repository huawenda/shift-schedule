import { getOverrideKey, type LegalOverrides, type OvertimeOverrides, type ShiftOverrides } from '../services/cloudRecordMaps'
import type { ScheduleData, ShiftType } from '../types/schedule'

const adminPersonName = '华文达'
const adminJuneDayDates = [
  '05/26',
  '05/27',
  '05/28',
  '05/29',
  '06/01',
  '06/02',
  '06/03',
  '06/04',
  '06/19'
]
const adminJuneNightDates = [
  '05/20',
  '05/21',
  '05/22',
  '05/23',
  '06/07',
  '06/08',
  '06/09',
  '06/10',
  '06/13',
  '06/14',
  '06/15',
  '06/16'
]
const adminJuneNightSpecialDates = ['05/24', '05/25', '05/30']
const adminJuneDaySpecialDates = ['05/31', '06/05']
const adminJuneLegalDayDate = '05/26'
const regularShiftTypes: ShiftType[] = ['白班', '夜班']
const specialShiftTypes: ShiftType[] = ['白特', '夜特']

function getStableSeed(value: string): number {
  return Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0)
}

function pickBySeed<T>(items: T[], seed: number, fallback?: T): T | undefined {
  if (items.length === 0) return fallback
  return items[Math.abs(seed) % items.length]
}

export function getAdminJuneDemoOverrides(): {
  shiftOverrides: ShiftOverrides
  overtimeOverrides: OvertimeOverrides
  legalOverrides: LegalOverrides
} {
  const shiftOverrides: ShiftOverrides = {}
  const overtimeOverrides: OvertimeOverrides = {}
  const legalOverrides: LegalOverrides = {}

  adminJuneDayDates.forEach(date => {
    overtimeOverrides[getOverrideKey(adminPersonName, date)] = 3
  })
  adminJuneNightDates.forEach(date => {
    overtimeOverrides[getOverrideKey(adminPersonName, date)] = 3
  })
  adminJuneNightSpecialDates.forEach(date => {
    const key = getOverrideKey(adminPersonName, date)
    shiftOverrides[key] = '夜特'
    overtimeOverrides[key] = 10
  })
  adminJuneDaySpecialDates.forEach(date => {
    const key = getOverrideKey(adminPersonName, date)
    shiftOverrides[key] = '白特'
    overtimeOverrides[key] = 10
  })
  const legalDayKey = getOverrideKey(adminPersonName, adminJuneLegalDayDate)
  legalOverrides[legalDayKey] = true
  overtimeOverrides[legalDayKey] = 11

  return { shiftOverrides, overtimeOverrides, legalOverrides }
}

export function applyAdminJuneDemoOverrides(
  shiftOverrides: ShiftOverrides,
  overtimeOverrides: OvertimeOverrides,
  legalOverrides: LegalOverrides = {}
): {
  shiftOverrides: ShiftOverrides
  overtimeOverrides: OvertimeOverrides
  legalOverrides: LegalOverrides
} {
  const demoOverrides = getAdminJuneDemoOverrides()

  return {
    shiftOverrides: {
      ...shiftOverrides,
      ...demoOverrides.shiftOverrides
    },
    overtimeOverrides: {
      ...overtimeOverrides,
      ...demoOverrides.overtimeOverrides
    },
    legalOverrides: {
      ...legalOverrides,
      ...demoOverrides.legalOverrides
    }
  }
}

export function getTeamJuneDemoOverrides(scheduleData: ScheduleData): {
  shiftOverrides: ShiftOverrides
  overtimeOverrides: OvertimeOverrides
  legalOverrides: LegalOverrides
} {
  const shiftOverrides: ShiftOverrides = {}
  const overtimeOverrides: OvertimeOverrides = {}
  const legalOverrides: LegalOverrides = {}

  scheduleData.people.forEach((person, personIndex) => {
    const seed = getStableSeed(person.name)
    const regularDates = scheduleData.dates.filter((date, dateIndex) => (
      regularShiftTypes.includes(person.shifts[dateIndex])
    ))
    const restDates = scheduleData.dates.filter((date, dateIndex) => person.shifts[dateIndex] === '休息')
    const legalDate = pickBySeed(regularDates, seed + 1, regularDates[0])
    const weekdayDate = pickBySeed(
      regularDates.filter(date => date !== legalDate),
      seed + 3,
      regularDates[0]
    )
    const specialDate = pickBySeed(restDates, seed + 5, restDates[0])

    if (weekdayDate) {
      overtimeOverrides[getOverrideKey(person.name, weekdayDate)] = 2 + (seed % 4)
    }

    if (specialDate) {
      const specialKey = getOverrideKey(person.name, specialDate)
      shiftOverrides[specialKey] = specialShiftTypes[(seed + personIndex) % specialShiftTypes.length]
      overtimeOverrides[specialKey] = 8 + (seed % 5)
    }

    if (legalDate) {
      const legalKey = getOverrideKey(person.name, legalDate)
      legalOverrides[legalKey] = true
      overtimeOverrides[legalKey] = 9 + (seed % 4)
    }
  })

  return { shiftOverrides, overtimeOverrides, legalOverrides }
}

export function applyTeamJuneDemoOverrides(
  scheduleData: ScheduleData,
  shiftOverrides: ShiftOverrides,
  overtimeOverrides: OvertimeOverrides,
  legalOverrides: LegalOverrides = {}
): {
  shiftOverrides: ShiftOverrides
  overtimeOverrides: OvertimeOverrides
  legalOverrides: LegalOverrides
} {
  const demoOverrides = getTeamJuneDemoOverrides(scheduleData)

  return {
    shiftOverrides: {
      ...shiftOverrides,
      ...demoOverrides.shiftOverrides
    },
    overtimeOverrides: {
      ...overtimeOverrides,
      ...demoOverrides.overtimeOverrides
    },
    legalOverrides: {
      ...legalOverrides,
      ...demoOverrides.legalOverrides
    }
  }
}
