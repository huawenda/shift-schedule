/**
 * 演示数据 —— 这一版只做 UI，不接业务层。
 *
 * 页面的形状照真实数据结构写：接数据层时把这个文件整体换成 store，
 * WXML 与 WXSS 一行都不用改。
 *
 * 不引用 miniapp/lib/data，也不读写 storage。
 */

/* ------------------------------------------------------------ 常量 */

const PERIOD = {
  title: '2026 年 11 月',
  range: '10月20日 - 11月19日',
  start: '2026-10-20',
  end: '2026-11-19',
  days: 31
}

/** 演示用的「今天」：11 月 1 日，周日，在本期内 */
const TODAY = '2026-11-01'

const ANCHOR = '2026-06-07'
const CYCLE = 24

/** 班序：24 天循环，只有白 / 夜 / 休 三种（与真实数据同构） */
const PATTERNS = {
  '4F': '夜夜夜夜休休夜夜夜夜休休白白白白休休白白白白休休',
  '4G': '休夜夜夜夜休休夜夜夜夜休休白白白白休休白白白白休',
  '4H': '休休夜夜夜夜休休夜夜夜夜休休白白白白休休白白白白',
  '4I': '白休休夜夜夜夜休休夜夜夜夜休休白白白白休休白白白',
  '4J': '白白休休夜夜夜夜休休夜夜夜夜休休白白白白休休白白',
  '4K': '白白白休休夜夜夜夜休休夜夜夜夜休休白白白白休休白',
  '4R': '白白白白休休白白白白休休夜夜夜夜休休夜夜夜夜休休',
  '4S': '休白白白白休休白白白白休休夜夜夜夜休休夜夜夜夜休',
  '4T': '休休白白白白休休白白白白休休夜夜夜夜休休夜夜夜夜',
  '4U': '夜休休白白白白休休白白白白休休夜夜夜夜休休夜夜夜',
  '4V': '夜夜休休白白白白休休白白白白休休夜夜夜夜休休夜夜',
  '4W': '夜夜夜休休白白白白休休白白白白休休夜夜夜夜休休夜',
  '4X': '夜夜夜夜休休白白白白休休白白白白休休夜夜夜夜休休'
}

/** 自定义班序示例（证明「班序」这条线在 UI 上是通的） */
const CUSTOM_PATTERNS = [
  { id: 'cp-1', name: '甲班', shifts: '白白白白休休夜夜夜夜休休白白白白休休夜夜夜夜休休' }
]

const MEMBERS = [
  { id: 'm-01', name: '华文达', pattern: '4F', position: 'PNP' },
  { id: 'm-02', name: '张舒棋', pattern: '4G', position: 'PNP' },
  { id: 'm-03', name: '陈泳智', pattern: '4H', position: 'PNP' },
  { id: 'm-04', name: '韩义博', pattern: '4I', position: '班长' },
  { id: 'm-05', name: '段志彬', pattern: '4J', position: 'PNP' },
  { id: 'm-06', name: '余昌耿', pattern: '4K', position: 'PNP' },
  { id: 'm-07', name: '张涛', pattern: '4R', position: 'PNP' },
  { id: 'm-08', name: '谢懋', pattern: '4S', position: 'PNP' },
  { id: 'm-09', name: '农伟俊', pattern: '4T', position: 'PNP' },
  { id: 'm-10', name: '帅长安', pattern: '4U', position: 'PNP' },
  { id: 'm-11', name: '林泽勇', pattern: '4V', position: '副班长' },
  { id: 'm-12', name: '陈家辉', pattern: '4W', position: 'PNP' },
  { id: 'm-13', name: '张增全', pattern: '4X', position: 'PNP' }
]

/** 本人当月的临时记录：加班 / 法定 / 事假 / 换班 */
const RECORDS = {
  '2026-11-01': { overtimeHours: 2 },
  '2026-11-03': { overtimeHours: 2 },
  '2026-11-05': { overtimeHours: 3, isLegal: true },
  '2026-11-06': { shift: '休息', isLegal: true },
  '2026-11-11': { overtimeHours: 1.5 },
  '2026-11-12': { shift: '事假', leaveDuration: '4h' },
  '2026-11-16': { shift: '白特', overtimeHours: 10 }
}

/** 有待办的日子 → 条数 */
const TODO_COUNTS = {
  '2026-11-01': 1,
  '2026-11-09': 2,
  '2026-11-16': 1
}

/**
 * 农历/节日：真实日历每天都有农历，但移动端只做「标记」——
 * 7 列 100rpx 宽的格子塞四样信息，层级全平，读者要逐格辨认。
 */
const LABELS = {
  '2026-10-20': '初一',
  '2026-11-05': '十五',
  '2026-11-07': '立冬',
  '2026-11-14': '初一',
  '2026-11-19': '十五'
}

const SHIFT_META = {
  白班: { short: '白', tone: 'day' },
  夜班: { short: '夜', tone: 'night' },
  休息: { short: '休', tone: 'rest' },
  白特: { short: '特', tone: 'dayx' },
  夜特: { short: '特', tone: 'nightx' },
  事假: { short: '假', tone: 'leave' }
}

const SHIFT_TIME = {
  白班: '08:00 – 20:00',
  夜班: '20:00 – 08:00',
  白特: '08:00 – 20:00',
  夜特: '20:00 – 08:00'
}

/* ------------------------------------------------------------ 日期工具 */

function toDate(key) {
  const parts = key.split('-').map(Number)
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function toKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return date.getFullYear() + '-' + month + '-' + day
}

function addDays(key, count) {
  const date = toDate(key)
  date.setDate(date.getDate() + count)
  return toKey(date)
}

function diffDays(from, to) {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000)
}

/* ------------------------------------------------------------ 推导 */

/** 班序串用单字写（更紧凑），这里换回完整班次名 */
const SHORT_TO_SHIFT = { 白: '白班', 夜: '夜班', 休: '休息' }

/** 某人某天上什么班（按 24 天循环） */
function baseShift(patternId, date) {
  const text = PATTERNS[patternId]
  if (!text) return '休息'
  const offset = diffDays(ANCHOR, date)
  const char = Array.from(text)[((offset % CYCLE) + CYCLE) % CYCLE]
  return SHORT_TO_SHIFT[char] || '休息'
}

/** 本人某天的最终班次：临时记录优先 */
function selfShift(date) {
  const record = RECORDS[date]
  if (record && record.shift) return record.shift
  return baseShift('4F', date)
}

function periodDates() {
  const list = []
  for (let index = 0; index < PERIOD.days; index += 1) list.push(addDays(PERIOD.start, index))
  return list
}

/** 35 格：前导补上期两天、补尾补下期两天（7 × 5）。星期栏从「日」起头 */
function buildCells() {
  const cells = []
  // 10/20 是周二 → 前面补 2 格（10/18 周日、10/19 周一）
  const leading = toDate(PERIOD.start).getDay()

  for (let back = leading; back > 0; back -= 1) {
    cells.push(cellOf(addDays(PERIOD.start, -back), false))
  }
  periodDates().forEach(date => cells.push(cellOf(date, true)))
  let ahead = 1
  while (cells.length % 7 !== 0) {
    cells.push(cellOf(addDays(PERIOD.end, ahead), false))
    ahead += 1
  }
  return cells
}

function cellOf(date, inPeriod) {
  const record = RECORDS[date] || {}
  const shift = selfShift(date)
  const base = baseShift('4F', date)
  const overtime = record.overtimeHours || 0
  const leaveText = shift === '事假' ? (record.leaveDuration === '4h' ? '4h' : '8h') : ''

  return {
    key: date,
    date,
    day: date.slice(8, 10),
    inPeriod,
    isToday: date === TODAY,
    meta: LABELS[date] || '',
    isFestival: Boolean(LABELS[date]),
    shift,
    tone: SHIFT_META[shift].tone,
    shiftShort: SHIFT_META[shift].short,
    shiftLabel: SHIFT_META[shift].label || shift,
    // 描边只表示「与模板不同」：加班、法定各有自己的角标，不重复表达
    changed: Boolean(record.shift) && record.shift !== base,
    otText: overtime > 0 ? '+' + (Number.isInteger(overtime) ? overtime : overtime.toFixed(1)) + 'h' : '',
    legal: Boolean(record.isLegal),
    leaveText,
    todoCount: TODO_COUNTS[date] || 0
  }
}

/* ------------------------------------------------------------ 矩阵 */

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function buildMatrix() {
  const dates = periodDates()
  return {
    days: dates.map(date => ({
      key: date,
      day: date.slice(8, 10),
      weekday: WEEKDAY_LABELS[toDate(date).getDay()],
      isToday: date === TODAY,
      isWeekend: [0, 6].indexOf(toDate(date).getDay()) >= 0
    })),
    rows: MEMBERS.map(member => ({
      id: member.id,
      name: member.name,
      pattern: member.pattern,
      position: member.position,
      isSelf: member.id === 'm-01',
      cells: dates.map(date => {
        const shift = member.id === 'm-01' ? selfShift(date) : baseShift(member.pattern, date)
        return {
          key: date,
          short: SHIFT_META[shift].short,
          tone: SHIFT_META[shift].tone,
          shift
        }
      })
    }))
  }
}

/** 今日概览：只数人，不算工时；白特并入白班、夜特并入夜班 */
function todaySummary() {
  const summary = { day: 0, night: 0, rest: 0 }
  MEMBERS.forEach(member => {
    const shift = member.id === 'm-01' ? selfShift(TODAY) : baseShift(member.pattern, TODAY)
    if (shift === '休息') summary.rest += 1
    else if (shift === '夜班' || shift === '夜特') summary.night += 1
    else summary.day += 1
  })
  return summary
}

/* ------------------------------------------------------------ 概览 */

function buildOverview() {
  const dates = periodDates()
  const counts = { 白班: 0, 夜班: 0, 休息: 0, 白特: 0, 夜特: 0, 事假: 0, 法定: 0 }

  dates.forEach(date => {
    const record = RECORDS[date] || {}
    const shift = selfShift(date)
    if (record.isLegal) counts.法定 += 1
    else counts[shift] += 1
  })

  const nightDays = dates.filter(date => {
    const shift = selfShift(date)
    return shift === '夜班' || shift === '夜特'
  }).length

  // 条长按当月最大值归一化：三条互相比，不能写死比例（5.5h 的条不该比 3h 短）
  const overtime = [
    { label: '平日加班', kind: 'weekday', hours: 5.5, pay: 138.62 },
    { label: '特勤加班', kind: 'special', hours: 10, pay: 502.06 },
    { label: '法定加班', kind: 'legal', hours: 3, pay: 225.93 }
  ]
  const maxHours = Math.max.apply(null, overtime.map(item => item.hours))
  overtime.forEach(item => {
    item.ratio = item.hours / maxHours
  })

  return {
    counts: [
      { label: '白班', value: counts.白班, tone: 'day' },
      { label: '夜班', value: counts.夜班, tone: 'night' },
      { label: '休息', value: counts.休息, tone: 'rest' },
      { label: '特勤', value: counts.白特 + counts.夜特, tone: 'dayx' },
      { label: '事假', value: counts.事假, tone: 'leave' },
      { label: '法定', value: counts.法定, tone: 'legal' }
    ],
    overtime,
    salary: {
      fixedTotal: 6282,
      weekdayPay: 138.62,
      specialPay: 502.06,
      legalPay: 225.93,
      overtimePay: 866.61,
      nightAllowance: nightDays * 15,
      nightDays,
      leaveDeduction: 91.54,
      socialFund: 1600,
      gross: 6282 + 866.61 + nightDays * 15,
      net: 6282 + 866.61 + nightDays * 15 - 1600 - 91.54
    }
  }
}

/* ------------------------------------------------------------ 班序列表 */

function buildPatterns() {
  const builtins = Object.keys(PATTERNS).map(id => ({
    id,
    name: id,
    builtin: true,
    shifts: Array.from(PATTERNS[id]).map(char => SHORT_TO_SHIFT[char] || '休息'),
    users: MEMBERS.filter(member => member.pattern === id).length
  }))

  const customs = CUSTOM_PATTERNS.map(item => ({
    id: item.id,
    name: item.name,
    builtin: false,
    shifts: Array.from(item.shifts).map(char => SHORT_TO_SHIFT[char] || '休息'),
    users: MEMBERS.filter(member => member.pattern === item.id).length
  }))

  return builtins.concat(customs)
}

/* ------------------------------------------------------------ 导出 */

const todayShift = selfShift(TODAY)

module.exports = {
  period: PERIOD,
  today: {
    date: '11月1日',
    weekday: '周日',
    shift: todayShift,
    time: SHIFT_TIME[todayShift] || '休息',
    overtime: (RECORDS[TODAY] || {}).overtimeHours || 0,
    legal: Boolean((RECORDS[TODAY] || {}).isLegal),
    todos: TODO_COUNTS[TODAY] || 0
  },
  profile: {
    name: '华文达',
    pattern: '4F',
    position: 'PNP',
    salary: { base: '3982', performance: '1300', position: '1000', social: '1600' }
  },
  cells: buildCells(),
  matrix: buildMatrix(),
  todaySummary: todaySummary(),
  overview: buildOverview(),
  members: MEMBERS,
  patterns: buildPatterns(),
  labels: { weekday: WEEKDAY_LABELS, shift: SHIFT_META }
}
