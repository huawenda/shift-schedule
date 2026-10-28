import { useMemo } from 'react'
import { getCalendarMeta } from '../data/calendarMeta'
import { getTemplateShift, overrideKey, patternLabelOf, type DayOverride, type Member, type Roster } from '../data/roster'
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
  onEdit: (member: Member, date: string) => void
}

/**
 * 个人日历：7 列，格子里放班次块 + 农历/节日角标。
 * 加班小时与「法」角标都挂在格子右上角；班次块的 1px 描边表示「与默认班次不同」。
 */
export function MonthCalendar({ roster, member, period, recordMap, onEdit }: MonthCalendarProps) {
  const today = todayKey()

  /**
   * 补齐 7 × N 的网格：前导补上个月的日期，末尾补下个月的日期。
   *
   * 周期外的格子**信息和周期内完全一样**（农历 + 班次 + 加班 / 法定 / 半天事假），
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
      <header className="calendar-head">
        <div>
          <p className="calendar-name">{member.name}</p>
          <p className="calendar-sub">{patternLabelOf(roster, member)} · {period.startDate} 起</p>
        </div>
      </header>

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

          // 半天事假才挂角标：一天是默认值，每格都挂就成了噪音
          const halfLeave = shift === '事假' && record?.leaveDuration === '半天'

          const titleParts = [
            date,
            shift ? SHIFT_META[shift].label : '—',
            shift === '事假' ? formatLeaveDuration(record?.leaveDuration) : '',
            overtime > 0 ? `加班 ${formatOvertimeHours(overtime)}` : '',
            record?.isLegal ? '法定' : '',
            shiftChanged ? '班次已改' : '',
            cell.inPeriod ? '' : '不在本期'
          ].filter(Boolean)

          const body = (
            <>
              <span className="cal-day">{formatDayNumber(date)}</span>
              <span className={`cal-meta${meta?.isFestival ? ' is-festival' : ''}`}>{meta?.label ?? ''}</span>

              {/* 加班、法定、半天事假挂在右上角，不挤班次那一行 */}
              {overtime > 0 || record?.isLegal || halfLeave ? (
                <span className="cal-corner">
                  {halfLeave ? <span className="cal-leave">半天</span> : null}
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
        <span className="legend-text">加班小时</span>
        <span className="cal-legal" aria-hidden="true">法</span>
        <span className="legend-text">法定节假日上班</span>
      </p>
    </section>
  )
}
