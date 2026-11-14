import { mergeJigConfig, type JigConfig } from '@/features/jig/core/config'

import { normalizeRosterDetailed, type Roster } from './roster'

/**
 * 备份：一份 JSON，装整套花名册（成员 + 自建班序 + 改班/加班记录）+ JIG 业务配置。
 *
 * 版本策略（2026-10-28 用户明确定调）：
 * **升级结构时直接改 `version`，不做旧格式兼容**。现在是开发期，没有真实用户，
 * 也就没有值得为它写适配层的数据。旧文件一律报「格式不对」，不猜、不迁移。
 */

export const BACKUP_APP_ID = 'shift-schedule-local'
export const BACKUP_VERSION = 6

export interface BackupFile {
  app: string
  version: number
  exportedAt: string
  roster: {
    members: Roster['members']
    groups: Roster['groups']
    overrides: Roster['overrides']
    patterns: Roster['patterns']
    todos: Roster['todos']
    profile: Roster['profile']
  }
  /**
   * JIG 业务配置（型号→尺寸映射、工序顺序等）。
   *
   * **可选**：排班用户可能根本不装 JIG 数据，导出时不该硬塞一段默认配置
   * 进去 —— 那会让「这个备份里有没有 JIG 数据」这件事变得没法判断。
   * 缺失时导入方用默认配置，不报错。
   *
   * **只放业务配置，不放本机偏好**：目录、行高、粘贴开关这些是「这台电脑」
   * 的属性，跟着备份跑到别的机器上只会指向一个不存在的目录。
   */
  jig?: JigConfig
}

export interface ImportResult {
  roster: Roster
  memberCount: number
  overrideCount: number
  /** 恢复的待办条数 */
  todoCount: number
  /** 因班序不存在 / 重名 / 重复 id 而没能恢复的成员姓名（正常应为空） */
  droppedMembers: string[]
  /**
   * 备份里带的 JIG 配置。
   *
   * `null` = 备份里没有 JIG 段（或者有但内容不可用）—— 调用方保持现有配置不变。
   */
  jig: JigConfig | null
}

export function createBackup(roster: Roster, jig: JigConfig | null): BackupFile {
  const file: BackupFile = {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    roster: {
      members: roster.members,
      groups: roster.groups,
      overrides: roster.overrides,
      patterns: roster.patterns,
      todos: roster.todos,
      profile: roster.profile
    }
  }

  // 只有真的装了 JIG 数据才带这一段 —— 见 BackupFile.jig 的注释
  if (jig) file.jig = jig

  return file
}

/** 备份文件的文本内容。壳里写盘与浏览器里下载共用同一份，避免两处格式漂移 */
export function backupText(roster: Roster, jig: JigConfig | null): string {
  return JSON.stringify(createBackup(roster, jig), null, 2)
}

/**
 * 解析备份文本。格式不对时抛出可直接展示给用户的中文错误。
 *
 * 只认一种形状：
 * `{ app, version: 6, roster: {...}, jig?: {...} }`。
 * 开发期不做旧格式迁移 —— 见到别的版本号、`dayRecords` 或顶层数组，直接报错。
 *
 * **`jig` 段可选** —— 排班用户可能根本不装 JIG 数据，那就没有这一段，
 * 导入方用默认配置，不报错。
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
    throw new Error('这个备份文件不是「Workhorse」导出的')
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

  /**
   * JIG 段：缺失时返回 null（调用方保持现有配置不变），
   * 有但内容不对时也返回 null —— 配置坏了不该把整次导入拖垮，
   * 花名册该恢复还是得恢复。
   */
  let jig: JigConfig | null = null
  if (record.jig !== undefined && record.jig !== null) {
    if (typeof record.jig === 'object' && !Array.isArray(record.jig)) {
      jig = mergeJigConfig(record.jig as Record<string, unknown>)
    }
  }

  return {
    roster,
    memberCount: roster.members.length,
    overrideCount: roster.overrides.length,
    todoCount: roster.todos.length,
    droppedMembers,
    jig
  }
}

export function buildBackupFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [pad(date.getHours()), pad(date.getMinutes())].join('')

  return `Workhorse-备份-${stamp}.json`
}
