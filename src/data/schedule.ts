import type { ScheduleData } from '../types/schedule'

const displayStartDate = '2026-04-19'
const displayEndDate = '2026-12-19'
const cycleAnchorDate = '2026-06-07'
const dayMs = 24 * 60 * 60 * 1000

function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}/${day}`
}

function getInclusiveDates(startDate: string, endDate: string): string[] {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  const dayCount = Math.round((end.getTime() - start.getTime()) / dayMs) + 1

  return Array.from({ length: dayCount }, (_, index) => {
    const current = new Date(start)
    current.setDate(start.getDate() + index)
    return formatDate(current)
  })
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo
}

function expandCycleShifts<T>(cycle: T[], startDate: string, endDate: string, anchorDate: string): T[] {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  const anchor = parseDate(anchorDate)
  const startOffset = Math.round((start.getTime() - anchor.getTime()) / dayMs)
  const dayCount = Math.round((end.getTime() - start.getTime()) / dayMs) + 1

  return Array.from({ length: dayCount }, (_, index) => {
    const cycleIndex = positiveModulo(startOffset + index, cycle.length)
    return cycle[cycleIndex]
  })
}

const cyclePeople: ScheduleData['people'] = [
    {
      name: '华文达',
      group: '4F',
      shifts: ['夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息']
    },
    {
      name: '张舒棋',
      group: '4G',
      shifts: ['休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息']
    },
    {
      name: '陈泳智',
      group: '4H',
      shifts: ['休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班']
    },
    {
      name: '韩义博',
      group: '4I',
      shifts: ['白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班']
    },
    {
      name: '段志彬',
      group: '4J',
      shifts: ['白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班']
    },
    {
      name: '余昌耿',
      group: '4K',
      shifts: ['白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班']
    },
    {
      name: '裴辉新',
      group: '4L',
      shifts: ['白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息']
    },
    {
      name: '张涛',
      group: '4R',
      shifts: ['白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息']
    },
    {
      name: '谢懋',
      group: '4S',
      shifts: ['休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息']
    },
    {
      name: '农伟俊',
      group: '4T',
      shifts: ['休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班']
    },
    {
      name: '帅长安',
      group: '4U',
      shifts: ['夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班']
    },
    {
      name: '林泽勇',
      group: '4V',
      shifts: ['夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班']
    },
    {
      name: '陈家辉',
      group: '4W',
      shifts: ['夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班']
    },
    {
      name: '张增全',
      group: '4X',
      shifts: ['夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息']
    }
]

export const scheduleData: ScheduleData = {
  startDate: displayStartDate,
  endDate: displayEndDate,
  dates: getInclusiveDates(displayStartDate, displayEndDate),
  people: cyclePeople.map(person => ({
    ...person,
    shifts: expandCycleShifts(person.shifts, displayStartDate, displayEndDate, cycleAnchorDate)
  }))
}
