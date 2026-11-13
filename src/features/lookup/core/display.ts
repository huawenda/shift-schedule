import type { Bezel, EntityRef, EntityType, LookupDimension } from './types'

/** 实体类型在界面上的叫法；command 建议与结果页头部共用同一份文案 */
export const ENTITY_LABEL: Record<EntityType, string> = {
  inch: 'INCH',
  model: 'GLS 型号',
  jig: 'JIG P/N',
  recipe: 'Recipe',
  fspm: 'FSPM',
  group: '组合',
}

/** 预设展示页的维度名；总览卡片与浏览板标题共用 */
export const DIMENSION_LABEL: Record<LookupDimension, string> = {
  inch: '按 INCH',
  model: '按 GLS 型号',
  fspm: '按 FSPM',
  jig: '按 JIG / Recipe',
}

/**
 * 首页与空态共用的快速入口。
 *
 * 五个真实键覆盖五类实体，既能当示例，也能直接点进关联结果。
 * 放这里而不是各组件一份 —— 两处文案必须一致，改一处就够。
 */
export const QUICK_ENTRIES: readonly EntityRef[] = [
  { type: 'model', key: 'FY' },
  { type: 'jig', key: '7748G' },
  { type: 'recipe', key: '310(10)' },
  { type: 'inch', key: '77/48' },
  { type: 'fspm', key: 'P467' },
]

/** 现场缩写：表头和卡片里用 NOR / NAR / V-NAR，数据层仍保留全称 */
const BEZEL_LABEL: Record<Bezel, string> = {
  Normal: 'NOR',
  Narrow: 'NAR',
  'V-Narrow': 'V-NAR',
}

export function formatBezel(bezel: Bezel): string {
  return BEZEL_LABEL[bezel]
}
