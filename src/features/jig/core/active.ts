/**
 * 「生产中」筛选 —— 源行按 Jig 状态过滤。
 *
 * 原项目把它放在 App.tsx 里当私有函数（`filterActive`），但在本项目它有两个用处：
 * 全量透视的「显示范围」下拉、以及工序轨道的计数底稿。两处必须拿到**同一批行**，
 * 否则轨道上的数字会和透视表里的数字对不上。所以它属于业务口径，放 core。
 *
 * 口径（与原项目逐字一致）：源表里**没有**状态列时不过滤 —— 有些导出文件
 * 没有这一列，硬要按它筛会把数据全筛空。
 */

import type { JigConfig } from './config'
import type { Row } from './table'

/**
 * 只保留「生产中」的行。
 *
 * 判定列与取值来自配置（`jigStatusColumn` / `jigStatusActiveValue`），
 * 默认是「Jig状态」列等于「INPRODUCTION」。
 */
export function filterActive(rows: ReadonlyArray<Row>, cfg: JigConfig): Row[] {
  const col = cfg.jigStatusColumn
  // 表里没有这一列 —— 不过滤。全滤会把整份数据清空，比不过滤糟得多。
  if (!rows.some((r) => col in r)) return [...rows]
  return rows.filter((r) => r[col] === cfg.jigStatusActiveValue)
}
