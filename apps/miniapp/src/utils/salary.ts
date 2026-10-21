export interface SalaryInputValues {
  baseSalary: string
  performanceAllowance: string
  positionAllowance: string
  otherDeductions: string
}

export interface SalaryHours {
  weekdayHours: number
  specialHours: number
  legalHours: number
  leaveHours: number
}

export interface SalaryCalculation {
  baseSalary: number
  performanceAllowance: number
  positionAllowance: number
  otherDeductions: number
  hourlyWage: number
  leaveDeduction: number
  weekdayOvertimePay: number
  specialOvertimePay: number
  legalOvertimePay: number
  overtimePayTotal: number
  basicPayTotal: number
  deductionTotal: number
  payableSalary: number
  netSalary: number
}

export const emptySalaryInputs: SalaryInputValues = {
  baseSalary: '',
  performanceAllowance: '',
  positionAllowance: '',
  otherDeductions: ''
}

export function calculateSalary(
  inputs: SalaryInputValues,
  hours: SalaryHours
): SalaryCalculation {
  const baseSalary = parseMoneyInput(inputs.baseSalary)
  const performanceAllowance = parseMoneyInput(inputs.performanceAllowance)
  const positionAllowance = parseMoneyInput(inputs.positionAllowance)
  const otherDeductions = parseMoneyInput(inputs.otherDeductions)
  const rawHourlyWage = baseSalary / 21.75 / 8
  const hourlyWage = roundMoney(rawHourlyWage)
  const leaveDeduction = roundMoney(safeHours(hours.leaveHours) * rawHourlyWage)
  const weekdayOvertimePay = roundMoney(rawHourlyWage * safeHours(hours.weekdayHours) * 1.5)
  const specialOvertimePay = roundMoney(rawHourlyWage * safeHours(hours.specialHours) * 2)
  const legalOvertimePay = roundMoney(rawHourlyWage * safeHours(hours.legalHours) * 3)
  const overtimePayTotal = roundMoney(weekdayOvertimePay + specialOvertimePay + legalOvertimePay)
  const basicPayTotal = roundMoney(baseSalary + performanceAllowance + positionAllowance)
  const deductionTotal = roundMoney(otherDeductions + leaveDeduction)
  const payableSalary = roundMoney(basicPayTotal + overtimePayTotal)
  const netSalary = roundMoney(payableSalary - deductionTotal)

  return {
    baseSalary,
    performanceAllowance,
    positionAllowance,
    otherDeductions,
    hourlyWage,
    leaveDeduction,
    weekdayOvertimePay,
    specialOvertimePay,
    legalOvertimePay,
    overtimePayTotal,
    basicPayTotal,
    deductionTotal,
    payableSalary,
    netSalary
  }
}

export function calculateOvertimePay(
  inputs: SalaryInputValues,
  overtimeHours: number,
  multiplier: number
): number {
  const rawHourlyWage = parseMoneyInput(inputs.baseSalary) / 21.75 / 8

  return roundMoney(rawHourlyWage * safeHours(overtimeHours) * safeMultiplier(multiplier))
}

/** 分位取整，两端统一口径（Web 端 stats 页用同一套 roundMoney）。 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0

  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatMoney(value: number): string {
  return roundMoney(value).toFixed(2)
}

function parseMoneyInput(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0

  return roundMoney(parsed)
}

function safeHours(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function safeMultiplier(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}
