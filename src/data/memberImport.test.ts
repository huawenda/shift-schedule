import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { MAX_MEMBERS } from './roster'
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
      { name: '张三', pattern: '4F', position: '班长' },
      { name: '李四', pattern: '4G', position: '' }
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

  it('表头顺序打乱也能认出来（岗位列在中间）', () => {
    const { people } = readMemberSheet(
      sheetBuffer([
        ['岗位', '姓名', '班序'],
        ['副操', '孙七', '4T']
      ])
    )

    expect(people).toEqual([{ name: '孙七', pattern: '4T', position: '副操' }])
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
        { name: '张三', pattern: '4F', position: '' },
        { name: '本人', pattern: '4F', position: '' },
        { name: '李四', pattern: '4F', position: '' }
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
        { name: 'Alice', pattern: '', position: '' },
        { name: ' alice ', pattern: '', position: '' }
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
      [{ name: '周八', pattern: '不存在的班序', position: '' }],
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
        { name: '甲', pattern: '4f', position: '' },
        { name: '乙', pattern: '乙班循环', position: '' }
      ],
      [],
      patterns,
      '4F'
    )

    expect(result.members.map(member => member.patternId)).toEqual(['4F', 'cp-b'])
    expect(result.unknownPatterns).toBe(0)
  })

  it('岗位为空时不写进成员对象，有值时去掉首尾空格', () => {
    const result = mergeImportedMembers(
      [
        { name: '甲', pattern: '', position: '  班长  ' },
        { name: '乙', pattern: '', position: '   ' }
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
        { name: '甲', pattern: '', position: '' },
        { name: '乙', pattern: '', position: '' }
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
      describeImport({ members: [{ id: 'm', name: '甲', patternId: '4F' }], duplicates: 0, unknownPatterns: 0, overLimit: 0, blankRows: 0 })
    ).toBe('已导入 1 位成员。')
  })

  it('跳过与兜底都写进同一句', () => {
    expect(
      describeImport({ members: [], duplicates: 3, unknownPatterns: 2, overLimit: 0, blankRows: 1 })
    ).toBe('已导入 0 位成员，跳过 3 位重名，2 位班序未识别，已用默认班序，1 行缺姓名已忽略。')
  })
})
