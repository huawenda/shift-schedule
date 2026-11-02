import { Solar } from 'lunar-javascript'

/**
 * 日历格子里的副标签：节日 / 节气 / 农历日。
 * 只在「日历视图」出现 —— 矩阵列宽放不下，也不该抢班次的信息量。
 */

export interface CalendarMeta {
  label: string
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

    const festival = [...solar.getFestivals(), ...lunar.getFestivals()]
      .find(name => name.length <= MAX_LABEL_LENGTH)

    if (festival) return { label: formatFestival(festival), isFestival: true }

    const jieQi = lunar.getJieQi()
    if (jieQi) return { label: jieQi, isFestival: true }

    const lunarDay = lunar.getDayInChinese()
    return {
      label: lunarDay === '初一' ? `${lunar.getMonthInChinese()}月` : lunarDay,
      isFestival: false
    }
  } catch {
    return { label: '', isFestival: false }
  }
}
