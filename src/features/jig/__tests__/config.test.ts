/**
 * 配置合并 —— 单元测试
 *
 * 覆盖三件事：
 *   1. 键名 snake_case（旧版 Python）vs camelCase（新版）不兼容会导致
 *      合并全程匹配不上、配置读取等于空转；
 *   2. 工序表必须取并集 —— 整体替换会让后来新增的默认工序对老用户永远不生效
 *      （取 order 退回 999，静默排到最后面，不报错只是位置不对）；
 *   3. 尺寸串里的裸 "65" 必须归一化 —— 严格 4 位比较下拼不出规格码，
 *      那一组会被整组丢弃，导致本该匹配的 P/N 被误判为不匹配（标红）。
 *
 * 配置已拆成两摊：业务配置（JigConfig，进备份）与本机偏好（JigPrefs，进 localStorage）。
 */

import { describe, it, expect } from 'vitest'
import {
  createDefaultJigConfig,
  createDefaultJigPrefs,
  mergeJigConfig,
  mergeJigPrefs
} from '../core/config'
import { rulesFromConfig, validateSizeMatch } from '../core/validate'

describe('配置合并：旧版 snake_case 键名', () => {
  /** 真实的旧版 config.json 结构节选（来自用户机器） */
  const legacyConfig = {
    window_title: 'JIG Data Finder',
    window_size: [1200, 700],
    table_default_row_height: 26,
    default_file_dialog_path: 'D:\\MES',
    default_export_path: 'D:\\Out',
    clipboard_auto_process_enabled: false,
    export_timestamp_enabled: false,
    close_to_tray: false,
    size_validation_enabled: true,
    jig_size_mapping: { '999': '88' },
    engineering_config: { PNP: { order: 10 } }
  }

  it('读取旧版 snake_case 的布尔开关（业务侧）', () => {
    const c = mergeJigConfig(legacyConfig)
    expect(c.sizeValidationEnabled).toBe(true)
  })

  it('读取旧版 snake_case 的布尔开关（本机偏好侧）', () => {
    const p = mergeJigPrefs(legacyConfig)
    expect(p.clipboardAutoProcessEnabled).toBe(false)
    expect(p.exportTimestampEnabled).toBe(false)
  })

  it('读取旧版 snake_case 的路径（本机偏好侧）', () => {
    const p = mergeJigPrefs(legacyConfig)
    expect(p.sourceDir).toBe('D:\\MES')
    expect(p.exportDir).toBe('D:\\Out')
  })

  it('读取旧版 snake_case 的行高（本机偏好侧）', () => {
    expect(mergeJigPrefs(legacyConfig).rowHeight).toBe(26)
  })

  it('读取旧版嵌套字典', () => {
    const c = mergeJigConfig(legacyConfig)
    expect(c.jigSizeMapping['999']).toBe('88')
    expect(c.engineeringConfig.PNP.order).toBe(10)
  })

  // 回归：engineering_config 曾被整体替换，导致后来新增的默认工序
  // 对老用户永远不生效 —— 磁盘上的旧表整个盖掉默认值，该工序不在
  // 用户配置里，取 order 退回 999，静默排到最后面。
  it('工序表取并集：磁盘上的旧表不会抹掉新增的默认工序', () => {
    const stored = {
      engineering_config: {
        PNP: { order: 10 },
        'Jig 洗净及检查': { order: 20 },
        'Jig Loading': { order: 30 }
      }
    }
    const c = mergeJigConfig(stored)
    expect(c.engineeringConfig['PNP 2nd']).toBeDefined()
    expect(c.engineeringConfig['Jig入库']).toBeDefined()
    expect(Object.keys(c.engineeringConfig).length).toBe(11)
  })

  it('工序表并集时磁盘上的 order 优先，用户改过的不被默认值覆盖', () => {
    const c = mergeJigConfig({ engineering_config: { PNP: { order: 99 } } })
    expect(c.engineeringConfig.PNP.order).toBe(99)
  })

  it('工序名重复不会互相污染，新增工序的 order 落在 PNP 与洗净检查之间', () => {
    const c = createDefaultJigConfig()
    expect(c.engineeringConfig['PNP 2nd'].order).toBeGreaterThan(
      c.engineeringConfig.PNP.order
    )
    expect(c.engineeringConfig['PNP 2nd'].order).toBeLessThan(
      c.engineeringConfig['Jig 洗净及检查'].order
    )
  })

  it('旧版缺失的字段回落到默认值', () => {
    const c = mergeJigConfig(legacyConfig)
    const d = createDefaultJigConfig()
    expect(c.allSizeValue).toBe(d.allSizeValue)
    expect(c.keywordTotal).toBe(d.keywordTotal)
  })

  it('camelCase 键同样被接受（新版自己写的配置）', () => {
    const p = mergeJigPrefs({
      rowHeight: 22,
      exportDir: 'E:\\X'
    })
    expect(p.rowHeight).toBe(22)
    expect(p.exportDir).toBe('E:\\X')
  })

  it('camelCase 优先于 snake_case（新写法胜出）', () => {
    const p = mergeJigPrefs({
      rowHeight: 22,
      row_height: 28
    })
    expect(p.rowHeight).toBe(22)
  })
})

describe('配置合并：容错', () => {
  it('null / undefined 回落默认值', () => {
    const d = createDefaultJigConfig()
    expect(mergeJigConfig(null).keywordTotal).toBe(d.keywordTotal)
    expect(mergeJigConfig(undefined).allSizeValue).toBe(d.allSizeValue)
  })

  it('空对象回落默认值', () => {
    expect(mergeJigConfig({}).keywordTotal).toBe('总计')
    expect(mergeJigPrefs({}).rowHeight).toBe(createDefaultJigPrefs().rowHeight)
  })

  it('类型不匹配的字段被忽略', () => {
    // 行高写成字符串，应被丢弃
    const p = mergeJigPrefs({ row_height: 'abc' })
    expect(p.rowHeight).toBe(createDefaultJigPrefs().rowHeight)
  })

  it('null 字段被忽略而非覆盖', () => {
    expect(mergeJigPrefs({ exportDir: null }).exportDir).toBe('')
  })

  it('未知字段被忽略，不污染配置对象', () => {
    const c = mergeJigConfig({ 完全不存在的字段: 'x', sizeValidationEnabled: true })
    expect(c.sizeValidationEnabled).toBe(true)
    expect('完全不存在的字段' in c).toBe(false)
  })
})

describe('尺寸串升级兼容 —— 裸 "65" 归一化', () => {
  /*
   * 匹配算法改为严格 4 位全等比较后，裸 "65" 拼不出 4 位规格码，
   * 那一组会被整组丢弃，导致本该匹配的 P/N 被误判为不匹配（标红）。
   *
   * 存量用户的配置里就是裸 "65"，必须在加载时自动展开，
   * 否则升级后他们的表会突然多出一堆标红。
   */

  it('整串就是裸 65 时展开为 65/55', () => {
    const c = mergeJigConfig({ jig_size_mapping: { '184': '65' } })
    expect(c.jigSizeMapping['184']).toBe('65/55')
  })

  it('裸 65 作为互斥组时也展开，其余组保持原样', () => {
    const c = mergeJigConfig({ jig_size_mapping: { '252': '65_77/27_77/42_77/48_83/48' } })
    expect(c.jigSizeMapping['252']).toBe('65/55_77/27_77/42_77/48_83/48')
  })

  it('已经是 65/55 的不动', () => {
    const c = mergeJigConfig({ jig_size_mapping: { '184': '65/55' } })
    expect(c.jigSizeMapping['184']).toBe('65/55')
  })

  it('其它形态的 65 不动 —— 那是用户自己的意思', () => {
    // "65/48" 是另一个规格，"6548" 也不是裸 65
    const c = mergeJigConfig({
      jig_size_mapping: { A: '65/48', B: '6548', C: '65/55' }
    })
    expect(c.jigSizeMapping['A']).toBe('65/48')
    expect(c.jigSizeMapping['B']).toBe('6548')
    expect(c.jigSizeMapping['C']).toBe('65/55')
  })

  it('多个裸 65 组都会被展开', () => {
    // 每组独立判断，不能只处理第一组
    const c = mergeJigConfig({ jig_size_mapping: { D: '65_65' } })
    expect(c.jigSizeMapping['D']).toBe('65/55_65/55')
  })

  it('归一化后 65/55 玻璃能正确匹配', () => {
    const c = mergeJigConfig({ jig_size_mapping: { '252': '65_77/27_77/42_77/48_83/48' } })
    const rules = rulesFromConfig(c)
    // 6555 = 65宽55高，252 明确能做 65/55 -> 不该标红
    expect(validateSizeMatch('6073J-6555F', c.jigSizeMapping['252'], rules)).toBe(true)
  })
})

describe('配置拆分：业务与本机偏好的边界', () => {
  it('业务配置里没有任何本机偏好字段', () => {
    const keys = Object.keys(createDefaultJigConfig())
    expect(keys).not.toContain('sourceDir')
    expect(keys).not.toContain('exportDir')
    expect(keys).not.toContain('rowHeight')
    expect(keys).not.toContain('clipboardAutoProcessEnabled')
    expect(keys).not.toContain('exportTimestampEnabled')
  })

  it('本机偏好里没有任何业务字段', () => {
    const keys = Object.keys(createDefaultJigPrefs())
    expect(keys).not.toContain('jigSizeMapping')
    expect(keys).not.toContain('engineeringConfig')
    expect(keys).not.toContain('outputColumns')
    expect(keys).not.toContain('sizeValidationEnabled')
  })

  it('本项目自己的外壳字段（窗口 / 托盘 / 主题）都不在配置里', () => {
    const all = [...Object.keys(createDefaultJigConfig()), ...Object.keys(createDefaultJigPrefs())]
    for (const key of [
      'windowTitle',
      'windowSize',
      'trayEnabled',
      'closeToTray',
      'theme',
      'gapSize',
      'headerHeight'
    ]) {
      expect(all).not.toContain(key)
    }
  })
})
