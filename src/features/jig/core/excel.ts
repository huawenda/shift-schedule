/**
 * Excel 读写 —— 封装 xlsx 库, 对齐 pandas dtype=str + keep_default_na=False
 *
 * **xlsx 库按需 import()**：它有 1MB 级，静态导入会把它整个塞进主 chunk ——
 * 而排班三页根本用不到 Excel。主包从 1,233 kB 涨到 1,893 kB 就是这么来的。
 * 改成动态 import 后它单独成 chunk，只有进 JIG 页选文件时才下载。
 */

import type { Row } from './table'

/**
 * xlsx 库的加载器。
 *
 * 抽成一个函数而不是模块顶层 `const p = import(...)`：模块顶层就发起动态
 * import 的话，**任何**引用到本模块的地方都会触发预加载 —— 相当于静态导入。
 * 放进函数里，才是「真的调用到才加载」。
 */
async function loadXlsx() {
  return import('xlsx-js-style')
}

export interface SourceData {
  columns: string[]
  rows: Row[]
  fileName: string
}

export async function readExcel(
  arrayBuffer: ArrayBuffer,
  fileName: string,
): Promise<SourceData> {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('这个文件里没有可读的工作表')

  // raw:false 让数字列以格式化字符串返回, 对应 pandas 的 dtype=str,
  // 否则 Slot No 之类的编号会变成 "7" 与 7 混用, 破坏排序与字符串比较。
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    raw: false,
    defval: '',
  })

  const headerRow = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })[0]
  const columns = (Array.isArray(headerRow) ? headerRow : []).map((c) =>
    String(c ?? '').trim(),
  )

  const rows: Row[] = raw.map((rec) => {
    const out: Row = {}
    for (const c of columns) {
      const v = rec[c]
      out[c] = v === undefined || v === null ? '' : String(v)
    }
    return out
  })

  return { columns, rows, fileName }
}

/** 校验关键列, 对应 Python 版 missing_jig_id_column 检查 */
export function validateSource(data: SourceData): string | null {
  if (!data.columns.includes('Jig ID')) {
    return "源文件中未找到 Jig ID 列,请检查表头。"
  }
  return null
}

/** 导出时需要标红的单元格 (1-based 坐标, 与 openpyxl 一致) */
export interface RedMark {
  /** 行索引, 与 table.rows 同序 */
  rows: ReadonlyArray<boolean>
  /** 需要标红的列名 */
  column: string
}

/**
 * 写出表格为 xlsx。
 *
 * 用 xlsx-js-style 而非 xlsx —— 后者是社区版, 不支持单元格样式,
 * 无法把尺寸不匹配的红色标记写进文件。对应旧版 openpyxl 的
 * `cell.font = Font(color="FF0000")`。
 *
 * 关键: 样式必须在 aoa_to_sheet **之前**挂到单元格对象上。
 * 该库写样式时是遍历 aoa 里每个 {v,t,s} 对象来收集样式的,
 * 事后给 ws[addr] 补 s 不会被收集到。
 *
 * **异步的原因**：xlsx 库按需加载（见文件头），同步写法拿不到库对象。
 */
export async function writeExcel(
  table: { columns: string[]; rows: Row[] },
  red?: RedMark,
): Promise<ArrayBuffer> {
  const XLSX = await loadXlsx()
  const colIdx = red ? table.columns.indexOf(red.column) : -1
  const hasRed = Boolean(red && colIdx >= 0)

  // 旧版用的是纯红 FF0000
  const RED = { font: { color: { rgb: 'FFFF0000' } } }

  const aoa: (string | { v: string; t: string; s: typeof RED })[][] = [
    table.columns.slice(),
  ]

  table.rows.forEach((row, ri) => {
    const marked = hasRed && red?.rows[ri] === true
    const line = table.columns.map((c, ci) => {
      const value = row[c] ?? ''
      return marked && ci === colIdx
        ? { v: value, t: 's', s: RED }
        : value
    })
    aoa.push(line)
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return out as ArrayBuffer
}