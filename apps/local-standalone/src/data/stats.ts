/**
 * 月度统计：一批纯函数，给「月度概览」页的四个区块供数。
 *
 * 口径全部抄自 web 的 `calculateSalary` 与统计页，不另造一套：
 * - 加班分三桶计价：平日 ×1.5、特勤（白特/夜特）×2、法定 ×3
 * - 时薪 = 基本工资 ÷ 21.75 ÷ 8，**计算时用未四舍五入的中间值**，
 *   只在每个分项落地时 round 到分（否则三类加班费相加会与手算差几分）
 * - 事假扣款 = 时薪 × 请假小时（半天 4h / 一天 8h，没记时长按一天）
 */

import { leaveHoursOf } from './leave'
import type { Period } from './period'
import { parseMoney, type SalaryInput } from './profile'
import { getRecordMap, getTemplateShift, overrideKey, type Member, type Roster } from './roster'
import { isWorkShift, type ShiftType } from './shifts'

/** 加班的三个计价桶 —— 倍率不同，所以必须分开统计 */
export type OvertimeKind = 'weekday' | 'special' | 'legal'

export const OVERTIME_RATES: Record<OvertimeKind, number> = {
  weekday: 1.5,
  special: 2,
  legal: 3
}

export const OVERTIME_KIND_LABEL: Record<OvertimeKind, string> = {
  weekday: '平日加班',
  special: '特勤加班',
  legal: '法定加班'
}

/** 三个计价桶各自的金额字段：界面按桶逐项列工资时用它取值 */
export const OVERTIME_PAY_FIELD: Record<OvertimeKind, 'weekdayPay' | 'specialPay' | 'legalPay'> = {
  weekday: 'weekdayPay',
  special: 'specialPay',
  legal: 'legalPay'
}

/** 一间公司一年才变一次的口径，集中放这里，将来要改只改这一处 */
export const MONTHLY_WORK_DAYS = 21.75
export const HOURS_PER_DAY = 8

/**
 * 夜班津贴标准：每个夜班额外发 15 元。
 *
 * 固定值，不做成可配置项 —— 这是公司统一的补贴标准，不是个人参数，
 * 放进「个人资料」反而会让人以为每人能各填各的。
 */
export const NIGHT_ALLOWANCE_PER_DAY = 15

export interface ShiftDayCounts {
  day: number
  night: number
  rest: number
  daySpecial: number
  nightSpecial: number
  leave: number
  /**
   * 法定天数。
   *
   * **与班次互斥**：标了法定的那一天算「法定」，就不再算进白班 / 夜班 / 白特 / 夜特。
   * 这样「本月概览」六张卡片的数字相加刚好等于本期天数，不会出现
   * 「12 白班 + 1 法定 = 13，而本月只有 31 天里却数出 32」这种重复。
   */
  legal: number
  /** 出勤天数 = 白 + 夜 + 白特 + 夜特 + 法定（法定那天也是上班） */
  work: number
}

export interface LeaveSummary {
  days: number
  /** 事假小时合计：半天 4h、一天 8h（没记时长按一天） */
  hours: number
}

export interface OvertimeTotals {
  weekday: number
  special: number
  legal: number
  total: number
}

/**
 * 夜班津贴的核算依据。
 *
 * **口径 = 所有夜间出勤**：只要那天上的是夜班（含夜特、含被标了法定的夜班）
 * 就计一天。这与「本月概览」六张卡片的互斥分类**是两套口径**：
 * 卡片里法定夜班归到「法定」格、夜特归到「特勤」格，
 * 但津贴照发 —— 那天确实在夜里上班。
 *
 * 所以这个计数必须独立于卡片分类单独累加，不能从 days.night / days.nightSpecial 里凑。
 */
export interface NightAllowance {
  /** 本月夜班天数（含夜特与法定夜班） */
  days: number
  /** 津贴金额 = 天数 × NIGHT_ALLOWANCE_PER_DAY */
  amount: number
}

/**
 * 加班按**卡片归类**汇总（另一个维度，与三个计价桶正交）。
 *
 * 键是「本月概览」上的那一格，不是真实班次：
 * 标了法定的那一天，加班算到 `法定` 上，不再算进白班/夜班/特勤。
 * 这样每一格只对应一个计价桶，能直接对账：
 *
 * ```
 * 白班格 + 夜班格 = 平日桶（×1.5）
 * 特勤格          = 特勤桶（×2）
 * 法定格          = 法定桶（×3）
 * ```
 *
 * 代价是「法定 1 天 · 10h」看不出那天原本是白班还是夜班 —— 想看真实班次去「每日明细」。
 */
export type OvertimeGroupKey = ShiftType | '法定'

export type OvertimeByGroup = Record<OvertimeGroupKey, number>

export interface SalaryBreakdown {
  base: number
  performance: number
  position: number
  /** 固定应发（不含加班）＝ 基本 + 绩效 + 岗位 */
  fixedTotal: number
  weekdayPay: number
  specialPay: number
  legalPay: number
  /** 三类加班费合计 */
  overtimePay: number
  /** 夜班津贴 = 夜班天数 × 15 */
  nightAllowance: number
  /** 本月夜班天数（含夜特与法定夜班） */
  nightDays: number
  /** 社保公积金（每月个人缴纳合计，算作扣款） */
  socialFund: number
  /** 事假小时合计 */
  leaveHours: number
  /** 事假扣款 = 时薪 × 请假小时 */
  leaveDeduction: number
  /** 应发 = 固定应发 + 加班费 + 夜班津贴 */
  gross: number
  /** 实发 = 应发 − 社保公积金 − 事假扣款 */
  net: number
  /** 展示用的时薪（已 round 到分）；算钱时用的是未 round 的中间值 */
  hourlyWage: number
  /** 基本工资是否填了 —— 没填就算不出任何钱的数 */
  hasBase: boolean
}

export interface OvertimeDay {
  date: string
  shift: ShiftType
  hours: number
  kind: OvertimeKind
  isLegal: boolean
  /** 这一天的加班费（已 round 到分） */
  pay: number
}

export interface MonthStats {
  days: ShiftDayCounts
  leave: LeaveSummary
  overtime: OvertimeTotals
  /** 按「本月概览」的格归类汇总的加班小时 —— 法定日归到「法定」格 */
  overtimeByGroup: OvertimeByGroup
  /** 夜班津贴核算依据（口径与上面的互斥分类不同，见 NightAllowance） */
  nightAllowance: NightAllowance
  salary: SalaryBreakdown
  /** 有加班的日子，按日期升序 —— 给「每日明细」 */
  overtimeDays: OvertimeDay[]
}

/** 钱的统一取整：四舍五入到分 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * 一条记录的加班属于哪一桶。
 *
 * 顺序不能反：**法定优先**（标了法定的白班按 ×3，不再走 ×1.5），
 * 其次才是特勤班次（白特/夜特 ×2），剩下的白/夜按平日 ×1.5。
 */
export function overtimeKindOf(shift: ShiftType, isLegal: boolean): OvertimeKind | null {
  if (!isWorkShift(shift)) return null
  if (isLegal) return 'legal'
  if (shift === '白特' || shift === '夜特') return 'special'
  return 'weekday'
}

/** 时薪：基本工资 ÷ 21.75 ÷ 8。不 round —— 中间值参与后续计算 */
export function rawHourlyWage(baseSalary: string): number {
  const base = parseMoney(baseSalary)
  if (base <= 0) return 0
  return base / MONTHLY_WORK_DAYS / HOURS_PER_DAY
}

export function emptySalaryBreakdown(salary?: SalaryInput): SalaryBreakdown {
  const base = parseMoney(salary?.baseSalary ?? '')
  const performance = parseMoney(salary?.performanceAllowance ?? '')
  const position = parseMoney(salary?.positionAllowance ?? '')
  const socialFund = parseMoney(salary?.socialFund ?? '')
  const fixedTotal = roundMoney(base + performance + position)
  return {
    base,
    performance,
    position,
    fixedTotal,
    weekdayPay: 0,
    specialPay: 0,
    legalPay: 0,
    overtimePay: 0,
    nightAllowance: 0,
    nightDays: 0,
    socialFund,
    leaveHours: 0,
    leaveDeduction: 0,
    gross: fixedTotal,
    net: roundMoney(fixedTotal - socialFund),
    hourlyWage: roundMoney(rawHourlyWage(salary?.baseSalary ?? '')),
    hasBase: base > 0
  }
}

/**
 * 算一个人一个结算月的全部统计。
 *
 * 逐日推算：覆盖记录优先，没有就回落到班序模板（`getTemplateShift`）。
 * 模板也算不出来（班序被删了之类）就跳过这一天，不让它变成 0 天的假数据。
 */
export function computeMonthStats(roster: Roster, member: Member, period: Period): MonthStats {
  const recordMap = getRecordMap(roster)

  const days: ShiftDayCounts = {
    day: 0,
    night: 0,
    rest: 0,
    daySpecial: 0,
    nightSpecial: 0,
    leave: 0,
    legal: 0,
    work: 0
  }
  const leave: LeaveSummary = { days: 0, hours: 0 }
  const overtime: OvertimeTotals = { weekday: 0, special: 0, legal: 0, total: 0 }
  /** 夜班天数：独立于上面的互斥分类单独累加（见 NightAllowance 的口径说明） */
  let nightDays = 0
  const overtimeByGroup: OvertimeByGroup = {
    白班: 0,
    夜班: 0,
    休息: 0,
    白特: 0,
    夜特: 0,
    事假: 0,
    法定: 0
  }
  const overtimeDays: OvertimeDay[] = []

  const salaryInput = roster.profile?.salary
  const hourly = rawHourlyWage(salaryInput?.baseSalary ?? '')

  period.dates.forEach(date => {
    const record = recordMap.get(overrideKey(member.id, date))
    const shift = record?.shift ?? getTemplateShift(roster, member, date)
    if (!shift) return

    const isLegal = record?.isLegal === true
    // 法定与班次**互斥**：这一天归「法定」，就不再计入白/夜/特勤 ——
    // 否则六张卡片相加会超出本期天数（同一天被数两次）。
    const asLegal = isLegal && isWorkShift(shift)

    // 夜班津贴的天数：只要那天上的是夜班就算一天（夜特也算），
    // 与上面的互斥分类无关 —— 法定夜班在卡片里归「法定」格，津贴照发。
    // 放在 switch 之前累加，免得被 asLegal 分支跳过。
    if (shift === '夜班' || shift === '夜特') {
      nightDays += 1
    }

    if (asLegal) {
      days.legal += 1
    } else {
      switch (shift) {
        case '白班': days.day += 1; break
        case '夜班': days.night += 1; break
        case '休息': days.rest += 1; break
        case '白特': days.daySpecial += 1; break
        case '夜特': days.nightSpecial += 1; break
        case '事假': days.leave += 1; break
      }
    }
    // 法定那天照样出勤
    if (isWorkShift(shift)) days.work += 1

    // 事假：天数已在上面的 switch 里计过，这里补小时数
    if (shift === '事假') {
      leave.days += 1
      leave.hours += leaveHoursOf(record?.leaveDuration)
    }

    const hours = record?.overtimeHours ?? 0
    if (hours <= 0) return

    const kind = overtimeKindOf(shift, isLegal)
    if (!kind) return

    overtime[kind] += hours
    overtime.total += hours
    // 法定日归到「法定」格：它在卡片上是独立一格，加班也跟着走，
    // 否则白班格会跨「平日」和「法定」两个桶，没法对账
    overtimeByGroup[asLegal ? '法定' : shift] += hours
    overtimeDays.push({
      date,
      shift,
      hours,
      kind,
      isLegal,
      pay: roundMoney(hourly * OVERTIME_RATES[kind] * hours)
    })
  })

  overtime.weekday = roundMoney(overtime.weekday)
  overtime.special = roundMoney(overtime.special)
  overtime.legal = roundMoney(overtime.legal)
  overtime.total = roundMoney(overtime.weekday + overtime.special + overtime.legal)

  // 按格汇总也要收敛一下（累计可能出现浮点尾巴）
  for (const group of Object.keys(overtimeByGroup) as OvertimeGroupKey[]) {
    overtimeByGroup[group] = roundMoney(overtimeByGroup[group])
  }

  leave.hours = roundMoney(leave.hours)

  // 夜班津贴 = 夜班天数 × 15。它不依赖基本工资 ——
  // 津贴是固定标准，跟时薪算不出来时无关，所以放在 hasBase 分支外面。
  const nightAllowance: NightAllowance = {
    days: nightDays,
    amount: roundMoney(nightDays * NIGHT_ALLOWANCE_PER_DAY)
  }

  const salary = emptySalaryBreakdown(salaryInput)
  salary.leaveHours = leave.hours
  salary.nightDays = nightAllowance.days
  salary.nightAllowance = nightAllowance.amount

  // 加班费要时薪，没填基本工资就算不出来
  if (salary.hasBase) {
    // 与 core 一致：每个分项先 round，再相加后 round 一次
    salary.weekdayPay = roundMoney(hourly * overtime.weekday * OVERTIME_RATES.weekday)
    salary.specialPay = roundMoney(hourly * overtime.special * OVERTIME_RATES.special)
    salary.legalPay = roundMoney(hourly * overtime.legal * OVERTIME_RATES.legal)
    salary.overtimePay = roundMoney(salary.weekdayPay + salary.specialPay + salary.legalPay)
  }

  // 事假扣款与 core 的 leaveDeduction 同口径：时薪（未 round）× 小时，再 round。
  // 没填基本工资时 hourly 为 0，扣款自然是 0。
  salary.leaveDeduction = roundMoney(hourly * leave.hours)

  // 应发 = 固定应发 + 加班费 + 夜班津贴
  salary.gross = roundMoney(salary.fixedTotal + salary.overtimePay + salary.nightAllowance)
  salary.net = roundMoney(salary.gross - salary.socialFund - salary.leaveDeduction)

  return { days, leave, overtime, overtimeByGroup, nightAllowance, salary, overtimeDays }
}
