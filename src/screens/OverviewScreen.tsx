import { useMemo } from 'react'
import { MonthCalendar } from '../components/MonthCalendar'
import { StatsPanels } from '../components/StatsPanels'
import { TodoCard } from '../components/TodoCard'
import { TodayPlaque } from '../components/TodayPlaque'
import { getCalendarMeta } from '../data/calendarMeta'
import { todayKey } from '../data/dateUtils'
import { formatPeriodRange, type Period } from '../data/period'
import {
  getRecordMap,
  getSelf,
  getTemplateShift,
  overrideKey,
  patternNameOf,
  type Member,
  type Roster
} from '../data/roster'
import type { ShiftType } from '../data/shifts'
import { computeMonthStats } from '../data/stats'
import { useCurrentShift } from '../hooks/useCurrentShift'

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
 * 整页内容限宽 1180 并居中：日历本身只需要 840（信息密度就那么多，撑宽只会更空），
 * 右边空出来的 320px 放待办卡，统计块在下面按两列铺满 ——
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

  /** 值班牌只在本期包含今天时显示倒计时；翻到别的月份就只保留月度统计与节奏条 */
  const today = todayKey()
  const todayInPeriod = period.dates.includes(today)
  const todayTodos = roster.todos.filter(todo => todo.date === today)
  const todayMeta = getCalendarMeta(today).label

  /** 本期逐日班次：模板 + 整天记录里的改写，供倒计时与节奏条使用 */
  const selfShifts = useMemo(() => {
    if (!self) return period.dates.map(() => '休息' as ShiftType)
    return period.dates.map(date => {
      const record = recordMap.get(overrideKey(self.id, date))
      return record?.shift ?? getTemplateShift(roster, self, date) ?? '休息'
    })
  }, [period.dates, recordMap, roster, self])

  /** 默认班次（模板）：节奏条按它分组，白特/夜特因此归进默认休息组 */
  const selfDefaultShifts = useMemo(() => {
    if (!self) return period.dates.map(() => '休息' as ShiftType)
    return period.dates.map(date => getTemplateShift(roster, self, date) ?? '休息')
  }, [period.dates, roster, self])

  const moment = useCurrentShift(period.dates, selfShifts)

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
        今日值班牌：概览页的第一问是「现在/下一班是什么、还有多久、这个月怎么排」。
        只讲本人，全员出勤口径仍留在矩阵页的概览条里；
        「本月实发」不再放这里，下面的薪资卡已经有一份，避免同一页两处同数。
      */}
      {self && stats ? (
        <TodayPlaque
          dates={period.dates}
          defaultShifts={selfDefaultShifts}
          moment={moment}
          onEditDate={date => onEdit(self, date)}
          personGroup={patternNameOf(roster, self.patternId)}
          personName={self.name}
          shifts={selfShifts}
          summary={stats.days}
          today={today}
          todayInPeriod={todayInPeriod}
          todayMeta={todayMeta}
          todayTodoCount={todayTodos.length}
        />
      ) : null}

      {/*
        日历 + 待办并排：日历固定 840，待办吃掉右边剩下的宽度。
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
