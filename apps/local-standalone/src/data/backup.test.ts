import { describe, expect, it } from 'vitest'
import { createBackup, parseBackup } from './backup'
import type { Roster } from './roster'

const roster: Roster = {
  members: [
    { id: 'm1', name: '王磊', patternId: '4F' },
    { id: 'm2', name: '李静', patternId: '4J' }
  ],
  overrides: [{ memberId: 'm1', date: '2026-10-20', shift: '白特' }],
  updatedAt: 0
}

describe('backup v2', () => {
  it('导出再导入完全还原', () => {
    const text = JSON.stringify(createBackup(roster))
    const result = parseBackup(text, { members: [], overrides: [], updatedAt: 0 })

    expect(result.memberCount).toBe(2)
    expect(result.overrideCount).toBe(1)
    expect(result.roster.members.map(member => member.name)).toEqual(['王磊', '李静'])
    expect(result.roster.overrides[0]).toEqual({ memberId: 'm1', date: '2026-10-20', shift: '白特' })
  })

  it('拒收别的应用导出的文件', () => {
    const text = JSON.stringify({ app: 'someone-else', version: 2, roster: { members: [], overrides: [] } })
    expect(() => parseBackup(text, roster)).toThrow('不是「倒班表 · 本地版」导出的')
  })

  it('非法 JSON 给出中文错误', () => {
    expect(() => parseBackup('{oops', roster)).toThrow('不是合法的 JSON')
  })

  it('没有成员的备份不予导入', () => {
    const text = JSON.stringify({ app: 'shift-schedule-local', version: 2, roster: { members: [], overrides: [] } })
    expect(() => parseBackup(text, roster)).toThrow('没有成员')
  })
})

describe('backup v1 兼容导入', () => {
  const legacy = {
    app: 'shift-schedule-local',
    version: 1,
    exportedAt: '2026-10-19T00:00:00.000Z',
    dayRecords: [
      { personName: '王磊', date: '2026-10-20', shiftOverride: '白特', overtimeHours: 0 },
      { personName: '王磊', date: '2026-10-21', overtimeHours: 2 },
      { personName: '查无此人', date: '2026-10-20', shiftOverride: '休息', overtimeHours: 0 },
      { personName: '李静', date: '2026-10-22', shiftOverride: '事假', overtimeHours: 0 }
    ],
    settings: { personName: '王磊' }
  }

  it('按姓名映射到当前成员，并报告对不上的姓名与跳过的加班记录', () => {
    const result = parseBackup(JSON.stringify(legacy), roster)

    expect(result.overrideCount).toBe(2)
    expect(result.roster.overrides).toEqual(
      expect.arrayContaining([
        { memberId: 'm1', date: '2026-10-20', shift: '白特' },
        { memberId: 'm2', date: '2026-10-22', shift: '事假' }
      ])
    )

    expect(result.legacy?.unmatchedNames).toEqual(['查无此人'])
    expect(result.legacy?.skippedRecords).toBe(1)
    expect(result.legacy?.matchedMembers).toBe(2)
  })

  it('只取被映射到的成员，名单里其他人保持不变地留在结果外', () => {
    const onlyOne: Roster = { ...roster, members: [roster.members[0], { id: 'm9', name: '陌生人', patternId: '4X' }] }
    const result = parseBackup(JSON.stringify(legacy), onlyOne)

    expect(result.roster.members.map(member => member.name)).toEqual(['王磊'])
  })

  it('当前没有任何成员时明确拒绝，而不是静默丢数据', () => {
    expect(() => parseBackup(JSON.stringify(legacy), { members: [], overrides: [], updatedAt: 0 }))
      .toThrow('请先在设置里建好成员')
  })

  it('顶层直接是数组的早期格式也能读', () => {
    const result = parseBackup(JSON.stringify(legacy.dayRecords), roster)
    expect(result.overrideCount).toBe(2)
  })
})
