import type { Bezel } from './types'

/** 现场缩写：表头和卡片里用 NOR / NAR / V-NAR，数据层仍保留全称 */
const BEZEL_LABEL: Record<Bezel, string> = {
  Normal: 'NOR',
  Narrow: 'NAR',
  'V-Narrow': 'V-NAR',
}

export function formatBezel(bezel: Bezel): string {
  return BEZEL_LABEL[bezel]
}
