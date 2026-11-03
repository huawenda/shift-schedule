/**
 * uni-app 小程序端验收（构建产物层）。
 *
 * 原生版的 verify-miniapp.mjs 靠直接 require 页面 JS，`.vue` 之后那条路断了。
 * 这里换成「读编译产物」：结构齐不齐、外壳配置对不对、关键元素在不在。
 * 业务口径由根目录的 vitest（src/data 的测试）负责，不在这里重复。
 *
 * 用法：先 `pnpm miniapp:build`，再 `pnpm verify:miniapp-uni`。
 * 验 dev 产物：`node scripts/verify-miniapp-uni.mjs miniapp-uni/dist/dev/mp-weixin`
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIST = process.argv[2] || 'miniapp-uni/dist/build/mp-weixin'
const PAGES = ['overview', 'matrix', 'settings']

const failures = []
function check(name, ok, detail) {
  if (!ok) failures.push(`${name} → ${detail}`)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

function read(relPath) {
  return readFileSync(join(DIST, relPath), 'utf8')
}

/* ------------------------------------------------------------ 产物存在 */

if (!existsSync(DIST)) {
  console.error(`找不到构建产物：${DIST}\n先跑 pnpm miniapp:build`)
  process.exitCode = 1
  throw new Error('missing dist')
}

/* ------------------------------------------------------------ app 配置 */

const appJson = JSON.parse(read('app.json'))
check('注册 3 个页面', appJson.pages.length === 3, `${appJson.pages.length} 页`)
check(
  '页面路径完整',
  PAGES.every(name => appJson.pages.includes(`pages/${name}/index`)),
  appJson.pages.join(', ')
)
check('自定义导航栏', appJson.window.navigationStyle === 'custom', appJson.window.navigationStyle)
check(
  'tabBar 走自定义模式（页内自绘）',
  appJson.tabBar?.custom === true && ['overview', 'matrix', 'settings'].every(name => appJson.tabBar.list.some(item => item.pagePath === `pages/${name}/index`)),
  appJson.tabBar ? `custom=${appJson.tabBar.custom}` : '无'
)
check(
  'custom-tab-bar 占位组件在产物里',
  existsSync(join(DIST, 'custom-tab-bar/index.json')) && existsSync(join(DIST, 'custom-tab-bar/index.js')),
  'custom-tab-bar/index'
)

const projectConfig = JSON.parse(read('project.config.json'))
check('appid 未丢', projectConfig.appid === 'wxbd3cf9a208228cf6', projectConfig.appid)

/* ------------------------------------------------------------ 全局样式 */

const appWxss = read('app.wxss')
check('令牌已编进 app.wxss', ['--chrome:', '--fs-kpi:', '--canvas:'].every(key => appWxss.includes(key)))

/* ------------------------------------------------------------ 页面文件 */

for (const name of PAGES) {
  const dir = `pages/${name}`
  const files = ['index.wxml', 'index.json', 'index.wxss', 'index.js']
  const missing = files.filter(file => !existsSync(join(DIST, dir, file)))
  check(`${name} 四件套齐全`, missing.length === 0, missing.join(', ') || 'ok')

  const pageJson = JSON.parse(read(`${dir}/index.json`))
  const using = pageJson.usingComponents || {}
  check(
    `${name} 组件注册正确`,
    Boolean(using['nav-bar']) === true && Boolean(using['tab-bar']) === true,
    Object.keys(using).join(', ')
  )
}

/* ------------------------------------------------------------ 关键内容 */

const overview = read('pages/overview/index.wxml')
check('概览有值班牌', overview.includes('today-plaque'))
check('概览有日历', overview.includes('month-calendar'))
check('概览有待办卡', overview.includes('todo-card'))
check('概览有统计面板', overview.includes('stats-panels'))
check('概览有改班抽屉', overview.includes('day-editor'))

const matrix = read('pages/matrix/index.wxml')
check('矩阵有姓名列', matrix.includes('name-row'))
check('矩阵有横向滚动', matrix.includes('scroll-view'))
check('矩阵有药丸格', matrix.includes('matrix-pill'))
check('矩阵有名单浮层', matrix.includes('summary-popover'))
check('矩阵有改班抽屉', matrix.includes('day-editor'))

const settings = read('pages/settings/index.wxml')
check('设置页有两段分页', settings.includes('segmented-item'))
check('设置页有班序区块', settings.includes('pattern-chip') && settings.includes('pattern-grid'))
check('设置页有成员卡片', settings.includes('member-row'))
check('设置页有个人资料', settings.includes('salary-grid'))
check('设置页有危险操作', settings.includes('btn-danger'))
check('设置页有底部抽屉', settings.includes('sheet-backdrop'))

/* ------------------------------------------------------------ 组件与残留 */

for (const name of ['nav-bar', 'tab-bar', 'day-editor', 'pattern-grid']) {
  // uni 把组件平铺在 components/ 下，文件名是 <组件名>.wxml
  const files = [`components/${name}.wxml`, `components/${name}.json`, `components/${name}.wxss`, `components/${name}.js`]
  check(`${name} 组件齐全`, files.every(file => existsSync(join(DIST, file))))
}

const allFiles = readdirSync(DIST, { recursive: true }).map(String)
check(
  '无占位组件残留',
  !allFiles.some(file => file.includes('placeholder-card')),
  allFiles.filter(file => file.includes('placeholder-card')).join(', ') || 'ok'
)
check(
  '页面跑在 uni 运行时上',
  read('pages/overview/index.js').includes('common/vendor.js'),
  '编译产物应引用 common/vendor.js'
)

if (failures.length > 0) {
  console.error(`\n${failures.length} 项未通过`)
  process.exitCode = 1
} else {
  console.log('\n全部通过：三个页面、外壳组件、令牌与关键结构都在产物里')
}
