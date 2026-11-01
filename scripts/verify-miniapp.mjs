/**
 * 小程序端冒烟：没有微信开发者工具时，也能确认「页面 → demo 数据」这条链是通的。
 *
 * 这一版只做 UI，页面不接业务层，所以断言只覆盖「渲染需要的数据都齐了」。
 * 接数据层之后，把这里换成「页面 → store → 数据层」的断言。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(join(process.cwd(), 'package.json'))

const failures = []
function check(name, ok, detail) {
  if (!ok) failures.push(`${name} → ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

/* ------------------------------------------------------------ 全局桩 */

let appDef = null
let pageDef = null
const bucket = {}

globalThis.wx = {
  getStorageSync: key => bucket[key] ?? '',
  setStorageSync: (key, value) => {
    bucket[key] = value
  },
  getSystemInfoSync: () => ({ windowWidth: 390, statusBarHeight: 44, screenHeight: 844, safeArea: { bottom: 810 } }),
  showToast: () => {},
  showModal: () => {},
  switchTab: () => {},
  navigateTo: () => {},
  navigateBack: () => {},
  pageScrollTo: () => {}
}
globalThis.App = def => {
  appDef = def
}
globalThis.Page = def => {
  pageDef = def
}
globalThis.getApp = () => appDef

/* ------------------------------------------------------------ demo 数据 */

const demo = require('./miniapp/utils/demo.js')
check('日历格铺满整周', demo.cells.length === 35, `${demo.cells.length} 格`)
check('周期内 31 天', demo.cells.filter(cell => cell.inPeriod).length === 31)
check('今天在内期', demo.cells.some(cell => cell.isToday && cell.date === '2026-11-01'))
check('班次六格合计等于本期天数', demo.overview.counts.reduce((sum, item) => sum + item.value, 0) === 31)
check('矩阵 13 行', demo.matrix.rows.length === 13)
check('矩阵每人 31 列', demo.matrix.rows.every(row => row.cells.length === 31))
check('今日概览合计 13 人', demo.todaySummary.day + demo.todaySummary.night + demo.todaySummary.rest === 13)
check('班序 24 格', demo.patterns.every(item => item.shifts.length === 24))
check('班序只有白/夜/休', demo.patterns.every(item => item.shifts.every(shift => ['白班', '夜班', '休息'].includes(shift))))

/* ------------------------------------------------------------ 页面 */

require('./miniapp/app.js')
appDef.onLaunch()

function mount(path, query) {
  pageDef = null
  require(path)
  const page = pageDef
  page.data = page.data ?? {}
  page.setData = function (patch) {
    Object.keys(patch).forEach(key => {
      if (key.includes('.')) {
        const [head, ...rest] = key.split('.')
        let cursor = this.data[head]
        for (let index = 0; index < rest.length - 1; index += 1) cursor = cursor[rest[index]]
        cursor[rest[rest.length - 1]] = patch[key]
      } else {
        this.data[key] = patch[key]
      }
    })
  }
  if (page.onLoad) page.onLoad.call(page, query || {})
  if (page.onShow) page.onShow.call(page)
  return page
}

const calendar = mount('./miniapp/pages/calendar/index.js')
check('日历页拿到 35 格', calendar.data.cells.length === 35)
check('日历页有今日卡', calendar.data.today.shift === '夜班', calendar.data.today.shift)
check('日历页有本人', calendar.data.profile.name === '华文达')
check('日历页让出了导航栏高度', calendar.data.navHeight > 0, `${calendar.data.navHeight}px`)

const matrix = mount('./miniapp/pages/matrix/index.js')
check('矩阵页 13 行', matrix.data.rows.length === 13)
check('矩阵页 31 列', matrix.data.days.length === 31)

matrix.onToday()
check('点今天会横向滚过去', matrix.data.scrollLeft > 0, `${Math.round(matrix.data.scrollLeft)}px`)

const settings = mount('./miniapp/pages/settings/index.js')
check('设置页有本人与计数', settings.data.profile.name === '华文达' && settings.data.memberCount === 13)

const members = mount('./miniapp/pages/members/index.js')
check('人员配置页 13 人 14 条班序', members.data.members.length === 13 && members.data.patterns.length === 14)

members.onAdd()
check('添加成员时保存按钮禁用', members.data.canSave === false)
members.onNameInput({ detail: { value: '测试' } })
check('填了姓名后可保存', members.data.canSave === true)
members.onSave()
check('保存后成员变 14', members.data.members.length === 14, `${members.data.members.length} 人`)

const pattern = mount('./miniapp/pages/pattern/index.js', { id: '4F' })
check('班序页读到 24 格', pattern.data.cells.length === 24)
check('班序页标题是 4F', pattern.data.title === '4F')
check('内置班序只读', pattern.data.builtin === true)

const overview = mount('./miniapp/pages/overview/index.js')
check('概览页有应发与实发', Boolean(overview.data.grossText && overview.data.netText))

if (failures.length > 0) {
  console.error(`\n${failures.length} 项未通过`)
  process.exitCode = 1
} else {
  console.log('\n全部通过：六个页面都能渲染，且数据形状完整')
}
