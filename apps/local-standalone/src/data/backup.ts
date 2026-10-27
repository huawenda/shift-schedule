import { isShiftType } from './shifts'
import { normalizeRoster, overrideKey, type DayOverride, type Roster } from './roster'

/**
 * 备份：v2（整套花名册）+ v1（旧版只有日记录）兼容导入。
 *
 * 旧版数据里没有「有哪些人」这个概念，只有一串按姓名索引的改班记录，
 * 所以 v1 导入必须先把姓名映射到当前成员，映射不上的列成清单交给用户决定。
 */

export const BACKUP_APP_ID = 'shift-schedule-local'
export const BACKUP_VERSION = 2

export interface BackupFileV2 {
  app: string
  version: number
  exportedAt: string
  roster: {
    members: Roster['members']
    overrides: Roster['overrides']
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
  legacy?: LegacyReport
}

export function createBackup(roster: Roster): BackupFileV2 {
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    roster: {
      members: roster.members,
      overrides: roster.overrides
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
    const roster = normalizeRoster(record.roster)
    if (roster.members.length === 0) throw new Error('备份文件里没有成员')

    return {
      roster,
      memberCount: roster.members.length,
      overrideCount: roster.overrides.length
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

  // 只把被映射到的成员写进结果，其余成员保持不变
  const roster = normalizeRoster({
    members: base.members.filter(member => usedIds.has(member.id)),
    overrides: dedupe(overrides),
    updatedAt: Date.now()
  })

  if (roster.members.length === 0) {
    throw new Error('旧版备份里没有一个姓名能和当前成员对上')
  }

  return {
    roster,
    memberCount: roster.members.length,
    overrideCount: roster.overrides.length,
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
