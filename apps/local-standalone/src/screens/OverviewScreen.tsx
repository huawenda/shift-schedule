import { useMemo } from 'react'
import { MonthCalendar } from '../components/MonthCalendar'
import { StatsPanels } from '../components/StatsPanels'
import { formatPeriodRange, type Period } from '../data/period'
import { getRecordMap, getSelf, patternNameOf, type Member, type Roster } from '../data/roster'
import { computeMonthStats } from '../data/stats'

interface OverviewScreenProps {
  roster: Roster
  period: Period
  onEdit: (member: Member, date: string) => void
  /** 没填基本工资时，统计区给一个直达「个人资料」的入口 */
  onOpenProfile: () => void
}

/**
 * 月度概览：个人日历 + 四块统计，一个页面看完整月的「排了什么班、加了多久、值多少钱」。
 *
 * 整页内容限宽 1180 并居中：日历本身只需要 900（信息密度就那么多，撑宽只会更空），
 * 统计块在它下面按两列铺满 —— 宽屏上多出来的空间变成左右对称的边距，而不是全堆在右边。
 */
export function OverviewScreen({ roster, period, onEdit, onOpenProfile }: OverviewScreenProps) {
  const self = getSelf(roster)
  const recordMap = useMemo(() => getRecordMap(roster), [roster])
  const stats = useMemo(
    () => (self ? computeMonthStats(roster, self, period) : null),
    [roster, self, period]
  )

  return (
    <div className="canvas is-overview">
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">月度概览</h1>
          <p className="canvas-sub">
            {formatPeriodRange(period)} · 共 {period.dates.length} 天 ·{' '}
            {self ? `本人 ${self.name} · ${patternNameOf(roster, self.patternId)}` : '还没有设置本人'}
          </p>
        </div>
      </div>

      <MonthCalendar
        member={self}
        onEdit={onEdit}
        period={period}
        recordMap={recordMap}
        roster={roster}
      />

      {stats ? (
        <StatsPanels stats={stats} totalDays={period.dates.length} onOpenProfile={onOpenProfile} />
      ) : null}
    </div>
  )
}
