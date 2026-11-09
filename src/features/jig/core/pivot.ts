/**
 * 透视表生成 —— 逻辑源自 v1.x worker.py 的 _generate_pivot
 *
 * 输出的视觉约定 (UI 依赖这些关键词, 不能改):
 *   - P/N 小计行: CST ID = "--",  UI 据此加粗 + 浅蓝底
 *   - 全表总计行: P/N = "总计",    UI 据此加粗 + 浅绿底
 *   - 计数为 0 时写成空字符串, 保持表格清爽
 *
 * 处理顺序不可调换 —— 调换会让计数归到错误的行上:
 *   1. Lot ID 回填空 CST ID
 *   2. 生产中筛选 (工程 == productionIndicatorCode 的 P/N)
 *   3. 排除 pivotExcludeNames 黑名单工程
 *   4. pivot_table: index=[P/N, CST ID], columns=工程名, values=Jig ID, count
 *   5. 按 engineeringConfig.order 排序列
 *   6. 手工组装 小计行/明细行/总计行
 *   7. 列序 = [P/N, CST ID, ...工程列, 总计],  0 -> ""
 */

import type { JigConfig } from './config'
import type { Row, Table } from './table'
import { emptyTable } from './table'

/** 汇总行的哨兵值, UI 样式依赖它 */
export const SUMMARY_CST = '--'

/**
 * 「可用」工程的集合。
 *
 * 现场口径: JIG 出现在 PNP / PNP 2nd / Jig 洗净及检查 / Jig Loading /
 * Jig Unloading 这几道工序时算"可用"; 其余工序 (N判定、分离、目视、
 * 待机、搬出、入库) 的记录算"非可用"。
 *
 * 工程名取自 cfg.pivotColumnKey (默认「工程名」), 与透视表列头一致。
 */
export const AVAILABLE_STAGES: ReadonlySet<string> = new Set([
  'PNP',
  'PNP 2nd',
  'Jig 洗净及检查',
  'Jig Loading',
  'Jig Unloading',
])

/**
 * 可用性筛选的档位。
 *
 * 注意分类对象是**工程 (透视表的列)**, 不是 P/N: 选「可用」时透视表
 * 只保留这五道工序的列与计数, 其余工序的行整体不参与汇总。
 */
export type StageCategory = 'all' | 'available' | 'unavailable'

/**
 * 按工程可用性筛行。
 *
 * 透视表的一行代表一条 JIG 记录, 其工程名决定它落在哪一档:
 * 可用工程 -> 'available', 其余 -> 'unavailable'。
 */
export function filterRowsByStageCategory(
  rows: ReadonlyArray<Row>,
  category: StageCategory,
  cfg: JigConfig,
): Row[] {
  if (category === 'all') return [...rows]

  const engCol = cfg.pivotColumnKey
  return rows.filter((r) => {
    const isAvailable = AVAILABLE_STAGES.has(r[engCol] ?? '')
    return category === 'available' ? isAvailable : !isAvailable
  })
}

/**
 * 统计两档的行数 (分段按钮上的计数)。
 *
 * 计入的是 JIG 记录数, 与透视表总计行的口径一致, 不做去重。
 */
export function countStageCategories(
  rows: ReadonlyArray<Row>,
  cfg: JigConfig,
): Record<StageCategory, number> {
  let available = 0
  for (const r of rows) {
    if (AVAILABLE_STAGES.has(r[cfg.pivotColumnKey] ?? '')) available++
  }
  return {
    all: rows.length,
    available,
    unavailable: rows.length - available,
  }
}

/**
 * 透视下钻的定位键。
 *
 * 三者都缺省表示"全表"。列里的「总计」列不是工序名, 对应 eng 缺省;
 * 小计行的 CST 缺省表示"该 P/N 下全部 CST"; 总计行的 pn 缺省表示"全部 P/N"。
 */
export interface PivotDrillKey {
  pn?: string
  cst?: string
  eng?: string
}

/**
 * 透视前的数据预处理 (CST 回填 / 生产中筛选 / 工序列黑名单)。
 *
 * 抽出来是为了让下钻筛选与透视计数用**同一套**行, 否则点击某个数字
 * 后筛出的明细行数与单元格上的数字对不上 —— 差异全藏在这三步里。
 */
export function preparePivotRows(
  df: ReadonlyArray<Row>,
  filterProduction: boolean,
  cfg: JigConfig,
): Row[] {
  // --- 1. 数据预处理: CST ID 为空时用 Lot ID 回填 ---
  let work: Row[] = [...df]
  if (work.some((r) => 'Lot ID' in r)) {
    work = work.map((r) =>
      r['CST ID'] === '' ? { ...r, 'CST ID': r['Lot ID'] ?? '' } : r,
    )
  }

  // --- 2. 生产中筛选: 只保留含关键工程代码的 P/N ---
  const engCodeCol = '工程'
  if (filterProduction) {
    const indicator = cfg.productionIndicatorCode
    const prodPns = new Set(
      work.filter((r) => r[engCodeCol] === indicator).map((r) => r['P/N']),
    )
    work = work.filter((r) => prodPns.has(r['P/N']))
  }

  // --- 3. 排除工程黑名单 ---
  const engColumn = cfg.pivotColumnKey
  if (cfg.pivotExcludeNames.length > 0) {
    const excluded = new Set(cfg.pivotExcludeNames)
    work = work.filter((r) => !excluded.has(r[engColumn]))
  }

  return work
}

/**
 * 按透视单元格的定位键筛出源行 (下钻明细)。
 *
 * 预处理与 generatePivot 完全共用, 因此筛出的行数必须等于单元格上的
 * 计数 —— 这是 tests/drill.test.ts 逐格校验的内容。
 */
export function drillPivotRows(
  df: ReadonlyArray<Row>,
  key: PivotDrillKey,
  filterProduction: boolean,
  cfg: JigConfig,
): Row[] {
  const prepared = preparePivotRows(df, filterProduction, cfg)
  const engColumn = cfg.pivotColumnKey

  // 总计行没有 P/N, 也就不该带 CST 条件 —— 否则等于永远筛出 0 行
  const pn = key.pn
  const cst = pn === undefined ? undefined : key.cst
  const eng = key.eng

  return prepared.filter((r) => {
    if (pn !== undefined && r['P/N'] !== pn) return false
    if (cst !== undefined && r['CST ID'] !== cst) return false
    if (eng !== undefined && r[engColumn] !== eng) return false
    return true
  })
}

/**
 * 生成透视表。
 *
 * @param df  源数据行
 * @param filterProduction  是否只保留"生产中"的 P/N
 * @param cfg 配置 (工程排序、排除名单等)
 */
export function generatePivot(
  df: ReadonlyArray<Row>,
  filterProduction: boolean,
  cfg: JigConfig,
): Table {
  if (df.length === 0) return emptyTable()

  // --- 1~3. 数据预处理: CST 回填 / 生产中筛选 / 工序列黑名单 ---
  const work = preparePivotRows(df, filterProduction, cfg)
  // 与原实现一致: 只有"生产中筛选把行筛空"才返回空表。
  // 黑名单把行全排除时仍保留一张只有总计行的表 (总计为 0 -> "")。
  if (filterProduction && work.length === 0) return emptyTable()

  // --- 4. 基础透视: 统计每个 (P/N, CST ID) 在各工程下的 Jig ID 数量 ---
  // key = P/N + '\u0000' + CST ID, 避免分隔符出现在真实值里
  const engColumn = cfg.pivotColumnKey
  const counts = new Map<string, Map<string, number>>()
  const pnOrder: string[] = []
  const seenPn = new Set<string>()

  for (const r of work) {
    const pn = r['P/N'] ?? ''
    const cst = r['CST ID'] ?? ''
    const eng = r[engColumn] ?? ''
    const key = `${pn}\u0000${cst}`

    let bucket = counts.get(key)
    if (!bucket) {
      bucket = new Map<string, number>()
      counts.set(key, bucket)
    }
    bucket.set(eng, (bucket.get(eng) ?? 0) + 1)

    if (!seenPn.has(pn)) {
      seenPn.add(pn)
      pnOrder.push(pn)
    }
  }

  // --- 5. 收集并排序列 (按 engineeringConfig.order, 未知工程排最后) ---
  const allEngs = new Set<string>()
  for (const bucket of counts.values()) {
    for (const eng of bucket.keys()) allEngs.add(eng)
  }
  const dataCols = [...allEngs].sort(
    (a, b) => (cfg.engineeringConfig[a]?.order ?? 999) - (cfg.engineeringConfig[b]?.order ?? 999),
  )

  // --- 6. 手工组装: 每个 P/N 一个小计行, 后面跟各 CST 明细行 ---
  // 中间行允许 number, 仅在最终输出时统一转成字符串 (0 -> "")
  type DraftRow = Record<string, string | number>
  const KEY_TOTAL = cfg.keywordTotal
  const newRows: DraftRow[] = []
  const grandTotal: Record<string, number> = {}
  let grandTotalCount = 0

  // 按字典序排列每个 P/N 的 CST 列表。
  // 注意: Python 的 pivot_table 会自动排序索引, 这里必须同样排序,
  // 否则明细行顺序与旧版不同, 导出结果对不上。
  const cstByPn = new Map<string, string[]>()
  for (const key of counts.keys()) {
    const [pn, cst] = key.split('\u0000')
    const list = cstByPn.get(pn)
    if (list) {
      if (!list.includes(cst)) list.push(cst)
    } else {
      cstByPn.set(pn, [cst])
    }
  }
  for (const [pn, list] of cstByPn) {
    list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    cstByPn.set(pn, list)
  }

  // P/N 也按字典序 (与 pivot_table 的索引排序一致)
  pnOrder.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  for (const pn of pnOrder) {
    const csts = cstByPn.get(pn) ?? []

    // 该 P/N 的各工程小计
    const subSums: Record<string, number> = {}
    let subTotalVal = 0
    for (const cst of csts) {
      const bucket = counts.get(`${pn}\u0000${cst}`)
      if (!bucket) continue
      for (const [eng, n] of bucket) {
        subSums[eng] = (subSums[eng] ?? 0) + n
        subTotalVal += n
      }
    }

    // 累加全局总计
    for (const col of dataCols) {
      grandTotal[col] = (grandTotal[col] ?? 0) + (subSums[col] ?? 0)
    }
    grandTotalCount += subTotalVal

    // A. 小计行 (CST = "--", 触发 UI 加粗)
    const headerRow: DraftRow = { 'P/N': pn, 'CST ID': SUMMARY_CST }
    for (const col of dataCols) headerRow[col] = subSums[col] ?? 0
    headerRow[KEY_TOTAL] = subTotalVal
    newRows.push(headerRow)

    // B. 明细行 (P/N 留空, 视觉上属于上方小计)
    for (const cst of csts) {
      const bucket = counts.get(`${pn}\u0000${cst}`)
      if (!bucket) continue
      let rowSum = 0
      for (const [, n] of bucket) rowSum += n

      const detailRow: DraftRow = { 'P/N': '', 'CST ID': cst }
      for (const col of dataCols) detailRow[col] = bucket.get(col) ?? 0
      detailRow[KEY_TOTAL] = rowSum
      newRows.push(detailRow)
    }
  }

  // --- 7. 全表总计行 ---
  const totalRow: DraftRow = { 'P/N': KEY_TOTAL, 'CST ID': '' }
  for (const col of dataCols) totalRow[col] = grandTotal[col] ?? 0
  totalRow[KEY_TOTAL] = grandTotalCount
  newRows.push(totalRow)

  // --- 8. 列序整理 + 0 -> "" ---
  const colsOrder = ['P/N', 'CST ID', ...dataCols, KEY_TOTAL]
  const rows = newRows.map((r) => {
    const out: Row = {}
    for (const c of colsOrder) {
      const v = r[c]
      out[c] = v === 0 || v === undefined ? '' : String(v)
    }
    return out
  })

  return { columns: colsOrder, rows }
}