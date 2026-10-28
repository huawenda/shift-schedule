import { formatMoney } from '../data/profile'
import { formatOvertimeHours } from '../data/overtime'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'
import { SHIFT_META, shiftToneClass, type ShiftType } from '../data/shifts'
import {
  OVERTIME_KIND_LABEL,
  OVERTIME_PAY_FIELD,
  OVERTIME_RATES,
  type MonthStats,
  type OvertimeKind
} from '../data/stats'

interface StatsPanelsProps {
  stats: MonthStats
  /** 天数总计（结算月 30 或 31），放在「本月概览」右上角 */
  totalDays: number
  /** 没填基本工资时的引导入口 */
  onOpenProfile: () => void
}

/** 六张卡片的数据形状：天数、右侧小时标记、以及是不是"扣项"样式 */
interface DayCard {
  key: string
  label: string
  days: number
  /** 加班合计（事假那格换成请假小时） */
  hours: number
  /** 事假用中性样式：请假是扣项，和"额外付出"的橙色不是一回事 */
  muted?: boolean
}

const OVERTIME_KINDS: OvertimeKind[] = ['weekday', 'special', 'legal']

/**
 * 月度概览的四块统计，2 × 2 铺在日历下方。
 *
 * 「每日明细」只列**有加班**的日子 —— 它的用途是让人看见「这天加的班值多少钱」，
 * 改过班但没加班的日子与工资无关，日历里已经能看见，塞进来只会稀释重点。
 */
export function StatsPanels({ stats, totalDays, onOpenProfile }: StatsPanelsProps) {
  const { days, leave, overtime, overtimeByGroup, salary, overtimeDays } = stats

  /**
   * 六张卡片：白 / 夜 / 休 / 特勤 / 事假 / 法定。
   *
   * - **特勤 = 白特 + 夜特**：两者单价一样（都按 ×2），分开看只是徒增两格
   * - **法定独立**：标了法定的那天（连它的加班）都算「法定」，已从白/夜/特勤里扣掉，
   *   所以六格相加正好是本期天数，加班也能一格对一桶
   * - 法定与休息不显示小时（这两类本身不产生加班）
   */
  const cards: DayCard[] = [
    { key: 'day', label: '白班', days: days.day, hours: overtimeByGroup.白班 },
    { key: 'night', label: '夜班', days: days.night, hours: overtimeByGroup.夜班 },
    { key: 'rest', label: '休息', days: days.rest, hours: 0 },
    {
      key: 'special',
      label: '特勤',
      days: days.daySpecial + days.nightSpecial,
      hours: overtimeByGroup.白特 + overtimeByGroup.夜特
    },
    { key: 'leave', label: '事假', days: days.leave, hours: leave.hours, muted: true },
    { key: 'legal', label: '法定', days: days.legal, hours: overtimeByGroup.法定 }
  ]

  return (
    <div className="stats-grid">
      <section className="stat-card" aria-label="本月概览">
        <header className="stat-head">
          <h2 className="stat-title">本月概览</h2>
          <span className="stat-note">共 {totalDays} 天</span>
        </header>

        <div className="day-counts">
          {cards.map(card => (
            <div className="day-count" key={card.key}>
              <span className="day-count-num">{card.days}</span>
              <span className="day-count-label">{card.label}</span>
              {card.hours > 0 ? (
                <span className={`day-count-extra${card.muted ? ' is-leave' : ''}`}>
                  {formatOvertimeHours(card.hours)}
                </span>
              ) : null}
            </div>
          ))}
        </div>

        <p className="stat-foot">
          出勤 <strong>{days.work}</strong> 天
          {leave.days > 0 ? (
            <> · 事假 <strong>{leave.days}</strong> 天</>
          ) : null}
        </p>
      </section>

      <section className="stat-card" aria-label="加班分布">
        <header className="stat-head">
          <h2 className="stat-title">加班分布</h2>
          <span className="stat-note"></span>
        </header>

        {overtime.total > 0 ? (
          <ul className="ot-list">
            {OVERTIME_KINDS.map(kind => (
              <li className="ot-row" key={kind}>
                <span className="ot-row-label">
                  {OVERTIME_KIND_LABEL[kind]}
                  <em className="ot-rate">×{OVERTIME_RATES[kind]}</em>
                </span>
                <span className="ot-row-value">{formatOvertimeHours(overtime[kind])}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="stat-empty">这个月还没有加班记录。</p>
        )}

        <p className="stat-foot">
          合计 <strong>{formatOvertimeHours(overtime.total)}</strong>
        </p>
      </section>

      <section className="stat-card" aria-label="薪资计算">
        <header className="stat-head">
          <h2 className="stat-title">薪资计算</h2>
          <span className="stat-note">时薪 {formatMoney(salary.hourlyWage)}</span>
        </header>

        {salary.hasBase ? (
          <>
            <ul className="money-list">
              <li className="money-group">
                <span>基本项</span>
                <span>{formatMoney(salary.fixedTotal)}</span>
              </li>
              <li className="money-row is-sub">
                <span>基本工资</span>
                <span>{formatMoney(salary.base)}</span>
              </li>
              <li className="money-row is-sub">
                <span>绩效津贴</span>
                <span>{formatMoney(salary.performance)}</span>
              </li>
              <li className="money-row is-sub">
                <span>岗位津贴</span>
                <span>{formatMoney(salary.position)}</span>
              </li>

              <li className="money-group">
                <span>加班工资</span>
                <span>{formatMoney(salary.overtimePay)}</span>
              </li>
              {OVERTIME_KINDS.map(kind => (
                <li className="money-row is-sub" key={kind}>
                  <span>{OVERTIME_KIND_LABEL[kind]}</span>
                  <span>{formatMoney(salary[OVERTIME_PAY_FIELD[kind]])}</span>
                </li>
              ))}

              <li className="money-group">
                <span>扣款项</span>
                <span>{formatMoney(salary.socialFund + salary.leaveDeduction)}</span>
              </li>
              <li className="money-row is-sub is-deduct">
                <span>社保公积金</span>
                <span>{formatMoney(salary.socialFund)}</span>
              </li>
              {salary.leaveHours > 0 ? (
                <li className="money-row is-sub is-deduct">
                  <span>事假扣款（{formatOvertimeHours(salary.leaveHours)}）</span>
                  <span>{formatMoney(salary.leaveDeduction)}</span>
              </li>
              ) : null}

              <li className="money-row is-strong">
                <span>应发</span>
                <span>{formatMoney(salary.gross)}</span>
              </li>
              <li className="money-row is-total">
                <span>实发</span>
                <span>{formatMoney(salary.net)}</span>
              </li>
            </ul>
            {salary.leaveHours > 0 ? null : (
              <p className="stat-hint">事假按「时薪 × 请假小时」扣款，半天记 4h、一天记 8h。</p>
            )}
          </>
        ) : (
          <div className="stat-empty-block">
            <p className="stat-empty">还没填基本工资，算不出加班费与实发。</p>
            <button className="btn btn-quiet" type="button" onClick={onOpenProfile}>
              去「个人资料」填
            </button>
          </div>
        )}
      </section>

      {/*
        高度不自己定：外壳只占一行（内容绝对定位、不参与高度计算），
        所以它被 grid 拉成和左边「薪资计算」一样高。
        薪资项将来变多时这张卡自动跟着长高，不需要维护任何高度常量。
      */}
      <section className="stat-card stat-card-detail" aria-label="每日明细">
        <div className="stat-card-fill">
          <header className="stat-head">
            <h2 className="stat-title">每日明细</h2>
            <span className="stat-note"></span>
          </header>

          {overtimeDays.length > 0 ? (
            <div className="detail-scroll">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th scope="col">日期</th>
                    <th scope="col">班次</th>
                    <th scope="col" className="is-num">加班</th>
                    <th scope="col" className="is-num">加班费</th>
                  </tr>
                </thead>
                <tbody>
                  {overtimeDays.map(day => (
                    <tr key={day.date}>
                      <td>
                        {formatMonthDay(day.date)}
                        <span className="detail-week">周{weekdayLabel(day.date)}</span>
                      </td>
                      <td>
                        <span className={`detail-shift ${shiftToneClass(day.shift)}`}>
                          {SHIFT_META[day.shift].label}
                        </span>
                        {day.isLegal ? <span className="detail-legal">法</span> : null}
                      </td>
                      <td className="is-num">{formatOvertimeHours(day.hours)}</td>
                      <td className="is-num">{salary.hasBase ? formatMoney(day.pay) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="stat-empty">这个月还没有加班记录。</p>
          )}

          {overtimeDays.length > 0 ? (
            <p className="stat-foot">
              合计 <strong>{formatOvertimeHours(overtime.total)}</strong>
              {salary.hasBase ? <> · 加班费 <strong>{formatMoney(salary.overtimePay)}</strong></> : null}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
