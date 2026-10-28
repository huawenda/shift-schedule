import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, createBackup, parseBackup } from './backup'
import { PATTERN_CYCLE_LENGTH } from './patterns'
import type { Roster } from './roster'

const roster: Roster = {
  members: [
    { id: 'm1', name: '王磊', patternId: '4F' },
    { id: 'm2', name: '李静', patternId: '4J' }
  ],
  overrides: [{ memberId: 'm1', date: '2026-10-20', shift: '白特' }],
  patterns: [],
  updatedAt: 0
}

const customPattern = {
  id: 'cp-1',
  name: '甲班',
  shifts: Array.from({ length: PATTERN_CYCLE_LENGTH }, (_, index) =>
    index % 2 === 0 ? ('白班' as const) : ('休息' as const)
  )
}

describe('backup 当前格式', () => {
  it('导出再导入完全还原', () => {
    const text = JSON.stringify(createBackup(roster))
    const result = parseBackup(text)

    expect(result.memberCount).toBe(2)
    expect(result.overrideCount).toBe(1)
    expect(result.roster.members.map(member => member.name)).toEqual(['王磊', '李静'])
    expect(result.roster.overrides[0]).toEqual({ memberId: 'm1', date: '2026-10-20', shift: '白特' })
    expect(result.droppedMembers).toEqual([])
  })

  it('版本号是 3', () => {
    expect(createBackup(roster).version).toBe(3)
    expect(BACKUP_VERSION).toBe(3)
  })

  it('自定义班序会写进备份，并在导入后还原', () => {
    const withPattern: Roster = {
      ...roster,
      members: [...roster.members, { id: 'm3', name: '孙强', patternId: 'cp-1' }],
      patterns: [customPattern]
    }

    const text = JSON.stringify(createBackup(withPattern))
    const result = parseBackup(text)

    expect(result.roster.patterns).toHaveLength(1)
    expect(result.roster.patterns[0].name).toBe('甲班')
    expect(result.roster.patterns[0].shifts).toHaveLength(PATTERN_CYCLE_LENGTH)
    // 关键：挂在自定义班序上的人没被丢掉
    expect(result.roster.members.map(member => member.name)).toEqual(['王磊', '李静', '孙强'])
    expect(result.droppedMembers).toEqual([])
  })

  it('拒收别的应用导出的文件', () => {
    const text = JSON.stringify({ app: 'someone-else', version: 3, roster: { members: [], overrides: [] } })
    expect(() => parseBackup(text)).toThrow('不是「倒班表 · 本地版」导出的')
  })

  it('非法 JSON 给出中文错误', () => {
    expect(() => parseBackup('{oops')).toThrow('不是合法的 JSON')
  })

  it('没有成员的备份不予导入', () => {
    const text = JSON.stringify({ app: 'shift-schedule-local', version: 3, roster: { members: [], overrides: [] } })
    expect(() => parseBackup(text)).toThrow('没有成员')
  })

  it('没有 roster 字段的文件报「没有可恢复的数据」', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'shift-schedule-local', version: 3 }))).toThrow(
      '没有可恢复的数据'
    )
  })
})

describe('旧格式一律拒绝（开发期不做兼容）', () => {
  it('顶层是数组的早期格式', () => {
    const text = JSON.stringify([{ personName: '王磊', date: '2026-10-20', shiftOverride: '白特' }])
    expect(() => parseBackup(text)).toThrow('旧版本的备份文件')
  })

  it('带 dayRecords 的 v1 格式', () => {
    const text = JSON.stringify({
      app: 'shift-schedule-local',
      version: 1,
      dayRecords: [{ personName: '王磊', date: '2026-10-20', shiftOverride: '白特' }]
    })
    expect(() => parseBackup(text)).toThrow('旧版本的备份文件')
  })
})

describe('加班字段的备份往返', () => {
  it('导出再导入，加班与法定都还在', () => {
    const withOvertime: Roster = {
      ...roster,
      overrides: [
        { memberId: 'm1', date: '2026-10-20', shift: '白特', overtimeHours: 2.5, isLegal: true },
        { memberId: 'm2', date: '2026-10-22', shift: '夜班', overtimeHours: 3 }
      ]
    }

    const result = parseBackup(JSON.stringify(createBackup(withOvertime)))
    expect(result.roster.overrides).toEqual(
      expect.arrayContaining([
        { memberId: 'm1', date: '2026-10-20', shift: '白特', overtimeHours: 2.5, isLegal: true },
        { memberId: 'm2', date: '2026-10-22', shift: '夜班', overtimeHours: 3 }
      ])
    )
  })
})
