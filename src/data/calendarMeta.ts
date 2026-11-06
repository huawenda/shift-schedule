import { Solar } from 'lunar-javascript'

/**
 * 日历格子里的副标签：节日 / 节气 / 农历日。
 * 只在「日历视图」出现 —— 矩阵列宽放不下，也不该抢班次的信息量。
 */

export interface CalendarMeta {
  /** 日历格子里用的短标签：节日 / 节气 / 农历日 */
  label: string
  /** 带月份的完整农历（如「十月廿八」），值班牌的今天行用 */
  lunarLabel: string
  isFestival: boolean
}

const MAX_LABEL_LENGTH = 3

function formatFestival(festival: string): string {
  return festival.endsWith('节') && festival.length === 3 ? festival.slice(0, -1) : festival
}

export function getCalendarMeta(dateKey: string): CalendarMeta {
  const [year, month, day] = dateKey.split('-').map(Number)

  try {
    const solar = Solar.fromYmd(year, month, day)
    const lunar = solar.getLunar()

    // 值班牌上的农历始终带月份；日历格子仍用短标签，避免撑破 3 字宽
    const lunarDay = lunar.getDayInChinese()
    const lunarMonth = `${lunar.getMonthInChinese()}月`
    const lunarLabel = `${lunarMonth}${lunarDay}`

    const festival = [...solar.getFestivals(), ...lunar.getFestivals()]
      .find(name => name.length <= MAX_LABEL_LENGTH)

    if (festival) {
      return { label: formatFestival(festival), lunarLabel, isFestival: true }
    }

    const jieQi = lunar.getJieQi()
    if (jieQi) return { label: jieQi, lunarLabel, isFestival: true }

    return {
      label: lunarDay === '初一' ? lunarMonth : lunarDay,
      lunarLabel,
      isFestival: false
    }
  } catch {
    return { label: '', lunarLabel: '', isFestival: false }
  }
}
