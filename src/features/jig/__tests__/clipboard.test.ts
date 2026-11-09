/**
 * 剪贴板处理 —— 清洗规则测试
 *
 * 早期这里的用例集来自 Python 基线快照。基线移除后改成内联常量:
 * 数据本来就是 5 条真实粘贴样本, 放在这里比放在外部 JSON 更直白 ——
 * 改断言时不用跨文件跳转, 失败时也能直接看出是哪一条样本挂了。
 */

import { describe, it, expect } from 'vitest'
import {
  processClipboardContent,
  extractJigIds,
  isPureJigIds,
  prepareQueryIds,
} from '../core/clipboard'

/**
 * 真实使用中出现的粘贴形态 -> 期望的清洗结果。
 *
 * 注意第 1、3 条输出与输入完全相同: 纯净列表不做任何加工,
 * 连重复行都原样保留 —— 去重是查询阶段的事, 不在清洗阶段做。
 */
const PASTE_SAMPLES: ReadonlyArray<{ input: string; output: string; note: string }> = [
  {
    input: 'CJJ349000910\nCJJ349000919',
    output: 'CJJ349000910\nCJJ349000919',
    note: '纯净列表原样保留',
  },
  {
    input: '请查一下这些: CJJ349000910 和 C4M123456789, 谢谢',
    output: 'CJJ349000910\nC4M123456789',
    note: '从中文句子里抽出 ID, 每行一个',
  },
  {
    input: 'CJJ349000910\nCJJ349000910\nCJJ349000919',
    output: 'CJJ349000910\nCJJ349000910\nCJJ349000919',
    note: '纯净列表不去重',
  },
  {
    input: '这里没有任何ID',
    output: '这里没有任何ID',
    note: '抽不到 ID 时原样返回, 不返回空串',
  },
  {
    input: '',
    output: '',
    note: '空文本返回空',
  },
]

describe('剪贴板 —— 真实粘贴样本', () => {
  for (const sample of PASTE_SAMPLES) {
    it(sample.note, () => {
      expect(processClipboardContent(sample.input)).toBe(sample.output)
    })
  }
})

describe('剪贴板 —— 提取规则', () => {
  it('识别 CJ 格式 12 位', () => {
    expect(extractJigIds('id=CJJ349000910 end')).toEqual(['CJJ349000910'])
  })

  it('识别 C4M 格式 12 位', () => {
    expect(extractJigIds('id=C4M123456789 end')).toEqual(['C4M123456789'])
  })

  it('排除末两位为 00 的 CJ 号 (与 Lot ID 区分)', () => {
    expect(extractJigIds('CJJ349000000')).toEqual([])
  })

  it('不匹配紧邻字母数字的片段', () => {
    expect(extractJigIds('XCJJ349000910X')).toEqual([])
  })

  it('去重且保持顺序', () => {
    expect(extractJigIds('CJJ349000919 CJJ349000910 CJJ349000919')).toEqual([
      'CJJ349000919',
      'CJJ349000910',
    ])
  })

  it('中文语境可提取', () => {
    expect(extractJigIds('请查 CJJ349000910 谢谢')).toEqual(['CJJ349000910'])
  })
})

describe('剪贴板 —— 纯净列表判定', () => {
  it('每行一个且全部合法 -> true', () => {
    expect(isPureJigIds('CJJ349000910\nCJJ349000919')).toBe(true)
  })

  it('含非 ID 文本 -> false', () => {
    expect(isPureJigIds('CJJ349000910\nhello')).toBe(false)
  })

  it('空文本 -> false', () => {
    expect(isPureJigIds('')).toBe(false)
  })

  it('纯净列表不去重, 原样保留', () => {
    const dup = 'CJJ349000910\nCJJ349000910'
    expect(processClipboardContent(dup)).toBe(dup)
  })
})

describe('剪贴板 —— 归一化与边界', () => {
  it('小写 ID 也能提取, 输出统一大写', () => {
    expect(extractJigIds('cjj349000910')).toEqual(['CJJ349000910'])
  })

  it('全角字母数字按半角识别', () => {
    expect(extractJigIds('ＣＪＪ３４９０００９１０')).toEqual(['CJJ349000910'])
  })

  it('零宽字符夹在 ID 中间也能识别', () => {
    expect(extractJigIds('CJJ349\u200B000910')).toEqual(['CJJ349000910'])
  })

  it('下划线 / 连字符紧邻时不截取', () => {
    expect(extractJigIds('X_CJJ349000910')).toEqual([])
    expect(extractJigIds('ABC-CJJ349000910')).toEqual([])
  })

  it('CRLF 列表仍判定为纯净列表', () => {
    expect(isPureJigIds('CJJ349000910\r\nCJJ349000919')).toBe(true)
  })

  it('制表符分隔的混合文本可提取', () => {
    expect(extractJigIds('CJJ349000910\tC4M123456789')).toEqual([
      'CJJ349000910',
      'C4M123456789',
    ])
  })
})

describe('prepareQueryIds', () => {
  it('去重、丢弃无效行并计数', () => {
    const out = prepareQueryIds([
      'CJJ349000910',
      'cjj349000910',
      'hello',
      'CJJ349000919',
      '',
      '  ',
    ])
    expect(out.ids).toEqual(['CJJ349000910', 'CJJ349000919'])
    expect(out.ignored).toBe(1)
  })

  it('全角 / 带空格的行归一化后保留', () => {
    expect(prepareQueryIds([' ＣＪＪ３４９０００９１０ '])).toEqual({
      ids: ['CJJ349000910'],
      ignored: 0,
    })
  })
})