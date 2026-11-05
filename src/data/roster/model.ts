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

/**
 * 成员分组（例如部门）。
 *
 * 独立成表而不是把组名写进成员：改组名只改一处，不会出现同一个部门两种写法；
 * 也允许先建空组、再往里放人。成员只存 `groupId` 指针。
 */
export interface MemberGroup {
  id: string
  name: string
}

export interface Member {
  id: string
  name: string
  /** 岗位（可空）：缺省即无岗位；矩阵里拼在班序旁展示，如「4F · 班长」 */
  position?: string
  /** 内置代号（4F…4X）或自定义班序的 id */
  patternId: string
  /** 所属分组；缺省 = 未分组。指向不存在的组时归一化只丢这个字段，不丢人 */
  groupId?: string
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
  /** 成员分组；顺序就是矩阵分组切换条的顺序（创建顺序，不另设排序字段） */
  groups: MemberGroup[]
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
  groups: [],
  overrides: [],
  patterns: [],
  todos: [],
  profile: null,
  updatedAt: 0
}

export const MAX_MEMBERS = 200
/** 分组上限：部门级别的划分，20 个足够；多到几十个时切换条也没法扫读了 */
export const MAX_MEMBER_GROUPS = 20
/** 组名长度：与姓名/岗位同一档，够写「生产一部」「Engineering」 */
export const MAX_GROUP_NAME_LENGTH = 12

export function overrideKey(memberId: string, date: string): string {
  return `${memberId}|${date}`
}

export function createMemberId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `m-${Date.now().toString(36)}-${random}`
}

export function createGroupId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `g-${Date.now().toString(36)}-${random}`
}

/** 组名比对用：去首尾空格 + 转小写（中文不受影响，英文部门名不分大小写） */
export function groupNameKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * 按分组块排序：分组顺序 → 组内原顺序 → 未分组（含悬空 groupId）最后。
 *
 * 设置页「全部」与全员矩阵的行顺序都靠这条不变量保持一致：
 * 组内排序只改本块内的先后，不会把别的分组的人插进来。
 */
export function orderByGroup<T extends { groupId?: string }>(
  items: T[],
  groups: MemberGroup[]
): T[] {
  const rank = new Map(groups.map((group, index) => [group.id, index]))
  const buckets = new Map<number, T[]>()

  items.forEach(item => {
    const index = item.groupId && rank.has(item.groupId) ? rank.get(item.groupId)! : groups.length
    const bucket = buckets.get(index)
    if (bucket) bucket.push(item)
    else buckets.set(index, [item])
  })

  const ordered: T[] = []
  for (let index = 0; index <= groups.length; index += 1) {
    const bucket = buckets.get(index)
    if (bucket) ordered.push(...bucket)
  }
  return ordered
}

export function isRosterEmpty(roster: Roster): boolean {
  return roster.members.length === 0
}
