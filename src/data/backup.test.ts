import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, createBackup, parseBackup } from './backup'
import { PATTERN_CYCLE_LENGTH } from './patterns'
import type { Roster } from './roster'

const roster: Roster = {
  members: [
    { id: 'm1', name: '王磊', patternId: '4F' },
    { id: 'm2', name: '李静', patternId: '4J' }
  ],
  groups: [],
  overrides: [{ memberId: 'm1', date: '2026-10-20', shift: '白特' }],
  patterns: [],
  todos: [],
  profile: null,
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
    const text = JSON.stringify(createBackup(roster, null))
    const result = parseBackup(text)

    expect(result.memberCount).toBe(2)
    expect(result.overrideCount).toBe(1)
    expect(result.roster.members.map(member => member.name)).toEqual(['王磊', '李静'])
    expect(result.roster.overrides[0]).toEqual({ memberId: 'm1', date: '2026-10-20', shift: '白特' })
    expect(result.droppedMembers).toEqual([])
  })

  it('版本号是 6', () => {
    expect(createBackup(roster, null).version).toBe(6)
    expect(BACKUP_VERSION).toBe(6)
  })

  it('岗位字段随备份往返：有岗位保留，无岗位缺省', () => {
    const withPosition: Roster = {
      ...roster,
      members: [
        { id: 'm1', name: '王磊', patternId: '4F', position: '班长' },
        { id: 'm2', name: '李静', patternId: '4J' }
      ]
    }
    const text = JSON.stringify(createBackup(withPosition, null))
    const result = parseBackup(text)
    expect(result.roster.members[0].position).toBe('班长')
    expect(result.roster.members[1].position).toBeUndefined()
  })

  it('自定义班序会写进备份，并在导入后还原', () => {
    const withPattern: Roster = {
      ...roster,
      members: [...roster.members, { id: 'm3', name: '孙强', patternId: 'cp-1' }],
      patterns: [customPattern]
    }

    const text = JSON.stringify(createBackup(withPattern, null))
    const result = parseBackup(text)

    expect(result.roster.patterns).toHaveLength(1)
    expect(result.roster.patterns[0].name).toBe('甲班')
    expect(result.roster.patterns[0].shifts).toHaveLength(PATTERN_CYCLE_LENGTH)
    // 关键：挂在自定义班序上的人没被丢掉
    expect(result.roster.members.map(member => member.name)).toEqual(['王磊', '李静', '孙强'])
    expect(result.droppedMembers).toEqual([])
  })

  it('拒收别的应用导出的文件', () => {
    const text = JSON.stringify({ app: 'someone-else', version: 6, roster: { members: [], overrides: [] } })
    expect(() => parseBackup(text)).toThrow('不是「昼夜」导出的')
  })

  it('非法 JSON 给出中文错误', () => {
    expect(() => parseBackup('{oops')).toThrow('不是合法的 JSON')
  })

  it('没有成员的备份不予导入', () => {
    const text = JSON.stringify({ app: 'shift-schedule-local', version: 6, roster: { members: [], overrides: [] } })
    expect(() => parseBackup(text)).toThrow('没有成员')
  })

  it('没有 roster 字段的文件报「没有可恢复的数据」', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'shift-schedule-local', version: 6 }))).toThrow(
      '没有可恢复的数据'
    )
  })
})

describe('旧格式一律拒绝（开发期不做兼容）', () => {
  it('上一版（v4）会明确报版本不符，而不是含糊地报格式错', () => {
    const text = JSON.stringify({
      app: 'shift-schedule-local',
      version: 4,
      roster: { members: [{ id: 'm1', name: '王磊', patternId: '4F' }], overrides: [], patterns: [] }
    })
    expect(() => parseBackup(text)).toThrow('只认 v6')
  })

  it('没有版本号的文件也拒收', () => {
    const text = JSON.stringify({ app: 'shift-schedule-local', roster: { members: [], overrides: [] } })
    expect(() => parseBackup(text)).toThrow('没有版本号')
  })

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

describe('待办的备份往返', () => {
  const withTodos: Roster = {
    ...roster,
    todos: [
      { id: 't-1', date: '2026-10-21', text: '交班记录表', tone: 1, done: false, createdAt: 1765000000000 },
      { id: 't-2', date: '2026-10-21', text: '买台灯', tone: 2, done: true, createdAt: 1765000001000 },
      { id: 't-3', date: '2026-10-25', text: '年休申请', tone: 3, done: false, createdAt: 1765000002000 }
    ]
  }

  it('导出再导入，待办原样还原', () => {
    const result = parseBackup(JSON.stringify(createBackup(withTodos, null)))
    expect(result.todoCount).toBe(3)
    expect(result.roster.todos).toEqual(withTodos.todos)
  })

  it('待办是 v5 才有的字段：v4 备份会被版本检查拦下', () => {
    const text = JSON.stringify({
      app: 'shift-schedule-local',
      version: 4,
      roster: { members: [{ id: 'm1', name: '王磊', patternId: '4F' }], overrides: [], patterns: [] }
    })
    expect(() => parseBackup(text)).toThrow('只认 v6')
  })

  it('待办里的脏数据被丢掉，不影响其它待办', () => {
    const dirty = {
      app: 'shift-schedule-local',
      version: 6,
      roster: {
        members: [{ id: 'm1', name: '王磊', patternId: '4F' }],
        overrides: [],
        patterns: [],
        todos: [
          { id: 't-1', date: '2026-10-21', text: '正常待办', done: false, createdAt: 1 },
          { id: '', date: '2026-10-21', text: '没 id', done: false, createdAt: 2 },
          { id: 't-3', date: '不是日期', text: '日期非法', done: false, createdAt: 3 },
          { id: 't-4', date: '2026-10-21', text: '   ', done: false, createdAt: 4 }
        ]
      }
    }
    const result = parseBackup(JSON.stringify(dirty))
    expect(result.roster.todos).toHaveLength(1)
    expect(result.roster.todos[0].text).toBe('正常待办')
  })
})

describe('分组的备份往返', () => {
  it('分组与成员归属原样还原', () => {
    const withGroups: Roster = {
      ...roster,
      groups: [
        { id: 'g1', name: '生产部' },
        { id: 'g2', name: '工程部' }
      ],
      members: [
        { id: 'm1', name: '王磊', patternId: '4F', groupId: 'g1' },
        { id: 'm2', name: '李静', patternId: '4J', groupId: 'g2' }
      ]
    }

    const result = parseBackup(JSON.stringify(createBackup(withGroups, null)))
    expect(result.roster.groups).toEqual(withGroups.groups)
    expect(result.roster.members.map(member => member.groupId)).toEqual(['g1', 'g2'])
  })

  it('没有 groups 字段的 v5 备份仍可导入，所有人未分组', () => {
    const text = JSON.stringify({
      app: 'shift-schedule-local',
      version: 6,
      roster: {
        members: [{ id: 'm1', name: '王磊', patternId: '4F' }],
        overrides: [],
        patterns: []
      }
    })

    const result = parseBackup(text)
    expect(result.roster.groups).toEqual([])
    expect(result.roster.members[0].groupId).toBeUndefined()
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

    const result = parseBackup(JSON.stringify(createBackup(withOvertime, null)))
    expect(result.roster.overrides).toEqual(
      expect.arrayContaining([
        { memberId: 'm1', date: '2026-10-20', shift: '白特', overtimeHours: 2.5, isLegal: true },
        { memberId: 'm2', date: '2026-10-22', shift: '夜班', overtimeHours: 3 }
      ])
    )
  })
})

describe('个人信息（本人 + 薪资）的备份往返', () => {
  const withSelf: Roster = {
    ...roster,
    profile: {
      memberId: 'm1',
      salary: {
        baseSalary: '8000',
        performanceAllowance: '1200',
        positionAllowance: '600',
        socialFund: '1500'
      }
    }
  }

  it('本人指针与四项薪资都能还原', () => {
    const result = parseBackup(JSON.stringify(createBackup(withSelf, null)))
    expect(result.roster.profile).toEqual(withSelf.profile)
  })

  it('薪资值在导入时会被清洗（手改的 JSON 塞了脏字符也能收敛）', () => {
    const dirty = {
      app: 'shift-schedule-local',
      version: 6,
      roster: {
        members: [{ id: 'm1', name: '王磊', patternId: '4F' }],
        overrides: [],
        patterns: [],
        profile: { memberId: 'm1', salary: { baseSalary: '¥8,000.987', socialFund: '-12' } }
      }
    }
    const result = parseBackup(JSON.stringify(dirty))
    expect(result.roster.profile?.salary.baseSalary).toBe('8000.98')
    // 负号被剥掉只剩数字，'12'
    expect(result.roster.profile?.salary.socialFund).toBe('12')
    expect(result.roster.profile?.salary.positionAllowance).toBe('')
  })

  it('本人指向一个不存在的成员时，profile 归零而不是让整个导入失败', () => {
    const broken = {
      app: 'shift-schedule-local',
      version: 6,
      roster: {
        members: [{ id: 'm1', name: '王磊', patternId: '4F' }],
        overrides: [],
        patterns: [],
        profile: { memberId: 'ghost', salary: { baseSalary: '1' } }
      }
    }
    const result = parseBackup(JSON.stringify(broken))
    expect(result.roster.profile).toBe(null)
    expect(result.roster.members).toHaveLength(1)
  })
})
