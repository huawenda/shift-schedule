import * as XLSX from 'xlsx'
import {
  MAX_GROUP_NAME_LENGTH,
  MAX_MEMBER_GROUPS,
  MAX_MEMBERS,
  createGroupId,
  createMemberId,
  groupNameKey,
  type Member,
  type MemberGroup
} from './roster'

/*
 * 从 Excel 批量导入成员。
 *
 * 只做两件事：把首张工作表读成「姓名 / 班序 / 岗位 / 分组」四列，再合并进现有花名册。
 * 合并规则固定在数据层，界面只负责选文件与提示结果 —— 这样重名跳过、班序兜底、
 * 分组自动新建这些「一旦改坏就静默进错人」的判断都能直接单测。
 *
 * 表头不写死列序：前三行内找到「姓名」列就以它为起点，班序 / 岗位 / 分组按表头名去认；
 * 一列表头都没有时（纯数据表）只按「姓名、班序、岗位」前三列读 ——
 * 第 4 列可能是备注，把不认识的内容自动建成分组比「分组暂时没导进来」更糟。
 */

/** 工作表里的一行（已按表头对齐，未做去重与兜底） */
export interface SheetPerson {
  name: string
  /** 班序代号（4F）或班序显示名（自定义班序的名字）；空 = 用默认班序 */
  pattern: string
  position: string
  /** 分组名（通常是部门名）；空 = 未分组 */
  group: string
}

/** 下拉里能选的班序：导入时用它把单元格里的文字翻译成 patternId */
export interface MemberPatternEntry {
  id: string
  name: string
}

export interface MemberImportPreview {
  /** 可以直接追加到花名册的新成员 */
  members: Member[]
  /** 导入时按表里的组名新建的分组：要和成员在同一次落盘里写入 */
  newGroups: MemberGroup[]
  /** 与现有成员（含本人）或文件内前面某行重名，被跳过 */
  duplicates: number
  /** 班序单元格有值但认不出来，退回默认班序 */
  unknownPatterns: number
  /** 分组已达上限，这些成员没有归组 */
  overGroups: number
  /** 超出成员上限（200）被丢弃 */
  overLimit: number
  /** 姓名为空的行（由 readMemberSheet 统计，合并时原样带回来） */
  blankRows: number
}

const NAME_HEADERS = ['姓名', '名字', '成员', '人员', 'name']
const PATTERN_HEADERS = ['班序', '班序编号', '排班', 'pattern']
const POSITION_HEADERS = ['岗位', '职位', 'position']
const GROUP_HEADERS = ['分组', '部门', '组别', 'group']

/** 表头比对用：去空格、去冒号、转小写 */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/[:：\s]/g, '')
    .toLowerCase()
}

/** 重名比对用：去首尾空格 + 转小写（中文不受影响，英文名不分大小写） */
function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}

function cellText(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * 读首张工作表。
 *
 * 完全空白的行不计入；姓名为空的行记进 blankRows（由调用方展示），不往下传。
 */
export function readMemberSheet(data: ArrayBuffer): { people: SheetPerson[]; blankRows: number } {
  const workbook = XLSX.read(data, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { people: [], blankRows: 0 }

  const table = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false
  })
  if (table.length === 0) return { people: [], blankRows: 0 }

  // 头三行里找「姓名」列；找不到就当作纯数据表，按 姓名 / 班序 / 岗位 的固定列序读。
  // 分组列必须有表头才认，避免把第 4 列备注自动建成部门。
  let nameCol = 0
  let patternCol = 1
  let positionCol = 2
  let groupCol = -1
  let startRow = 0

  for (let row = 0; row < Math.min(table.length, 3); row += 1) {
    const headers = (table[row] ?? []).map(normalizeHeader)
    const found = headers.findIndex(header => NAME_HEADERS.includes(header))
    if (found < 0) continue

    nameCol = found
    patternCol = headers.findIndex(header => PATTERN_HEADERS.includes(header))
    positionCol = headers.findIndex(header => POSITION_HEADERS.includes(header))
    groupCol = headers.findIndex(header => GROUP_HEADERS.includes(header))
    startRow = row + 1
    break
  }

  const people: SheetPerson[] = []
  let blankRows = 0

  for (let row = startRow; row < table.length; row += 1) {
    const cells = table[row] ?? []
    const name = cellText(cells[nameCol])
    if (!name) {
      // 整行都空的不算「漏填」，不提醒
      const hasSomething = cells.some(cell => cellText(cell) !== '')
      if (hasSomething) blankRows += 1
      continue
    }

    people.push({
      name,
      pattern: patternCol >= 0 ? cellText(cells[patternCol]) : '',
      position: positionCol >= 0 ? cellText(cells[positionCol]) : '',
      group: groupCol >= 0 ? cellText(cells[groupCol]) : ''
    })
  }

  return { people, blankRows }
}

/**
 * 合并：追加到现有成员后面，与现有（含本人）或文件内前一行重名的跳过。
 *
 * 班序认不出来时退回 defaultPatternId（并计数），而不是丢人 ——
 * 丢人比「班序临时不对」更难发现：名单少一个人，要翻完整个矩阵才看得出来。
 *
 * 分组按组名匹配已有分组（不分大小写与首尾空格），认不出来就自动新建；
 * 新建的分组随 `newGroups` 返回，调用方要和成员同一次落盘。
 */
export function mergeImportedMembers(
  people: SheetPerson[],
  existingNames: string[],
  patterns: MemberPatternEntry[],
  defaultPatternId: string,
  existingGroups: MemberGroup[] = [],
  /** 分组列留空时归到这个组（在某个分组 tab 里导入时传当前组） */
  defaultGroupId?: string
): Omit<MemberImportPreview, 'blankRows'> {
  const taken = new Set(existingNames.map(normalizeName))
  const byId = new Map(patterns.map(entry => [entry.id.toLowerCase(), entry.id]))
  const byLabel = new Map(patterns.map(entry => [normalizeName(entry.name), entry.id]))
  const groupByName = new Map(existingGroups.map(group => [groupNameKey(group.name), group.id]))
  const knownGroupIds = new Set(existingGroups.map(group => group.id))
  const fallbackGroupId = defaultGroupId && knownGroupIds.has(defaultGroupId) ? defaultGroupId : undefined

  let used = existingNames.length
  let groupTotal = existingGroups.length
  let duplicates = 0
  let unknownPatterns = 0
  let overGroups = 0
  let overLimit = 0
  const members: Member[] = []
  const newGroups: MemberGroup[] = []

  for (const person of people) {
    const name = person.name.trim()
    const key = normalizeName(name)

    if (taken.has(key)) {
      duplicates += 1
      continue
    }

    if (used >= MAX_MEMBERS) {
      overLimit += 1
      continue
    }

    let patternId = defaultPatternId
    const patternText = person.pattern.trim()
    if (patternText) {
      const resolved = byId.get(patternText.toLowerCase()) ?? byLabel.get(normalizeName(patternText))
      if (resolved) patternId = resolved
      else unknownPatterns += 1
    }

    let groupId = fallbackGroupId
    const groupName = person.group.trim().slice(0, MAX_GROUP_NAME_LENGTH)
    if (groupName) {
      const matched = groupByName.get(groupNameKey(groupName))
      if (matched) {
        groupId = matched
      } else if (groupTotal < MAX_MEMBER_GROUPS) {
        const created: MemberGroup = { id: createGroupId(), name: groupName }
        newGroups.push(created)
        groupByName.set(groupNameKey(created.name), created.id)
        groupTotal += 1
        groupId = created.id
      } else {
        overGroups += 1
      }
    }

    const position = person.position.trim()
    members.push({
      id: createMemberId(),
      name,
      patternId,
      ...(position ? { position } : {}),
      ...(groupId ? { groupId } : {})
    })

    taken.add(key)
    used += 1
  }

  return { members, newGroups, duplicates, unknownPatterns, overGroups, overLimit }
}

/**
 * 一句话结果：界面直接拿去弹 toast。
 * 正常导入只报「新增几位」，其余情况补在后面，方便回头修表。
 */
export function describeImport(result: MemberImportPreview): string {
  const parts = [`已导入 ${result.members.length} 位成员`]
  if (result.newGroups.length > 0) parts.push(`新建 ${result.newGroups.length} 个分组`)
  if (result.duplicates > 0) parts.push(`跳过 ${result.duplicates} 位重名`)
  if (result.unknownPatterns > 0) parts.push(`${result.unknownPatterns} 位班序未识别，已用默认班序`)
  if (result.overGroups > 0) parts.push(`分组已达 ${MAX_MEMBER_GROUPS} 个上限，${result.overGroups} 位未归组`)
  if (result.overLimit > 0) parts.push(`超出 ${MAX_MEMBERS} 人上限，丢弃 ${result.overLimit} 位`)
  if (result.blankRows > 0) parts.push(`${result.blankRows} 行缺姓名已忽略`)
  return `${parts.join('，')}。`
}
