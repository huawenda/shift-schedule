/**
 * 个人信息：薪资基线。
 *
 * 本人身份（姓名 + 班序）不在这里 —— 本人是 `members` 里的一条，
 * 由 `Roster.profile.memberId` 指过去。这里只管钱。
 *
 * 金额一律用 `string` 存：
 * 1. 避免浮点误差（8000.10 存成 8000.099999…）；
 * 2. 输入框里正在敲的 `1.` 不会被吃成 1；
 * 3. 与 web 端 `SalaryInputValues` 的口径一致，将来接通统计时不用改。
 *
 * 薪资是**长期数据**（一般一年才变一次），所以不做按月存档 ——
 * 统计任何月份都用这一组值（2026-10-28 用户明确定）。
 */

export interface SalaryInput {
  /** 基本工资 */
  baseSalary: string
  /** 绩效津贴 */
  performanceAllowance: string
  /** 岗位津贴 */
  positionAllowance: string
  /** 社保公积金：每月个人缴纳合计，统计时算作扣款 */
  socialFund: string
}

export type SalaryKey = keyof SalaryInput

export const SALARY_FIELDS: Array<{ key: SalaryKey; label: string; note?: string }> = [
  { key: 'baseSalary', label: '基本工资'},
  { key: 'performanceAllowance', label: '绩效津贴' },
  { key: 'positionAllowance', label: '岗位津贴' },
  { key: 'socialFund', label: '社保公积金'}
]

export const emptySalary: SalaryInput = {
  baseSalary: '',
  performanceAllowance: '',
  positionAllowance: '',
  socialFund: ''
}

/** 整数位上限：七位（999 万），再大基本是填错了 */
const MAX_INT_DIGITS = 7

/**
 * 金额输入清洗：只留数字和一个小数点，小数最多两位。
 * 空串表示「没填」，和 0 区分开（0 是明确知道为 0）。
 */
export function sanitizeMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  if (!cleaned) return ''

  const [head, ...rest] = cleaned.split('.')
  const intPart = head.replace(/^0+(?=\d)/, '').slice(0, MAX_INT_DIGITS)

  // 没有小数点：纯整数输入中
  if (rest.length === 0) return intPart

  const decimal = rest.join('').slice(0, 2)
  return `${intPart || '0'}.${decimal}`
}

/** 收敛任意来源（旧备份、手改的 JSON）为四个干净字符串 */
export function normalizeSalary(value: unknown): SalaryInput {
  if (typeof value !== 'object' || value === null) return { ...emptySalary }
  const record = value as Record<string, unknown>

  const pick = (key: SalaryKey): string =>
    typeof record[key] === 'string' ? sanitizeMoneyInput(record[key] as string) : ''

  return {
    baseSalary: pick('baseSalary'),
    performanceAllowance: pick('performanceAllowance'),
    positionAllowance: pick('positionAllowance'),
    socialFund: pick('socialFund')
  }
}

/** 输入框里的一串字 → 数字（未填 / 非法都算 0） */
export function parseMoney(value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100) / 100
}

export function isSalaryEmpty(salary: SalaryInput): boolean {
  return SALARY_FIELDS.every(field => !salary[field.key].trim())
}

/** 已填了几项 —— 清空前提示「已填的 N 项薪资」用 */
export function salaryFilledCount(salary: SalaryInput): number {
  return SALARY_FIELDS.filter(field => salary[field.key].trim()).length
}

/** 金额展示：千分位 + 两位小数（`8000 → "8,000.00"`）。统计区块与每日明细共用 */
export function formatMoney(value: number): string {
  const fixed = (Number.isFinite(value) ? value : 0).toFixed(2)
  const negative = fixed.startsWith('-')
  const [intPart, decimal] = (negative ? fixed.slice(1) : fixed).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}.${decimal}`
}

/** 身份信息（姓名 + 班序 + 岗位）：姓名与班序改动即视为换人，岗位不算身份、可空 */
export interface SelfIdentity {
  name: string
  patternId: string
  /** 岗位（可选）：缺省等于空岗位 */
  position?: string
}
