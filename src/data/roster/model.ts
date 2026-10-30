import type { ShiftType } from '../shifts'
import type { LeaveDuration } from '../leave'
import type { SalaryInput } from '../profile'
import type { CustomPattern } from '../patterns'
import type { Todo } from '../todos'

/**
 * 花名册：自定义班序 + 成员 + 改班记录。
 *
 * 三个设计要点：
 * 1. 覆盖记录用 `memberId` 做键，不用姓名 —— 改名不丢历史；
 * 2. 只存「与模板不同」的日子，恢复默认 = 删除该条；
 * 3. 自定义班序与成员存在同一份数据里 —— 导入时必须同时替换，
 *    否则成员的 patternId 会指向不存在的班序，人会被归一化丢掉。
 */

export interface Member {
  id: string
  name: string
  /** 岗位（可空）：缺省即无岗位；矩阵里拼在班序旁展示，如「4F · 班长」 */
  position?: string
  /** 内置代号（4F…4X）或自定义班序的 id */
  patternId: string
}

export interface DayOverride {
  memberId: string
  /** 'YYYY-MM-DD' */
  date: string
  shift: ShiftType
  /** 当天加班小时数（0.5 步长）；undefined = 没有加班 */
  overtimeHours?: number
  /** 是否法定节假日上班（影响加班费倍率，统计用） */
  isLegal?: boolean
  /**
   * 事假时长。**只在「4h」时才写进记录** —— 8h（一天）是默认值，
   * 存下来只会让每条事假记录都多一个字段，且要额外判断它算不算「与默认不同」。
   */
  leaveDuration?: LeaveDuration
}

/** 弹层一次要写的整天内容 */
export interface DayRecordInput {
  shift: ShiftType
  overtimeHours?: number
  isLegal?: boolean
  leaveDuration?: LeaveDuration
}

/**
 * 本人：指向 `members` 里的一条，不另存副本。
 *
 * 为什么用指针而不是独立的一份数据：本人也要出现在全员矩阵里，
 * 存两份就会出现「改了个人信息、矩阵还是旧名字」这种两个真相来源。
 */
export interface Profile {
  memberId: string
  salary: SalaryInput
}

export interface Roster {
  members: Member[]
  overrides: DayOverride[]
  /** 用户自建的班序，上限 MAX_CUSTOM_PATTERNS */
  patterns: CustomPattern[]
  /**
   * 待办清单（只给本人用，不带 memberId）。
   *
   * 与考勤记录互不影响：记一条待办不会动班次，换人也不会清掉待办。
   */
  todos: Todo[]
  /** null = 还没设置本人（跳过向导、或导入了没有 profile 的备份） */
  profile: Profile | null
  updatedAt: number
}

export const emptyRoster: Roster = {
  members: [],
  overrides: [],
  patterns: [],
  todos: [],
  profile: null,
  updatedAt: 0
}

export const MAX_MEMBERS = 200

export function overrideKey(memberId: string, date: string): string {
  return `${memberId}|${date}`
}

export function createMemberId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `m-${Date.now().toString(36)}-${random}`
}

export function isRosterEmpty(roster: Roster): boolean {
  return roster.members.length === 0
}
