/**
 * 生成一份「10 月结算周期、不同加班类型」的测试备份文件。
 *
 * 产出 apps/local-standalone 能直接「导入」的 JSON
 * （格式见 apps/local-standalone/src/services/backup.ts:29 的 LocalBackupFile）。
 *
 * 两个容易踩的坑，这份脚本都处理了：
 *
 * 1) 应用里的「10月」不是自然月 10/01–10/31，而是结算周期 **09/20–10/19**
 *    （core/utils/schedule.ts:197 getMonthScheduleView：
 *     periodStart = 上月/20，periodEnd = 本月/19，共 30 天）。
 *    把记录写在 10/20 之后的话，整个周期都统计不到 —— 法定加班会显示成 0h。
 *
 * 2) 排班基线要自己算，不能瞎写日期。只有落在真正的白班/夜班上，
 *    「平日加班」才成立；落在休息日上的加班会被 canRecordOvertime 过滤掉。
 *    覆盖基线时必须写 shiftOverride，且只在与基线不同时才写
 *    （core/services/cloudRecordMaps.ts:147 buildCloudDayRecords 就是这么存的）。
 */
const fs = require('fs')
const path = require('path')

const DAY = 24 * 60 * 60 * 1000

// 与 apps/local-standalone/src/core/data/schedule.ts 保持一致
const DISPLAY_START = '2026-04-19'
const DISPLAY_END = '2026-12-19'
const CYCLE_ANCHOR = '2026-06-07'

// src/core/data/schedule.ts:48 的 cyclePeople，原样搬过来
const CYCLE_PEOPLE = [
  { name: '华文达', group: '4F', shifts: ['夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息'] },
  { name: '张舒棋', group: '4G', shifts: ['休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班', '休息'] },
  { name: '陈泳智', group: '4H', shifts: ['休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '夜班', '夜班', '夜班', '夜班', '休息', '休息', '白班', '白班', '白班', '白班', '休息', '休息', '白班', '白班', '白班', '白班'] }
]

const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const formatDate = d => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
const posMod = (v, m) => ((v % m) + m) % m

/** 与 schedule.ts:35 的 expandCycleShifts 同算法 */
function expandShifts(cycle) {
  const start = parseDate(DISPLAY_START), end = parseDate(DISPLAY_END), anchor = parseDate(CYCLE_ANCHOR)
  const startOffset = Math.round((start - anchor) / DAY)
  const dayCount = Math.round((end - start) / DAY) + 1
  return Array.from({ length: dayCount }, (_, i) => cycle[posMod(startOffset + i, cycle.length)])
}

const allDates = (() => {
  const start = parseDate(DISPLAY_START), end = parseDate(DISPLAY_END)
  const n = Math.round((end - start) / DAY) + 1
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i); return formatDate(d)
  })
})()

const baseOf = Object.fromEntries(CYCLE_PEOPLE.map(p => [p.name, expandShifts(p.shifts)]))
const baseShift = (person, date) => {
  const i = allDates.indexOf(date)
  if (i < 0) throw new Error(`${date} 不在排班区间 ${DISPLAY_START}–${DISPLAY_END} 内`)
  return baseOf[person][i]
}

// 「10月」= 09/20–10/19（core/utils/schedule.ts:197）
const PERIOD_START = '09/20'
const PERIOD_END = '10/19'
const PERIOD = allDates.slice(allDates.indexOf(PERIOD_START), allDates.indexOf(PERIOD_END) + 1)

const HWD = '华文达'
const ZSQ = '张舒棋'
const CYZ = '陈泳智'

const shiftOf = (who, date) => baseShift(who, date)
const daysWhere = (who, shift) => PERIOD.filter(d => shiftOf(who, d) === shift)

console.log(`结算周期 ${PERIOD_START} – ${PERIOD_END}（${PERIOD.length} 天）\n`)
for (const who of [HWD, ZSQ, CYZ]) {
  console.log(`=== ${who} ===`)
  console.log('  ' + PERIOD.map(x => `${x.slice(3)}:${shiftOf(who, x)}`).join(' '))
  for (const s of ['白班', '夜班', '休息']) {
    console.log(`  ${s}: ${daysWhere(who, s).map(x => x.slice(3)).join(' ') || '(无)'}`)
  }
  console.log('')
}

/** 找出某人某班次的第 n 天（1 起），用来把记录落在真实班次上 */
function nth(who, shift, n) {
  const list = daysWhere(who, shift)
  if (!list[n - 1]) throw new Error(`${who} 在本周期内没有第 ${n} 个${shift}（共 ${list.length} 个）`)
  return list[n - 1]
}

// 每条：who, date, 覆盖班次（省略=基线）, 加班小时, 法定, 事假时长, 说明
const PLAN = [
  // —— 白班平日加班：整小时 / 半天 / 半小时三档 ——
  { who: HWD, date: nth(HWD, '白班', 1), hours: 2,   note: '白班平日加班 · 整小时' },
  { who: HWD, date: nth(HWD, '白班', 2), hours: 1.5, note: '白班平日加班 · 半天（0.5h）' },
  { who: HWD, date: nth(HWD, '白班', 3), hours: 3,   note: '白班平日加班 · 整小时' },
  { who: HWD, date: nth(HWD, '白班', 4), hours: 0.5, note: '白班平日加班 · 半小时' },
  { who: HWD, date: nth(HWD, '白班', 5), hours: 4,   note: '白班平日加班 · 当月最长之一' },

  // —— 夜班平日加班 ——
  { who: HWD, date: nth(HWD, '夜班', 1), hours: 2.5, note: '夜班平日加班 · 2.5h' },
  { who: HWD, date: nth(HWD, '夜班', 2), hours: 1,   note: '夜班平日加班 · 整小时' },
  { who: HWD, date: nth(HWD, '夜班', 3), hours: 3.5, note: '夜班平日加班 · 3.5h' },
  { who: HWD, date: nth(HWD, '夜班', 4), hours: 2,   note: '夜班平日加班 · 整小时' },

  // —— 特勤：白特 / 夜特，且特意落在基线为「休息」的日子上，需要 shiftOverride 覆盖 ——
  { who: HWD, date: nth(HWD, '休息', 1), shift: '白特', hours: 4,   note: '白特加班（基线休息→覆盖白特）' },
  { who: HWD, date: nth(HWD, '休息', 2), shift: '夜特', hours: 6,   note: '夜特加班（基线休息→覆盖夜特）' },
  { who: HWD, date: nth(HWD, '休息', 3), shift: '白特', hours: 2.5, note: '白特加班 · 2.5h' },
  { who: HWD, date: nth(HWD, '休息', 4), shift: '夜特', hours: 3.5, note: '夜特加班 · 3.5h' },

  // —— 法定加班：isLegalOvertime=true，走 ×3 ——
  { who: HWD, date: nth(HWD, '白班', 6), hours: 3, legal: true, note: '法定加班 · 白班 ×3' },
  { who: HWD, date: nth(HWD, '夜班', 5), hours: 4, legal: true, note: '法定加班 · 夜班 ×3' },
  { who: HWD, date: nth(HWD, '白班', 7), hours: 8, legal: true, note: '法定加班 · 一整班 ×3' },
  // 法定 + 特勤同时成立，用来验证分类时法定优先于白特/夜特
  { who: HWD, date: nth(HWD, '休息', 5), shift: '夜特', hours: 5, legal: true, note: '法定加班 · 夜特 ×3（法定优先）' },

  // —— 事假：半天 4h / 一天 8h，验证按小时扣薪 ——
  { who: HWD, date: nth(HWD, '休息', 6), shift: '事假', leave: '半天', note: '事假半天（扣 4h）' },
  { who: HWD, date: nth(HWD, '休息', 7), shift: '事假', leave: '一天', note: '事假一天（扣 8h）' },
  // 事假顶掉一个白班：扣薪的同时当天不算班次
  { who: HWD, date: nth(HWD, '白班', 8), shift: '事假', leave: '一天', note: '事假一天（顶掉白班）' },

  // —— 边界：这几条「不该计入加班合计」，验证 canRecordOvertime 没漏 ——
  { who: HWD, date: nth(HWD, '休息', 8), hours: 3, note: '休息日 + 加班 → 不计薪' },
  { who: HWD, date: nth(HWD, '休息', 9), hours: 2, note: '休息日 + 加班 → 不计薪' },
  { who: HWD, date: nth(HWD, '休息', 10), shift: '事假', leave: '一天', hours: 3, note: '事假 + 加班 → 不计薪' },
  // 0 小时：只有 shiftOverride 才留得住，否则会被 localStore 判为空记录丢弃
  { who: HWD, date: nth(HWD, '白班', 9), shift: '夜班', hours: 0, note: '白班改夜班但无加班 → 有班次没加班' },
  { who: HWD, date: nth(HWD, '白班', 10), shift: '休息', hours: 0, note: '白班改休息但无加班 → 该天不计加班' },

  // —— 另两个人：验证切人后统计跟着换 ——
  { who: ZSQ, date: nth(ZSQ, '白班', 1), hours: 2, note: '张舒棋 白班平日加班' },
  { who: ZSQ, date: nth(ZSQ, '夜班', 1), hours: 3, note: '张舒棋 夜班平日加班' },
  { who: ZSQ, date: nth(ZSQ, '休息', 1), shift: '夜特', hours: 5, note: '张舒棋 夜特加班' },
  { who: ZSQ, date: nth(ZSQ, '夜班', 2), hours: 3, legal: true, note: '张舒棋 法定加班' },
  { who: ZSQ, date: nth(ZSQ, '休息', 2), shift: '事假', leave: '半天', note: '张舒棋 事假半天' },

  { who: CYZ, date: nth(CYZ, '白班', 1), hours: 1.5, note: '陈泳智 白班平日加班' },
  { who: CYZ, date: nth(CYZ, '夜班', 1), hours: 4, note: '陈泳智 夜班平日加班' },
  { who: CYZ, date: nth(CYZ, '休息', 1), shift: '白特', hours: 3, note: '陈泳智 白特加班' },
  { who: CYZ, date: nth(CYZ, '夜班', 2), hours: 6, legal: true, note: '陈泳智 法定加班' }
]

// —— 组装 ———————————————————————————————————————————————
const now = Date.now()
const dayRecords = PLAN.map((item, i) => {
  const baseline = shiftOf(item.who, item.date)
  const shift = item.shift ?? baseline
  const rec = {
    _id: `test-oct-${String(i + 1).padStart(2, '0')}`,
    personName: item.who,
    date: item.date,
    createdAt: now,
    createdAtText: '2026-10-01 09:00:00',
    updatedAt: now,
    updatedAtText: '2026-10-01 09:00:00'
  }
  if (shift !== baseline) rec.shiftOverride = shift
  if (item.hours) rec.overtimeHours = item.hours
  if (item.legal) rec.isLegalOvertime = true
  if (item.leave) rec.leaveDuration = item.leave

  // 与 localStore.ts:119 的丢弃规则对齐，避免生成导入后就被丢掉的记录
  const effective = !!(rec.shiftOverride || rec.overtimeHours > 0 || rec.isLegalOvertime || rec.leaveDuration)
  if (!effective) throw new Error(`第 ${i + 1} 条会被 localStore 判为空记录丢弃：${JSON.stringify(item)}`)
  return rec
})

const backup = {
  app: 'shift-schedule-local',
  version: 1,
  exportedAt: '2026-10-01T09:00:00.000Z',
  dayRecords,
  salaryInputs: {
    [`${HWD}::10`]: { baseSalary: '5200', performanceAllowance: '800', positionAllowance: '600', otherDeductions: '150' },
    [`${ZSQ}::10`]: { baseSalary: '4800', performanceAllowance: '600', positionAllowance: '500', otherDeductions: '' },
    [`${CYZ}::10`]: { baseSalary: '4600', performanceAllowance: '400', positionAllowance: '500', otherDeductions: '200' }
  },
  settings: { personName: HWD }
}

// —— 打印与预期，便于和界面核对 ————————————————————————————————
console.log('=== 逐条记录 ===')
PLAN.forEach((item, i) => {
  const baseline = shiftOf(item.who, item.date)
  const shift = item.shift ?? baseline
  const tag = []
  if (shift !== baseline) tag.push(`基线${baseline}→${shift}`)
  if (item.legal) tag.push('法定×3')
  if (item.leave) tag.push(`事假${item.leave}`)
  if (!item.hours && !item.legal && !item.leave) tag.push('无加班')
  console.log(`  ${String(i + 1).padStart(2, '0')}  ${item.who}  ${item.date}  ${shift}` +
    `  ${item.hours ?? 0}h  ${tag.join(' ')}  —— ${item.note}`)
})

// 分类口径与 statistics.ts:5 overtimeChartTypeOrder = ['平日','特勤','法定'] 一致
function classify(who) {
  const byType = { 平日: 0, 特勤: 0, 法定: 0 }
  let filtered = 0
  for (const i of PLAN) {
    if (i.who !== who) continue
    const shift = i.shift ?? shiftOf(i.who, i.date)
    if (shift === '休息' || shift === '事假') { if (i.hours) filtered++; continue }
    if (i.legal) byType.法定 += i.hours
    else if (shift === '白特' || shift === '夜特') byType.特勤 += i.hours
    else byType.平日 += i.hours
  }
  return { byType, filtered }
}

for (const who of [HWD, ZSQ, CYZ]) {
  const { byType, filtered } = classify(who)
  const total = byType.平日 + byType.特勤 + byType.法定
  console.log(`\n=== ${who} 预期合计 ===`)
  console.log(`  平日 ${byType.平日}h  特勤 ${byType.特勤}h  法定 ${byType.法定}h  =>  总计 ${total}h`)
  const leave = PLAN.filter(i => i.who === who && i.leave)
  const leaveH = leave.reduce((t, i) => t + (i.leave === '半天' ? 4 : 8), 0)
  if (leaveH) console.log(`  事假扣薪 ${leaveH}h（${leave.length} 天）`)
  if (filtered) console.log(`  被 canRecordOvertime 过滤掉的加班 ${filtered} 条`)
}

const out = path.join(__dirname, '..', 'apps', 'local-standalone', '倒班表-测试数据-10月加班.json')
fs.writeFileSync(out, JSON.stringify(backup, null, 2), 'utf8')
console.log(`\n已写出 ${out}`)
console.log(`  ${dayRecords.length} 条记录 / ${Object.keys(backup.salaryInputs).length} 份薪资输入`)
console.log(`  周期 ${PERIOD_START} – ${PERIOD_END}`)