import { useMemo } from 'react'

import type { JigConfig } from '../core/config'
import type { Table } from '../core/table'

interface JigStageRailProps {
  /** 当前范围的透视表；计数取自它的「总计」行 */
  table: Table
  /** 业务配置；工序顺序取自 engineeringConfig */
  config: JigConfig
}

/**
 * 工序轨道。
 *
 * engineeringConfig 里那 11 道工序（PNP=10 → Jig入库=100）本来就是产线流水顺序，
 * 这是这个领域独有的信息，所以画成一条轨道而不是普通表格列 ——
 * 一眼能看出「今天还没有 JIG 走到搬出」这类现场状态。
 *
 * 计数取自透视表的「总计」行 —— 那是当前范围内的真实数量。
 *
 * 与原项目的差别只有两处：颜色全部走本项目令牌（原项目写死了几个十六进制），
 * 以及横向滚动条不再自己画（原项目有独立的 OverlayScrollbar，本项目已有
 * `ScrollOverlay`，但它只管纵向，横向这里直接用原生条）。
 */
export function JigStageRail({ table, config }: JigStageRailProps) {
  /** 按 engineeringConfig.order 取工序顺序 */
  const stageNames = useMemo(
    () =>
      Object.entries(config.engineeringConfig)
        .sort((a, b) => a[1].order - b[1].order)
        .map(([name]) => name),
    [config.engineeringConfig]
  )

  if (stageNames.length === 0) return null

  const totalRow = table.rows[table.rows.length - 1]
  const counts = new Map<string, number>()

  if (totalRow) {
    for (const name of stageNames) {
      const raw = totalRow[name]
      const n = raw === undefined || raw === '' ? 0 : Number(raw)
      counts.set(name, Number.isFinite(n) ? n : 0)
    }
  }

  // 峰值用于归一化条形长度，让「最多的一道工序」成为视觉锚点
  const peak = Math.max(1, ...counts.values())
  const lead = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

  return (
    <div className="jig-rail">
      <div aria-label="工序分布" className="jig-rail-track" role="list">
        {stageNames.map(name => {
          const n = counts.get(name) ?? 0
          const empty = n === 0
          // 0-4 档映射到透明度，避免每道工序都画一条同长度的条
          const weight = n === 0 ? 0 : 0.25 + 0.75 * (n / peak)

          return (
            <div
              className="jig-stage"
              data-active={!empty}
              data-empty={empty}
              data-lead={name === lead && !empty}
              key={name}
              role="listitem"
              title={`${name}: ${n}`}
            >
              <div
                aria-hidden="true"
                className="jig-stage-bar"
                style={{ opacity: weight }}
              />
              <div className="jig-stage-name">{name}</div>
              <div className="jig-stage-count">{n}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
