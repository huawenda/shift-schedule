/**
 * 导出平台层 —— 文件名处理。
 *
 * 只测纯函数部分（对话框与落盘要实机）。
 */

import { describe, it, expect } from 'vitest'

import { safeFileName, withTimestamp } from './jigExport'

describe('safeFileName', () => {
  it('去掉 Windows 的非法字符', () => {
    expect(safeFileName('全量透视:2026/10')).toBe('全量透视202610')
    expect(safeFileName('a*b?c"d<e>f|g')).toBe('abcdefg')
  })

  it('正常文件名原样返回', () => {
    expect(safeFileName('审查数据')).toBe('审查数据')
  })

  it('空串不变', () => {
    expect(safeFileName('')).toBe('')
  })
})

describe('withTimestamp', () => {
  it('在扩展名前插入时间戳', () => {
    const out = withTimestamp('审查数据.xlsx')
    expect(out).toMatch(/^审查数据_\d{8}-\d{4}\.xlsx$/)
  })

  it('没有扩展名时加在末尾', () => {
    const out = withTimestamp('审查数据')
    expect(out).toMatch(/^审查数据_\d{8}-\d{4}$/)
  })

  it('时间戳只含数字与连字符（Windows 文件名安全）', () => {
    const out = withTimestamp('a.xlsx')
    expect(out).not.toMatch(/[\\/:*?"<>|]/)
  })
})
