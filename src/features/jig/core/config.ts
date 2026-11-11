/**
 * JIG 配置 —— 分成两摊，这是移植时唯一需要动刀的业务文件。
 *
 * 原项目把三类东西塞在一个 `AppConfig` 里：
 *   1. **业务配置**（型号→尺寸映射、工序顺序、列序、校验参数）—— 现场口径，
 *      换台电脑也要带走，所以进备份文件；
 *   2. **本机偏好**（目录、行高、粘贴开关）—— 属于「这台电脑」，跟备份走不合适；
 *   3. **原应用自己的东西**（窗口尺寸、托盘、主题）—— 本项目全都有自己的一套，
 *      搬过来只会打架，直接不搬。
 *
 * 所以这里定义两个接口：`JigConfig`（业务）与 `JigPrefs`（本机偏好）。
 * core 里的算法只认 `JigConfig` —— 那些字段全是业务性的，机器偏好不该渗进算法。
 *
 * 业务事实以 `docs/domain-rules.md`（原项目）为准：工序 order 值 10..100 必须与
 * Python 版完全一致，否则透视表列序不同。
 */

/**
 * 业务配置：进备份文件，换机器也带走。
 *
 * 这些字段定义的是「车间现场的口径」，不是界面偏好：改了映射表就改了判定结果，
 * 改了工序顺序就改了透视表的列序。所以它们是数据，不是设置。
 */
export interface JigConfig {
  /** 输出的列序；「对应尺寸」会被动态插在「Jig 对应型号」之后 */
  outputColumns: string[]
  /** 排序用的列 */
  sortColumns: string[]
  /** 其中按数值比较的列（其余按字符串比） */
  numericSortColumns: string[]

  /** 透视表排除的 P/N 与工程名黑名单 */
  pivotExcludePns: string[]
  pivotExcludeNames: string[]
  /** 透视表的计数依据列 */
  pivotValueCol: string
  /** 透视表的工序列（列头就是工序名） */
  pivotColumnKey: string
  /** 「生产中」判定用的工序代号 */
  productionIndicatorCode: string
  /** 工序表：11 道工序及其顺序。order 决定透视表的列序 */
  engineeringConfig: Record<string, { order: number }>

  /** JIG 型号 → 对应尺寸串 */
  jigSizeMapping: Record<string, string>
  /**
   * 映射表的面板排列顺序（型号列表）。
   *
   * 为什么要单列一个字段：jigSizeMapping 是 Record<string, string>，而
   * JS 对象对「数组索引样式的键」按数值升序排在所有字符串键之前 ——
   * 无论怎么插入，'184' '252' '262' 这些纯数字型号永远排在 '420A' '502N' 前面。
   * 面板里调整的顺序存不进去，重开就没了。所以顺序单独存一份。
   */
  jigSizeMappingOrder: string[]

  /** JIG 状态列名与「在产」取值（数据审查只留这一档） */
  jigStatusColumn: string
  jigStatusActiveValue: string

  /** 总计列的表头文字 */
  keywordTotal: string

  /** P/N 里尺寸码的起始位与长度（默认第 7–10 位，即索引 6 起 4 位） */
  pnExtractStart: number
  pnExtractLength: number
  /** 特殊映射：某些尺寸码对应的等价写法 */
  sizeSpecialMappings: Record<string, string>
  /** 「All Size」的字面值，恒匹配 */
  allSizeValue: string
}

/**
 * 本机偏好：进 localStorage，不进备份文件。
 *
 * 与本项目既有的 theme / backupDir 同一档 ——
 * 换台电脑时按新机器的情况重新设更合适，把旧机器的路径搬过去反而指到不存在的目录。
 */
export interface JigPrefs {
  /** 源 Excel 的默认目录 */
  sourceDir: string
  /** 导出文件的默认目录 */
  exportDir: string
  /** 表格行高（px） */
  rowHeight: number
  /** 粘贴时自动从混合文本里挑出 JIG ID */
  clipboardAutoProcessEnabled: boolean
  /** 导出文件名加时间戳 */
  exportTimestampEnabled: boolean
}

/** 对应 Python config.py __post_init__ 的默认值 */
export function createDefaultJigConfig(): JigConfig {
  return {
    outputColumns: [
      'P/N',
      'Lot ID',
      'CST ID',
      'Slot No',
      'Jig ID',
      '工程名',
      'Glass判定',
      'Jig 对应型号',
    ],
    sortColumns: ['P/N', 'Lot ID', 'CST ID', 'Slot No'],
    numericSortColumns: ['Slot No'],

    pivotExcludePns: [],
    pivotExcludeNames: [],
    pivotValueCol: 'Jig ID',
    pivotColumnKey: '工程名',
    productionIndicatorCode: '50000',
    engineeringConfig: {
      PNP: { order: 10 },
      'PNP 2nd': { order: 15 },
      'Jig 洗净及检查': { order: 20 },
      'Jig Loading': { order: 30 },
      'Jig Unloading': { order: 40 },
      'Jig N判定 另外移载': { order: 50 },
      'Jig 分离': { order: 60 },
      目视Stage: { order: 70 },
      'Jig 搬出待机': { order: 80 },
      Jig搬出: { order: 90 },
      Jig入库: { order: 100 },
    },

    jigSizeMapping: {
      '184': '65/55',
      '420A': '65/55',
      '420B': '65/55',
      '477': '65/55',
      '502': '65/55',
      '502A': '65/55',
      '430': '65/55_77/48_83/48',
      '502N': '65/55_77/48_83/48',
      '508': '77/48_83/48',
      '509': '77/48_83/48',
      '508N': '77/27_77/42_77/48_83/48',
      '509N': '77/27_77/42_77/48_83/48',
      '252': '65/55_77/27_77/42_77/48_83/48',
      '252A': '39/31_77/27_77/42_77/48_83/48',
      '256': 'All Size',
      '262': 'All Size',
    },

    // 与上面的 jigSizeMapping 一一对应。纯数字型号排在前面是 JS 对象的
    // 固有行为，恰好与这里手写的顺序一致，面板初次打开不会跳位。
    jigSizeMappingOrder: [
      '184',
      '420A',
      '420B',
      '477',
      '502',
      '502A',
      '430',
      '502N',
      '508',
      '509',
      '508N',
      '509N',
      '252',
      '252A',
      '256',
      '262',
    ],

    jigStatusColumn: 'Jig状态',
    jigStatusActiveValue: 'INPRODUCTION',

    keywordTotal: '总计',

    pnExtractStart: 6,
    pnExtractLength: 4,
    sizeSpecialMappings: { '65': '65/55' },
    allSizeValue: 'All Size',
  }
}

export function createDefaultJigPrefs(): JigPrefs {
  return {
    sourceDir: '',
    exportDir: '',
    rowHeight: 30,
    clipboardAutoProcessEnabled: true,
    exportTimestampEnabled: true
  }
}

/**
 * 把磁盘上的配置合并到默认业务配置上，只接受已知字段。
 *
 * 键名同时认 camelCase 与 snake_case：原项目最早是 Python 版，写的是
 * `table_default_row_height` 那种下划线名，后来 TS 版改成驼峰。不做键名转换的话，
 * 用户从旧版升上来时每个字段都匹配不上，配置读取等于空转 —— 设置全丢。
 * 驼峰优先。
 */
export function mergeJigConfig(
  stored: Record<string, unknown> | null | undefined
): JigConfig {
  const base = createDefaultJigConfig()
  if (!stored || typeof stored !== 'object') return base

  for (const key of Object.keys(base) as (keyof JigConfig)[]) {
    // 先按原样取，再按 snake_case 取（兼容旧版 Python 写出的配置）
    const direct = stored[key]
    const snake = stored[toSnakeCase(key)]
    const v = direct !== undefined && direct !== null ? direct : snake

    if (v === undefined || v === null) continue
    // 类型不匹配时保留默认值，避免损坏的配置拖垮应用
    if (Array.isArray(base[key]) !== Array.isArray(v)) continue
    if (typeof base[key] !== typeof v) continue

    /*
     * 工序表要并集，不能整体替换。
     *
     * 用户磁盘上的配置里存着一份完整的 engineering_config，它会整个盖掉默认值 ——
     * 于是以后再往默认值里加新工序（比如 "PNP 2nd"），老用户永远看不到：
     * 该工序不在他的配置里，取 order 时退回 999，静默排到最后面。
     * 不报错、不提示，只是位置不对，极难察觉。
     *
     * 工序表没有用户可编辑的入口（能改的只有型号尺寸映射），所以
     * 不存在「用户故意删掉某道工序」的情况，并集是安全的。默认顺序
     * 打底，磁盘值优先 —— 改过 order 的用户不受影响。
     */
    if (key === 'engineeringConfig' && isPlainObject(v) && isPlainObject(base[key])) {
      const merged: Record<string, { order: number }> = {
        ...(base[key] as Record<string, { order: number }>),
      }
      for (const [stage, cfgv] of Object.entries(v as Record<string, unknown>)) {
        const oc = (cfgv as { order?: unknown } | null)?.order
        if (typeof oc === 'number' && Number.isFinite(oc)) merged[stage] = { order: oc }
      }
      ;(base as unknown as Record<string, unknown>)[key] = merged
      continue
    }

    ;(base as unknown as Record<string, unknown>)[key] = v
  }

  /*
   * 排列顺序要对齐映射表的实际内容，否则面板打开就是空的或多出幽灵行：
   *   - 映射里有、顺序里没有的型号 -> 追加到末尾（旧配置没这个字段）；
   *   - 顺序里有、映射里没有的型号 -> 丢弃（用户删过规则）；
   *   - 重复的顺序项 -> 只留第一次。
   */
  const seen = new Set<string>()
  const order: string[] = []
  for (const m of base.jigSizeMappingOrder) {
    if (m in base.jigSizeMapping && !seen.has(m)) {
      order.push(m)
      seen.add(m)
    }
  }
  for (const m of Object.keys(base.jigSizeMapping)) {
    if (!seen.has(m)) {
      order.push(m)
      seen.add(m)
    }
  }
  base.jigSizeMappingOrder = order

  /*
   * 归一化尺寸串里裸写的 "65" 组。
   *
   * 背景：匹配算法已改为严格 4 位全等比较，尺寸串 "65/55" 与 P/N 提取段
   * "6555" 是同一套编码。而旧配置（1.x Python 版）里写的是裸 "65" ——
   * 只有 2 位，拼不出 4 位规格码，那一组会被整组丢弃，导致 252 遇到 6555
   * 时误判为「不匹配」（标红）。实际 252 是能做 65/55 的。
   *
   * 所以这里把裸 "65" 展开成 "65/55" 再用。
   *
   * 必须**按组**处理，不能整串替换：
   *   "65"                    -> "65/55"           (整串就是这一组)
   *   "65_77/48_83/48"        -> "65/55_77/48_83/48"  (第一组是裸 65)
   *   "65_77/27_77/42_..."    -> "65/55_77/27_..."     (同上)
   *
   * 只认「恰好等于 65」这一种组形态：用户若写了 "65/48" 或 "6548"，
   * 那是别的意思，不能动。
   */
  const normalized: Record<string, string> = {}
  for (const [model, size] of Object.entries(base.jigSizeMapping)) {
    normalized[model] = size
      .split('_')
      .map(group => (group === '65' ? '65/55' : group))
      .join('_')
  }
  base.jigSizeMapping = normalized

  return base
}

/** 本机偏好的合并：与业务配置同规则（只认已知字段、类型不符就丢弃） */
export function mergeJigPrefs(
  stored: Record<string, unknown> | null | undefined
): JigPrefs {
  const base = createDefaultJigPrefs()
  if (!stored || typeof stored !== 'object') return base

  for (const key of Object.keys(base) as (keyof JigPrefs)[]) {
    const direct = stored[key]
    const snake = stored[toSnakeCase(key)]
    const legacy = LEGACY_PREF_KEYS[key]
    const legacyValue = legacy ? stored[legacy] : undefined

    const v =
      direct !== undefined && direct !== null
        ? direct
        : snake !== undefined && snake !== null
          ? snake
          : legacyValue

    if (v === undefined || v === null) continue
    if (typeof base[key] !== typeof v) continue
    ;(base as unknown as Record<string, unknown>)[key] = v
  }

  return base
}

/**
 * 旧应用（JIG Data Finder）的偏好字段名 → 本项目的字段名。
 *
 * 只列**改名**的那几个：其余字段 snake_case 转换后自然对得上。
 * 旧名保留认，是为了将来能从旧应用的配置里导入偏好 ——
 * 业务字段（映射表、工序表）本来就同名同义，那部分直接就能读。
 */
const LEGACY_PREF_KEYS: Partial<Record<keyof JigPrefs, string>> = {
  sourceDir: 'default_file_dialog_path',
  exportDir: 'default_export_path',
  rowHeight: 'table_default_row_height'
}

/** tableDefaultRowHeight -> table_default_row_height */
function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase()
}

/** 排除数组与 null：JSON.parse 出来的东西不该是这些 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
