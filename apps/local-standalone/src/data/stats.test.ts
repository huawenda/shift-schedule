import { describe, expect, it } from 'vitest'
import {
  computeMonthStats,
  emptySalaryBreakdown,
  overtimeKindOf,
  rawHourlyWage,
  roundMoney
} from './stats'
import { getPeriod } from './period'
import { emptySalary } from './profile'
import type { Member, Roster } from './roster'

const period = getPeriod({ year: 2026, month: 11 }) // 2026-10-20 ~ 2026-11-19，31 天
const member: Member = { id: 'm1', name: '华文达', patternId: '4F' }

function makeRoster(overrides: Roster['overrides'] = [], salary = emptySalary): Roster {
  return {
    members: [member],
    overrides,
    patterns: [],
    profile: { memberId: 'm1', salary },
    updatedAt: 0
  }
}

const filledSalary = {
  baseSalary: '8000',
  performanceAllowance: '1200',
  positionAllowance: '600',
  socialFund: '1500'
}

describe('加班分桶', () => {
  it('法定优先于特勤，特勤优先于平日', () => {
    expect(overtimeKindOf('白班', false)).toBe('weekday')
    expect(overtimeKindOf('夜班', false)).toBe('weekday')
    expect(overtimeKindOf('白特', false)).toBe('special')
    expect(overtimeKindOf('夜特', false)).toBe('special')
    // 白班标了法定 → ×3，不再按 ×1.5
    expect(overtimeKindOf('白班', true)).toBe('legal')
    expect(overtimeKindOf('白特', true)).toBe('legal')
  })

  it('休息与事假没有加班桶', () => {
    expect(overtimeKindOf('休息', false)).toBe(null)
    expect(overtimeKindOf('事假', true)).toBe(null)
  })
})

describe('时薪', () => {
  it('基本工资 ÷ 21.75 ÷ 8，不做四舍五入', () => {
    expect(rawHourlyWage('8000')).toBeCloseTo(8000 / 21.75 / 8, 10)
  })

  it('没填基本工资时是 0，不会算出负数或 NaN', () => {
    expect(rawHourlyWage('')).toBe(0)
    expect(rawHourlyWage('abc')).toBe(0)
  })
})

describe('月度天数与加班汇总', () => {
  it('模板日也能统计（没有覆盖记录时就按班序推）', () => {
    const stats = computeMonthStats(makeRoster(), member, period)
    // 一个月 31 天必须被完整分类，不能有漏
    const sum =
      stats.days.day + stats.days.night + stats.days.rest +
      stats.days.daySpecial + stats.days.nightSpecial + stats.days.leave + stats.days.legal
    expect(sum).toBe(period.dates.length)
    // 法定那天照样出勤
    expect(stats.days.work).toBe(
      stats.days.day + stats.days.night + stats.days.daySpecial + stats.days.nightSpecial + stats.days.legal
    )
  })

  it('三类加班分开计数，并单独统计法定天数', () => {
    const roster = makeRoster([
      { memberId: 'm1', date: period.dates[0], shift: '白班', overtimeHours: 2 },
      { memberId: 'm1', date: period.dates[1], shift: '白特', overtimeHours: 10 },
      { memberId: 'm1', date: period.dates[2], shift: '夜班', overtimeHours: 3, isLegal: true }
    ])
    const stats = computeMonthStats(roster, member, period)

    expect(stats.overtime.weekday).toBe(2)
    expect(stats.overtime.special).toBe(10)
    expect(stats.overtime.legal).toBe(3)
    expect(stats.overtime.total).toBe(15)
    expect(stats.days.legal).toBe(1)
  })

  it('只记加班、班次没改的日子同样进统计（覆盖记录里的班次就是模板值）', () => {
    const roster = makeRoster([
      { memberId: 'm1', date: period.dates[0], shift: '白班', overtimeHours: 2 }
    ])
    const stats = computeMonthStats(roster, member, period)
    expect(stats.overtimeDays).toHaveLength(1)
    expect(stats.overtimeDays[0].hours).toBe(2)
  })

  it('加班明细按日期升序，且带当天加班费', () => {
    const roster = makeRoster(
      [
        { memberId: 'm1', date: period.dates[5], shift: '白班', overtimeHours: 2 },
        { memberId: 'm1', date: period.dates[1], shift: '夜班', overtimeHours: 3 }
      ],
      filledSalary
    )
    const stats = computeMonthStats(roster, member, period)
    expect(stats.overtimeDays.map(day => day.date)).toEqual([period.dates[1], period.dates[5]])
  })
})

describe('加班费与薪资', () => {
  it('三类加班按 1.5 / 2 / 3 倍算，分项 round 到分', () => {
    const roster = makeRoster(
      [
        { memberId: 'm1', date: period.dates[0], shift: '白班', overtimeHours: 2 },
        { memberId: 'm1', date: period.dates[1], shift: '白特', overtimeHours: 10 },
        { memberId: 'm1', date: period.dates[2], shift: '夜班', overtimeHours: 3, isLegal: true }
      ],
      filledSalary
    )
    const stats = computeMonthStats(roster, member, period)
    const hourly = 8000 / 21.75 / 8

    expect(stats.salary.weekdayPay).toBe(roundMoney(hourly * 2 * 1.5))
    expect(stats.salary.specialPay).toBe(roundMoney(hourly * 10 * 2))
    expect(stats.salary.legalPay).toBe(roundMoney(hourly * 3 * 3))
    expect(stats.salary.overtimePay).toBe(
      roundMoney(stats.salary.weekdayPay + stats.salary.specialPay + stats.salary.legalPay)
    )
  })

  it('应发 = 基本 + 绩效 + 岗位 + 加班费；实发再减社保公积金', () => {
    const roster = makeRoster(
      [{ memberId: 'm1', date: period.dates[0], shift: '白班', overtimeHours: 2 }],
      filledSalary
    )
    const stats = computeMonthStats(roster, member, period)

    expect(stats.salary.fixedTotal).toBe(9800)
    expect(stats.salary.gross).toBe(roundMoney(9800 + stats.salary.overtimePay))
    expect(stats.salary.net).toBe(roundMoney(stats.salary.gross - 1500))
  })

  it('没有加班时加班费为 0，实发仍然算得出来', () => {
    const stats = computeMonthStats(makeRoster([], filledSalary), member, period)
    expect(stats.salary.overtimePay).toBe(0)
    expect(stats.salary.net).toBe(8300)
  })

  it('没填基本工资：所有钱的数字都是 0，hasBase 为 false', () => {
    const roster = makeRoster([
      { memberId: 'm1', date: period.dates[0], shift: '白班', overtimeHours: 2 }
    ])
    const stats = computeMonthStats(roster, member, period)
    expect(stats.salary.hasBase).toBe(false)
    expect(stats.salary.overtimePay).toBe(0)
    expect(stats.salary.hourlyWage).toBe(0)
    // 加班小时本身照常统计，只是算不出钱
    expect(stats.overtime.weekday).toBe(2)
  })

  it('每日明细的加班费与分桶合计一致', () => {
    const roster = makeRoster(
      [
        { memberId: 'm1', date: period.dates[0], shift: '白班', overtimeHours: 2 },
        { memberId: 'm1', date: period.dates[1], shift: '夜班', overtimeHours: 2.5 }
      ],
      filledSalary
    )
    const stats = computeMonthStats(roster, member, period)
    const sum = roundMoney(stats.overtimeDays.reduce((total, day) => total + day.pay, 0))
    expect(sum).toBe(stats.salary.weekdayPay)
  })

  it('没设本人 / 没有 profile 时照常出天数，钱全为 0', () => {
    const roster: Roster = { ...makeRoster(), profile: null }
    const stats = computeMonthStats(roster, member, period)
    expect(stats.salary.hasBase).toBe(false)
    expect(stats.days.rest + stats.days.day + stats.days.night).toBeGreaterThan(0)
  })
})

describe('空薪资', () => {
  it('四项全空时 hasBase 为 false，应发与实发都是 0', () => {
    const salary = emptySalaryBreakdown(emptySalary)
    expect(salary.hasBase).toBe(false)
    expect(salary.gross).toBe(0)
    expect(salary.net).toBe(0)
  })

  it('只填社保公积金也算不出应发', () => {
    const salary = emptySalaryBreakdown({ ...emptySalary, socialFund: '1500' })
    expect(salary.hasBase).toBe(false)
    expect(salary.socialFund).toBe(1500)
    expect(salary.gross).toBe(0)
  })
})


describe('事假扣款', () => {
  it('半天事假计 4 小时，按 时薪 × 4 扣款', () => {
    const roster = makeRoster(
      [{ memberId: 'm1', date: period.dates[3], shift: '事假', leaveDuration: '半天' }],
      filledSalary
    )
    const stats = computeMonthStats(roster, member, period)
    const hourly = 8000 / 21.75 / 8

    expect(stats.leave.days).toBe(1)
    expect(stats.leave.hours).toBe(4)
    expect(stats.salary.leaveDeduction).toBe(roundMoney(hourly * 4))
    expect(stats.salary.net).toBe(roundMoney(9800 - 1500 - stats.salary.leaveDeduction))
  })

  it('没记时长的事假按一天 8 小时算', () => {
    const roster = makeRoster([{ memberId: 'm1', date: period.dates[3], shift: '事假' }], filledSalary)
    const stats = computeMonthStats(roster, member, period)
    expect(stats.leave.hours).toBe(8)
  })

  it('多天事假小时累加（半天 + 一天 = 12h）', () => {
    const roster = makeRoster(
      [
        { memberId: 'm1', date: period.dates[3], shift: '事假', leaveDuration: '半天' },
        { memberId: 'm1', date: period.dates[4], shift: '事假', leaveDuration: '一天' }
      ],
      filledSalary
    )
    const stats = computeMonthStats(roster, member, period)
    expect(stats.leave).toEqual({ days: 2, hours: 12 })
  })

  it('加班与事假可以同时存在，两笔一起算进实发', () => {
    const roster = makeRoster(
      [
        { memberId: 'm1', date: period.dates[0], shift: '白班', overtimeHours: 2 },
        { memberId: 'm1', date: period.dates[3], shift: '事假', leaveDuration: '半天' }
      ],
      filledSalary
    )
    const stats = computeMonthStats(roster, member, period)
    expect(stats.salary.net).toBe(
      roundMoney(9800 + stats.salary.overtimePay - 1500 - stats.salary.leaveDeduction)
    )
  })

  it('没填基本工资：事假小时照常统计，但扣款为 0', () => {
    const roster = makeRoster([
      { memberId: 'm1', date: period.dates[3], shift: '事假', leaveDuration: '半天' }
    ])
    const stats = computeMonthStats(roster, member, period)
    expect(stats.leave.hours).toBe(4)
    expect(stats.salary.leaveDeduction).toBe(0)
    expect(stats.salary.hasBase).toBe(false)
  })
})

describe('按班次汇总的加班小时', () => {
  it('把加班记到对应的班次上，天数与加班互不干扰', () => {
    const roster = makeRoster(
      [
        { memberId: 'm1', date: period.dates[0], shift: '白班', overtimeHours: 2 },
        { memberId: 'm1', date: period.dates[1], shift: '白班', overtimeHours: 3.5 },
        { memberId: 'm1', date: period.dates[2], shift: '夜班', overtimeHours: 10 },
        { memberId: 'm1', date: period.dates[3], shift: '白特', overtimeHours: 11 }
      ],
      filledSalary
    )

    const stats = computeMonthStats(roster, member, period)
    expect(stats.overtimeByGroup).toEqual({
      白班: 5.5,
      夜班: 10,
      休息: 0,
      白特: 11,
      夜特: 0,
      事假: 0,
      法定: 0
    })
    // 天数只数天，不受加班影响
    expect(stats.days.day).toBeGreaterThanOrEqual(1)
  })

  it('七格（含法定）的加班合计等于总加班小时 —— 两个维度必须对得上', () => {
    const roster = makeRoster(
      [
        { memberId: 'm1', date: period.dates[0], shift: '白班', overtimeHours: 2 },
        { memberId: 'm1', date: period.dates[1], shift: '夜班', overtimeHours: 3 },
        { memberId: 'm1', date: period.dates[2], shift: '白特', overtimeHours: 10 },
        { memberId: 'm1', date: period.dates[3], shift: '夜特', overtimeHours: 11.5 },
        // 同一天不可能既白班又夜班，但不同日可以有不同的法定标记
        { memberId: 'm1', date: period.dates[4], shift: '白班', overtimeHours: 3, isLegal: true }
      ],
      filledSalary
    )

    const stats = computeMonthStats(roster, member, period)
    const byGroup = Object.values(stats.overtimeByGroup).reduce((sum, hours) => sum + hours, 0)
    expect(roundMoney(byGroup)).toBe(stats.overtime.total)
  })

  it('休息与事假不会带上加班小时', () => {
    const roster = makeRoster(
      [
        { memberId: 'm1', date: period.dates[0], shift: '休息', overtimeHours: 5 },
        { memberId: 'm1', date: period.dates[1], shift: '事假', overtimeHours: 5 }
      ],
      filledSalary
    )

    const stats = computeMonthStats(roster, member, period)
    expect(stats.overtimeByGroup.休息).toBe(0)
    expect(stats.overtimeByGroup.事假).toBe(0)
    expect(stats.overtime.total).toBe(0)
  })
})

describe('法定与班次互斥', () => {
  const twoWhiteDays = (legal: boolean) => makeRoster([
    { memberId: 'm1', date: period.dates[0], shift: '白班' },
    { memberId: 'm1', date: period.dates[1], shift: '白班', isLegal: legal }
  ])

  it('标了法定的那天从白班里扣掉，只算进「法定」', () => {
    const base = computeMonthStats(twoWhiteDays(false), member, period)
    const withLegal = computeMonthStats(twoWhiteDays(true), member, period)

    expect(withLegal.days.day).toBe(base.days.day - 1)
    expect(base.days.legal).toBe(0)
    expect(withLegal.days.legal).toBe(1)
    // 出勤天数不变：法定那天照样上班
    expect(withLegal.days.work).toBe(base.days.work)
  })

  it('六格（白/夜/休/特勤/事假/法定）相加仍等于本期天数', () => {
    const roster = makeRoster([
      { memberId: 'm1', date: period.dates[0], shift: '白班', isLegal: true },
      { memberId: 'm1', date: period.dates[1], shift: '夜班', isLegal: true },
      { memberId: 'm1', date: period.dates[2], shift: '白特', isLegal: true }
    ])
    const stats = computeMonthStats(roster, member, period)
    const sum =
      stats.days.day + stats.days.night + stats.days.rest +
      stats.days.daySpecial + stats.days.nightSpecial + stats.days.leave + stats.days.legal

    expect(stats.days.legal).toBe(3)
    expect(sum).toBe(period.dates.length)
  })

  it('法定日的加班跟着归到「法定」格，不留在白班名下', () => {
    const roster = makeRoster([
      { memberId: 'm1', date: period.dates[0], shift: '白班', overtimeHours: 3, isLegal: true }
    ])
    const stats = computeMonthStats(roster, member, period)

    // 天数：这一格算「法定」
    expect(stats.days.legal).toBe(1)
    // 加班：也跟着进「法定」格 —— 这样白班格只剩平日倍率的加班，一格对一桶
    expect(stats.overtimeByGroup.法定).toBe(3)
    expect(stats.overtimeByGroup.白班).toBe(0)
    expect(stats.overtime.legal).toBe(3)
  })

  it('每一格只对应一个计价桶（白+夜=平日、特勤=特勤、法定=法定）', () => {
    const roster = makeRoster([
      { memberId: 'm1', date: period.dates[0], shift: '白班', overtimeHours: 2 },
      { memberId: 'm1', date: period.dates[1], shift: '夜班', overtimeHours: 3 },
      { memberId: 'm1', date: period.dates[2], shift: '白特', overtimeHours: 10 },
      { memberId: 'm1', date: period.dates[3], shift: '夜特', overtimeHours: 11.5 },
      { memberId: 'm1', date: period.dates[4], shift: '白班', overtimeHours: 3, isLegal: true },
      { memberId: 'm1', date: period.dates[5], shift: '白特', overtimeHours: 10, isLegal: true }
    ])
    const stats = computeMonthStats(roster, member, period)
    const g = stats.overtimeByGroup

    expect(roundMoney(g.白班 + g.夜班)).toBe(stats.overtime.weekday)
    expect(roundMoney(g.白特 + g.夜特)).toBe(stats.overtime.special)
    expect(g.法定).toBe(stats.overtime.legal)
  })
})
