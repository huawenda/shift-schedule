import { SUMMARY_CST } from '../core/pivot'
import type { Row, Table } from '../core/table'

import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

interface JigTableProps {
  table: Table
  /** 行号列：明细表与审查页显示，透视表不显示 */
  showRowNumbers?: boolean
  /**
   * 触发尺寸校验标红的列名（通常是「对应尺寸」）。
   * 给了这一列名，尺寸不匹配的行会在该列标红。
   */
  sizeColumn?: string
  /**
   * 每行是否尺寸不匹配，与 table.rows 同序。
   * 不给就整列都不标红（尺寸校验没启用时）。
   */
  mismatchFlags?: boolean[]
  /** 总计列的表头文字；行首是它的那一行按「总计行」处理 */
  keywordTotal?: string
  /** 空态标题与说明 */
  emptyTitle: string
  emptyHint: string
  /**
   * 计数格点击回调（透视表下钻）。
   * 传了才启用：只有非空数字格可点，标识列（P/N、CST ID）不可点。
   */
  onCellClick?: (rowIndex: number, column: string) => void
}

/** 透视表的标识列，不是计数格 */
const IDENTITY_COLUMNS = new Set(['P/N', 'CST ID'])

/** 判断一行是否为小计行（CST ID == "--"） */
function isSubtotal(row: Row): boolean {
  return row['CST ID'] === SUMMARY_CST
}

/** 判断一行是否为总计行（P/N == "总计"） */
function isTotal(row: Row, keywordTotal: string): boolean {
  return row['P/N'] === keywordTotal
}

/**
 * 单元格内容：空值统一渲染为非断空格，保持列高稳定。
 *
 * 空字符串会让行高塌掉一截（那行只剩别的列的高度），表格里出现参差不齐的
 * 横线；换成不换行的空格后，每行的高度一致。
 */
function cell(value: string | undefined): string {
  return value === undefined || value === '' ? '\u00A0' : value
}

/** 计数类列：数字用等宽字形，视觉上能对齐 */
function isNumericColumn(name: string, keywordTotal: string): boolean {
  return name === 'Slot No' || name === keywordTotal
}

/**
 * JIG 数据表格。
 *
 * 用本项目的 `ui/table`（`<table>` 语义 + shadcn 样式），不是自绘的
 * CSS Grid 表格 —— 行列数不定、还要横向滚动，语义化表格更省事，
 * 也天然支持 `position: sticky` 固定首列。
 *
 * 三种行各有各的样子（都取本项目令牌）：
 * - **小计行**（CST ID == "--"）：某个 P/N 下各 CST 的合计，加粗 + 浅底；
 * - **总计行**（P/N == "总计"）：全表合计，加粗 + 更重一档的底 + 上边框；
 * - **明细行**：普通行。
 */
export function JigTable({
  table,
  showRowNumbers = false,
  sizeColumn,
  mismatchFlags,
  keywordTotal = '总计',
  emptyTitle,
  emptyHint,
  onCellClick
}: JigTableProps) {
  if (table.rows.length === 0 || table.columns.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">{emptyTitle}</p>
        <p className="empty-text">{emptyHint}</p>
      </div>
    )
  }

  const lastIndex = table.rows.length - 1
  const totalRowIndex = isTotal(table.rows[lastIndex], keywordTotal) ? lastIndex : -1

  return (
    <div className="jig-table-scroll">
      <UITable className="jig-table">
        <TableHeader>
          <TableRow>
            {showRowNumbers ? (
              <TableHead className="jig-table-num jig-table-sticky-col" scope="col">
                #
              </TableHead>
            ) : null}
            {table.columns.map(name => (
              <TableHead
                className={[
                  isNumericColumn(name, keywordTotal) ? 'is-num' : '',
                  name === 'P/N' ? 'jig-table-sticky-col' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={name}
                scope="col"
              >
                {name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {table.rows.map((row, rowIndex) => {
            const subtotal = isSubtotal(row)
            const total = rowIndex === totalRowIndex
            const mismatch = mismatchFlags?.[rowIndex] === true

            return (
              <TableRow
                className={[
                  subtotal ? 'is-subtotal' : '',
                  total ? 'is-total' : '',
                  mismatch ? 'is-mismatch' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={rowIndex}
              >
                {showRowNumbers ? (
                  <TableCell className="jig-table-num jig-table-sticky-col">{rowIndex + 1}</TableCell>
                ) : null}

                {table.columns.map(name => {
                  const value = row[name] ?? ''
                  const numeric = isNumericColumn(name, keywordTotal)
                  const clickable =
                    Boolean(onCellClick) &&
                    !IDENTITY_COLUMNS.has(name) &&
                    value !== '' &&
                    !numeric

                  return (
                    <TableCell
                      className={[
                        numeric ? 'is-num' : '',
                        clickable ? 'is-clickable' : '',
                        mismatch && name === sizeColumn ? 'is-flagged' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      key={name}
                      onClick={
                        clickable ? () => onCellClick?.(rowIndex, name) : undefined
                      }
                    >
                      {cell(value)}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </UITable>
    </div>
  )
}
