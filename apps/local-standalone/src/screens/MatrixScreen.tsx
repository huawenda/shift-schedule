import { SummaryBar } from '../components/SummaryBar'
import { TeamMatrix } from '../components/TeamMatrix'
import { formatPeriodRange, type Period } from '../data/period'
import type { Member, Roster } from '../data/roster'

interface MatrixScreenProps {
  roster: Roster
  period: Period
  onEdit: (member: Member, date: string) => void
}

/**
 * 全员矩阵：只讲「全组」的事。
 *
 * 顶部那 4 格概览（今日白班/夜班/休息/出勤）放在这一页而不是日历页 ——
 * 它统计的是全员出勤，与矩阵同源；日历页只讲本人。
 */
export function MatrixScreen({ roster, period, onEdit }: MatrixScreenProps) {
  return (
    <div className="canvas">
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">全员矩阵</h1>
          <p className="canvas-sub">
            {formatPeriodRange(period)} · 共 {period.dates.length} 天 · {roster.members.length} 位成员
          </p>
        </div>
      </div>

      <SummaryBar period={period} roster={roster} />

      <TeamMatrix period={period} roster={roster} onEdit={onEdit} />
    </div>
  )
}
