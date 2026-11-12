import type { Bezel, EntityType } from './types'

/** 实体类型在界面上的叫法；command 建议与结果页头部共用同一份文案 */
export const ENTITY_LABEL: Record<EntityType, string> = {
  inch: 'INCH',
  model: 'GLS 型号',
  jig: 'JIG P/N',
  recipe: 'Recipe',
  fspm: 'FSPM',
  group: '组合',
}

/** 现场缩写：表头和卡片里用 NOR / NAR / V-NAR，数据层仍保留全称 */
const BEZEL_LABEL: Record<Bezel, string> = {
  Normal: 'NOR',
  Narrow: 'NAR',
  'V-Narrow': 'V-NAR',
}

export function formatBezel(bezel: Bezel): string {
  return BEZEL_LABEL[bezel]
}
