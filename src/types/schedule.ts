export type ShiftType = '白班' | '夜班' | '休息' | '白特' | '夜特'

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
