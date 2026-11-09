/**
 * 表格列宽计算。
 *
 * ## 为什么要自己算
 *
 * 语义化 `<table>` 的自动列宽算法有两个毛病：
 *
 * 1. **富余量会被分给列**。表格 `width: 100%` 时，多出来的宽度按各列
 *    内容比例摊掉 —— 窗口一拉宽，某列就独吞（末列「对应尺寸」能被拉到
 *    470px），内容居中后两边留出大片空白。
 * 2. **窄窗口下会被裁**。容器不够宽时，自动布局优先保证「不换行」，
 *    多余内容从侧面裁掉，看不到。
 *
 * 原项目是自绘 CSS Grid，列宽由 JS 算好绑定到每一列，彻底避开这两点。
 * 本项目用语义表格，但可以靠 `<colgroup>` 达到同样效果 —— `<col>` 的
 * 宽度在表格布局算法里优先级最高，会覆盖自动分配。
 *
 * ## 怎么量
 *
 * 用 canvas 的 `measureText` 按**真实字体**量，而不是按字符数估算：
 * 宽字符在 UI 字体下只占约 4.8px，按 7.6 估会高估 58%；而等宽字体下
 * 7.6 又略高于实测的 7.33 —— 两类误差方向相反，量出来的列宽就会
 * 「有的紧有的松」。
 *
 * 字体栈直接取自 CSS（`getComputedStyle`），不在这里手写第二份 ——
 * 手写那份一旦漏了回退字体，量出来的就不是实际渲染宽度。
 *
 * ## 必须按「最粗的那一档」量
 *
 * 小计行 / 总计行的单元格是 600 / 700（见 jig.scss），比正文 400 宽
 * 1–4%。若按 400 量，正文刚好放下的列在加粗行就会溢出 —— 而
 * `overflow: hidden` + `text-overflow: ellipsis` 下，**溢出不到 1px
 * 也会把尾部换成省略号**，看起来像整整少了两个字。
 *
 * P/N 列就是一例：它的值只出现在加粗的小计行上（明细行的 P/N 留空），
 * 按 400 量出 107px、实际 600 需要 110px，于是每一条小计行的 P/N
 * 都被截成 `6073J-655…`。
 *
 * 表头同理：字重 600、还有 0.03em 字距（实测比 400 宽约 3.6px），
 * 这两项都要算进去，否则表头也会在最紧的列上被截。
 */

import type { Row } from './table'

/** 单元格左右内边距合计 + 2px 余量 */
const CELL_PAD_X = 22

/**
 * 数据单元格的字重 —— 小计行 600、总计行 700，按较宽的 600 量。
 *
 * 正文 400 更窄，用 600 量会略宽一两像素，但绝不会因此截断。
 */
const CELL_WEIGHT = 600

/** 表头字重 —— 与 jig.scss 的 `thead th` 一致 */
const HEAD_WEIGHT = 600

/** 表头字距（em）—— 与 jig.scss 的 `letter-spacing: 0.03em` 一致 */
const HEAD_LETTER_SPACING_EM = 0.03
/**
 * 列宽下限
 *
 * 太窄的列挤在一起不好读。
 */
const MIN_COL_W = 68

/**
 * 列宽上限。
 *
 * 不封顶的话一列超长字符串（例如尺寸串
 * `65_77/27/77/42/77/48_83/48`）会把整张表撑到几千像素宽，
 * 其余列全被推到屏幕外。封顶后超宽内容会被裁，这是刻意的取舍：
 * 审查页最容易超宽的就是「对应尺寸」列，而横向滚动仍可查看全文。
 */
const MAX_COL_W = 360

/** 参与测量的最大行数：超过则只扫前 N 行，避免 10 万行时卡顿 */
const MEASURE_ROWS = 5000

/** 测量用的 canvas 上下文，按字体缓存 */
const measureCtxs = new Map<string, CanvasRenderingContext2D>()

/**
 * 量一段文字的像素宽。
 *
 * 拿不到 canvas（测试环境 / 极老浏览器）时退回按字符数估 ——
 * 估得不准也比表格塌掉强。
 */
export function measureText(text: string, font: string): number {
  if (typeof document === 'undefined') return text.length * 7.6

  let ctx = measureCtxs.get(font)
  if (!ctx) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return text.length * 7.6
    context.font = font
    ctx = context
    measureCtxs.set(font, ctx)
  }
  return ctx.measureText(text).width
}

/**
 * 表格用的字体栈。
 *
 * **必须与实际渲染字体完全一致** —— 量出来的宽度是按这个栈算的，
 * 与渲染差一个字宽，列就会被裁或留白。
 *
 * 从 CSS 变量 `--jig-table-font` 读（见 jig.scss 里的定义）：
 * 表格在 shadcn 的 `ui/table` 里，带 `data-slot` 属性，会命中 index.css 的
 * `[data-slot] { font-family: var(--font-sans) }`（Geist Variable），
 * 中文再回落到系统字体 —— 这条回落链手写一份必然与实际不一致。
 */
function fontStack(size: number, weight = 400): string {
  if (typeof getComputedStyle !== 'function' || typeof document === 'undefined') {
    return `${weight} ${size}px 'Geist Variable', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif`
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--jig-table-font')
    .trim()
  return raw ? `${weight} ${size}px ${raw}` : `${weight} ${size}px 'Geist Variable', sans-serif`
}

/**
 * 表头那一段文字的实际宽度：字重 600 + 0.03em 字距。
 *
 * 字距按字符数累加 —— CSS 的 `letter-spacing` 会在每个字符后都加一份，
 * 末字符也不例外，所以乘的是字符数而不是「字符数 - 1」。
 */
function headTextWidth(text: string, headSize: number, headFont: string): number {
  return measureText(text, headFont) + text.length * HEAD_LETTER_SPACING_EM * headSize
}

/**
 * 算出每列的像素宽。
 *
 * 每列独立按**该列内容**的最宽值定，与窗口宽度无关 —— 表格要么刚好放下，
 * 要么整体横向滚动。
 *
 * @param columns 列名
 * @param rows 数据行（用于量内容宽度）
 * @param headSize 表头字号（px）—— 与内容同字号（--fs-control = 13），
 *   改表头字号时要同步这里，否则量出来的列宽会比实际窄
 * @param cellSize 数据单元格字号（px）
 */
export function computeColumnWidths(
  columns: string[],
  rows: ReadonlyArray<Row>,
  headSize = 13,
  cellSize = 13
): number[] {
  if (columns.length === 0) return []

  const headFont = fontStack(headSize, HEAD_WEIGHT)
  const cellFont = fontStack(cellSize, CELL_WEIGHT)
  const sample = rows.length > MEASURE_ROWS ? rows.slice(0, MEASURE_ROWS) : rows

  return columns.map((col) => {
    // 表头与内容分别量，取两者的较大值
    let max = Math.max(headTextWidth(col, headSize, headFont), measureText(col, cellFont))

    for (const row of sample) {
      const width = measureText(row[col] ?? '', cellFont)
      if (width > max) max = width
    }

    return Math.round(
      Math.min(Math.max(max + CELL_PAD_X, MIN_COL_W), MAX_COL_W)
    )
  })
}
