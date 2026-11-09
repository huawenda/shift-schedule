/**
 * 尺寸验证算法 —— 匹配规则测试
 *
 * 判定模型: P/N 第 7..10 位是 4 位尺寸码, 尺寸串里每个互斥组
 * (按 `_` 分隔) 去掉非数字字符后也是 4 位码, 两者全等才算匹配。
 * 例: P/N "6073J-6555F" 提取 "6555" == 尺寸串 "65/55" 的编码。
 *
 * 运行: npm test
 */

import { describe, it, expect } from 'vitest'
import { createDefaultJigConfig } from '../core/config'
import { validateSizeMatch, rulesFromConfig } from '../core/validate'

const config = createDefaultJigConfig()
const rules = rulesFromConfig(config)

describe('尺寸验证 —— 规则边界', () => {
  it('All Size 恒匹配', () => {
    expect(validateSizeMatch('6073J-8348G', 'All Size', rules)).toBe(true)
  })

  it('空值视为匹配', () => {
    expect(validateSizeMatch('', '77/48', rules)).toBe(true)
    expect(validateSizeMatch('6073J-8348G', '', rules)).toBe(true)
  })

  it('P/N 长度不足时视为匹配', () => {
    // pnExtractStart=6, pnExtractLength=4 => 需要至少 10 位
    expect(validateSizeMatch('ABC', '77/48', rules)).toBe(true)
  })

  // ---------------------------------------------------------------------
  // 以下用例的 P/N 串必须是 6 个前导字符 + 4 位数字。
  //
  // 曾经的写法是 "XXXX7748XXXX" (4 个 X), 但 pnExtractStart=6 意味着
  // 提取的是下标 6..9 —— 那串的真实提取段是 "48XX" 而不是 "7748"。
  // 它当年能通过, 是因为旧规则 8 的"任意连续 2 位子串"在尺寸串里
  // 找到了 "48" 才判匹配, 属于蒙对。严格匹配下这类串会判不匹配,
  // 所以这里改用真实 P/N 格式, 让用例名与实际断的东西一致。
  // ---------------------------------------------------------------------
  it('严格 4 位匹配: 7748 命中规格 77/48', () => {
    expect(validateSizeMatch('XXXXXX7748', '77/48', rules)).toBe(true)
    expect(validateSizeMatch('6073J-7748K', '77/48', rules)).toBe(true)
  })

  it('严格 4 位匹配: 65/55 等价于 P/N 的 6555', () => {
    expect(validateSizeMatch('XXXXXX6555', '65/55', rules)).toBe(true)
    expect(validateSizeMatch('6073J-6555F', '65/55', rules)).toBe(true)
  })

  it('分隔符不同的同一规格视为不匹配: 65XX 不是 65/55', () => {
    // 提取段是 "65XX", 与规格码 "6555" 不同 -> 不匹配
    expect(validateSizeMatch('XXXXXX65XX', '65/55', rules)).toBe(false)
  })

  it('互斥组按组拆分, 不会跨组拼出假规格', () => {
    // 整串去分隔符会得到 "77488348" 里的 "7488",
    // 按组拆则只有 7748 与 8348 两个真规格
    expect(validateSizeMatch('XXXXXX7748', '77/48_83/48', rules)).toBe(true)
    expect(validateSizeMatch('XXXXXX8348', '77/48_83/48', rules)).toBe(true)
    expect(validateSizeMatch('XXXXXX7488', '77/48_83/48', rules)).toBe(false)
  })

  it('子串不再算匹配: 7727 不在 77/48_83/48 的规格里', () => {
    // 旧规则 8 会因 "77" 子串存在而误判为匹配
    expect(validateSizeMatch('XXXXXX7727', '77/48_83/48', rules)).toBe(false)
  })

  it('子串不再算匹配: 7742 不在 430 的规格 65/55_77/48_83/48 里', () => {
    expect(validateSizeMatch('XXXXXX7742', '65/55_77/48_83/48', rules)).toBe(false)
    expect(validateSizeMatch('XXXXXX7748', '65/55_77/48_83/48', rules)).toBe(true)
  })

  it('组内数字不足 4 位时不构成规格, 一律不匹配', () => {
    // "65" 只有 2 位, 拼不出完整 4 位规格
    expect(validateSizeMatch('XXXXXX6555', '65', rules)).toBe(false)
  })

  it('不匹配时返回 false', () => {
    expect(validateSizeMatch('XXXXXX1234', '77/48', rules)).toBe(false)
  })

  it('提取长度非 4 时保守判为不匹配', () => {
    // 规格码固定 4 位, 提取长度改成 2 就无法全等比较。
    // 宁可标红提示人工确认, 也不放行可能装错的 JIG。
    const twoDigitRules = { ...rules, pnExtractLength: 2 }
    expect(validateSizeMatch('XXXXXX65', '65/48', twoDigitRules)).toBe(false)
  })
})