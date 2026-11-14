import {
  compareMonth,
  currentMonthKey,
  monthKeyToString,
  parseMonthKey,
  type MonthKey
} from '@/data/period'
import type { SettingsTab } from '@/screens/SettingsScreen'
import type { EntityType, LookupDimension, LookupView } from './features/lookup/core/types'
import { jigTabFromSlug, jigTabToSlug, type JigTabId } from './features/jig/components/jigTabs'

/**
 * 应用内的完整位置：视图 + 结算月 + 设置页签 / JIG 子页，全部来自 hash。
 *
 * hash 格式（当前结算月省略月份前缀）：
 *   #/overview                #/2026-10/overview
 *   #/matrix                  #/2026-10/matrix
 *   #/settings/roster         #/2026-10/settings/profile
 *   #/settings/system
 *   #/jig/pivot
 *
 * 月份放在最前面而不是挂在某个视图上，是为了「切到设置再切回来」也保得住；
 * 当前月不写进 URL，默认地址保持干净，翻到别的月份才多出一段。
 *
 * **JIG 页不带月份**：JIG 数据来自 MES 导出的 Excel，与哪个月份无关，
 * 所以它的 hash 是 `#/jig/<子页>`，不套月份前缀。解析时若 hash 里带了月份
 * （手敲的 `#/2026-10/jig`），按「月份与 JIG 无关」处理 —— 忽略它，
 * 免得 JIG 页显示一个自己用不上的月份。
 */
export interface AppLocation {
  route: Route
  /** null = 当前结算月（URL 里省略） */
  month: MonthKey | null
  settingsTab: SettingsTab
  /** JIG 页当前子页；其余视图下无意义 */
  jigTab: JigTabId
  /** 速查页当前视图：首页引导 / 一个实体的关联结果 */
  lookupView: LookupView
}

/** 五个一级页面：全员矩阵看全组、月度概览看本人、JIG DATA 查 MES 导出、生产速查查 GLS/FSPM、设置改配置 */
export type Route = 'matrix' | 'overview' | 'jig' | 'lookup' | 'settings'

export const DEFAULT_LOCATION: AppLocation = {
  route: 'overview',
  month: null,
  settingsTab: 'roster',
  jigTab: 'detail',
  lookupView: { kind: 'home' },
}

/** 解析 hash；未知视图回落到概览，未知参数按「当前月 / 人员配置」处理 */
export function parseLocation(hash: string): AppLocation {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  let month: MonthKey | null = null

  const head = parseMonthKey(parts[0] ?? '')
  if (head) {
    month = head
    parts.shift()
  }

  const [view, param, third] = parts

  if (view === 'matrix' || view === 'overview') {
    // 兼容旧式 `#/matrix/2026-10`：月份写在视图后面
    const trailing = param ? parseMonthKey(param) : null
    return { ...DEFAULT_LOCATION, route: view, month: trailing ?? month }
  }

  if (view === 'settings') {
    return {
      ...DEFAULT_LOCATION,
      route: 'settings',
      month,
      // `#/settings/jig` = JIG DATA 页签；旧深链 profile 已并入人员配置，归一到 roster
      settingsTab: param === 'system' || param === 'jig' ? param : 'roster'
    }
  }

  if (view === 'jig') {
    // 月份与 JIG 无关：这里刻意不取 month
    return { ...DEFAULT_LOCATION, route: 'jig', jigTab: jigTabFromSlug(param) }
  }

  if (view === 'lookup') {
    // `#/lookup/browse/inch`：预设展示页
    if (param === 'browse') {
      const dim = dimensionOf(third ?? '')
      return {
        ...DEFAULT_LOCATION,
        route: 'lookup',
        lookupView: dim ? { kind: 'browse', dim } : { kind: 'home' },
      }
    }
    // `#/lookup/model/FY`、`#/lookup/inch/77%2F48`、`#/lookup/fspm/P467`；
    // 也兼容手敲的 `#/lookup/FY`（按型号处理）
    const type = param ? entityTypeOf(param) : null
    if (type) {
      const key = third ? safeDecode(third) : ''
      return {
        ...DEFAULT_LOCATION,
        route: 'lookup',
        lookupView: key ? { kind: 'entity', type, key } : { kind: 'home' },
      }
    }
    const key = param ? safeDecode(param) : ''
    return {
      ...DEFAULT_LOCATION,
      route: 'lookup',
      lookupView: key ? { kind: 'entity', type: 'model', key } : { kind: 'home' },
    }
  }

  return { ...DEFAULT_LOCATION, month }
}

/** `#/lookup/browse/<dim>` 的维度；认不出就回落到总览 */
function dimensionOf(value: string): LookupDimension | null {
  switch (value) {
    case 'inch':
    case 'model':
    case 'fspm':
    case 'jig':
      return value
    default:
      return null
  }
}

/** hash 第二段是否是实体类型；认不出就当作手敲的型号键 */
function entityTypeOf(value: string): EntityType | null {
  switch (value) {
    case 'inch':
    case 'model':
    case 'jig':
    case 'recipe':
    case 'fspm':
    case 'group':
      return value
    default:
      return null
  }
}

/** 手敲的 % 序列不合法时按原文保留，不让整个路由崩掉 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** 生成规范 hash：当前月省略月份；设置页总是带页签；JIG / 速查页不带月份 */
export function buildHash(location: AppLocation): string {
  if (location.route === 'jig') return `#/jig/${jigTabToSlug(location.jigTab)}`

  if (location.route === 'lookup') {
    const view = location.lookupView
    if (view.kind === 'browse') return `#/lookup/browse/${view.dim}`
    return view.kind === 'entity'
      ? `#/lookup/${view.type}/${encodeURIComponent(view.key)}`
      : '#/lookup'
  }

  const prefix = location.month && compareMonth(location.month, currentMonthKey()) !== 0
    ? `/${monthKeyToString(location.month)}`
    : ''

  if (location.route === 'settings') return `#${prefix}/settings/${location.settingsTab}`
  return `#${prefix}/${location.route}`
}

/**
 * 任务栏 / 原生标题栏：**只显示当前视图名**，不带软件名前缀。
 *
 * 与 index.html 的 `<title>`、tauri.conf.json 的窗口初始 title 保持同一套值，
 * 否则窗口创建那一帧是「月度概览」、React 挂载后又跳成「Workhorse · 月度概览」。
 * 原生标题栏左侧已有应用图标，任务栏悬停也显示产品名，再拼一遍应用名是重复。
 */
export const ROUTE_TITLE: Record<Route, string> = {
  overview: '月度概览',
  matrix: '全员矩阵',
  jig: 'JIG DATA',
  lookup: '生产速查',
  settings: '设置'
}
