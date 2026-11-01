/**
 * 验证 `miniapp/lib/data` 这份产物真的能在「没有 DOM、没有浏览器 API」的环境里跑。
 *
 * 小程序运行在 JS 引擎里，没有 window / document / localStorage。
 * 桌面端这些能用，所以源文件里混进一个 `localStorage` 也不会在桌面暴露问题，
 * 到了小程序才会炸。这里在 Node 里裸跑一遍产物，并把产物本身扫一遍，
 * 保证「数据层可移植」不是一句口号。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const OUT = 'miniapp/lib/data'
const FIXTURE = 'fixtures/班组13人.json'
const require = createRequire(join(process.cwd(), 'package.json'))

const failures = []
function check(name, ok, detail) {
  if (!ok) failures.push(`${name} → ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

/* 1. 产物必须是浏览器 API 中立的 */
const BROWSER_API = /\bwindow\b|\bdocument\.|localStorage|sessionStorage|navigator\./
let scanned = 0
for (const name of readdirSync(OUT, { recursive: true })) {
  const full = join(OUT, String(name))
  if (!full.endsWith('.js')) continue
  scanned += 1
  const hit = BROWSER_API.exec(readFileSync(full, 'utf8'))
  if (hit) check(`${name} 不含浏览器 API`, false, `命中 ${hit[0]}`)
}
check('产物不含 window / localStorage 等浏览器 API', true, `扫描 ${scanned} 个文件`)

/* 2. 能正常加载 */
const backup = require(`./${OUT}/backup.js`)
const period = require(`./${OUT}/period.js`)
const rosterApi = require(`./${OUT}/roster/index.js`)
const stats = require(`./${OUT}/stats.js`)

/* 3. 用真实规模的样例跑一遍统计 */
const parsed = backup.parseBackup(readFileSync(FIXTURE, 'utf8'))
check('样例备份可解析', Boolean(parsed.roster), `${parsed.memberCount} 名成员`)
check('成员数是 13', parsed.memberCount === 13, `实际 ${parsed.memberCount}`)

const roster = parsed.roster
const self = rosterApi.getSelf(roster)
check('能取到本人', Boolean(self), self ? self.name : 'null')

const key = period.currentMonthKey()
const p = period.getPeriod(key)
const result = stats.computeMonthStats(roster, self, p)

const days = result.days
const total =
  days.day +
  days.night +
  days.rest +
  days.daySpecial +
  days.nightSpecial +
  days.leave +
  days.legal
check(
  '六格相加等于本期天数',
  total === p.dates.length,
  `${total} / ${p.dates.length}`
)
check(
  '出勤不超过本期天数',
  days.work <= p.dates.length,
  `出勤 ${days.work} 天`
)

console.log('\n当期统计：')
console.log(`  ${period.formatMonthTitle(key)}  ${period.formatPeriodRange(p)}`)
console.log(
  `  白班 ${days.day} · 夜班 ${days.night} · 休息 ${days.rest}` +
    ` · 特勤 ${days.daySpecial + days.nightSpecial} · 事假 ${days.leave} · 法定 ${days.legal}`
)
console.log(`  出勤 ${days.work} 天 · 事假 ${result.leave.days} 天`)
console.log(`  实发 ¥${result.salary.net ?? result.salary.takeHome ?? '—'}`)

if (failures.length > 0) {
  console.error(`\n${failures.length} 项未通过`)
  process.exitCode = 1
} else {
  console.log('\n全部通过：数据层可在无 DOM 环境运行')
}
