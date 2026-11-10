/** 速查页的领域类型 —— 口径见 docs/lookup-plan.md */

export type Bezel = 'Normal' | 'Narrow' | 'V-Narrow'
export type Material = 'Stal' | 'Pro' | 'Stal-N' | 'Pro-N'
export type Maker = 'LGC' | 'INNOX'
export type LookupMode = 'model' | 'jig'

/** 贴在 JIG 上的膜：P 号为材料型号 */
export interface Fspm {
  id: string
  size: string
  maker: Maker
  material: Material
  bezel: Bezel
}

/**
 * 一组生产条件：原表的一对 Main + Sub。
 *
 * 同一组合内的型号完全等同；同一位置（main / sub）的 FSPM 互为通用项，可互换。
 */
export interface LookupGroup {
  /** 稳定 ID，如 7748G-01 */
  id: string
  /** 英寸组合，如 77/48 */
  inch: string
  jigPn: string
  recipe: string
  mainSize: string
  subSize: string
  mainBezel: Bezel
  subBezel: Bezel
  /** 组内等同的 GLS 型号 */
  models: string[]
  /** 主尺寸可用 FSPM（可互换） */
  mainFspm: string[]
  /** 副尺寸可用 FSPM（可互换） */
  subFspm: string[]
  /** 溯源，如 "Sheet2 行37-38" */
  source: string
}

/** hash 里保存的选择 */
export interface LookupSelection {
  mode: LookupMode
  key: string
}
