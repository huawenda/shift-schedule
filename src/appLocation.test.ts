/**
 * 路由解析 —— 单元测试
 *
 * hash 是应用内的唯一真相，解析错了会表现为「刷新后跳到别的页」「月份丢了」
 * 这类很难从界面上看出原因的问题。这里把四条规则钉住：
 *   1. 排班三页的月份前缀照旧（当前月省略，翻别的月才带）；
 *   2. **JIG 页不带月份** —— 它与结算月无关；
 *   3. JIG 的子页认得四个 slug，认不出回落「查询结果」；
 *   4. 未知视图回落到概览，未知参数按默认值处理。
 */

import { describe, it, expect } from 'vitest'

import { buildHash, DEFAULT_LOCATION, parseLocation, ROUTE_TITLE } from './appLocation'
import { monthKeyToString, type MonthKey } from './data/period'
import { jigTabFromSlug, jigTabToSlug } from './features/jig/components/jigTabs'

describe('路由解析：排班三页', () => {
  it('无 hash 时回落到概览 / 当前月 / 人员配置', () => {
    const loc = parseLocation('')
    expect(loc.route).toBe('overview')
    expect(loc.month).toBe(null)
    expect(loc.settingsTab).toBe('roster')
  })

  it('裸视图名解析出该视图', () => {
    expect(parseLocation('#/matrix').route).toBe('matrix')
    expect(parseLocation('#/overview').route).toBe('overview')
    expect(parseLocation('#/settings/roster').route).toBe('settings')
  })

  it('月份前缀被认出来', () => {
    const loc = parseLocation('#/2026-10/overview')
    expect(loc.route).toBe('overview')
    expect(loc.month).toEqual({ year: 2026, month: 10 })
  })

  it('兼容旧式「月份写在视图后面」', () => {
    const loc = parseLocation('#/matrix/2026-10')
    expect(loc.route).toBe('matrix')
    expect(loc.month).toEqual({ year: 2026, month: 10 })
  })

  it('设置页的三个页签', () => {
    expect(parseLocation('#/settings/roster').settingsTab).toBe('roster')
    expect(parseLocation('#/settings/system').settingsTab).toBe('system')
    expect(parseLocation('#/settings/jig').settingsTab).toBe('jig')
  })

  it('旧深链 #/settings/profile 归一到人员配置', () => {
    expect(parseLocation('#/settings/profile').settingsTab).toBe('roster')
  })

  it('未知的设置页签回落到人员配置', () => {
    expect(parseLocation('#/settings/xxx').settingsTab).toBe('roster')
  })

  it('未知视图回落到概览', () => {
    expect(parseLocation('#/foo').route).toBe('overview')
  })
})

describe('路由解析：JIG 页不参与结算月', () => {
  it('子页 slug 认得四个', () => {
    expect(parseLocation('#/jig/detail').jigTab).toBe('detail')
    expect(parseLocation('#/jig/query-pivot').jigTab).toBe('queryPivot')
    expect(parseLocation('#/jig/pivot').jigTab).toBe('pivot')
    expect(parseLocation('#/jig/review').jigTab).toBe('review')
  })

  it('不带子页时是「查询结果」', () => {
    expect(parseLocation('#/jig').jigTab).toBe('detail')
  })

  it('认不出的子页回落到「查询结果」', () => {
    expect(parseLocation('#/jig/xxx').jigTab).toBe('detail')
  })

  it('**月份被忽略** —— JIG 与结算月无关', () => {
    const loc = parseLocation('#/2026-10/jig/pivot')
    expect(loc.route).toBe('jig')
    expect(loc.jigTab).toBe('pivot')
    // 月份不保留：JIG 页显示一个自己用不上的月份只会误导
    expect(loc.month).toBe(null)
  })

  it('slug 与子页 id 双向对应', () => {
    for (const tab of ['detail', 'queryPivot', 'pivot', 'review'] as const) {
      expect(jigTabFromSlug(jigTabToSlug(tab))).toBe(tab)
    }
  })
})

describe('路由生成', () => {
  it('当前月省略月份前缀', () => {
    // 当月是 currentMonthKey()，所以这里用 null 表示「当前月」
    expect(buildHash({ ...DEFAULT_LOCATION, route: 'overview' })).toBe('#/overview')
  })

  it('别的月份带前缀', () => {
    expect(buildHash({ ...DEFAULT_LOCATION, route: 'overview', month: { year: 2026, month: 10 } }))
      .toBe('#/2026-10/overview')
  })

  it('设置页总是带页签', () => {
    expect(buildHash({ ...DEFAULT_LOCATION, route: 'settings', settingsTab: 'system' }))
      .toBe('#/settings/system')
  })

  it('**JIG 页不带月份前缀**，哪怕 location 上有月份', () => {
    expect(buildHash({ ...DEFAULT_LOCATION, route: 'jig', jigTab: 'pivot' }))
      .toBe('#/jig/pivot')
    expect(buildHash({
      ...DEFAULT_LOCATION,
      route: 'jig',
      jigTab: 'review',
      month: { year: 2026, month: 10 }
    })).toBe('#/jig/review')
  })
})

describe('路由：速查页', () => {
  it('首页（空态）', () => {
    const loc = parseLocation('#/lookup')
    expect(loc.route).toBe('lookup')
    expect(loc.lookupView).toEqual({ kind: 'home' })
    expect(loc.month).toBe(null)
  })

  it('型号深链', () => {
    expect(parseLocation('#/lookup/model/FY').lookupView)
      .toEqual({ kind: 'entity', type: 'model', key: 'FY' })
  })

  it('JIG 深链', () => {
    expect(parseLocation('#/lookup/jig/7748G').lookupView)
      .toEqual({ kind: 'entity', type: 'jig', key: '7748G' })
  })

  it('旧 Recipe 深链仍按 jig 解析，括号编码还原', () => {
    expect(parseLocation('#/lookup/jig/31%2810%29').lookupView)
      .toEqual({ kind: 'entity', type: 'jig', key: '31(10)' })
  })

  it('英寸 / FSPM / 组合 / Recipe 四类新深链', () => {
    expect(parseLocation('#/lookup/inch/77%2F48').lookupView)
      .toEqual({ kind: 'entity', type: 'inch', key: '77/48' })
    expect(parseLocation('#/lookup/fspm/P467').lookupView)
      .toEqual({ kind: 'entity', type: 'fspm', key: 'P467' })
    expect(parseLocation('#/lookup/group/7748G-01').lookupView)
      .toEqual({ kind: 'entity', type: 'group', key: '7748G-01' })
    expect(parseLocation('#/lookup/recipe/31(10)').lookupView)
      .toEqual({ kind: 'entity', type: 'recipe', key: '31(10)' })
  })

  it('四个展示维度', () => {
    for (const dim of ['inch', 'model', 'fspm', 'jig'] as const) {
      expect(parseLocation(`#/lookup/browse/${dim}`).lookupView)
        .toEqual({ kind: 'browse', dim })
    }
  })

  it('认不出的维度 / 缺维度都回落到首页', () => {
    expect(parseLocation('#/lookup/browse/xxx').lookupView).toEqual({ kind: 'home' })
    expect(parseLocation('#/lookup/browse').lookupView).toEqual({ kind: 'home' })
  })

  it('生成：展示页', () => {
    expect(buildHash({
      ...DEFAULT_LOCATION,
      route: 'lookup',
      lookupView: { kind: 'browse', dim: 'fspm' },
    })).toBe('#/lookup/browse/fspm')
  })

  it('带类型但缺 key 时回落到首页', () => {
    expect(parseLocation('#/lookup/model').lookupView).toEqual({ kind: 'home' })
  })

  it('兼容手敲的 `#/lookup/FY`', () => {
    expect(parseLocation('#/lookup/FY').lookupView)
      .toEqual({ kind: 'entity', type: 'model', key: 'FY' })
  })

  it('**月份被忽略** —— 速查与结算月无关', () => {
    const loc = parseLocation('#/2026-10/lookup/model/FY')
    expect(loc.route).toBe('lookup')
    expect(loc.lookupView).toEqual({ kind: 'entity', type: 'model', key: 'FY' })
    expect(loc.month).toBe(null)
  })

  it('生成：首页 / 型号 / 英寸 / Recipe 括号', () => {
    expect(buildHash({ ...DEFAULT_LOCATION, route: 'lookup' })).toBe('#/lookup')
    expect(buildHash({
      ...DEFAULT_LOCATION,
      route: 'lookup',
      lookupView: { kind: 'entity', type: 'model', key: 'FY' },
    })).toBe('#/lookup/model/FY')
    expect(buildHash({
      ...DEFAULT_LOCATION,
      route: 'lookup',
      lookupView: { kind: 'entity', type: 'inch', key: '77/48' },
    })).toBe('#/lookup/inch/77%2F48')
    expect(buildHash({
      ...DEFAULT_LOCATION,
      route: 'lookup',
      lookupView: { kind: 'entity', type: 'recipe', key: '31(10)' },
    })).toBe('#/lookup/recipe/31(10)')
  })
})

describe('路由：解析与生成互为逆运算', () => {
  const cases = [
    { route: 'overview' as const, month: null, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'home' } as const },
    { route: 'matrix' as const, month: null, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'home' } as const },
    { route: 'matrix' as const, month: { year: 2026, month: 10 } as MonthKey, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'home' } as const },
    { route: 'settings' as const, month: null, settingsTab: 'system' as const, jigTab: 'detail' as const, lookupView: { kind: 'home' } as const },
    { route: 'settings' as const, month: null, settingsTab: 'jig' as const, jigTab: 'detail' as const, lookupView: { kind: 'home' } as const },
    { route: 'settings' as const, month: null, settingsTab: 'system' as const, jigTab: 'detail' as const, lookupView: { kind: 'home' } as const },
    { route: 'settings' as const, month: null, settingsTab: 'jig' as const, jigTab: 'detail' as const, lookupView: { kind: 'home' } as const },
    { route: 'jig' as const, month: null, settingsTab: 'roster' as const, jigTab: 'queryPivot' as const, lookupView: { kind: 'home' } as const },
    { route: 'jig' as const, month: null, settingsTab: 'roster' as const, jigTab: 'review' as const, lookupView: { kind: 'home' } as const },
    { route: 'lookup' as const, month: null, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'home' } as const },
    { route: 'lookup' as const, month: null, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'browse', dim: 'inch' } as const },
    { route: 'lookup' as const, month: null, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'browse', dim: 'fspm' } as const },
    { route: 'lookup' as const, month: null, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'entity', type: 'model', key: 'FY' } as const },
    { route: 'lookup' as const, month: null, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'entity', type: 'jig', key: '31(10)' } as const },
    { route: 'lookup' as const, month: null, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'entity', type: 'inch', key: '77/48' } as const },
    { route: 'lookup' as const, month: null, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'entity', type: 'fspm', key: 'P467' } as const },
    { route: 'lookup' as const, month: null, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'entity', type: 'group', key: '7748G-01' } as const },
    { route: 'lookup' as const, month: null, settingsTab: 'roster' as const, jigTab: 'detail' as const, lookupView: { kind: 'entity', type: 'recipe', key: '31(10)' } as const }
  ]

  for (const loc of cases) {
    const suffix =
      loc.lookupView.kind === 'entity'
        ? '/' + loc.lookupView.key
        : loc.lookupView.kind === 'browse'
          ? '/browse/' + loc.lookupView.dim
          : ''
    it(`${loc.route}${loc.month ? '/' + loc.month : ''}${suffix} 往返一致`, () => {
      const parsed = parseLocation(buildHash(loc))
      expect(parsed.route).toBe(loc.route)
      expect(parsed.settingsTab).toBe(loc.settingsTab)
      expect(parsed.jigTab).toBe(loc.jigTab)
      expect(parsed.lookupView).toEqual(loc.lookupView)
      // JIG / 速查页不保留月份；其余页面保留
      expect(parsed.month).toEqual(
        loc.route === 'jig' || loc.route === 'lookup' ? null : loc.month,
      )
    })
  }
})

describe('窗口标题', () => {
  it('五个视图各有一个标题，且不带软件名前缀', () => {
    expect(ROUTE_TITLE.overview).toBe('月度概览')
    expect(ROUTE_TITLE.matrix).toBe('全员矩阵')
    expect(ROUTE_TITLE.jig).toBe('JIG DATA')
    expect(ROUTE_TITLE.lookup).toBe('生产速查')
    expect(ROUTE_TITLE.settings).toBe('设置')
    for (const title of Object.values(ROUTE_TITLE)) {
      expect(title).not.toContain('·')
    }
  })
})
