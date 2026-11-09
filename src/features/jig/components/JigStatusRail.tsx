import type { JigStatus } from '../hooks/useJigData'

interface JigStatusRailProps {
  /** 状态灯 */
  status: JigStatus
  /** 常驻日志：最近一次动作的结果 */
  log: string
  /** 源数据行数；0 = 还没载入 */
  sourceRows: number
  /** 当前视图的行数 */
  currentRows: number
}

/**
 * 底部常驻状态轨。
 *
 * 搬自原项目的第三层（原项目叫「状态轨」）。它解决三件事：
 *
 * 1. **状态灯** —— 空闲 / 处理中 / 就绪 / 出错，一眼看出程序在不在忙。
 * 2. **常驻日志** —— 最近一次动作的结果。提示条会消失，这行不会；
 *    「刚才那批数据是几行、导出到哪了」这种信息，事后还能看到。
 * 3. **行数对账** —— 「源 N 行 · 当前 M 行」。当前这一页显示多少行，
 *    跟源数据一共多少行，一眼可比 —— 筛选漏了或没生效都会露出来。
 *
 * **只留最新一条，不攒历史** —— 它是「现在怎么样」，不是日志文件。
 */
export function JigStatusRail({
  status,
  log,
  sourceRows,
  currentRows
}: JigStatusRailProps) {
  return (
    <footer className="jig-status-rail">
      <span className="jig-status-dot" data-state={status} />
      <span className="jig-status-log">{log}</span>

      {status === 'busy' ? (
        <span aria-label="处理中" className="jig-status-bar" />
      ) : null}

      <span className="jig-status-spacer" />

      {sourceRows > 0 ? (
        <span className="jig-status-meta">
          源 {sourceRows} 行 · 当前 {currentRows} 行
        </span>
      ) : null}

      <span className="jig-status-sign" title="作者">
        huawenda
      </span>
    </footer>
  )
}
