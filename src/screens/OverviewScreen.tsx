import { useMemo } from 'react'
import { MonthCalendar } from '../components/MonthCalendar'
import { StatsPanels } from '../components/StatsPanels'
import { TodoCard } from '../components/TodoCard'
import { formatPeriodRange, type Period } from '../data/period'
import { getRecordMap, getSelf, patternNameOf, type Member, type Roster } from '../data/roster'
import { computeMonthStats } from '../data/stats'

interface OverviewScreenProps {
  roster: Roster
  period: Period
  onEdit: (member: Member, date: string) => void
  /** 勾选 / 取消勾选待办（改动立即生效） */
  onToggleTodo: (todoId: string) => void
  /** 没填基本工资时，统计区给一个直达「个人资料」的入口 */
  onOpenProfile: () => void
}

/**
 * 月度概览：个人日历 + 待办 + 四块统计，一个页面看完整月的「排了什么班、加了多久、值多少钱」。
 *
 * 整页内容限宽 1180 并居中：日历本身只需要 900（信息密度就那么多，撑宽只会更空），
 * 右边空出来的 250px 放待办卡，统计块在下面按两列铺满 ——
 * 宽屏上多出来的空间变成左右对称的边距，而不是全堆在右边。
 */
export function OverviewScreen({
  roster,
  period,
  onEdit,
  onToggleTodo,
  onOpenProfile
}: OverviewScreenProps) {
  const self = getSelf(roster)
  const recordMap = useMemo(() => getRecordMap(roster), [roster])
  const stats = useMemo(
    () => (self ? computeMonthStats(roster, self, period) : null),
    [roster, self, period]
  )

  /** 本月内的待办（结算月内的），按日期分组由卡片自己处理 */
  const periodTodos = useMemo(
    () => roster.todos.filter(todo => todo.date >= period.startDate && todo.date <= period.endDate),
    [roster.todos, period.startDate, period.endDate]
  )

  /** 有待办的日期 → 条数（给日历格子画小圆点） */
  const todoCounts = useMemo(() => {
    const counts = new Map<string, number>()
    periodTodos.forEach(todo => counts.set(todo.date, (counts.get(todo.date) ?? 0) + 1))
    return counts
  }, [periodTodos])

  return (
    <div className="canvas is-overview">
      <div className="canvas-head">
        <div>
          <h1 className="canvas-title">月度概览</h1>
          <p className="canvas-sub">
            {formatPeriodRange(period)} · 共 {period.dates.length} 天 ·{' '}
            {self ? `${self.name} · ${patternNameOf(roster, self.patternId)}` : '还没有设置本人'}
          </p>
        </div>
      </div>

      {/*
        日历 + 待办并排：日历固定 900，待办吃掉右边剩下的宽度。
        高度由日历决定（align-items: stretch 让待办卡跟着长到一样高），
        右边界与下面统计块的右边界自然对齐。
      */}
      <div className="overview-top">
        <MonthCalendar
          member={self}
          onEdit={onEdit}
          period={period}
          recordMap={recordMap}
          roster={roster}
          todoCounts={todoCounts}
        />
        <TodoCard todos={periodTodos} onToggle={onToggleTodo} />
      </div>

      {stats ? (
        <StatsPanels stats={stats} totalDays={period.dates.length} onOpenProfile={onOpenProfile} />
      ) : null}
    </div>
  )
}
