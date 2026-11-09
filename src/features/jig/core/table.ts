/**
 * 表格数据结构 —— 纯 TS, 不依赖 DOM, 可单测
 */

/** 一行数据: 列名 -> 单元格值 (均为字符串, 与 pandas dtype=str 读取一致) */
export type Row = Record<string, string>

/** 一个表格: 列顺序 + 行 */
export interface Table {
  columns: string[]
  rows: Row[]
}

/** 透视表缓存包, 对应 Python 的 df_pivot_cache */
export interface PivotPackage {
  /** 全部数据 */
  all: Table
  /** 生产中数据 */
  prod: Table
}

export function emptyTable(): Table {
  return { columns: [], rows: [] }
}

export function isEmptyTable(t: Table | null | undefined): boolean {
  return !t || t.rows.length === 0 || t.columns.length === 0
}

/** 按指定顺序取列; 缺失列自动跳过 (对应 Python 的列存在性过滤) */
export function pickColumns(row: Row, order: string[]): Row {
  const out: Row = {}
  for (const c of order) {
    if (c in row) out[c] = row[c]
  }
  return out
}

/** 表格 -> 二维数组, 供导出与断言使用 */
export function tableToMatrix(t: Table): string[][] {
  return [t.columns.slice(), ...t.rows.map((r) => t.columns.map((c) => r[c] ?? ''))]
}