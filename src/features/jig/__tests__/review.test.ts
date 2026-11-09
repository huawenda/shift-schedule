/**
 * 数据审查的两态分类 —— 判定与筛选语义
 *
 * 这一层只做**归类与筛选**, 不重新实现判定规则: 尺寸判定仍是
 * validate.ts 的 validateSizeMatch。所以测试重点不是"规则对不对"
 * (那边有独立测试), 而是:
 *   1. 分类结果与 validateSizeMatch 一致
 *   2. 缺列时不误判 (返回空数组, 而不是全 ok)
 *   3. 两档的包含关系与文案
 */

import { describe, expect, it } from 'vitest'
import { createDefaultJigConfig } from '../core/config'
import {
  classifyReviewRow,
  classifyReviewTable,
  isFlagged,
  matchesScope,
  REVIEW_SCOPES,
} from '../core/review'
import type { ReviewKind } from '../core/review'
import { rulesFromConfig } from '../core/validate'
import type { Row } from '../core/table'

const cfg = createDefaultJigConfig()
const rules = rulesFromConfig(cfg)

const row = (pn: string, size: string): Row => ({ 'P/N': pn, '对应尺寸': size })

const SIZE_508 = cfg.jigSizeMapping['508']
const SIZE_420A = cfg.jigSizeMapping['420A']
const SIZE_256 = cfg.jigSizeMapping['256']

const kind = (r: Row) => classifyReviewRow(r, rules)

describe('单行分类', () => {
  it('尺寸对不上 -> mismatch', () => {
    // 420A 只能做 65/55, P/N 要求 7748
    expect(kind(row('6073J-7748K', SIZE_420A))).toBe('mismatch')
  })

  it('尺寸匹配 -> ok', () => {
    expect(kind(row('6073J-7748B', SIZE_508))).toBe('ok')
  })

  it('All Size 恒匹配 -> ok, 不管 P/N 是什么码', () => {
    expect(kind(row('6072J-6555H', SIZE_256))).toBe('ok')
    expect(kind(row('6073J-3931F', SIZE_256))).toBe('ok')
  })

  it('尺寸为空 -> ok (无法验证时宁可漏报, 不误报)', () => {
    expect(kind(row('6073J-7748K', ''))).toBe('ok')
  })
})

describe('整表判定', () => {
  const table = (columns: string[], rows: Row[]) => ({ columns, rows })

  it('逐行给出分类', () => {
    const t = table(
      ['P/N', '对应尺寸'],
      [
        row('6073J-7748K', SIZE_420A), // mismatch
        row('6073J-7748B', SIZE_508), // ok
        row('6072J-6555H', SIZE_256), // ok
      ],
    )
    expect(classifyReviewTable(t, rules)).toEqual(['mismatch', 'ok', 'ok'])
  })

  it('没有「对应尺寸」列时返回空数组, 不返回全 ok', () => {
    // 调用方靠空数组判断"这张表不适用尺寸审查"(如透视表)。
    // 返回全 ok 会被当成"审过了, 全没问题"。
    const t = table(['P/N'], [row('6073J-7748K', '')])
    expect(classifyReviewTable(t, rules)).toEqual([])
  })

  it('空表返回空数组', () => {
    expect(classifyReviewTable(table(['对应尺寸'], []), rules)).toEqual([])
  })
})

describe('标红与分档筛选', () => {
  it('mismatch 标红, ok 不标', () => {
    expect(isFlagged('mismatch')).toBe(true)
    expect(isFlagged('ok')).toBe(false)
  })

  it('「所有对象」全收, 「尺寸不匹配」只收标红', () => {
    const kinds: ReviewKind[] = ['mismatch', 'ok']
    expect(kinds.filter((k) => matchesScope(k, 'all'))).toHaveLength(2)
    expect(kinds.filter((k) => matchesScope(k, 'mismatch'))).toEqual(['mismatch'])
  })

  it('ok 行在收窄档里不出现', () => {
    for (const s of REVIEW_SCOPES) {
      if (s.id === 'all') continue
      expect(matchesScope('ok', s.id)).toBe(false)
    }
  })

  it('分档按钮的顺序与文案固定 (UI 直接遍历它)', () => {
    expect(REVIEW_SCOPES.map((s) => s.id)).toEqual(['all', 'mismatch'])
    expect(REVIEW_SCOPES[0].label).toBe('所有对象')
    expect(REVIEW_SCOPES[1].label).toBe('尺寸不匹配')
  })
})
