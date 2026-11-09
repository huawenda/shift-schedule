/**
 * 映射表改动后的重算 —— 纯函数测试
 *
 * 验的是 P7 的核心验收标准：「映射改动后所有视图即时更新」。
 *
 * 这里不测 React（那是实机的事），而是测**派生链本身**：
 * 源数据 → 各视图的表，每一层都是纯函数，配置一变就该重算出新值。
 *
 * 关键：**四张表都是从源数据派生的，不是加载时算好存起来的。**
 * 存成 state 的话，改完映射界面上的「对应尺寸」列还是旧值，
 * 用户会以为保存没生效；导出的文件里也是旧值，拿去做尺寸核对
 * 会得出错误结论。
 */

import { describe, it, expect } from 'vitest'

import { createDefaultJigConfig } from '../core/config'
import { processSourceData, queryData } from '../core/query'
import { classifyReviewTable } from '../core/review'
import { computeReviewView } from '../core/reviewView'
import { rulesFromConfig } from '../core/validate'
import type { Row } from '../core/table'

const base = createDefaultJigConfig()

/**
 * 造几行带型号的源数据。
 *
 * **P/N 必须够长**：尺寸码从第 7 位起取 4 位（索引 6 起），
 * 长度不够会被判成「无法验证 → 视为匹配」，标红判定就不会有任何变化。
 * 真实 P/N 形如 `6072J-7748B`，这里用同长度的假串。
 */
const rows: Row[] = [
  { 'P/N': '6072J-7748B', 'Jig 对应型号': '184', 'Jig ID': 'J1', 工程名: 'PNP' },
  { 'P/N': '6073J-6555D', 'Jig 对应型号': '252', 'Jig ID': 'J2', 工程名: 'PNP' }
]

describe('映射改动后各视图重算', () => {
  it('审查表的「对应尺寸」跟着新映射走', () => {
    const before = processSourceData(rows, base)
    const beforeSize = before.rows[0]['对应尺寸']

    // 改映射：把 184 对应到另一个尺寸
    const after = processSourceData(rows, {
      ...base,
      jigSizeMapping: { ...base.jigSizeMapping, '184': '99/99' }
    })

    expect(beforeSize).not.toBe('99/99')
    expect(after.rows[0]['对应尺寸']).toBe('99/99')
  })

  it('查询结果表的「对应尺寸」跟着新映射走', () => {
    const before = queryData(rows, ['J1'], base)
    const after = queryData(rows, ['J1'], {
      ...base,
      jigSizeMapping: { ...base.jigSizeMapping, '184': '88/88' }
    })

    expect(before.rows[0]['对应尺寸']).not.toBe('88/88')
    expect(after.rows[0]['对应尺寸']).toBe('88/88')
  })

  it('标红结果跟着新映射走', () => {
    const rules = rulesFromConfig(base)

    // P/N `6072J-7748B` 提取出的尺寸码是 `7748`。
    // 默认映射里 184 → 65/55，对不上（不匹配）；
    // 把它改成 77/48，拆出的码就是 `7748`，对上了（匹配）。
    //
    // 注意尺寸写法是「宽/高」（如 77/48），不是 4 位数字 ——
    // parseSizeCodes 按组拆，每组去掉非数字后必须**恰好 4 位**才成码。
    const changed = { ...base.jigSizeMapping, '184': '77/48' }

    const beforeKinds = classifyReviewTable(processSourceData(rows, base), rules)
    const afterKinds = classifyReviewTable(
      processSourceData(rows, { ...base, jigSizeMapping: changed }),
      rules
    )

    // 第一行从「不匹配」变成「匹配」
    expect(beforeKinds[0]).toBe('mismatch')
    expect(afterKinds[0]).toBe('ok')
  })

  it('审查视图的两档计数跟着新映射走', () => {
    const rules = rulesFromConfig(base)
    const changed = { ...base.jigSizeMapping, '184': '77/48' }

    const before = computeReviewView(processSourceData(rows, base), 'all', rules)
    const after = computeReviewView(
      processSourceData(rows, { ...base, jigSizeMapping: changed }),
      'all',
      rules
    )

    expect(after.counts.mismatch).toBe(before.counts.mismatch - 1)
  })

  it('映射改动不影响与尺寸无关的列', () => {
    const before = processSourceData(rows, base)
    const after = processSourceData(rows, {
      ...base,
      jigSizeMapping: { ...base.jigSizeMapping, '184': '99/99' }
    })

    expect(after.rows[0]['P/N']).toBe(before.rows[0]['P/N'])
    expect(after.rows[0]['Jig 对应型号']).toBe(before.rows[0]['Jig 对应型号'])
  })
})
