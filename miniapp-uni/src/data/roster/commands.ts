import { isBuiltinPatternId, type CustomPattern } from '../patterns'
import type { ShiftType } from '../shifts'
import { canMarkLegal, canRecordOvertime, sanitizeOvertime } from '../overtime'
import { sanitizeLeave } from '../leave'
import { createTodoId, pickTodoTone, sortTodos, type Todo } from '../todos'
import { overrideKey, type DayRecordInput, type Member, type Roster } from './model'
import { findMember, getDayRecord, getSelf, getTemplateShift } from './queries'

/**
 * 写入某人某天的整天内容（班次 + 加班 + 法定）。
 *
 * **删除条件已从「与模板相同」改成三元判断**：
 * `班次 == 模板 && 无加班 && 无法定` 才删除记录。
 * 不改的话，「模板本来就是白班、今天加了 2h」会被当成"与模板相同"整条删掉，加班凭空消失。
 */
export function applyDayRecord(
  roster: Roster,
  memberId: string,
  date: string,
  input: DayRecordInput
): Roster {
  const member = findMember(roster, memberId)
  if (!member) return roster

  const key = overrideKey(memberId, date)
  const rest = roster.overrides.filter(override => overrideKey(override.memberId, override.date) !== key)
  const templateShift = getTemplateShift(roster, member, date)
  const extra = sanitizeOvertime(input.shift, input.overtimeHours, input.isLegal)
  const leave = sanitizeLeave(input.shift, input.leaveDuration)

  const sameAsTemplate = input.shift === templateShift
  // 4h 事假也算「和默认不一样」——否则「模板本就事假、今天改成 4h」会被当场删掉
  const hasExtra = (extra.overtimeHours ?? 0) > 0 || extra.isLegal === true || leave === '4h'

  if (sameAsTemplate && !hasExtra) {
    return { ...roster, overrides: rest, updatedAt: Date.now() }
  }

  return {
    ...roster,
    overrides: [
      ...rest,
      {
        memberId,
        date,
        shift: input.shift,
        ...extra,
        ...(leave === '4h' ? { leaveDuration: leave } : {})
      }
    ],
    updatedAt: Date.now()
  }
}

/**
 * 「恢复默认」：把这一天的记录整条删掉 —— 班次回模板，**加班与法定一并清空**。
 */
export function restoreDay(roster: Roster, memberId: string, date: string): Roster {
  const key = overrideKey(memberId, date)
  const kept = roster.overrides.filter(override => overrideKey(override.memberId, override.date) !== key)
  if (kept.length === roster.overrides.length) return roster
  return { ...roster, overrides: kept, updatedAt: Date.now() }
}

/**
 * 只改班次（矩阵弹层用）。
 *
 * 新班次不支持加班时（改成休息/事假），已有的加班与法定会被**一并清掉**，
 * 否则会留下「休息 + 3h 加班」这种脏数据。矩阵弹层里会提前提示这一点。
 */
export function applyShiftEdit(
  roster: Roster,
  memberId: string,
  date: string,
  shift: ShiftType | null
): Roster {
  const member = findMember(roster, memberId)
  if (!member) return roster

  if (!shift) return restoreDay(roster, memberId, date)

  const existing = getDayRecord(roster, memberId, date)
  const keepOvertime = canRecordOvertime(shift) ? existing?.overtimeHours : undefined
  const keepLegal = canMarkLegal(shift) ? existing?.isLegal : undefined
  // 矩阵弹层不能改事假时长，但也不该把它抹掉：改成事假时沿用原值，改成别的班次就丢掉
  const keepLeave = shift === '事假' ? existing?.leaveDuration : undefined

  return applyDayRecord(roster, memberId, date, {
    shift,
    overtimeHours: keepOvertime,
    isLegal: keepLegal,
    leaveDuration: keepLeave
  })
}

/* ------------------------------------------------------------ 待办维护 */

/**
 * 新增一条待办。
 *
 * 正文 trim 后为空就什么都不做（返回原 roster）——
 * 空待办在界面上表现为「加了个空行」，没有任何意义。
 */
export function addTodo(roster: Roster, date: string, text: string): Roster {
  const body = text.trim()
  if (!body) return roster

  // 便笺色随机，但避开列表里上一条的颜色，避免相邻两条撞色
  const previousTone = roster.todos.length > 0 ? roster.todos[roster.todos.length - 1].tone : undefined
  const todo: Todo = {
    id: createTodoId(),
    date,
    text: body,
    tone: pickTodoTone(previousTone),
    done: false,
    createdAt: Date.now()
  }
  return {
    ...roster,
    todos: sortTodos([...roster.todos, todo]),
    updatedAt: Date.now()
  }
}

/** 勾选 / 取消勾选一条待办；找不到就原样返回 */
export function toggleTodo(roster: Roster, todoId: string): Roster {
  if (!roster.todos.some(todo => todo.id === todoId)) return roster
  return {
    ...roster,
    todos: roster.todos.map(todo =>
      todo.id === todoId ? { ...todo, done: !todo.done } : todo
    ),
    updatedAt: Date.now()
  }
}

/** 删除一条待办；找不到就原样返回 */
export function removeTodo(roster: Roster, todoId: string): Roster {
  if (!roster.todos.some(todo => todo.id === todoId)) return roster
  return {
    ...roster,
    todos: roster.todos.filter(todo => todo.id !== todoId),
    updatedAt: Date.now()
  }
}

/* ------------------------------------------------------------ 成员维护 */

/** 删除成员时连带清掉他的全部改班记录；返回被清理的条数 */
export function removeMember(roster: Roster, memberId: string): { roster: Roster; removedOverrides: number } {
  const kept = roster.overrides.filter(override => override.memberId !== memberId)
  return {
    roster: {
      ...roster,
      members: roster.members.filter(member => member.id !== memberId),
      overrides: kept,
      updatedAt: Date.now()
    },
    removedOverrides: roster.overrides.length - kept.length
  }
}

/** 统计某人有多少条改班记录（删除前提示用） */
export function countOverrides(roster: Roster, memberId: string): number {
  return roster.overrides.filter(override => override.memberId === memberId).length
}

/* ------------------------------------------------------------ 班序维护 */

/** 新建或更新一条自定义班序（按 id 判断是哪种） */
export function upsertPattern(roster: Roster, pattern: CustomPattern): Roster {
  const exists = roster.patterns.some(item => item.id === pattern.id)
  const patterns = exists
    ? roster.patterns.map(item => (item.id === pattern.id ? pattern : item))
    : [...roster.patterns, pattern]

  return { ...roster, patterns, updatedAt: Date.now() }
}

export interface PatternUsage {
  /** 挂在这条班序上的成员姓名 */
  members: string[]
  /** 这些人名下的改班记录总数 */
  overrides: number
}

/** 删除某条班序之前，先算清会牵连到谁（界面二次确认要用） */
export function patternUsage(roster: Roster, patternId: string): PatternUsage {
  const victims = roster.members.filter(member => member.patternId === patternId)
  const ids = new Set(victims.map(member => member.id))
  return {
    members: victims.map(member => member.name),
    overrides: roster.overrides.filter(override => ids.has(override.memberId)).length
  }
}

export interface RemovePatternResult {
  roster: Roster
  /** 同时被删掉的成员姓名 */
  removedMembers: string[]
  removedOverrides: number
  /**
   * 拒绝删除的原因，null 表示删成功：
   * - `builtin`：内置 20 条只读
   * - `self`：本人正挂在这条班序上（删班序会连人一起删，不能顺手把本人删了）
   */
  blocked: 'builtin' | 'self' | null
}

/**
 * 删除一条自定义班序，**连带删除挂在上面的成员与其改班记录**。
 *
 * 两种情况拒绝：内置 20 条（只读）、本人所在的班序（要删先把本人换到别的班序）。
 */
export function removePattern(roster: Roster, patternId: string): RemovePatternResult {
  if (isBuiltinPatternId(patternId)) {
    return { roster, removedMembers: [], removedOverrides: 0, blocked: 'builtin' }
  }

  if (getSelf(roster)?.patternId === patternId) {
    return { roster, removedMembers: [], removedOverrides: 0, blocked: 'self' }
  }

  const victims = roster.members.filter(member => member.patternId === patternId)
  const victimIds = new Set(victims.map(member => member.id))
  const keptOverrides = roster.overrides.filter(override => !victimIds.has(override.memberId))

  return {
    roster: {
      ...roster,
      patterns: roster.patterns.filter(pattern => pattern.id !== patternId),
      members: roster.members.filter(member => member.patternId !== patternId),
      overrides: keptOverrides,
      updatedAt: Date.now()
    },
    removedMembers: victims.map(member => member.name),
    removedOverrides: roster.overrides.length - keptOverrides.length,
    blocked: null
  }
}
