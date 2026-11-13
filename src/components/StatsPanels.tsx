import { formatMoney } from '../data/profile'
import { formatOvertimeHours } from '../data/overtime'
import { formatMonthDay, weekdayLabel } from '../data/dateUtils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { SHIFT_META, shiftToneClass, type ShiftType } from '../data/shifts'
import { Button } from '@/components/ui/button'
import {
  OVERTIME_KIND_LABEL,
  OVERTIME_PAY_FIELD,
  OVERTIME_RATES,
  payTier,
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

/** 天数可以是半天：整数不带小数点，0.5 保留一位 */
function formatDays(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
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
 * 加班分布柱形图的分类：白班 / 夜班 / 白特 / 夜特常态显示，法定有值才出现。
 *
 * 用的是**卡片归类**那套口径（`overtimeByGroup`）：
 * 标了法定的那天，加班只算进「法定」柱，不再重复计入它原本的班次柱 ——
 * 有法定时五柱相加正好等于总加班小时，能与薪资卡对账。
 *
 * 配色直接复用班次语义色类（`.t-day` 等，与日历、矩阵里的班次块同一套），
 * 法定没有对应班次，用「法」角标那套警示色。
 */
const OVERTIME_COLUMNS = [
  { group: '白班', label: '白班加班', tone: 'day' },
  { group: '夜班', label: '夜班加班', tone: 'night' },
  { group: '白特', label: '白特加班', tone: 'dayx' },
  { group: '夜特', label: '夜特加班', tone: 'nightx' },
  { group: '法定', label: '法定加班', tone: 'legal' }
] as const

/**
 * 月度概览的四块统计，2 × 2 铺在日历下方。
 *
 * 「每日明细」只列**有加班**的日子 —— 它的用途是让人看见「这天加的班值多少钱」，
 * 改过班但没加班的日子与工资无关，日历里已经能看见，塞进来只会稀释重点。
 */
export function StatsPanels({ stats, totalDays, onOpenProfile }: StatsPanelsProps) {
  const { days, leave, overtime, overtimeByGroup, salary, overtimeDays } = stats

  /**
   * 加班费胶囊的档位范围：当月最低 / 最高那天。
   * 放在这里算一次，避免每行都重新扫一遍列表。
   */
  const payRange = overtimeDays.reduce(
    (range, day) => ({
      min: Math.min(range.min, day.pay),
      max: Math.max(range.max, day.pay)
    }),
    { min: Infinity, max: 0 }
  )
  const minPay = Number.isFinite(payRange.min) ? payRange.min : 0
  const maxPay = payRange.max

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

  /**
   * 加班分布：白班 / 夜班 / 白特 / 夜特四根常态显示，法定柱只在真有法定加班时出现。
   * 没有法定加班时留一根 0h 柱只会让右边多一块空白，也会让人以为漏了数据。
   *
   * 高度按**最大值归一化**（最高的柱子画满绘图区）。固定刻度会让淡季的柱子全贴地，
   * 看不出分布；归一化后对比的是构成比例。零高度的其他柱子留一条基线。
   */
  const otColumns = OVERTIME_COLUMNS
    .map(column => ({
      ...column,
      hours: overtimeByGroup[column.group],
      /** 相对绘图区高度的百分比 */
      ratio: 0
    }))
    .filter(column => column.group !== '法定' || column.hours > 0)
  const otMax = otColumns.reduce((max, column) => Math.max(max, column.hours), 0)
  otColumns.forEach(column => {
    column.ratio = otMax > 0 ? (column.hours / otMax) * 100 : 0
  })

  return (
    <div className="stats-grid">
      <section className="stat-card card-surface" aria-label="本月概览">
        <header className="stat-head">
          <h2 className="stat-title">本月概览</h2>
          <span className="stat-note">共 {totalDays} 天</span>
        </header>

        <div className="day-counts">
          {cards.map(card => (
            <div className={`day-count is-${card.key}`} key={card.key}>
              <span className="day-count-num">{formatDays(card.days)}</span>
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
          出勤 <strong>{formatDays(days.work)}</strong> 天
          {leave.days > 0 ? (
            <> · 事假 <strong>{formatDays(leave.days)}</strong> 天</>
          ) : null}
        </p>
      </section>

      {/*
        高度不自己定：外壳只占一行（内容绝对定位、不参与高度计算），
        所以它对 grid 行高的贡献是 0，行高完全由左边的「本月概览」算；
        随后 grid 的 stretch 把外壳拉成同高，绝对定位的内层跟着铺满。
        否则加班分布的图表一旦需要更多高度，反过来会把本月概览撑高、留出空白。
      */}
      <section className="stat-card card-surface stat-card-ot" aria-label="加班分布">
        <div className="stat-card-ot-fill">
          <header className="stat-head">
            <h2 className="stat-title">加班分布</h2>
            <span className="stat-note"></span>
          </header>

          {overtime.total > 0 ? (
            <div className="ot-chart">
              <div className="ot-plot-row">
                {otColumns.map(column => (
                  <div className="ot-col" key={column.group}>
                    <div className="ot-col-plot">
                      {/*
                        柱子容器：数值绝对定位挂在柱子顶端**正上方**，
                        跟着柱子的高度走（不是排在绘图区顶部）。
                        上面的 margin-top 给数值腾出位置，
                        最高那根画满时数值也不会顶出卡片。
                      */}
                      <div className="ot-bar-wrap">
                        <span
                          className={`ot-col-value is-${column.tone}`}
                          style={{ bottom: `calc(${column.ratio}% + 3px)` }}
                        >
                          {formatOvertimeHours(column.hours)}
                        </span>
                        <div
                          className={`ot-bar is-${column.tone}`}
                          style={{ height: `${column.ratio}%` }}
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ot-axis-row">
                {otColumns.map(column => (
                  <span className="ot-col-label" key={column.group}>
                    {column.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="stat-empty">这个月还没有加班记录。</p>
          )}
        </div>
      </section>

      <section className="stat-card card-surface" aria-label="薪资计算">
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
                <span>{formatMoney(salary.overtimePay + salary.nightAllowance)}</span>
              </li>
              {OVERTIME_KINDS.map(kind => (
                <li className="money-row is-sub" key={kind}>
                  <span>
                    {OVERTIME_KIND_LABEL[kind]}
                    <em className="money-rate">×{OVERTIME_RATES[kind]}</em>
                  </span>
                  <span>{formatMoney(salary[OVERTIME_PAY_FIELD[kind]])}</span>
                </li>
              ))}
              <li className="money-row is-sub">
                <span>夜班津贴（{salary.nightDays} 天）</span>
                <span>{formatMoney(salary.nightAllowance)}</span>
              </li>

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

              <li className="money-summary">
                <div className="money-summary-item">
                  <span className="money-summary-label">应发</span>
                  <span className="money-summary-value">{formatMoney(salary.gross)}</span>
                </div>
                <div className="money-summary-item is-total">
                  <span className="money-summary-label">实发</span>
                  <span className="money-summary-value">{formatMoney(salary.net)}</span>
                </div>
              </li>
            </ul>

          </>
        ) : (
          <div className="stat-empty-block">
            <p className="stat-empty">还没填基本工资，算不出加班费与实发。</p>
            <Button onClick={onOpenProfile} type="button" variant="ghost">
              去「个人信息」填
            </Button>
          </div>
        )}
      </section>

      {/*
        高度不自己定：外壳只占一行（内容绝对定位、不参与高度计算），
        所以它被 grid 拉成和左边「薪资计算」一样高。
        薪资项将来变多时这张卡自动跟着长高，不需要维护任何高度常量。
      */}
      <section className="stat-card card-surface stat-card-detail" aria-label="每日明细">
        <div className="stat-card-fill">
          <header className="stat-head">
            <h2 className="stat-title">每日明细</h2>
            <span className="stat-note"></span>
          </header>

          {overtimeDays.length > 0 ? (
            <div className="detail-scroll [&_[data-slot=table-container]]:overflow-visible">
              <Table className="detail-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-10 bg-card" scope="col">日期</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card" scope="col">班次</TableHead>
                    <TableHead className="is-num sticky top-0 z-10 bg-card" scope="col">加班</TableHead>
                    <TableHead className="is-num sticky top-0 z-10 bg-card" scope="col">加班费</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overtimeDays.map(day => (
                    <TableRow className="border-b-0" key={day.date}>
                      <TableCell>
                        {formatMonthDay(day.date)}
                        <span className="detail-week">周{weekdayLabel(day.date)}</span>
                      </TableCell>
                      <TableCell>
                        {/*
                          班次块外面套一层：『法』用绝对定位挂在它右侧，
                          不参与宽度 —— 否则带法定标的那一行整体被挤偏，
                          同一列里各行的班次块对不齐（截图里看着"夜班"跳了一下）。
                        */}
                        <span className="detail-shift-wrap">
                          <span className={`detail-shift ${shiftToneClass(day.shift)}`}>
                            {SHIFT_META[day.shift].label}
                          </span>
                          {day.isLegal ? <span className="detail-legal">法</span> : null}
                        </span>
                      </TableCell>
                      <TableCell className="is-num">{formatOvertimeHours(day.hours)}</TableCell>
                      <TableCell className="is-num">
                        {salary.hasBase ? (
                          <span className={`pay-pill is-t${payTier(day.pay, maxPay, minPay)}`}>
                            {formatMoney(day.pay)}
                          </span>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
