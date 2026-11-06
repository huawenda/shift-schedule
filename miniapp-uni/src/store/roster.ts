/**
 * 小程序端唯一的数据入口：一份花名册 + 当前结算月，读写都过这里。
 *
 * - 数据层（纯函数）来自 `src/data`，与桌面端同一份规则；
 * - 每次写操作整份替换 roster，然后写进 uni storage；
 * - 本机第一次打开（没有存档）时灌入演示花名册，之后走真实读写。
 */

import { reactive } from 'vue'
import { normalizeRoster } from '../data/roster/normalize'
import {
  addTodo as addTodoCommand,
  applyDayRecord,
  applySelf,
  applyShiftEdit,
  findMember,
  removePattern,
  removeTodo as removeTodoCommand,
  restoreDay,
  saveSalary as saveSalaryCommand,
  toggleTodo as toggleTodoCommand,
  upsertPattern,
  type DayRecordInput,
  type Member,
  type Roster
} from '../data/roster'
import type { CustomPattern } from '../data/patterns'
import type { SalaryInput, SelfIdentity } from '../data/profile'
import { emptyRoster } from '../data/roster/model'
import { backupText, parseBackup, type ImportResult } from '../data/backup'
import { currentMonthKey, shiftMonth, type MonthKey } from '../data/period'
import { seedRoster } from '../data/seed'
import type { ShiftType } from '../data/shifts'
import { diffRoster, isEmptyChangeSet } from '../cloud/diff'
import { noteLocalChanges } from '../cloud/meta'
import { enqueue, startCloudSync } from '../cloud/sync'

const ROSTER_KEY = 'shift-schedule:local:roster:v2'

function readStoredRoster(): Roster {
  try {
    const raw = uni.getStorageSync(ROSTER_KEY)
    if (raw) {
      return normalizeRoster(typeof raw === 'string' ? JSON.parse(raw) : raw)
    }
  } catch {
    // 存档损坏：退回演示数据，不让一条坏数据把应用卡死
  }
  return seedRoster()
}

const state = reactive({
  roster: readStoredRoster(),
  /** 当前结算月（上月 20 日 ~ 本月 19 日） */
  month: currentMonthKey()
})

function persist() {
  try {
    uni.setStorageSync(ROSTER_KEY, JSON.stringify({ ...state.roster, updatedAt: Date.now() }))
  } catch {
    // 存盘失败只影响下次启动，本次运行照常
  }
}

function commit(next: Roster) {
  const prev = state.roster
  const changes = diffRoster(prev, next)
  state.roster = next
  persist()
  // 本地写成功后再记时间戳并排队推送：断网/云函数失败都不影响本次操作
  if (!isEmptyChangeSet(changes)) {
    noteLocalChanges(changes)
    enqueue(changes)
  }
}

/* ------------------------------------------------------------ 记录 */

function saveDay(memberId: string, date: string, input: DayRecordInput) {
  commit(applyDayRecord(state.roster, memberId, date, input))
}

function resetDay(memberId: string, date: string) {
  commit(restoreDay(state.roster, memberId, date))
}

function editShift(memberId: string, date: string, shift: ShiftType | null) {
  commit(applyShiftEdit(state.roster, memberId, date, shift))
}

/* ------------------------------------------------------------ 待办 */

function addTodo(date: string, text: string) {
  commit(addTodoCommand(state.roster, date, text))
}

function toggleTodo(todoId: string) {
  commit(toggleTodoCommand(state.roster, todoId))
}

function removeTodo(todoId: string) {
  commit(removeTodoCommand(state.roster, todoId))
}

/* ------------------------------------------------------------ 成员与班序 */

/**
 * 整表保存成员（设置页 / 人员配置用）：保留仍然存在的成员的改班记录，
 * 本人那一行的姓名与班序强制沿用当前值 —— 「改本人 = 换人 + 清空」只能走 saveSelf。
 */
function saveMembers(members: Member[]) {
  const self = state.roster.profile ? findMember(state.roster, state.roster.profile.memberId) : undefined
  const guarded = self
    ? members.map(member => (
      member.id === self.id ? { ...member, name: self.name, patternId: self.patternId } : member
    ))
    : members

  const ids = new Set(guarded.map(member => member.id))
  commit({
    ...state.roster,
    members: guarded,
    overrides: state.roster.overrides.filter(override => ids.has(override.memberId)),
    updatedAt: Date.now()
  })
}

function savePattern(pattern: CustomPattern) {
  commit(upsertPattern(state.roster, pattern))
}

/** 删除自定义班序；内置与本人所在的班序会被数据层拒绝 */
function removePatternById(patternId: string) {
  const result = removePattern(state.roster, patternId)
  if (result.blocked === null) commit(result.roster)
  return result
}

/* ------------------------------------------------------------ 本人与薪资 */

function saveSelf(input: SelfIdentity) {
  const result = applySelf(state.roster, input)
  commit(result.roster)
  return result
}

function saveSalary(salary: SalaryInput) {
  commit(saveSalaryCommand(state.roster, salary))
}

/* ------------------------------------------------------------ 月份 */

function setMonth(key: MonthKey) {
  state.month = key
}

function stepMonth(delta: number) {
  state.month = shiftMonth(state.month, delta)
}

function goCurrentMonth() {
  state.month = currentMonthKey()
}

/* ------------------------------------------------------------ 数据管理 */

function loadDemo() {
  commit(seedRoster())
}

function clearAll() {
  commit({ ...emptyRoster, updatedAt: Date.now() })
}

function exportBackup(): string {
  return backupText(state.roster)
}

/** 只解析、不落盘：导入前先给用户看「将覆盖什么」 */
function previewBackup(text: string): ImportResult {
  return parseBackup(text)
}

function importBackup(text: string): ImportResult {
  const result = parseBackup(text)
  commit(result.roster)
  return result
}

export const rosterStore = {
  state,
  saveDay,
  resetDay,
  editShift,
  addTodo,
  toggleTodo,
  removeTodo,
  saveMembers,
  savePattern,
  removePatternById,
  saveSelf,
  saveSalary,
  setMonth,
  stepMonth,
  goCurrentMonth,
  loadDemo,
  clearAll,
  exportBackup,
  previewBackup,
  importBackup
}

/* ------------------------------------------------------------ 云端同步
 *
 * 本地优先：启动只在「本地为空」时用云端数据兜底，其余情况把本地现状
 * 作为一批增量推上去。之后每次写操作由 commit 里的 diff 增量推送。
 */
startCloudSync({
  snapshot: () => state.roster,
  adopt: roster => {
    state.roster = roster
    persist()
  }
})
