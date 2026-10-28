import { normalizeRosterDetailed, type Roster } from './roster'

/**
 * 备份：一份 JSON，装整套花名册（成员 + 自建班序 + 改班/加班记录）。
 *
 * 版本策略（2026-10-28 用户明确定调）：
 * **升级结构时直接改 `version`，不做旧格式兼容**。现在是开发期，没有真实用户，
 * 也就没有值得为它写适配层的数据。旧文件一律报「格式不对」，不猜、不迁移。
 */

export const BACKUP_APP_ID = 'shift-schedule-local'
export const BACKUP_VERSION = 5

export interface BackupFile {
  app: string
  version: number
  exportedAt: string
  roster: {
    members: Roster['members']
    overrides: Roster['overrides']
    patterns: Roster['patterns']
    todos: Roster['todos']
    profile: Roster['profile']
  }
}

export interface ImportResult {
  roster: Roster
  memberCount: number
  overrideCount: number
  /** 恢复的待办条数 */
  todoCount: number
  /** 因班序不存在 / 重名 / 重复 id 而没能恢复的成员姓名（正常应为空） */
  droppedMembers: string[]
}

export function createBackup(roster: Roster): BackupFile {
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    roster: {
      members: roster.members,
      overrides: roster.overrides,
      patterns: roster.patterns,
      todos: roster.todos,
      profile: roster.profile
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
 * 解析备份文本。格式不对时抛出可直接展示给用户的中文错误。
 *
 * 只认一种形状：`{ app, version: 5, roster: { members, overrides, patterns, todos, profile } }`。
 * 开发期不做旧格式迁移 —— 见到别的版本号、`dayRecords` 或顶层数组，直接报错。
 */
export function parseBackup(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('备份文件不是合法的 JSON')
  }

  if (Array.isArray(parsed)) {
    throw new Error('这是旧版本的备份文件，当前版本不再支持导入，请用当前版本重新导出')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('备份文件格式无法识别')
  }

  const record = parsed as Record<string, unknown>
  if (typeof record.app === 'string' && record.app !== BACKUP_APP_ID) {
    throw new Error('这个备份文件不是「倒班表 · 本地版」导出的')
  }

  if (record.dayRecords !== undefined) {
    throw new Error('这是旧版本的备份文件，当前版本不再支持导入，请用当前版本重新导出')
  }

  if (record.version !== BACKUP_VERSION) {
    const found = typeof record.version === 'number' ? `v${record.version}` : '（没有版本号）'
    throw new Error(`备份文件是 ${found}，当前版本只认 v${BACKUP_VERSION}，请用当前版本重新导出`)
  }

  if (record.roster === undefined) {
    throw new Error('备份文件里没有可恢复的数据')
  }

  const { roster, droppedMembers } = normalizeRosterDetailed(record.roster)
  if (roster.members.length === 0) throw new Error('备份文件里没有成员')

  return {
    roster,
    memberCount: roster.members.length,
    overrideCount: roster.overrides.length,
    todoCount: roster.todos.length,
    droppedMembers
  }
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
