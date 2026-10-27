import { isShiftType } from './shifts'
import { normalizeRoster, normalizeRosterDetailed, overrideKey, type DayOverride, type Roster } from './roster'

/**
 * 备份：v3（自定义班序 + 成员 + 改班记录）、v2（成员 + 改班记录）、
 * v1（旧版只有按姓名索引的日记录）三种都能读。
 *
 * 版本差异：
 *  - v3 新增 `roster.patterns`。**必须带上**：自定义班序不进备份，
 *    换台电脑恢复后那些成员的 patternId 就成了「不存在的班序」，
 *    会被归一化整条丢掉 —— 等于静默的数据丢失。
 *  - v2 没有 patterns 字段，读出来补空数组，成员全部落在内置 13 条上。
 *  - v1 连「有哪些人」都没有，只能按姓名往现有成员上映射。
 */

export const BACKUP_APP_ID = 'shift-schedule-local'
export const BACKUP_VERSION = 3

export interface BackupFile {
  app: string
  version: number
  exportedAt: string
  roster: {
    members: Roster['members']
    overrides: Roster['overrides']
    patterns: Roster['patterns']
  }
}

export interface LegacyReport {
  /** 成功映射的成员数 */
  matchedMembers: number
  /** 备份里有记录、但当前花名册里没有的姓名 */
  unmatchedNames: string[]
  /** 只有加班/法定、没有改班的记录数（本版不承载加班，直接跳过） */
  skippedRecords: number
}

export interface ImportResult {
  roster: Roster
  memberCount: number
  overrideCount: number
  /** 因班序不明而没能恢复的成员（正常应为空，出现即说明备份与程序不匹配） */
  droppedMembers: string[]
  legacy?: LegacyReport
}

export function createBackup(roster: Roster): BackupFile {
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    roster: {
      members: roster.members,
      overrides: roster.overrides,
      patterns: roster.patterns
    }
  }
}

export function downloadBackup(roster: Roster): string {
  const fileName = buildBackupFileName(new Date())
  const blob = new Blob([JSON.stringify(createBackup(roster), null, 2)], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  return fileName
}

/**
 * 解析备份文本。`base` 是当前花名册，仅用于 v1 的姓名映射。
 * 格式不对时抛出可直接展示给用户的中文错误。
 */
export function parseBackup(text: string, base: Roster): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('备份文件不是合法的 JSON')
  }

  // 早期格式：顶层直接是记录数组
  if (Array.isArray(parsed)) {
    return importLegacyRecords(parsed, base)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('备份文件格式无法识别')
  }

  const record = parsed as Record<string, unknown>
  if (typeof record.app === 'string' && record.app !== BACKUP_APP_ID) {
    throw new Error('这个备份文件不是「倒班表 · 本地版」导出的')
  }

  if (record.roster !== undefined) {
    // v3 与 v2 都走这里：v2 没有 patterns 字段，归一化时补空数组。
    const { roster, droppedMembers } = normalizeRosterDetailed(record.roster)
    if (roster.members.length === 0) throw new Error('备份文件里没有成员')

    return {
      roster,
      memberCount: roster.members.length,
      overrideCount: roster.overrides.length,
      droppedMembers
    }
  }

  if (Array.isArray(record.dayRecords)) {
    return importLegacyRecords(record.dayRecords, base)
  }

  throw new Error('备份文件里没有可恢复的数据')
}

function importLegacyRecords(records: unknown[], base: Roster): ImportResult {
  if (base.members.length === 0) {
    throw new Error('旧版备份需要先有成员才能对照姓名，请先在设置里建好成员再导入')
  }

  const memberByName = new Map(base.members.map(member => [member.name, member]))
  const matched = new Set<string>()
  const unmatched = new Set<string>()
  const overrides: DayOverride[] = []
  let skipped = 0

  records.forEach(item => {
    if (typeof item !== 'object' || item === null) return
    const record = item as Record<string, unknown>

    const name = typeof record.personName === 'string' ? record.personName.trim() : ''
    const date = typeof record.date === 'string' ? record.date.trim() : ''
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return

    const member = memberByName.get(name)
    if (!member) {
      unmatched.add(name)
      return
    }
    matched.add(name)

    if (!isShiftType(record.shiftOverride)) {
      // 只有加班小时 / 法定标记的记录：本版不承载，计入跳过
      skipped += 1
      return
    }

    overrides.push({ memberId: member.id, date, shift: record.shiftOverride })
  })

  const usedIds = new Set(base.members.filter(member => matched.has(member.name)).map(member => member.id))

  if (usedIds.size === 0) {
    throw new Error('旧版备份里没有一个姓名能和当前成员对上，请先按备份里的姓名建好成员再导入')
  }

  // 只把被映射到的成员写进结果，其余成员保持不变。
  // ⚠️ patterns 必须一并带过来：漏了的话，挂在自定义班序上的成员
  // 会因为没有对应的班序定义而被归一化丢掉。
  const roster = normalizeRoster({
    members: base.members.filter(member => usedIds.has(member.id)),
    overrides: dedupe(overrides),
    patterns: base.patterns,
    updatedAt: Date.now()
  })

  if (roster.members.length === 0) {
    throw new Error('旧版备份里没有一个姓名能和当前成员对上')
  }

  return {
    roster,
    memberCount: roster.members.length,
    overrideCount: roster.overrides.length,
    droppedMembers: [],
    legacy: {
      matchedMembers: roster.members.length,
      unmatchedNames: [...unmatched].sort((a, b) => a.localeCompare(b)),
      skippedRecords: skipped
    }
  }
}

function dedupe(overrides: DayOverride[]): DayOverride[] {
  const map = new Map<string, DayOverride>()
  overrides.forEach(override => {
    map.set(overrideKey(override.memberId, override.date), override)
  })
  return [...map.values()]
}

function buildBackupFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [pad(date.getHours()), pad(date.getMinutes())].join('')

  return `倒班表-备份-${stamp}.json`
}
