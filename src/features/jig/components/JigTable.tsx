import { useEffect, useMemo, useRef, useState } from 'react'

import { computeColumnWidths } from '../core/columns'
import { findTotalRowIndex, isSubtotalRow } from '../core/rowKinds'
import type { Table } from '../core/table'

import { JigScrollbar } from './JigScrollbar'

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
 *
 * ## 总计行冻结在底部
 *
 * 透视表有几百行，总计行在最后 —— 不冻结的话，横向扫读时看不到全表合计。
 * 做法是给它 `position: sticky; bottom: 0`：它在正常流里仍占一个行高，
 * 滚动范围与原来完全一致，滑到底时不会压住最后一条明细。
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
  /**
   * 内容是否超过一屏（真的需要纵向滚动）。
   *
   * 决定**总计行的下框线画不画**：
   * - 超过一屏 → 总计行冻结吸在滚动区底部，紧贴网格底线 → 不画下框线
   *   （否则两条线紧挨着，看起来像外框被加粗）；
   * - 不足一屏 → 总计行停在内容末尾，下方是留白，没有底线可借 → 画下框线
   *   把这一行封口。
   *
   * 与原项目的 `.grid__foot` / `.grid__foot--end` 同一口径。
   */
  const scrollRef = useRef<HTMLDivElement>(null)
  const [vScrollable, setVScrollable] = useState(false)
  /**
   * 最右列是否**贴住**滚动区右缘（表格宽度不小于滚动区宽度）。
   *
   * 贴住时末列的右框线与网格外框只隔 1px，会叠成双线；此时由外框收尾，
   * 末列不再自己画。表格比滚动区窄时，末列右侧还有空白，必须自己画一条
   * 收尾线，否则表看起来没有结束。
   */
  const [hFlush, setHFlush] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => {
      setVScrollable(el.scrollHeight - el.clientHeight > 1)
      const tableEl = el.querySelector('table')
      setHFlush(tableEl ? tableEl.offsetWidth >= el.clientWidth : false)
    }
    check()
    const ro =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check)
    ro?.observe(el)
    // 列宽由内容算出来，换一份数据时表格宽度会变；观察表格本身才能跟上
    const tableEl = el.querySelector('table')
    if (tableEl) ro?.observe(tableEl)
    window.addEventListener('resize', check)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [table, showRowNumbers])

  /**
   * 总计行的行下标；-1 表示这张表没有总计行。
   *
   * **空表时 rows[-1] 是 undefined** —— `isTotal` 会读 `row['P/N']` 直接抛错。
   * 空表判断挪到所有 Hook 之后（Hooks 顺序不能变），所以这里必须自己兜住。
   */
  const totalRowIndex = findTotalRowIndex(table.rows, keywordTotal)

  /** 总计列在列序里的下标；-1 表示这张表没有总计列 */
  const totalColumnIndex = table.columns.indexOf(keywordTotal)

  /**
   * 每列的像素宽 —— 按该列最宽的内容算，与窗口宽度无关。
   *
   * 写进 `<colgroup>` 后由 CSS 的 `table-layout: fixed` 落地成确定值。
   * 不这么做的话，表格会自动布局把富余宽度摊给各列：窗口一拉宽，
   * 末列就独吞（实测能被拉到 470px），内容居中后两边留出大片空白。
   */
  const widths = useMemo(
    () => computeColumnWidths(table.columns, table.rows),
    [table.columns, table.rows]
  )

  /** 行号列的固定宽 */
  const idxWidth = showRowNumbers ? 52 : 0

  /**
   * 表格的总宽 = 各列宽之和。
   *
   * **必须显式给**，不能靠 `width: max-content` —— 那个算的是**内容**的
   * max-content 总和，不是列宽之和：实测列宽指定 52/120/90/300 时，
   * max-content 给出 620px，多出的 58px 全被塞给了最后一列。
   * 显式给宽度后，每列精确等于 `<col>` 指定值，总宽正好是列宽和。
   */
  const tableWidth = useMemo(
    () => idxWidth + widths.reduce((sum, width) => sum + width, 0),
    [idxWidth, widths]
  )

  /**
   * 空状态必须放在所有 Hook 之后。
   *
   * 条件 return 出现在 Hook 中间会让「空表 → 有数据」切换时 Hook 调用
   * 数量跳变，React 抛 #310（渲染时 Hook 顺序变了），整个界面白屏。
   */
  if (table.rows.length === 0 || table.columns.length === 0) {
    return (
      <div className="empty">
        <p className="empty-title">{emptyTitle}</p>
        <p className="empty-text">{emptyHint}</p>
      </div>
    )
  }

  return (
    /*
     * 两层结构（与原项目一致）：
     *   .jig-table-wrap   外框 + 定位父级（滚动条的浮层贴在这里）
     *   .jig-table-scroll 真正的滚动区
     *
     * 浮层必须挂在定位父级里 —— 它的位置是按「滚动区 rect 减 父容器 rect」
     * 算出来的，父容器不定位就没法算。
     */
    <div className="jig-table-wrap">
      <div
        className="jig-table-scroll"
        data-hflush={hFlush}
        data-vscroll={vScrollable}
        ref={scrollRef}
      >
        <UITable className="jig-table" style={{ width: `${tableWidth}px` }}>
          <colgroup>
            {showRowNumbers ? <col style={{ width: `${idxWidth}px` }} /> : null}
            {widths.map((width, index) => (
              <col key={table.columns[index]} style={{ width: `${width}px` }} />
            ))}
          </colgroup>

          <TableHeader>
            <TableRow>
              {showRowNumbers ? (
                <TableHead className="jig-table-num" scope="col">
                  #
                </TableHead>
              ) : null}
              {table.columns.map((name, index) => (
                <TableHead
                  className={[
                    isNumericColumn(name, keywordTotal) ? 'is-num' : '',
                    index === totalColumnIndex ? 'jig-table-total-col' : ''
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
              const subtotal = isSubtotalRow(row)
              const total = rowIndex === totalRowIndex
              const mismatch = mismatchFlags?.[rowIndex] === true
              /**
               * 是不是「总计行的前一行」。
               *
               * 内容不足一屏时，总计行要在上沿补一道框线把这一行封口；
               * 而它紧贴着最后一条明细 —— 那条明细自己的下框线会与它叠成
               * 双线，所以要去掉一条。
               */
              const beforeTotal = totalRowIndex > 0 && rowIndex === totalRowIndex - 1

              return (
                <TableRow
                  className={[
                    subtotal ? 'is-subtotal' : '',
                    total ? 'is-total' : '',
                    beforeTotal ? 'is-before-total' : '',
                    mismatch ? 'is-mismatch' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={rowIndex}
                >
                  {showRowNumbers ? (
                    <TableCell className="jig-table-num">{rowIndex + 1}</TableCell>
                  ) : null}

                  {table.columns.map((name, index) => {
                    const value = row[name] ?? ''
                    const numeric = isNumericColumn(name, keywordTotal)
                    /**
                     * 可点判定：标识列（P/N、CST ID）不可点，空格不可点，其余可点。
                     *
                     * **「总计」列是可点的** —— 点它表示「这一行在全部工序上的合计」，
                     * 下钻时对应「全部工序」（key.eng 不设）。原项目也是这个口径。
                     */
                    const clickable =
                      Boolean(onCellClick) && !IDENTITY_COLUMNS.has(name) && value !== ''

                    return (
                      <TableCell
                        className={[
                          numeric ? 'is-num' : '',
                          clickable ? 'is-clickable' : '',
                          mismatch && name === sizeColumn ? 'is-flagged' : '',
                          index === totalColumnIndex ? 'jig-table-total-col' : ''
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

      {/*
        覆盖式滚动条：横向与纵向各一条。

        原生滚动条会占掉 10~15px，表格右侧的列或底部行因此被挤；
        而只看不滚时那条灰条又一直杵在外面。这里把原生条隐藏，
        换成只在滚动时淡入的细滑块（照搬原项目的 OverlayScrollbar）。
      */}
      <JigScrollbar axis="vertical" targetRef={scrollRef} />
      <JigScrollbar axis="horizontal" targetRef={scrollRef} />
    </div>
  )
}
