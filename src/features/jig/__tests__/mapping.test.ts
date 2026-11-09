/**
 * 型号尺寸匹配面板的编辑逻辑 —— 单元测试
 *
 * 重点不是"能不能增删改", 而是重复型号会不会被静默吃掉:
 * pairsToMapping 底层是 Record<string, string>, 同一个型号写两次
 * 后者直接覆盖前者, 既不报错也不提示 —— 用户以为自己配了三条规则,
 * 实际生效只有两条, 而且丢的是哪条取决于输入顺序。
 * validateMappingPairs 就是在面板上堵这个洞, 所以它的行为必须钉死。
 */

import { describe, it, expect } from 'vitest'
import {
  blankPair,
  mappingToPairs,
  movePair,
  orderedPairs,
  pairsToMapping,
  validateMappingPairs,
} from '../core/mapping'
import type { MappingPair } from '../core/mapping'
import { createDefaultJigConfig, mergeJigConfig } from '../core/config'

describe('映射表: 配置对象 <-> 行数组', () => {
  it('默认配置能完整往返', () => {
    const cfg = createDefaultJigConfig()
    expect(pairsToMapping(mappingToPairs(cfg.jigSizeMapping))).toEqual(cfg.jigSizeMapping)
  })

  it('mappingToPairs 保留型号的大小写与后缀', () => {
    // 252 与 252A 映射不同, 大小写或后缀一旦被规范化掉就会串
    const pairs = mappingToPairs({ '252': 'x', '252A': 'y', '502N': 'z' })
    expect(pairs).toEqual([
      { model: '252', size: 'x' },
      { model: '252A', size: 'y' },
      { model: '502N', size: 'z' },
    ])
  })

  it('pairsToMapping 逐行 trim 两侧空白', () => {
    expect(pairsToMapping([{ model: '  256  ', size: '  All Size ' }])).toEqual({
      '256': 'All Size',
    })
  })

  it('空型号的行被跳过, 不会产生空字符串键', () => {
    // 空键会被 firstModel 查得到, 命中任何空型号的行都会判成
    // "匹配空尺寸" —— 静默丢掉反而更安全, 但面板必须先拦住它
    expect(pairsToMapping([{ model: '   ', size: 'x' }, { model: '256', size: 'y' }])).toEqual({
      '256': 'y',
    })
  })

  it('空尺寸是合法值, 表示该型号不做尺寸校验', () => {
    expect(pairsToMapping([{ model: '184', size: '' }])).toEqual({ '184': '' })
  })
})

describe('映射表: 校验', () => {
  it('合法输入没有错误', () => {
    expect(validateMappingPairs(mappingToPairs(createDefaultJigConfig().jigSizeMapping))).toEqual({})
  })

  it('空型号报错', () => {
    const errors = validateMappingPairs([{ model: '', size: 'x' }])
    expect(errors[0]).toBe('型号不能为空')
  })

  it('只有空格的型号同样报错', () => {
    expect(validateMappingPairs([{ model: '   ', size: 'x' }])[0]).toBe('型号不能为空')
  })

  it('重复型号在第二行报错, 并指明首次出现的行号', () => {
    const errors = validateMappingPairs([
      { model: '256', size: 'All Size' },
      { model: '252', size: 'a' },
      { model: '256', size: 'b' },
    ])
    expect(errors[2]).toBe('型号 256 与第 1 行重复')
    expect(errors[0]).toBeUndefined()
    expect(errors[1]).toBeUndefined()
  })

  it('三处重复会逐个报出各自的来源行', () => {
    const errors = validateMappingPairs([
      { model: 'x', size: '' },
      { model: 'x', size: '' },
      { model: 'x', size: '' },
    ])
    expect(errors[1]).toBe('型号 x 与第 1 行重复')
    expect(errors[2]).toBe('型号 x 与第 1 行重复')
  })

  it('trim 之后才算重复 —— " 256 " 与 "256" 是同一个型号', () => {
    const errors = validateMappingPairs([
      { model: '256', size: 'a' },
      { model: ' 256 ', size: 'b' },
    ])
    expect(errors[1]).toBe('型号 256 与第 1 行重复')
  })

  it('空型号不参与去重, 两行都空则两行都报错', () => {
    const errors = validateMappingPairs([
      { model: '', size: '' },
      { model: '', size: '' },
    ])
    expect(errors[0]).toBe('型号不能为空')
    expect(errors[1]).toBe('型号不能为空')
  })

  it('空数组没有错误, 面板允许清空全部规则', () => {
    expect(validateMappingPairs([])).toEqual({})
  })
})

describe('映射表: 新增行', () => {
  it('blankPair 返回独立对象, 不会被共用引用串改', () => {
    const a = blankPair()
    const b = blankPair()
    expect(a).toEqual({ model: '', size: '' })
    expect(a).not.toBe(b)
  })
})

describe('映射表: 调整顺序', () => {
  const list: MappingPair[] = [
    { model: 'a', size: '1' },
    { model: 'b', size: '2' },
    { model: 'c', size: '3' },
    { model: 'd', size: '4' },
  ]

  it('下移一行', () => {
    expect(movePair(list, 0, 1).map((p) => p.model)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('上移一行', () => {
    expect(movePair(list, 3, 2).map((p) => p.model)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('移到最前', () => {
    expect(movePair(list, 2, 0).map((p) => p.model)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('移到最后', () => {
    expect(movePair(list, 1, 3).map((p) => p.model)).toEqual(['a', 'c', 'd', 'b'])
  })

  it('尺寸串跟着型号一起搬, 不会错位', () => {
    const moved = movePair(list, 3, 0)
    expect(moved[0]).toEqual({ model: 'd', size: '4' })
    expect(moved[3]).toEqual({ model: 'c', size: '3' })
    expect(moved.map((p) => p.model)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('同位置返回原数组引用 —— 端点按钮点了不该触发重渲', () => {
    // 上下移动按钮在首尾必然要点得到, 每次都造新数组会让整表重渲
    expect(movePair(list, 0, 0)).toBe(list)
  })

  it('越界返回原数组引用', () => {
    expect(movePair(list, -1, 2)).toBe(list)
    expect(movePair(list, 0, 9)).toBe(list)
    expect(movePair(list, 4, 0)).toBe(list)
  })

  it('空列表不炸', () => {
    expect(movePair([], 0, 1)).toEqual([])
  })

  it('顺序会被 pairsToMapping 保留为插入次序', () => {
    // 只有非数字键才保得住插入顺序。纯数字型号('184' '252')会被 JS
    // 对象按数值升序提到最前面 —— 这正是要用 jigSizeMappingOrder 单列
    // 一份顺序的原因, 下面的 orderedPairs 用例就是它的正面证明。
    const moved = movePair(list, 3, 0)
    expect(Object.keys(pairsToMapping(moved))).toEqual(['d', 'a', 'b', 'c'])
  })
})

describe('映射表: 顺序必须单列一份', () => {
  it('mappingToPairs 存不住纯数字型号排的顺序', () => {
    // 这是整个 orderedPairs 存在的理由: 用户把 252 拖到首位再保存,
    // Record 里读出来必然还是 184 打头、纯数字全部升序。
    const mapping = { '477': 'x', '502': 'y', '184': 'z', '262': 'w' }
    expect(Object.keys(mappingToPairs(pairsToMapping(mappingToPairs(mapping)))
      .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.model]: p.size }), {}),
    )).toEqual(['184', '262', '477', '502'])
  })

  it('orderedPairs 按 order 还原, 不受数字键升序影响', () => {
    const mapping = { '184': 'a', '252': 'b', '256': 'c', '262': 'd' }
    const order = ['262', '256', '252', '184']
    expect(orderedPairs(mapping, order).map((p) => p.model)).toEqual(order)
  })

  it('orderedPairs 附带对应的尺寸串, 不错位', () => {
    const mapping = { '184': 'a', '252': 'b', '256': 'c' }
    expect(orderedPairs(mapping, ['256', '184', '252'])).toEqual([
      { model: '256', size: 'c' },
      { model: '184', size: 'a' },
      { model: '252', size: 'b' },
    ])
  })

  it('orderedPairs 跳过顺序里已删除的型号, 不留幽灵行', () => {
    const mapping = { '184': 'a', '252': 'b' }
    expect(orderedPairs(mapping, ['252', '477', '184']).map((p) => p.model)).toEqual([
      '252',
      '184',
    ])
  })

  it('orderedPairs 把顺序里没有的型号追加到末尾, 不丢规则', () => {
    const mapping = { '184': 'a', '252': 'b', '999': 'c' }
    expect(orderedPairs(mapping, ['252']).map((p) => p.model)).toEqual(['252', '184', '999'])
  })

  it('默认配置的 order 与 mapping 键集完全一致', () => {
    const cfg = createDefaultJigConfig()
    expect([...cfg.jigSizeMappingOrder].sort()).toEqual(Object.keys(cfg.jigSizeMapping).sort())
  })

  it('往返: 面板重排 -> 保存 -> 重开, 顺序不变', () => {
    const cfg = createDefaultJigConfig()
    const pairs = orderedPairs(cfg.jigSizeMapping, cfg.jigSizeMappingOrder)
    const moved = movePair(movePair(pairs, 15, 0), 8, 3)
    const saved = {
      jigSizeMapping: pairsToMapping(moved),
      jigSizeMappingOrder: moved.map((p) => p.model),
    }
    expect(
      orderedPairs(saved.jigSizeMapping, saved.jigSizeMappingOrder).map((p) => p.model),
    ).toEqual(moved.map((p) => p.model))
  })
})

describe('映射表: 旧配置没有 order 字段时的对齐', () => {
  it('缺字段时按内置默认顺序补上', () => {
    const merged = mergeJigConfig({ jigSizeMapping: { '184': 'x' } } as never)
    expect(merged.jigSizeMappingOrder).toContain('184')
  })

  it('用户删过的型号不会从 order 里复活', () => {
    const merged = mergeJigConfig({
      jigSizeMapping: { '184': 'x' },
      jigSizeMappingOrder: ['184', '477'],
    } as never)
    expect(merged.jigSizeMappingOrder).toEqual(['184'])
  })

  it('用户后加的型号追加到末尾', () => {
    const merged = mergeJigConfig({
      jigSizeMapping: { '184': 'x', '999': 'y' },
      jigSizeMappingOrder: ['184'],
    } as never)
    expect(merged.jigSizeMappingOrder).toEqual(['184', '999'])
  })

  it('顺序里的重复项只留第一次', () => {
    const merged = mergeJigConfig({
      jigSizeMapping: { '184': 'x' },
      jigSizeMappingOrder: ['184', '184'],
    } as never)
    expect(merged.jigSizeMappingOrder).toEqual(['184'])
  })
})