/**
 * 昼夜 · 个人倒班记录本 —— 唯一云函数入口（分表增量读写）
 *
 * 约定：
 * - 客户端只调这一个函数，`action` 决定行为：`load` 全量拉取、`apply` 增量写入；
 * - 身份只认 `cloud.getWXContext().OPENID`，任何 payload 都不接受客户端自带 openid；
 * - 所有字段在服务端重新校验（客户端校验只为提示，不能当边界）；
 * - 集合按业务键建唯一索引，写入走「按业务键查询 → update / add」，天然幂等。
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const COLLECTIONS = {
  members: 'members',
  patterns: 'patterns',
  dayRecords: 'day_records',
  todos: 'todos',
  profiles: 'profiles'
}

const SHIFT_TYPES = ['白班', '夜班', '休息', '白特', '夜特', '事假']
const LEAVE_DURATIONS = ['4h', '8h']
const PATTERN_LENGTH = 24
const MAX_MEMBERS = 200
const MAX_PATTERNS = 10
const MAX_TODOS = 3000
const MAX_BATCH = 100
const PAGE_SIZE = 100
const NAME_LIMIT = 12
const TODO_TEXT_LIMIT = 60
const SALARY_LIMIT = 12

/* ---------------------------------------------------------------- 校验 */

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isOptionalString(value, maxLength) {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= maxLength)
}

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function normalizeOvertimeHours(value) {
  const hours = Number(value)
  if (!Number.isFinite(hours) || hours <= 0) return undefined
  const clamped = Math.min(24, Math.max(0, Math.round(hours * 2) / 2))
  return clamped > 0 ? clamped : undefined
}

function normalizeMember(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!isNonEmptyString(raw.id, 64) || !isNonEmptyString(raw.name, NAME_LIMIT)) return null
  if (!isNonEmptyString(raw.patternId, 24)) return null
  const position = isOptionalString(raw.position, NAME_LIMIT) ? String(raw.position ?? '').trim() : ''
  return {
    memberId: raw.id.trim(),
    name: raw.name.trim(),
    patternId: raw.patternId.trim(),
    position: position.slice(0, NAME_LIMIT)
  }
}

function normalizePattern(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!isNonEmptyString(raw.id, 24) || !isNonEmptyString(raw.name, NAME_LIMIT)) return null
  if (!Array.isArray(raw.shifts) || raw.shifts.length !== PATTERN_LENGTH) return null
  if (!raw.shifts.every(shift => SHIFT_TYPES.includes(shift))) return null
  return {
    patternId: raw.id.trim(),
    name: raw.name.trim(),
    shifts: raw.shifts.slice()
  }
}

function normalizeDayRecord(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!isNonEmptyString(raw.memberId, 64) || !isDateKey(raw.date)) return null
  if (!SHIFT_TYPES.includes(raw.shift)) return null
  const overtimeHours = normalizeOvertimeHours(raw.overtimeHours)
  const isLegal = raw.isLegal === true
  const leaveDuration = raw.shift === '事假' && LEAVE_DURATIONS.includes(raw.leaveDuration)
    ? raw.leaveDuration
    : undefined
  return {
    memberId: raw.memberId.trim(),
    date: raw.date,
    shift: raw.shift,
    overtimeHours,
    isLegal: isLegal || undefined,
    leaveDuration
  }
}

function normalizeTodo(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!isNonEmptyString(raw.id, 64) || !isDateKey(raw.date)) return null
  if (!isNonEmptyString(raw.text, TODO_TEXT_LIMIT)) return null
  if (typeof raw.tone !== 'number' || raw.tone < 1 || raw.tone > 6) return null
  const createdAt = Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now()
  return {
    todoId: raw.id.trim(),
    date: raw.date,
    text: raw.text.trim().slice(0, TODO_TEXT_LIMIT),
    done: raw.done === true,
    tone: Math.floor(raw.tone),
    createdAt
  }
}

function normalizeSalary(raw) {
  if (!raw || typeof raw !== 'object') return null
  const salary = {}
  for (const key of ['baseSalary', 'performanceAllowance', 'positionAllowance', 'socialFund']) {
    const value = raw[key]
    if (typeof value !== 'string') return null
    if (value.length > SALARY_LIMIT || !/^\d*(\.\d{0,2})?$/.test(value)) return null
    salary[key] = value
  }
  return salary
}

function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!isNonEmptyString(raw.memberId, 64)) return null
  const salary = normalizeSalary(raw.salary)
  if (!salary) return null
  return { memberId: raw.memberId.trim(), salary }
}

function splitRecordKey(key) {
  if (typeof key !== 'string') return null
  const parts = key.split('|')
  if (parts.length !== 2 || !isNonEmptyString(parts[0], 64) || !isDateKey(parts[1])) return null
  return { memberId: parts[0], date: parts[1] }
}

/* ---------------------------------------------------------------- 读写 */

async function getAll(collectionName, openid) {
  const items = []
  let offset = 0
  while (true) {
    const response = await db
      .collection(collectionName)
      .where({ _openid: openid })
      .skip(offset)
      .limit(PAGE_SIZE)
      .get()
    items.push(...response.data)
    if (response.data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return items
}

/** 按业务键 upsert：先查，命中就 update，否则新增（唯一索引保证不会插重）。
 *  `deletedAt: null` 用来「复活」一条被软删过的记录。 */
async function upsertByKey(collectionName, openid, where, data) {
  const existing = await db.collection(collectionName).where({ ...where, _openid: openid }).limit(1).get()
  const payload = { ...data, deletedAt: null }
  if (existing.data.length > 0) {
    await db.collection(collectionName).doc(existing.data[0]._id).update({ data: payload })
  } else {
    await db.collection(collectionName).add({ data: { ...where, ...data, deletedAt: null, _openid: openid } })
  }
}

/** 软删：留一条墓碑，让另一台设备合并时知道「这条是被删除的」，而不是「没上传」 */
async function softDeleteByWhere(collectionName, openid, where, now) {
  await db.collection(collectionName).where({ ...where, _openid: openid }).update({
    data: { deletedAt: now, updatedAt: now }
  })
}

async function loadRoster(openid) {
  const [members, patterns, dayRecords, todos, profiles] = await Promise.all([
    getAll(COLLECTIONS.members, openid),
    getAll(COLLECTIONS.patterns, openid),
    getAll(COLLECTIONS.dayRecords, openid),
    getAll(COLLECTIONS.todos, openid),
    getAll(COLLECTIONS.profiles, openid)
  ])

  return {
    members: members
      .sort((left, right) => (left.sortIndex ?? 0) - (right.sortIndex ?? 0))
      .map(item => ({
        id: item.memberId,
        name: item.name,
        position: item.position || undefined,
        patternId: item.patternId,
        updatedAt: item.updatedAt || 0,
        deletedAt: item.deletedAt || 0
      })),
    patterns: patterns.map(item => ({
      id: item.patternId,
      name: item.name,
      shifts: item.shifts,
      updatedAt: item.updatedAt || 0,
      deletedAt: item.deletedAt || 0
    })),
    dayRecords: dayRecords.map(item => ({
      memberId: item.memberId,
      date: item.date,
      shift: item.shift,
      overtimeHours: item.overtimeHours,
      isLegal: item.isLegal === true ? true : undefined,
      leaveDuration: item.leaveDuration,
      updatedAt: item.updatedAt || 0,
      deletedAt: item.deletedAt || 0
    })),
    todos: todos.map(item => ({
      id: item.todoId,
      date: item.date,
      text: item.text,
      done: item.done === true,
      tone: item.tone,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || 0,
      deletedAt: item.deletedAt || 0
    })),
    profile: profiles.length > 0
      ? {
        memberId: profiles[0].memberId,
        salary: profiles[0].salary,
        updatedAt: profiles[0].updatedAt || 0,
        deletedAt: profiles[0].deletedAt || 0
      }
      : null
  }
}

async function applyChanges(openid, payload) {
  const now = Date.now()
  const errors = []
  let written = 0

  const members = (payload.members || []).map(normalizeMember).filter(Boolean).slice(0, MAX_MEMBERS)
  const patterns = (payload.patterns || []).map(normalizePattern).filter(Boolean).slice(0, MAX_PATTERNS)
  const dayRecords = (payload.dayRecords || []).map(normalizeDayRecord).filter(Boolean).slice(0, MAX_BATCH)
  const todos = (payload.todos || []).map(normalizeTodo).filter(Boolean).slice(0, MAX_BATCH)
  const profile = payload.profile === null ? null : normalizeProfile(payload.profile)

  const skipped = (payload.members || []).length - members.length
    + (payload.patterns || []).length - patterns.length
    + (payload.dayRecords || []).length - dayRecords.length
    + (payload.todos || []).length - todos.length
  if (skipped > 0) errors.push(`${skipped} 条数据未通过校验，已跳过`)

  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]
    await upsertByKey(COLLECTIONS.members, openid, { memberId: member.memberId }, {
      name: member.name,
      position: member.position,
      patternId: member.patternId,
      sortIndex: (payload.members || []).findIndex(item => item && item.id === member.memberId),
      updatedAt: now
    })
    written += 1
  }

  for (const pattern of patterns) {
    await upsertByKey(COLLECTIONS.patterns, openid, { patternId: pattern.patternId }, {
      name: pattern.name,
      shifts: pattern.shifts,
      updatedAt: now
    })
    written += 1
  }

  for (const record of dayRecords) {
    await upsertByKey(COLLECTIONS.dayRecords, openid, { memberId: record.memberId, date: record.date }, {
      shift: record.shift,
      overtimeHours: record.overtimeHours,
      isLegal: record.isLegal === true,
      leaveDuration: record.leaveDuration,
      updatedAt: now
    })
    written += 1
  }

  for (const todo of todos) {
    await upsertByKey(COLLECTIONS.todos, openid, { todoId: todo.todoId }, {
      date: todo.date,
      text: todo.text,
      done: todo.done,
      tone: todo.tone,
      createdAt: todo.createdAt,
      updatedAt: now
    })
    written += 1
  }

  if (payload.profileChanged === true) {
    if (profile) {
      await upsertByKey(COLLECTIONS.profiles, openid, {}, {
        memberId: profile.memberId,
        salary: profile.salary,
        updatedAt: now
      })
      written += 1
    } else {
      // profile 显式清空：留墓碑，另一台设备合并时才能知道「是清空，不是没上传」
      await softDeleteByWhere(COLLECTIONS.profiles, openid, {}, now)
    }
  }

  const deleted = payload.deleted || {}
  for (const memberId of (deleted.memberIds || []).slice(0, MAX_BATCH)) {
    if (!isNonEmptyString(memberId, 64)) continue
    await softDeleteByWhere(COLLECTIONS.members, openid, { memberId }, now)
  }
  for (const patternId of (deleted.patternIds || []).slice(0, MAX_BATCH)) {
    if (!isNonEmptyString(patternId, 24)) continue
    await softDeleteByWhere(COLLECTIONS.patterns, openid, { patternId }, now)
  }
  for (const key of (deleted.dayRecordKeys || []).slice(0, MAX_BATCH)) {
    const record = splitRecordKey(key)
    if (!record) continue
    await softDeleteByWhere(COLLECTIONS.dayRecords, openid, record, now)
  }
  for (const todoId of (deleted.todoIds || []).slice(0, MAX_BATCH)) {
    if (!isNonEmptyString(todoId, 64)) continue
    await softDeleteByWhere(COLLECTIONS.todos, openid, { todoId }, now)
  }

  return { written, errors }
}

/* ---------------------------------------------------------------- 入口 */

exports.main = async event => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, code: 'NO_OPENID', message: '无法识别用户身份' }

  const action = event && event.action

  try {
    if (action === 'load') {
      return { ok: true, data: await loadRoster(OPENID) }
    }

    if (action === 'apply') {
      const result = await applyChanges(OPENID, event.payload || {})
      return { ok: true, ...result }
    }

    return { ok: false, code: 'UNKNOWN_ACTION', message: `未知 action: ${action}` }
  } catch (error) {
    console.error('[rosterApi] failed', action, error)
    return { ok: false, code: 'SERVER_ERROR', message: error.message || '服务端错误' }
  }
}

exports._internal = { normalizeMember, normalizePattern, normalizeDayRecord, normalizeTodo, normalizeSalary, isDateKey, splitRecordKey }
