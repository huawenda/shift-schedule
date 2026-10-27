import { describe, expect, it } from 'vitest'
import {
  BUILTIN_PATTERNS,
  createBlankCustomPattern,
  isValidPatternShifts,
  MAX_CUSTOM_PATTERNS,
  normalizeCustomPatterns,
  PATTERN_ANCHOR_DATE,
  PATTERN_CYCLE_LENGTH,
  PATTERN_SHIFT_OPTIONS,
  resolvePatterns,
  validateCustomPattern,
  type CustomPattern
} from './patterns'

function makePattern(overrides: Partial<CustomPattern> = {}): CustomPattern {
  return {
    id: 'cp-test-1',
    name: '甲班',
    shifts: Array.from({ length: PATTERN_CYCLE_LENGTH }, () => '白班' as const),
    ...overrides
  }
}

describe('createBlankCustomPattern', () => {
  it('给满 24 格「休息」，避免出现半张表', () => {
    const pattern = createBlankCustomPattern()
    expect(pattern.shifts).toHaveLength(PATTERN_CYCLE_LENGTH)
    expect(pattern.shifts.every(shift => shift === '休息')).toBe(true)
    expect(pattern.name).toBe('')
  })

  it('每次生成不同的 id', () => {
    expect(createBlankCustomPattern().id).not.toBe(createBlankCustomPattern().id)
  })
})

describe('isValidPatternShifts', () => {
  it('24 个合法班次才算通过', () => {
    expect(isValidPatternShifts(Array(24).fill('白班'))).toBe(true)
    expect(isValidPatternShifts(Array(23).fill('白班'))).toBe(false)
    expect(isValidPatternShifts(Array(25).fill('白班'))).toBe(false)
    expect(isValidPatternShifts(Array(24).fill('加班'))).toBe(false)
    expect(isValidPatternShifts('白班')).toBe(false)
    expect(isValidPatternShifts(null)).toBe(false)
  })
})

describe('normalizeCustomPatterns', () => {
  it('保留合法条目', () => {
    const result = normalizeCustomPatterns([makePattern(), makePattern({ id: 'cp-2', name: '乙班' })])
    expect(result).toHaveLength(2)
    expect(result.map(pattern => pattern.name)).toEqual(['甲班', '乙班'])
  })

  it('缺 id 或缺名字的丢掉', () => {
    expect(normalizeCustomPatterns([makePattern({ id: '' })])).toHaveLength(0)
    expect(normalizeCustomPatterns([makePattern({ name: '  ' })])).toHaveLength(0)
  })

  it('名字或 id 撞内置代号的一律丢掉 —— 否则界面上分不清', () => {
    expect(normalizeCustomPatterns([makePattern({ name: '4F' })])).toHaveLength(0)
    expect(normalizeCustomPatterns([makePattern({ id: '4F' })])).toHaveLength(0)
  })

  it('重复 id 或重复名字只保留第一条', () => {
    const duplicatedId = normalizeCustomPatterns([
      makePattern(),
      makePattern({ name: '乙班' }) // 同 id 不同名
    ])
    expect(duplicatedId).toHaveLength(1)

    const duplicatedName = normalizeCustomPatterns([
      makePattern(),
      makePattern({ id: 'cp-2' }) // 同名不同 id
    ])
    expect(duplicatedName).toHaveLength(1)
    expect(duplicatedName[0].id).toBe('cp-test-1')
  })

  it('格子不完整的丢掉', () => {
    expect(normalizeCustomPatterns([makePattern({ shifts: Array(12).fill('白班') as never })])).toHaveLength(0)
  })

  it(`超过 ${MAX_CUSTOM_PATTERNS} 条时截断`, () => {
    const many = Array.from({ length: MAX_CUSTOM_PATTERNS + 5 }, (_, index) =>
      makePattern({ id: `cp-${index}`, name: `班-${index}` })
    )
    expect(normalizeCustomPatterns(many)).toHaveLength(MAX_CUSTOM_PATTERNS)
  })

  it('非数组返回空数组，绝不抛异常', () => {
    expect(normalizeCustomPatterns(undefined)).toEqual([])
    expect(normalizeCustomPatterns(null)).toEqual([])
    expect(normalizeCustomPatterns('nope')).toEqual([])
    expect(normalizeCustomPatterns([null, 42, 'x'])).toEqual([])
  })
})

describe('validateCustomPattern', () => {
  const existing = [makePattern()]

  it('名字必填', () => {
    expect(validateCustomPattern({ name: '  ', shifts: createBlankCustomPattern().shifts }, [])).toContain(
      '班序需要起个名字'
    )
  })

  it('不能用内置代号当名字', () => {
    const errors = validateCustomPattern({ name: '4F', shifts: createBlankCustomPattern().shifts }, [])
    expect(errors.some(error => error.includes('内置班序的代号'))).toBe(true)
  })

  it('不能和已有的自定义班序重名', () => {
    const errors = validateCustomPattern({ name: '甲班', shifts: createBlankCustomPattern().shifts }, existing)
    expect(errors.some(error => error.includes('已经有一条叫「甲班」'))).toBe(true)
  })

  it('编辑自己时不算重名', () => {
    const errors = validateCustomPattern(
      { id: 'cp-test-1', name: '甲班', shifts: createBlankCustomPattern().shifts },
      existing
    )
    expect(errors).toEqual([])
  })

  it('格子必须是完整 24 天', () => {
    const errors = validateCustomPattern({ name: '乙班', shifts: Array(20).fill('白班') }, [])
    expect(errors.some(error => error.includes('完整的 24 天'))).toBe(true)
  })

  it(`新增超过 ${MAX_CUSTOM_PATTERNS} 条时报错，但编辑已有不报`, () => {
    const full = Array.from({ length: MAX_CUSTOM_PATTERNS }, (_, index) =>
      makePattern({ id: `cp-${index}`, name: `班-${index}` })
    )
    const adding = validateCustomPattern({ name: '新的', shifts: createBlankCustomPattern().shifts }, full)
    expect(adding.some(error => error.includes('最多'))).toBe(true)

    const editing = validateCustomPattern(
      { id: 'cp-0', name: '班-0', shifts: createBlankCustomPattern().shifts },
      full
    )
    expect(editing).toEqual([])
  })
})

describe('resolvePatterns', () => {
  it('内置在前、自定义在后，总数对得上', () => {
    const lookup = resolvePatterns([makePattern(), makePattern({ id: 'cp-2', name: '乙班' })])
    expect(lookup.all).toHaveLength(BUILTIN_PATTERNS.length + 2)
    expect(lookup.builtin).toHaveLength(13)
    expect(lookup.custom).toHaveLength(2)
    expect(lookup.all[0].id).toBe('4F')
    expect(lookup.all[13].id).toBe('cp-test-1')
  })

  it('显示名：内置用代号，自定义用用户起的名字', () => {
    const lookup = resolvePatterns([makePattern({ name: '甲班' })])
    expect(lookup.labelOf('4F')).toBe('4F')
    expect(lookup.labelOf('cp-test-1')).toBe('甲班')
    expect(lookup.labelOf('不存在的')).toBe('不存在的')
  })

  it('自定义班序能算出班次 —— 与内置同一套锚点规则', () => {
    const custom = makePattern({
      shifts: Array.from({ length: PATTERN_CYCLE_LENGTH }, (_, index) => (index === 0 ? '夜班' : '休息')) as never
    })
    const lookup = resolvePatterns([custom])

    // 锚点日取序列第一位
    expect(lookup.getShift(custom.id, PATTERN_ANCHOR_DATE)).toBe('夜班')
    // 24 天后回到同一位
    expect(lookup.getShift(custom.id, '2026-07-01')).toBe('夜班')
    // 锚点前一天取最后一位
    expect(lookup.getShift(custom.id, '2026-06-06')).toBe('休息')
  })

  it('没有自定义班序时，行为与内置一致', () => {
    const lookup = resolvePatterns()
    expect(lookup.has('4F')).toBe(true)
    expect(lookup.has('cp-test-1')).toBe(false)
    expect(lookup.getShift('4F', PATTERN_ANCHOR_DATE)).toBe('夜班')
  })

  it('未知 id 返回 null，不抛异常', () => {
    const lookup = resolvePatterns()
    expect(lookup.getShift('nope', PATTERN_ANCHOR_DATE)).toBeNull()
    expect(lookup.get('nope')).toBeUndefined()
  })

  it('录入入口只提供白班 / 夜班 / 休息三种基础班次', () => {
    expect([...PATTERN_SHIFT_OPTIONS]).toEqual(['白班', '夜班', '休息'])
  })

  it('班序的 24 格只由基础班次构成 —— 特殊班次走单天改班，不进班序', () => {
    BUILTIN_PATTERNS.forEach(pattern => {
      pattern.shifts.forEach(shift => {
        expect(PATTERN_SHIFT_OPTIONS).toContain(shift)
      })
    })
  })
})
