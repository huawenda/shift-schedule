/** 速查页的领域类型 —— 口径见 docs/lookup-plan.md */

export type Bezel = 'Normal' | 'Narrow' | 'V-Narrow'
export type Material = 'Stal' | 'Pro' | 'Stal-N' | 'Pro-N'
export type Maker = 'LGC' | 'INNOX'

/**
 * 速查页的完整视图状态。
 *
 * P1 先有 home / entity 两种；P2 的预设展示页会再加 `browse`。
 * hash 是唯一真相：这个状态由 `buildHash` / `parseLocation` 生成与还原，
 * 组件内部只保留输入框文字、浮层开合这类临时状态。
 */
/** 预设展示页的四个浏览维度；`group` 不单列，由组合卡进入 */
export type LookupDimension = 'inch' | 'model' | 'fspm' | 'jig'

export type LookupView =
  | { kind: 'home' }
  | { kind: 'browse'; dim: LookupDimension }
  | { kind: 'entity'; type: EntityType; key: string }

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

/**
 * 速查页的实体类型：command 搜索与关联结果都以它为单位。
 *
 * `group` 是内部实体 —— 展示页不单列维度，由组合卡、对比表行、
 * 关联组合列表点入；其余五类各有自己的展示维度与结果页。
 */
export type EntityType = 'inch' | 'model' | 'jig' | 'recipe' | 'fspm' | 'group'

/**
 * 一次查询的目标。
 *
 * `key` 保留用户看到 / 输入的原样写法（如 `77/48`、`310(10)`），
 * 查询索引时再归一化 —— 这样 hash、标题、结果页头部都不用做大小写回转。
 */
export interface EntityRef {
  type: EntityType
  key: string
}

/**
 * FSPM 的一次引用：哪个组合的哪个位置用到了它。
 *
 * `byFspm` 的元素，也是 FSPM 结果页「被引用位置」表的数据源。
 * 同一组合的 Main 与 Sub 各算一次；同一位置的多项按组合内顺序排列。
 */
export interface FspmRef {
  id: string
  groupId: string
  part: 'main' | 'sub'
}
