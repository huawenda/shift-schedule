import { useMemo } from 'react'
import { getCalendarMeta } from '../data/calendarMeta'
import { getTemplateShift, overrideKey, type DayOverride, type Member, type Roster } from '../data/roster'
import { formatOvertimeHours } from '../data/overtime'
import { formatLeaveDuration } from '../data/leave'
import type { Period } from '../data/period'
import { buildCalendarGrid } from '../data/period'
import { SHIFT_META, type ShiftType } from '../data/shifts'
import { WEEKDAY_LABELS, formatDayNumber, todayKey } from '../data/dateUtils'

interface MonthCalendarProps {
  roster: Roster
  member: Member | null
  period: Period
  /** 整天记录（班次 + 加班 + 法定） */
  recordMap: Map<string, DayOverride>
  /** 有待办的日期 → 待办条数（日期数字下压一道短横） */
  todoCounts: Map<string, number>
  onEdit: (member: Member, date: string) => void
}

/**
 * 个人日历：7 列，格子里放班次块 + 农历/节日角标。
 * 加班小时与「法」角标都挂在格子右上角；班次块的 1px 描边表示「与默认班次不同」。
 * 有待办的日子，日期数字下面压一道 2px 橙短横（不是旁边飘个小圆点）。
 *
 * 日历自己**没有标题**：本人姓名与班序已经写在页面副标题（月度概览 · 10月20日 - 11月19日 ·
 * 华文达 · 4F）里了，再在网格上方重复一遍是同一句话说两次。
 */
export function MonthCalendar({
  roster,
  member,
  period,
  recordMap,
  todoCounts,
  onEdit
}: MonthCalendarProps) {
  const today = todayKey()

  /**
   * 补齐 7 × N 的网格：前导补上个月的日期，末尾补下个月的日期。
   *
   * 周期外的格子**信息和周期内完全一样**（农历 + 班次 + 加班 / 法定 / 4h 事假），
   * 区别只在两处：样式淡化一档，以及不可点击 —— 它们属于相邻两期，
   * 改这里的班等于改另一期，应该翻到那一期去做。
   */
  const cells = useMemo(() => buildCalendarGrid(period), [period])

  const metas = useMemo(
    () => new Map(cells.map(cell => [cell.date, getCalendarMeta(cell.date)])),
    [cells]
  )

  if (!member) {
    return (
      <div className="empty">
        <p className="empty-title">还没有设置本人</p>
        <p className="empty-text">
          个人日历只显示本人。到「设置 → 个人资料」里填上你的姓名与班序，这里就会出现你自己的月历。
        </p>
      </div>
    )
  }

  return (
    <section className="calendar" aria-label={`${member.name} 的月历`}>
      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map(label => <span key={label}>{label}</span>)}
      </div>

      <div className="calendar-grid">
        {cells.map(cell => {
          const date = cell.date
          const record = recordMap.get(overrideKey(member.id, date))
          const templateShift = getTemplateShift(roster, member, date)
          const shift: ShiftType | null = record?.shift ?? templateShift
          // 三种信息各占一处，互不重复：
          //   班次块描边 = 这天班次与默认不同 · 右上角橙标 = 加班小时 · 「法」= 法定
          // 所以只记了加班、没动班次的日子，描边不该出现。
          const shiftChanged = Boolean(record) && record?.shift !== templateShift
          const overtime = record?.overtimeHours ?? 0
          const meta = metas.get(date)
          const isToday = date === today
          // 有待办：格子左下角画一个小圆点（与右上角的加班/法定角标分开）
          const todoCount = todoCounts.get(date) ?? 0

          // 事假都挂角标，显示实际时长（4h 或 8h；没记时长默认 8h）
          const leaveLabel = shift === '事假' ? formatLeaveDuration(record?.leaveDuration) : ''

          const titleParts = [
            date,
            shift ? SHIFT_META[shift].label : '—',
            shift === '事假' ? formatLeaveDuration(record?.leaveDuration) : '',
            overtime > 0 ? `加班 ${formatOvertimeHours(overtime)}` : '',
            record?.isLegal ? '法定' : '',
            shiftChanged ? '班次已改' : '',
            todoCount > 0 ? `待办 ${todoCount} 项` : '',
            cell.inPeriod ? '' : '不在本期'
          ].filter(Boolean)

          const body = (
            <>
              {/* 有待办的日子，日期数字下面压一道 2px 橙短横（见 .cal-day.is-todo）。
               * 不再在数字右边画小圆点 —— 6px 圆点 + 1px 描边贴在 12px 数字旁，
               * 像笔画溢出来的一个脏点，还跟右上角的加班角标抢注意力。 */}
              <span className={`cal-day${todoCount > 0 ? ' is-todo' : ''}`}>{formatDayNumber(date)}</span>
              <span className={`cal-meta${meta?.isFestival ? ' is-festival' : ''}`}>{meta?.label ?? ''}</span>

              {/* 加班、法定、事假时长挂在右上角，不挤班次那一行 */}
              {overtime > 0 || record?.isLegal || leaveLabel ? (
                <span className="cal-corner">
                  {leaveLabel ? <span className="cal-leave">{leaveLabel}</span> : null}
                  {record?.isLegal ? <span className="cal-legal" aria-hidden="true">法</span> : null}
                  {overtime > 0 ? <span className="cal-ot">+{formatOvertimeHours(overtime)}</span> : null}
                </span>
              ) : null}

              {shift ? (
                <span className={`cal-shift t-${SHIFT_META[shift].tone}${shiftChanged ? ' is-changed' : ''}`}>
                  {SHIFT_META[shift].label}
                </span>
              ) : (
                <span className="cal-shift is-blank">—</span>
              )}
            </>
          )

          // 周期外：内容一模一样，只是淡一档且不可点 —— 改这里等于改相邻那一期
          if (!cell.inPeriod) {
            return (
              <div className="cal-cell is-outside" key={cell.key} title={titleParts.join(' · ')}>
                {body}
              </div>
            )
          }

          return (
            <button
              className={`cal-cell${isToday ? ' is-today' : ''}`}
              key={cell.key}
              type="button"
              onClick={() => onEdit(member, date)}
              title={titleParts.join(' · ')}
            >
              {body}
            </button>
          )
        })}
      </div>

      <p className="calendar-legend">
        <span className="cal-ot">+2h</span>
        <span className="legend-text">加班数</span>
        <span className="cal-legal" aria-hidden="true">法</span>
        <span className="legend-text">法定节假日</span>
      </p>
    </section>
  )
}
