export type ShiftType = '白班' | '夜班' | '休息' | '白特' | '夜特' | '事假'
export type LeaveDuration = '半天' | '一天'

export interface SchedulePerson {
  name: string
  group: string
  shifts: ShiftType[]
}

export interface ScheduleData {
  startDate: string
  endDate: string
  dates: string[]
  people: SchedulePerson[]
}
