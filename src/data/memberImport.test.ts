import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { MAX_MEMBER_GROUPS, MAX_MEMBERS } from './roster'
import { describeImport, mergeImportedMembers, readMemberSheet } from './memberImport'

/** 在内存里生成一张 xlsx：省得测试依赖磁盘上的样例文件 */
function sheetBuffer(rows: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '成员')
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('读 Excel 成员表', () => {
  it('按表头找列，跳过空行，保留缺姓名行用于提示', () => {
    const { people, blankRows } = readMemberSheet(
      sheetBuffer([
        ['姓名', '班序', '岗位'],
        ['张三', '4F', '班长'],
        ['', '', ''],
        ['李四', '4G', ''],
        ['', '4H', '替班'] // 有内容但没姓名 → 计入 blankRows
      ])
    )

    expect(people).toEqual([
      { name: '张三', pattern: '4F', position: '班长', group: '' },
      { name: '李四', pattern: '4G', position: '', group: '' }
    ])
    expect(blankRows).toBe(1)
  })

  it('没有表头时按「姓名、班序、岗位」的固定列序读', () => {
    const { people } = readMemberSheet(
      sheetBuffer([
        ['王五', '4K', '主操'],
        ['赵六', '4S', '']
      ])
    )

    expect(people.map(person => person.name)).toEqual(['王五', '赵六'])
    expect(people[0].pattern).toBe('4K')
  })

  it('没有表头时第 4 列不当分组（可能是备注）', () => {
    const { people } = readMemberSheet(
      sheetBuffer([['王五', '4K', '主操', '备注甲']])
    )

    expect(people[0]).toEqual({ name: '王五', pattern: '4K', position: '主操', group: '' })
  })

  it('表头顺序打乱也能认出来（岗位列在中间）', () => {
    const { people } = readMemberSheet(
      sheetBuffer([
        ['岗位', '姓名', '班序'],
        ['副操', '孙七', '4T']
      ])
    )

    expect(people).toEqual([{ name: '孙七', pattern: '4T', position: '副操', group: '' }])
  })

  it('识别分组列：表头写「部门」也认，列序随意', () => {
    const { people } = readMemberSheet(
      sheetBuffer([
        ['部门', '姓名', '岗位', '班序'],
        ['生产部', '张三', '班长', '4F'],
        ['', '李四', '', '4G']
      ])
    )

    expect(people).toEqual([
      { name: '张三', pattern: '4F', position: '班长', group: '生产部' },
      { name: '李四', pattern: '4G', position: '', group: '' }
    ])
  })
})

describe('合并导入的成员', () => {
  const patterns = [
    { id: '4F', name: '四班三运转' },
    { id: 'cp-b', name: '乙班循环' }
  ]

  it('追加到现有成员后面，与现有成员（含本人）重名的跳过', () => {
    const result = mergeImportedMembers(
      [
        { name: '张三', pattern: '4F', position: '', group: '' },
        { name: '本人', pattern: '4F', position: '', group: '' },
        { name: '李四', pattern: '4F', position: '', group: '' }
      ],
      ['本人', '张三'],
      patterns,
      '4F'
    )

    expect(result.members.map(member => member.name)).toEqual(['李四'])
    expect(result.duplicates).toBe(2)
  })

  it('文件内重名（去掉大小写与首尾空格）也只留第一条', () => {
    const result = mergeImportedMembers(
      [
        { name: 'Alice', pattern: '', position: '', group: '' },
        { name: ' alice ', pattern: '', position: '', group: '' }
      ],
      [],
      patterns,
      '4F'
    )

    expect(result.members).toHaveLength(1)
    expect(result.members[0].name).toBe('Alice')
    expect(result.duplicates).toBe(1)
  })

  it('班序认不出来时用默认班序并计数，而不是丢人', () => {
    const result = mergeImportedMembers(
      [{ name: '周八', pattern: '不存在的班序', position: '', group: '' }],
      [],
      patterns,
      '4F'
    )

    expect(result.members[0].patternId).toBe('4F')
    expect(result.unknownPatterns).toBe(1)
  })

  it('班序可以写代号，也可以写显示名（自定义班序）', () => {
    const result = mergeImportedMembers(
      [
        { name: '甲', pattern: '4f', position: '', group: '' },
        { name: '乙', pattern: '乙班循环', position: '', group: '' }
      ],
      [],
      patterns,
      '4F'
    )

    expect(result.members.map(member => member.patternId)).toEqual(['4F', 'cp-b'])
    expect(result.unknownPatterns).toBe(0)
  })

  it('分组按名称匹配已有分组（不分大小写），认不出就自动新建', () => {
    const existingGroups = [
      { id: 'g-qa', name: 'QA' },
      { id: 'g-prod', name: '生产部' }
    ]
    const result = mergeImportedMembers(
      [
        { name: '甲', pattern: '', position: '', group: 'qa' },
        { name: '乙', pattern: '', position: '', group: ' 生产部 ' },
        { name: '丙', pattern: '', position: '', group: '工程部' },
        { name: '丁', pattern: '', position: '', group: '工程部' },
        { name: '戊', pattern: '', position: '', group: '' }
      ],
      [],
      patterns,
      '4F',
      existingGroups
    )

    expect(result.members.map(member => member.groupId)).toEqual([
      'g-qa',
      'g-prod',
      result.newGroups[0].id,
      result.newGroups[0].id,
      undefined
    ])
    // 文件内同一个新组名只建一次
    expect(result.newGroups).toHaveLength(1)
    expect(result.newGroups[0].name).toBe('工程部')
  })

  it('分组列留空时归到默认分组（在某个分组 tab 里导入）', () => {
    const existingGroups = [{ id: 'g-qa', name: 'QA' }]
    const result = mergeImportedMembers(
      [
        { name: '甲', pattern: '', position: '', group: '' },
        { name: '乙', pattern: '', position: '', group: '生产部' }
      ],
      [],
      patterns,
      '4F',
      existingGroups,
      'g-qa'
    )

    expect(result.members[0].groupId).toBe('g-qa')
    expect(result.newGroups).toHaveLength(1)
    expect(result.members[1].groupId).toBe(result.newGroups[0].id)
  })

  it('默认分组不存在时忽略，留空的人还是未分组', () => {
    const result = mergeImportedMembers(
      [{ name: '甲', pattern: '', position: '', group: '' }],
      [],
      patterns,
      '4F',
      [{ id: 'g-qa', name: 'QA' }],
      'g-ghost'
    )

    expect(result.members[0].groupId).toBeUndefined()
  })

  it('分组数达到上限时，后来的组不新建，成员记为未归组', () => {
    const existingGroups = Array.from({ length: MAX_MEMBER_GROUPS }, (_, index) => ({
      id: `g-${index}`,
      name: `部门${index}`
    }))
    const result = mergeImportedMembers(
      [{ name: '甲', pattern: '', position: '', group: '新部门' }],
      [],
      patterns,
      '4F',
      existingGroups
    )

    expect(result.newGroups).toHaveLength(0)
    expect(result.members[0].groupId).toBeUndefined()
    expect(result.overGroups).toBe(1)
  })

  it('岗位为空时不写进成员对象，有值时去掉首尾空格', () => {
    const result = mergeImportedMembers(
      [
        { name: '甲', pattern: '', position: '  班长  ', group: '' },
        { name: '乙', pattern: '', position: '   ', group: '' }
      ],
      [],
      patterns,
      '4F'
    )

    expect(result.members[0].position).toBe('班长')
    expect(result.members[1].position).toBeUndefined()
  })

  it('超出成员上限的部分被丢弃并计数', () => {
    const existing = Array.from({ length: MAX_MEMBERS - 1 }, (_, index) => `同事${index}`)
    const result = mergeImportedMembers(
      [
        { name: '甲', pattern: '', position: '', group: '' },
        { name: '乙', pattern: '', position: '', group: '' }
      ],
      existing,
      patterns,
      '4F'
    )

    expect(result.members).toHaveLength(1)
    expect(result.overLimit).toBe(1)
  })
})

describe('导入结果文案', () => {
  it('正常导入只报新增人数', () => {
    expect(
      describeImport({
        members: [{ id: 'm', name: '甲', patternId: '4F' }],
        newGroups: [],
        duplicates: 0,
        unknownPatterns: 0,
        overGroups: 0,
        overLimit: 0,
        blankRows: 0
      })
    ).toBe('已导入 1 位成员。')
  })

  it('跳过与兜底都写进同一句', () => {
    expect(
      describeImport({
        members: [],
        newGroups: [],
        duplicates: 3,
        unknownPatterns: 2,
        overGroups: 0,
        overLimit: 0,
        blankRows: 1
      })
    ).toBe('已导入 0 位成员，跳过 3 位重名，2 位班序未识别，已用默认班序，1 行缺姓名已忽略。')
  })

  it('自动新建的分组写进结果', () => {
    expect(
      describeImport({
        members: [{ id: 'm', name: '甲', patternId: '4F' }],
        newGroups: [
          { id: 'g-1', name: '生产部' },
          { id: 'g-2', name: '工程部' }
        ],
        duplicates: 0,
        unknownPatterns: 0,
        overGroups: 0,
        overLimit: 0,
        blankRows: 0
      })
    ).toBe('已导入 1 位成员，新建 2 个分组。')
  })

  it('分组达到上限时也给出原因', () => {
    expect(
      describeImport({
        members: [],
        newGroups: [],
        duplicates: 0,
        unknownPatterns: 0,
        overGroups: 2,
        overLimit: 0,
        blankRows: 0
      })
    ).toBe(`已导入 0 位成员，分组已达 ${MAX_MEMBER_GROUPS} 个上限，2 位未归组。`)
  })
})
