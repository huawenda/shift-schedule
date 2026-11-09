/**
 * 查询与审查数据处理 —— 逻辑源自 v1.x worker.py 的
 * query_data 与 process_source_data
 *
 * 两者的列处理、尺寸映射、排序逻辑完全一致, 抽成同一个内部函数,
 * 仅"填充未找到"与数据来源不同:
 *   - queryData:  左连接用户输入, 未命中填 '【未找到】'
 *   - processSourceData: 直接处理源数据, 不填充
 */

import type { JigConfig } from './config'
import type { Row, Table } from './table'
import { emptyTable, pickColumns } from './table'

/** 未命中记录的占位文本, 与 Python 版一致 */
export const NOT_FOUND = '【未找到】'

/** 从 "184 184" 提取首个型号, 与 Python 的 split()[0] 语义一致 */
export function firstModel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const parts = trimmed.split(/\s+/)
  return parts[0] ?? ''
}

/**
 * 计算输出列序: 在 config.output_columns 基础上,
 * 把 "对应尺寸" 插到 "Jig 对应型号" 之后 (Python 里同样的动态插入逻辑)
 */
export function buildOutputColumns(cfg: JigConfig): string[] {
  const targetCol = 'Jig 对应型号'
  const newCol = '对应尺寸'
  const cols = [...cfg.outputColumns]

  const idx = cols.indexOf(targetCol)
  if (idx >= 0) {
    if (!cols.includes(newCol)) cols.splice(idx + 1, 0, newCol)
  } else if (!cols.includes(newCol)) {
    cols.push(newCol)
  }
  return cols
}

/** 添加"对应尺寸"列并按 outputColumns 重排列序 */
function applySizeMapping(rows: Row[], cfg: JigConfig): Row[] {
  const targetCol = 'Jig 对应型号'
  const newCol = '对应尺寸'
  const hasModel = rows.some((r) => targetCol in r)

  const order = hasModel ? buildOutputColumns(cfg) : cfg.outputColumns

  // 列序必须严格等于 order, 因此按 order 逐列取值, 不依赖插入顺序。
  // (先插入映射列再遍历 order 会让这两列停留在对象前部, 导致列序错乱。)
  const effectiveOrder = order.filter((c) => (c === newCol ? hasModel : rows.some((r) => c in r)))

  const mapped = rows.map((r) => {
    const out: Row = {}
    // Python 里未命中的型号列是 NaN, notna 判断后取空串。
    // TS 侧对应的是 NOT_FOUND 占位符, 必须同样归一化为空串,
    // 否则 split() 会把 "【未找到】" 当成型号原样保留下来。
    const rawModel = r[targetCol] ?? ''
    const model =
      hasModel && rawModel !== '' && rawModel !== NOT_FOUND ? firstModel(rawModel) : ''
    for (const c of effectiveOrder) {
      if (c === targetCol) {
        out[c] = hasModel ? model : rawModel
      } else if (c === newCol) {
        out[c] = hasModel ? (cfg.jigSizeMapping[model] ?? '') : ''
      } else {
        out[c] = r[c] ?? ''
      }
    }
    return out
  })

  return mapped
}

/**
 * 排序: 按 cfg.sortColumns, 其中 numericSortColumns 用数值比较。
 * 无法转成数值的项排到最后 (对应 Python 的 fillna(inf))。
 */
export function sortRows(rows: Row[], cfg: JigConfig): Row[] {
  const cols = cfg.sortColumns.filter((c) => c in (rows[0] ?? {}))
  if (cols.length === 0) return rows

  // 稳定排序: 逐列从次要到主要, 或直接构造比较键
  const withKey = rows.map((row, index) => ({ row, index }))

  withKey.sort((a, b) => {
    for (const c of cols) {
      const av = a.row[c] ?? ''
      const bv = b.row[c] ?? ''

      if (cfg.numericSortColumns.includes(c)) {
        const an = Number(av)
        const bn = Number(bv)
        const aOk = av !== '' && Number.isFinite(an)
        const bOk = bv !== '' && Number.isFinite(bn)
        if (aOk && bOk) {
          if (an !== bn) return an - bn
          continue
        }
        if (aOk !== bOk) {
          // 无法转数值的排最后
          return aOk ? -1 : 1
        }
        continue
      }

      if (av !== bv) return av < bv ? -1 : 1
    }
    return a.index - b.index
  })

  return withKey.map((x) => x.row)
}

/** 取一个表的列序 */
function columnsOf(rows: Row[], preferred: string[]): string[] {
  const sample = rows[0] ?? {}
  const cols = preferred.filter((c) => c in sample)
  return cols
}

/**
 * 查询: 以输入的 Jig ID 为主做左连接, 未命中填 '【未找到】'。
 */
export function queryData(
  sourceRows: ReadonlyArray<Row>,
  inputIds: string[],
  cfg: JigConfig,
): Table {
  if (!sourceRows.length || inputIds.length === 0) return emptyTable()

  // 建立索引: Jig ID -> 源行 (保留首次出现, 对应 merge 的行为)
  const index = new Map<string, Row>()
  for (const r of sourceRows) {
    const id = r['Jig ID']
    if (id !== undefined && !index.has(id)) index.set(id, r)
  }

  const merged: Row[] = inputIds.map((id) => {
    const hit = index.get(id)
    const base: Row = { 'Jig ID': id }
    if (!hit) {
      // 未命中: 其余列统一填 '【未找到】'
      const cols = Object.keys(sourceRows[0])
      for (const c of cols) {
        if (c !== 'Jig ID') base[c] = NOT_FOUND
      }
      return base
    }
    for (const [k, v] of Object.entries(hit)) base[k] = v
    return base
  })

  const mapped = applySizeMapping(merged, cfg)

  // 对应 Python 的 fillna("【未找到】"): 剩余空值填占位符。
    // 型号/尺寸两列已在 applySizeMapping 阶段归一化, 这里不能回填,
    // 否则未命中行会显示成型号="【未找到】" 而非旧版的空单元格。
    const filled = mapped.map((r) => {
      const out: Row = {}
      for (const [k, v] of Object.entries(r)) {
        out[k] = v === '' && k !== '对应尺寸' && k !== 'Jig 对应型号' ? NOT_FOUND : v
      }
      return out
    })

  const sorted = sortRows(filled, cfg)
  return { columns: columnsOf(sorted, Object.keys(sorted[0] ?? {})), rows: sorted }
}

/**
 * 把一批源行整理成"明细表" (加对应尺寸、按 cfg.sortColumns 排序、按输出列序取列)。
 *
 * 查询结果页与透视明细共用这一条链路, 保证两处看到的列序、对应尺寸、
 * 排序完全一致。**不**做 Jig 状态过滤: 透视「结果透视」的底数据是全部
 * 命中行, 若这里再按 INPRODUCTION 筛一次, 明细行数就会少于点击的数字。
 */
export function buildDetailTable(
  rows: ReadonlyArray<Row>,
  cfg: JigConfig,
): Table {
  if (rows.length === 0) return emptyTable()
  const mapped = applySizeMapping([...rows], cfg)
  const sorted = sortRows(mapped, cfg)
  return { columns: columnsOf(sorted, Object.keys(sorted[0] ?? {})), rows: sorted }
}

/**
 * 审查页数据: 过滤 INPRODUCTION, 加"对应尺寸", 排序。不填充未找到。
 */
export function processSourceData(sourceRows: ReadonlyArray<Row>, cfg: JigConfig): Table {
  if (!sourceRows.length) return emptyTable()

  const statusCol = cfg.jigStatusColumn
  const hasStatus = sourceRows.some((r) => statusCol in r)
  const active = hasStatus
    ? sourceRows.filter((r) => r[statusCol] === cfg.jigStatusActiveValue)
    : [...sourceRows]

  if (active.length === 0) return emptyTable()

  return buildDetailTable(active, cfg)
}

/** 按 P/N 筛选审查数据 */
export function filterByPn(rows: ReadonlyArray<Row>, pn: string): Row[] {
  if (pn === '全部') return [...rows]
  return rows.filter((r) => r['P/N'] === pn)
}

export { pickColumns }