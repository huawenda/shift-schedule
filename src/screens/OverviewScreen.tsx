import { useMemo } from 'react'
import { MonthCalendar } from '../components/MonthCalendar'
import { StatsPanels } from '../components/StatsPanels'
import { TodoCard } from '../components/TodoCard'
import { formatMonthDay, todayKey, weekdayLabel } from '../data/dateUtils'
import { formatLeaveDuration } from '../data/leave'
import { formatOvertimeHours } from '../data/overtime'
import { formatPeriodRange, type Period } from '../data/period'
import { formatMoney } from '../data/profile'
import {
  getRecordMap,
  getSelf,
  getTemplateShift,
  overrideKey,
  patternNameOf,
  type Member,
  type Roster
} from '../data/roster'
import { SHIFT_META, shiftToneClass } from '../data/shifts'
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

  /** 今日条只在本期包含今天时出现；翻到别的月份就没有「今天」可言 */
  const today = todayKey()
  const todayInPeriod = period.dates.includes(today)
  const todayRecord = self ? recordMap.get(overrideKey(self.id, today)) : undefined
  const todayShift = self ? todayRecord?.shift ?? getTemplateShift(roster, self, today) : null
  const todayOvertime = todayRecord?.overtimeHours ?? 0
  const todayLeave = todayShift === '事假' ? formatLeaveDuration(todayRecord?.leaveDuration) : ''
  const todayTodos = roster.todos.filter(todo => todo.date === today)
  const todayOpen = todayTodos.filter(todo => !todo.done).length

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
        今日条：概览页的第一问是「我今天什么班、还有几件事、这个月能拿多少」。
        只讲本人，全员出勤口径仍留在矩阵页的概览条里。
      */}
      {todayInPeriod && self ? (
        <section className="today-strip" aria-label="今日概览">
          <div className="today-cell">
            <span className="today-label">今天</span>
            <span className="today-date">
              {formatMonthDay(today)}
              <span className="today-week">周{weekdayLabel(today)}</span>
            </span>
          </div>

          <div className="today-cell">
            <span className="today-label">今日班次</span>
            <div className="today-row">
              {todayShift ? (
                <button
                  aria-label={`改今天（${today}）的班次`}
                  className={`today-shift ${shiftToneClass(todayShift)}`}
                  type="button"
                  onClick={() => onEdit(self, today)}
                >
                  {SHIFT_META[todayShift].label}
                </button>
              ) : (
                <span className="today-shift is-blank">未排班</span>
              )}
              {todayOvertime > 0 ? (
                <span className="cal-ot" title={`今日加班 ${formatOvertimeHours(todayOvertime)}`}>
                  +{formatOvertimeHours(todayOvertime)}
                </span>
              ) : null}
              {todayRecord?.isLegal ? (
                <span className="cal-legal" aria-hidden="true" title="法定节假日">法</span>
              ) : null}
              {todayLeave ? (
                <span className="cal-leave" title={`事假 ${todayLeave}`}>{todayLeave}</span>
              ) : null}
            </div>
          </div>

          <div className="today-cell">
            <span className="today-label">今日待办</span>
            <span className="today-value">
              {todayTodos.length}
              <span className="today-unit">项</span>
            </span>
            <span className={`today-sub${todayTodos.length === 0 ? ' is-empty' : ''}`}>
              {todayTodos.length === 0
                ? '今天没有待办'
                : todayOpen > 0
                  ? `未完成 ${todayOpen} 项`
                  : '已经全部完成'}
            </span>
          </div>

          <div className="today-cell">
            <span className="today-label">本月实发</span>
            <span className="today-value is-money">
              {stats?.salary.hasBase ? `¥${formatMoney(stats.salary.net)}` : '—'}
            </span>
            {stats?.salary.hasBase ? null : (
              <span className="today-sub is-empty">未填基本工资</span>
            )}
          </div>
        </section>
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
