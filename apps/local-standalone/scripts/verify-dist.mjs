#!/usr/bin/env node
/**
 * 产物验收：真实启动无头浏览器，把 dist/ 打开跑一遍关键流程。
 *
 *   node scripts/verify-dist.mjs                # HTTP 托管 + file:// 双击，两种都测
 *   node scripts/verify-dist.mjs --only=file
 *
 * 覆盖（对应 PRD §8 验收标准）：
 *   1. 空数据首次打开 → 出现三步向导
 *   2. 向导先填本人（姓名 + 班序）再加 2 位同事 → 排班页出现 3 行
 *   3. 独立浏览器存储可写（file:// 下尤其要确认）
 *   4. 点格子改班 → 弹层 → 保存 → 写入 roster v2（矩阵弹层不含加班录入）
 *   5. 刷新后改动仍在（真持久化）
 *   6. 恢复默认 → 记录被删除
 *   6b. 个人日历记加班 3h → 落盘 → 格子显示 +3h → 恢复默认连加班清掉
 *   7. 设置页：13 条内置班序可预览 24 格
 *   8. 新建自建班序（24 格逐格填）→ 出现在列表 → 能挂到成员上
 *   9. 矩阵里显示自建班序名
 *  10. 导出备份是 v5，且带上自建班序
 *  11. 删除自建班序要输入名字确认，成员与改班记录一并删除
 *  12. 翻月不崩
 *
 * 依赖：本机 Chrome/Edge，Node 18+（用全局 fetch / WebSocket）。没有第三方依赖。
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(__dirname, '..')
const distDir = path.join(projectDir, 'dist')
const distIndex = path.join(distDir, 'index.html')
/** 真实班组的样例备份：13 人挂在内置 4F–4X 上，用来验导入链路 */
const fixturePath = path.join(projectDir, 'fixtures', '班组13人.json')

const ROSTER_KEY = 'shift-schedule:local:roster:v2'

/** 班次 → 矩阵格子里的单字，与 src/data/shifts.ts 保持一致 */
const SHORT_LABEL = { 白班: '白', 夜班: '夜', 休息: '休', 白特: '特', 夜特: '特', 事假: '假' }

const onlyArg = process.argv.find(arg => arg.startsWith('--only='))
const only = onlyArg ? onlyArg.slice('--only='.length) : null

const results = []

function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean)

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null
}

function startStaticServer(rootDir) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.txt': 'text/plain; charset=utf-8'
  }

  const server = http.createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url || '/').split('?')[0])
    const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
    const filePath = path.join(rootDir, relative)

    if (!filePath.startsWith(rootDir)) {
      response.writeHead(403).end('forbidden')
      return
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404).end('not found')
        return
      }
      response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' })
      response.end(data)
    })
  })

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

async function waitForJsonEndpoint(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl)
        if (page) return page
      }
    } catch {
      // 浏览器还没起来
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  throw new Error('连接无头浏览器超时')
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  const pending = new Map()
  let nextId = 1

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve())
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')))
  })
  ready.catch(() => {})

  socket.addEventListener('message', event => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    if (!message.id || !pending.has(message.id)) return

    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(`${message.error.message || 'CDP 调用失败'}`))
    else resolve(message.result)
  })

  function send(method, params = {}) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description
      throw new Error(description || result.exceptionDetails.text || '页面内求值失败')
    }
    return result.result.value
  }

  function close() {
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close()
    } catch {
      // 忽略
    }
  }

  return { ready, send, evaluate, close }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(client, expression, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return true
    await sleep(120)
  }
  throw new Error(`等待超时：${label}`)
}

/** 点文字匹配的按钮（button 或 label） */
function clickByText(selector, text) {
  return `(() => {
    const target = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .find(item => item.textContent.trim() === ${JSON.stringify(text)})
    if (!target) return false
    target.click()
    return true
  })()`
}

/** 给受控 input 赋值（React 需要原生 setter + input 事件）；用索引取第 n 个 */
function setInputAt(selector, index, value) {
  return `(() => {
    const input = document.querySelectorAll(${JSON.stringify(selector)})[${index}]
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`
}

/** 按选择器给受控 input 赋值（React 需要原生 setter + input 事件） */
function setInputBySelector(selector, value) {
  return `(() => {
    const input = document.querySelector(${JSON.stringify(selector)})
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`
}

/** 侧栏跳转：三页各自等一个稳定标记 */
async function goMatrix(client) {
  await client.evaluate(clickByText('.rail-item', '全员矩阵'))
  await waitFor(client, 'Boolean(document.querySelector(".matrix"))', '全员矩阵页')
}

async function goOverview(client) {
  await client.evaluate(clickByText('.rail-item', '月度概览'))
  await waitFor(client, 'Boolean(document.querySelector(".stats-grid"))', '月度概览页')
}

/** 设置页分两个 tab：人员配置 / 个人资料。切页后给 React 一拍时间 */
async function switchSettingsTab(client, label) {
  await client.evaluate(clickByText('.canvas-tools .segmented-item', label))
  await sleep(150)
}

const firstCell = '.matrix-row .matrix-cell'

async function runScenario(name, url, downloadDir) {
  console.log(`\n=== 场景：${name} ===`)
  fs.mkdirSync(downloadDir, { recursive: true })

  const userDataDir = path.join(os.tmpdir(), `shift-verify-${name}-${Date.now()}`)
  const debugPort = 9333 + Math.floor(Math.random() * 400)
  const browser = findBrowser()

  const chrome = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debugPort}`,
    url
  ], { stdio: 'ignore' })

  let client = null

  try {
    const page = await waitForJsonEndpoint(debugPort)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    // 固定到设计基准 1440×900：headless 默认 800×600，
    // 在那种宽度下「日历 900 上限」「统计两列」这些布局判断根本测不出来。
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    })
    try {
      await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
    } catch {
      await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {})
    }

    // --- 1. 空数据首次打开 → 向导 ---
    // 连上来时标签页可能还停在 about:blank，此时访问 localStorage 会抛 SecurityError，
    // 所以先等真正加载到目标地址（否则整场会因为一个竞态直接判失败）。
    await waitFor(
      client,
      `location.href.startsWith(${JSON.stringify(url.replace(/[^/]*$/, ''))})`,
      '标签页加载到目标地址'
    )
    await client.evaluate(`(() => {
      window.localStorage.clear()
      return true
    })()`)
    await client.send('Page.reload', { ignoreCache: true })
    await waitFor(client, 'document.readyState === "complete"', '页面加载')
    await waitFor(client, 'Boolean(document.querySelector(".wizard"))', '首次配置向导')
    check(`${name}: 无数据时进入三步向导`, true)

    const storageState = await client.evaluate(`(() => {
      try {
        window.localStorage.setItem('__probe', '1')
        window.localStorage.removeItem('__probe')
        return 'ok'
      } catch (error) {
        return 'unavailable: ' + error.message
      }
    })()`)
    check(`${name}: 本机存储可用`, storageState === 'ok', storageState === 'ok' ? '' : storageState)
    if (storageState !== 'ok') return

    // --- 2. 向导：第 1 步先填本人，第 2 步加同事 ---
    check(`${name}: 向导第 1 步先问本人`, await client.evaluate(setInputBySelector('.wizard-self input', '张三')))
    await sleep(150)
    check(`${name}: 向导第 1 步可继续`, await client.evaluate(clickByText('.wizard-foot button', '下一步')))
    await waitFor(client, 'Boolean(document.querySelector(".member-editor"))', '同事表')

    // 同事这一步初始只有一行空行，先加一行凑成两位
    check(`${name}: 同事表可以再加一行`, await client.evaluate(clickByText('.btn-add', '添加成员')))
    await sleep(150)

    const names = ['李四', '王五']
    for (let index = 0; index < names.length; index += 1) {
      const ok = await client.evaluate(setInputAt('.member-row input[aria-label$="姓名"]', index, names[index]))
      check(`${name}: 填第 ${index + 1} 位同事姓名`, ok)
    }

    await sleep(150)
    check(`${name}: 向导第 2 步可继续`, await client.evaluate(clickByText('.wizard-foot button', '下一步')))
    await waitFor(client, 'Boolean(document.querySelector(".wizard-summary"))', '确认页')

    const summarySelf = await client.evaluate(
      `document.querySelector('.wizard-summary-row.is-self')?.textContent.trim() ?? ''`
    )
    check(
      `${name}: 确认页把本人单独标出来`,
      summarySelf.includes('张三') && summarySelf.includes('本人'),
      summarySelf
    )
    check(`${name}: 向导进入第 3 步`, await client.evaluate(clickByText('.wizard-foot button', '进入排班表')))

    // 默认落地是「月度概览」：日历 + 四块统计，且不再有今日概览条
    await waitFor(client, 'Boolean(document.querySelector(".stats-grid"))', '月度概览页')
    const landing = await client.evaluate(`(() => ({
      active: document.querySelector('.rail-item.is-active')?.textContent.trim() ?? '',
      rails: Array.from(document.querySelectorAll('.rail-item')).map(node => node.textContent.trim()),
      cards: document.querySelectorAll('.stat-card').length,
      summary: document.querySelectorAll('.summary').length,
      calendar: document.querySelectorAll('.calendar').length,
      sub: (document.querySelector('.canvas.is-overview .canvas-sub')?.textContent ?? '')
        .replace(/\\s+/g, ' ').trim()
    }))()`)
    check(`${name}: 默认落在月度概览`, landing.active === '月度概览', JSON.stringify(landing))
    check(
      `${name}: 侧栏是全员矩阵 / 月度概览 / 设置`,
      JSON.stringify(landing.rails) === JSON.stringify(['全员矩阵', '月度概览', '设置']),
      JSON.stringify(landing.rails)
    )
    check(
      `${name}: 概览页有日历和四块统计、没有今日概览条`,
      landing.calendar === 1 && landing.cards === 4 && landing.summary === 0,
      JSON.stringify(landing)
    )
    check(
      `${name}: 结算周期用「-」连接（不用长破折号）`,
      /月\d+日 - \d+月\d+日/.test(landing.sub) && !landing.sub.includes('—'),
      landing.sub
    )

    const layout = await client.evaluate(`(() => {
      const cal = document.querySelector('.calendar-grid')?.getBoundingClientRect()
      const grid = document.querySelector('.stats-grid')?.getBoundingClientRect()
      return {
        cal: Math.round(cal?.width ?? 0),
        grid: Math.round(grid?.width ?? 0),
        viewport: window.innerWidth
      }
    })()`)
    check(
      `${name}: 日历保持 900 上限、统计区更宽`,
      layout.cal <= 901 && layout.cal > 700 && layout.grid > layout.cal,
      JSON.stringify(layout)
    )

    // 待办卡片：日历右侧，高度与**日历网格**等高，右边界与统计块对齐
    const todoLayout = await client.evaluate(`(() => {
      const rect = sel => document.querySelector(sel)?.getBoundingClientRect()
      const calGrid = rect('.calendar-grid')
      const todo = rect('.todo-card')
      const grid = rect('.stats-grid')
      const top = rect('.overview-top')
      return {
        calGridH: Math.round(calGrid?.height ?? 0),
        todoH: Math.round(todo?.height ?? 0),
        todoW: Math.round(todo?.width ?? 0),
        calRight: Math.round(calGrid?.right ?? 0),
        todoLeft: Math.round(todo?.left ?? 0),
        todoRight: Math.round(todo?.right ?? 0),
        gridRight: Math.round(grid?.right ?? 0),
        topW: Math.round(top?.width ?? 0)
      }
    })()`)
    check(
      `${name}: 待办卡在日历右侧，与日历网格等高`,
      todoLayout.todoH === todoLayout.calGridH && todoLayout.todoH > 0 &&
        todoLayout.todoLeft > todoLayout.calRight,
      JSON.stringify(todoLayout)
    )
    check(
      `${name}: 待办卡右边界与统计块对齐`,
      todoLayout.todoRight === todoLayout.gridRight,
      JSON.stringify(todoLayout)
    )

    // 统计区块：刚建完数据还没有加班，也没有薪资
    const emptyStats = await client.evaluate(`(() => ({
      days: document.querySelectorAll('.day-count').length,
      noOvertime: Array.from(document.querySelectorAll('.stat-empty')).map(node => node.textContent.trim()),
      profileCta: Boolean(Array.from(document.querySelectorAll('.stat-empty-block button'))
        .find(node => node.textContent.trim() === '去「个人资料」填'))
    }))()`)
    check(`${name}: 本月概览列出六个班次天数`, emptyStats.days === 6, JSON.stringify(emptyStats))
    check(
      `${name}: 没有加班时两块给空态，薪资块给填工资的入口`,
      // 加班分布 + 每日明细各一条「还没有加班记录」，薪资块一条「还没填基本工资」
      emptyStats.noOvertime.filter(text => text === '这个月还没有加班记录。').length === 2 &&
        emptyStats.noOvertime.some(text => text.includes('基本工资')) &&
        emptyStats.profileCta === true,
      JSON.stringify(emptyStats)
    )

    await goMatrix(client)
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 3', '矩阵出现 3 行')
    check(`${name}: 矩阵页出现 1 本人 + 2 同事`, true)
    check(`${name}: 今日概览条只在矩阵页`, await client.evaluate('document.querySelectorAll(".summary").length === 1'))

    // 矩阵里本人那一行带徽章，同事没有
    const selfBadges = await client.evaluate(`(() => {
      const badges = document.querySelectorAll('.matrix-row .badge-self').length
      const selfRow = document.querySelector('.matrix-row.is-self')
      return {
        badges,
        selfName: selfRow?.querySelector('.matrix-name')?.textContent.trim() ?? '',
        nameIsButton: Boolean(document.querySelector('.matrix-name-cell button'))
      }
    })()`)
    check(
      `${name}: 矩阵里只有本人行带徽章`,
      selfBadges.badges === 1 && selfBadges.selfName.startsWith('张三'),
      JSON.stringify(selfBadges)
    )
    check(`${name}: 矩阵姓名不再可点（日历已锁本人）`, selfBadges.nameIsButton === false)

    // 矩阵观感：药丸块由 ::before 画（格子保持直角 → 列线连续）；今天只在表头标
    const matrixLook = await client.evaluate(`(() => {
      const cell = document.querySelector('.matrix-row .matrix-cell')
      const cs = cell ? getComputedStyle(cell) : null
      const before = cell ? getComputedStyle(cell, '::before') : null
      const rect = cell?.getBoundingClientRect()
      const head = document.querySelector('.matrix-day.is-today')
      const todayCell = document.querySelector('.matrix-cell.is-today')
      const nameCell = document.querySelector('.matrix-row .matrix-name-cell')
      const names = Array.from(document.querySelectorAll('.matrix-row .matrix-name, .matrix-row .matrix-pattern'))
      return {
        // 格子本身是直角 + 透明底，列线才是连续的
        cellRadius: cs?.borderRadius ?? '',
        cellBg: cs?.backgroundColor ?? '',
        // 药丸画在 ::before 上：上下 6px / 左右 2px、3px 圆角、有底色
        pillTop: before ? parseFloat(before.top) : -1,
        pillLeft: before ? parseFloat(before.left) : -1,
        pillRadius: before?.borderRadius ?? '',
        pillBg: before?.backgroundColor ?? '',
        cellH: rect ? Math.round(rect.height) : -1,
        todayHeadBg: head ? getComputedStyle(head).backgroundColor : '',
        todayHeadBand: head ? getComputedStyle(head).boxShadow : '',
        todayCellShadow: todayCell ? getComputedStyle(todayCell).boxShadow : 'none',
        nameW: nameCell ? Math.round(nameCell.getBoundingClientRect().width) : -1,
        // 姓名 / 班序两行都不该被省略号截断
        nameClipped: names.some(node => node.scrollWidth > node.clientWidth + 1)
      }
    })()`)
    check(
      `${name}: 矩阵色块收成药丸块（格子直角 + ::before 画块，列线才连续）`,
      matrixLook.cellRadius === '0px' && matrixLook.cellBg === 'rgba(0, 0, 0, 0)' &&
        matrixLook.pillTop === 6 && matrixLook.pillLeft === 2 &&
        matrixLook.pillRadius === '3px' && matrixLook.pillBg !== 'rgba(0, 0, 0, 0)',
      JSON.stringify(matrixLook)
    )
    check(
      `${name}: 今天只标在表头，正文格子不再画描边`,
      matrixLook.todayHeadBg !== '' && matrixLook.todayHeadBand !== 'none' &&
        matrixLook.todayCellShadow === 'none',
      JSON.stringify(matrixLook)
    )
    check(
      `${name}: 成员列收窄到 120（内容不被省略号截断）`,
      matrixLook.nameW >= 100 && matrixLook.nameW <= 124 && matrixLook.nameClipped === false,
      JSON.stringify(matrixLook)
    )

    // 切到日历：没有人员下拉，本人只由页面副标题说明（日历上方不再重复一遍）
    await goOverview(client)
    const calendarLock = await client.evaluate(`(() => ({
      selects: document.querySelectorAll('.canvas-tools select, .calendar select').length,
      // 日历自己不该有标题块 —— 姓名/班序只在页面副标题出现一次
      dupHead: document.querySelectorAll('.calendar-head, .calendar-name, .calendar-sub').length,
      sub: (document.querySelector('.canvas.is-overview .canvas-sub')?.textContent ?? '')
        .replace(/\\s+/g, ' ').trim()
    }))()`)
    check(
      `${name}: 个人日历锁定本人、且不再重复一遍姓名`,
      calendarLock.selects === 0 && calendarLock.dupHead === 0 && calendarLock.sub.includes('张三'),
      JSON.stringify(calendarLock)
    )
    await goMatrix(client)

    // --- 2b. 设置分页 + 个人信息：区块到位，薪资能落盘 ---
    await client.evaluate(clickByText('.rail-item', '设置'))
    await waitFor(client, 'Boolean(document.querySelector(".canvas-tools .segmented"))', '设置页 tab')

    const tabState = await client.evaluate(`(() => ({
      labels: Array.from(document.querySelectorAll('.canvas-tools .segmented-item')).map(node => node.textContent.trim()),
      active: document.querySelector('.canvas-tools .segmented-item.is-on')?.textContent.trim() ?? '',
      patterns: document.querySelectorAll('.pattern-block').length,
      members: document.querySelectorAll('.member-editor').length,
      profile: document.querySelectorAll('.profile-block').length
    }))()`)
    check(
      `${name}: 设置分两页且默认落在人员配置`,
      JSON.stringify(tabState.labels) === JSON.stringify(['人员配置', '个人资料']) &&
        tabState.active === '人员配置' &&
        tabState.patterns === 1 &&
        tabState.members === 1 &&
        tabState.profile === 0,
      JSON.stringify(tabState)
    )

    const selfRow = await client.evaluate(`(() => ({
      selfBadges: document.querySelectorAll('.member-row .badge-self').length,
      selfInputs: document.querySelectorAll('.member-row.is-self input, .member-row.is-self select').length,
      selfDeleteDisabled: Boolean(document.querySelector('.member-row.is-self .btn-quiet[disabled]'))
    }))()`)
    check(
      `${name}: 成员表里的本人行只读且删除禁用`,
      selfRow.selfBadges === 1 && selfRow.selfInputs === 0 && selfRow.selfDeleteDisabled === true,
      JSON.stringify(selfRow)
    )

    await switchSettingsTab(client, '个人资料')
    await waitFor(client, 'Boolean(document.querySelector(".profile-block"))', '个人信息区块')

    const profilePageOnly = await client.evaluate(`(() => ({
      patterns: document.querySelectorAll('.pattern-block').length,
      members: document.querySelectorAll('.member-editor').length,
      profile: document.querySelectorAll('.profile-block').length
    }))()`)
    check(
      `${name}: 切到个人资料后班序与成员不再渲染`,
      // profile 是 2：本人一块 + 薪资一块
      profilePageOnly.patterns === 0 && profilePageOnly.members === 0 && profilePageOnly.profile === 2,
      JSON.stringify(profilePageOnly)
    )

    const profileMeta = await client.evaluate(
      `document.querySelector('.settings-section .settings-meta')?.textContent.trim() ?? ''`
    )
    check(`${name}: 个人资料页标出本人`, profileMeta.includes('张三'), profileMeta)

    // 本人岗位：在个人信息里填，应落到本人那条 member 上（只改岗位不触发换人清空）
    check(`${name}: 填本人岗位`, await client.evaluate(setInputBySelector('input[aria-label="本人岗位"]', '班长')))
    await sleep(150)
    check(
      `${name}: 保存本人信息（只改岗位）`,
      await client.evaluate(clickByText('.profile-block .btn-primary', '保存本人信息'))
    )
    await sleep(300)
    const selfPosition = await client.evaluate(`(() => {
      const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
      const parsed = raw ? JSON.parse(raw) : null
      const self = parsed?.members?.find(member => member.id === parsed?.profile?.memberId)
      return self?.position ?? null
    })()`)
    check(`${name}: 本人岗位写进 member`, selfPosition === '班长', JSON.stringify(selfPosition))

    check(`${name}: 填基本工资`, await client.evaluate(setInputBySelector('.salary-grid input', '8000')))
    await sleep(150)
    check(`${name}: 保存薪资`, await client.evaluate(clickByText('.profile-block .btn-primary', '保存薪资')))
    await sleep(300)

    const salaryStored = await client.evaluate(`(() => {
      const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
      const parsed = raw ? JSON.parse(raw) : null
      return {
        base: parsed?.profile?.salary?.baseSalary ?? null,
        hasMemberId: Boolean(parsed?.profile?.memberId)
      }
    })()`)
    check(
      `${name}: 薪资写进 profile 并落盘`,
      salaryStored.base === '8000' && salaryStored.hasMemberId,
      JSON.stringify(salaryStored)
    )

    await client.evaluate(clickByText('.rail-item', '全员矩阵'))
    await waitFor(client, 'Boolean(document.querySelector(".matrix"))', '回到矩阵')

    // --- 3. 改班 ---
    const before = await client.evaluate(`document.querySelector(${JSON.stringify(firstCell)}).textContent.trim()`)
    const targetShift = ['白特', '夜特', '事假', '休息', '白班', '夜班'].find(shift => SHORT_LABEL[shift] !== before) ?? '白特'

    await client.evaluate(`document.querySelector(${JSON.stringify(firstCell)}).click(); true`)
    await waitFor(client, 'Boolean(document.querySelector(".dialog"))', '改班弹层')
    check(`${name}: 点击格子打开改班弹层`, true)
    // 矩阵弹层只能改班次：不该出现加班/法定两段
    const matrixDialog = await client.evaluate(`(() => ({
      day: document.querySelectorAll('.dialog-day').length,
      overtime: document.querySelectorAll('.ot-presets, .ot-input').length
    }))()`)
    check(
      `${name}: 矩阵弹层不含加班录入`,
      matrixDialog.day === 0 && matrixDialog.overtime === 0,
      JSON.stringify(matrixDialog)
    )

    const picked = await client.evaluate(`(() => {
      const option = Array.from(document.querySelectorAll('.dialog-options .option'))
        .find(item => item.textContent.trim() === ${JSON.stringify(targetShift)})
      if (!option) return false
      option.click()
      return true
    })()`)
    check(`${name}: 选中「${targetShift}」`, picked)
    await sleep(200)

    check(`${name}: 点击保存`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
    await waitFor(client, '!document.querySelector(".dialog")', '弹层关闭')

    let stored = null
    const saveDeadline = Date.now() + 3000
    while (Date.now() < saveDeadline) {
      stored = await client.evaluate(`window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})`)
      if (stored && stored.includes('overrides')) break
      await sleep(150)
    }

    let parsed = null
    try {
      parsed = JSON.parse(stored || 'null')
    } catch {
      parsed = null
    }
    check(
      `${name}: 改动写入 roster v2`,
      Boolean(parsed?.overrides?.length === 1 && parsed.overrides[0].shift === targetShift),
      JSON.stringify(parsed?.overrides ?? null)
    )

    // --- 4. 刷新后仍在 ---
    await client.send('Page.reload', { ignoreCache: true })
    await waitFor(client, 'document.readyState === "complete"', '页面重新加载')
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 3', '矩阵重新渲染')

    const afterReload = await client.evaluate(`(() => {
      const cell = document.querySelector(${JSON.stringify(firstCell)})
      if (!cell) return null
      return { text: cell.textContent.trim(), marked: cell.classList.contains('is-edited') }
    })()`)
    check(
      `${name}: 刷新后改动仍在且矩阵不带标记`,
      Boolean(afterReload && afterReload.text === SHORT_LABEL[targetShift] && afterReload.marked === false),
      JSON.stringify(afterReload)
    )

    // --- 5. 恢复默认 ---
    await client.evaluate(`document.querySelector(${JSON.stringify(firstCell)}).click(); true`)
    await waitFor(client, 'Boolean(document.querySelector(".dialog"))', '改班弹层')
    check(`${name}: 点击恢复默认`, await client.evaluate(clickByText('.dialog-foot button', '恢复默认')))
    await waitFor(client, '!document.querySelector(".dialog")', '弹层关闭')

    await sleep(300)
    const afterReset = await client.evaluate(`window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})`)
    let resetParsed = null
    try {
      resetParsed = JSON.parse(afterReset || 'null')
    } catch {
      resetParsed = null
    }
    check(`${name}: 恢复默认后记录被删除`, resetParsed?.overrides?.length === 0, JSON.stringify(resetParsed?.overrides ?? null))

    // --- 5b. 月度概览（日历）：加班 + 法定 ---
    await goOverview(client)
    await waitFor(client, 'document.querySelectorAll(".cal-cell").length > 0', '月度概览日历')

    // 周期外的日期补齐网格：信息与周期内一致（农历 + 班次），只靠样式与是否可点区分
    const gridFill = await client.evaluate(`(() => {
      const cells = Array.from(document.querySelectorAll('.cal-cell'))
      const outside = cells.filter(cell => cell.classList.contains('is-outside'))
      const inside = cells.filter(cell => !cell.classList.contains('is-outside'))
      const bg = node => getComputedStyle(node).backgroundColor
      return {
        total: cells.length,
        outside: outside.length,
        inside: inside.length,
        // 每格都要有日号、农历、班次 —— 周期外不能只剩一个日号
        outsideDay: outside.filter(cell => /^\\d{1,2}$/.test(cell.querySelector('.cal-day')?.textContent.trim() ?? '')).length,
        outsideMeta: outside.filter(cell => (cell.querySelector('.cal-meta')?.textContent ?? '').trim().length > 0).length,
        outsideShift: outside.filter(cell => (cell.querySelector('.cal-shift')?.textContent ?? '').trim().length > 0).length,
        outsideTag: outside[0]?.tagName ?? '',
        insideTag: inside[0]?.tagName ?? '',
        // 样式区别：底色不同、整格更淡
        outsideBg: outside[0] ? bg(outside[0]) : '',
        insideBg: inside[0] ? bg(inside[0]) : '',
        outsideOpacity: outside[0] ? getComputedStyle(outside[0]).opacity : '',
        insideOpacity: inside[0] ? getComputedStyle(inside[0]).opacity : '',
        outsideTitles: outside.slice(0, 2).map(cell => cell.title)
      }
    })()`)
    check(
      `${name}: 日历补齐到整 7 列（无空白格）`,
      gridFill.total % 7 === 0 && gridFill.outside > 0 && gridFill.outside + gridFill.inside === gridFill.total,
      JSON.stringify(gridFill)
    )
    check(
      `${name}: 周期外也有日号、农历与班次（信息与周期内一致）`,
      gridFill.outsideDay === gridFill.outside &&
        gridFill.outsideMeta === gridFill.outside &&
        gridFill.outsideShift === gridFill.outside,
      JSON.stringify(gridFill)
    )
    check(
      `${name}: 周期外只靠样式区分（底色更深、更淡）且不可点`,
      gridFill.outsideBg !== gridFill.insideBg &&
        Number(gridFill.outsideOpacity) < Number(gridFill.insideOpacity) &&
        gridFill.outsideTag === 'DIV' &&
        gridFill.insideTag === 'BUTTON',
      JSON.stringify(gridFill)
    )

    // 找一个白班/夜班的格子（休息/事假不记加班）
    const workCell = await client.evaluate(`(() => {
      const cells = Array.from(document.querySelectorAll('.cal-cell'))
      for (let index = 0; index < cells.length; index += 1) {
        // 周期外的格子是不可点的 <div>，记不了加班，得跳过
        if (cells[index].classList.contains('is-outside')) continue
        const block = cells[index].querySelector('.cal-shift')
        const text = block ? block.textContent.trim() : ''
        if (text === '白班' || text === '夜班') return { index, shift: text, date: cells[index].title }
      }
      return null
    })()`)
    check(`${name}: 日历里找到可记加班的日子`, Boolean(workCell), JSON.stringify(workCell))

    if (workCell) {
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')

      // 焦点必须进弹层：留在背景格子上时，用户一按 ESC（键盘交互），
      // Chrome 会给那个格子补上 :focus-visible 焦点环 —— 弹层关了，框线还留着
      check(
        `${name}: 弹层打开时焦点在弹层内`,
        await client.evaluate(`Boolean(document.activeElement?.closest('.dialog'))`)
      )

      // 三段加两个按钮全堆起来仍要放得进 900 高的办公屏
      const dialogSize = await client.evaluate(`(() => {
        const dialog = document.querySelector('.dialog-day')
        if (!dialog) return null
        const rect = dialog.getBoundingClientRect()
        return { w: Math.round(rect.width), h: Math.round(rect.height), viewH: window.innerHeight }
      })()`)
      check(
        `${name}: 日历弹层放得进视口`,
        Boolean(dialogSize && dialogSize.h <= dialogSize.viewH && dialogSize.w <= 520),
        JSON.stringify(dialogSize)
      )

      const presets = await client.evaluate(
        `Array.from(document.querySelectorAll('.ot-presets .chip-mini')).map(node => node.textContent.trim())`
      )
      check(
        `${name}: 日历弹层有加班预设且不含「恢复默认」误置灰`,
        JSON.stringify(presets) === JSON.stringify(['2h', '3h', '3.5h']),
        JSON.stringify(presets)
      )
      check(
        `${name}: 日历弹层有法定选项`,
        await client.evaluate('document.querySelectorAll(".dialog-day .segmented-sm .segmented-item").length === 2')
      )

      // ── 待办页：弹层分两页，待办改动立即生效 ──
      const todoTabs = await client.evaluate(`(() => {
        const tabs = Array.from(document.querySelectorAll('.dialog-tab'))
        return {
          labels: tabs.map(node => node.textContent.trim()),
          // 默认停在「班次」页
          active: tabs.find(node => node.classList.contains('is-on'))?.textContent.trim() ?? ''
        }
      })()`)
      check(
        `${name}: 弹层分「班次 / 待办」两页，默认停在班次页`,
        todoTabs.labels.length === 2 &&
          todoTabs.labels[0] === '班次' &&
          todoTabs.labels[1].startsWith('待办') &&
          todoTabs.active === '班次',
        JSON.stringify(todoTabs)
      )

      check(
        `${name}: 切到待办页`,
        await client.evaluate(clickByText('.dialog-tab', '待办'))
      )
      await sleep(200)
      const todoPage = await client.evaluate(`(() => ({
        hasInput: Boolean(document.querySelector('.dialog-page input[aria-label="新增待办"]')),
        hasAdd: Boolean(Array.from(document.querySelectorAll('.dialog-page button'))
          .find(node => node.textContent.trim() === '添加')),
        emptyText: document.querySelector('.dialog-page .stat-empty')?.textContent.trim() ?? '',
        // 待办页底栏只有「完成」，没有「保存 / 恢复默认」
        footButtons: Array.from(document.querySelectorAll('.dialog-foot button'))
          .map(node => node.textContent.trim()),
        // 班次页的内容不该露出来
        shiftOptions: document.querySelectorAll('.dialog-day .option').length
      }))()`)
      check(
        `${name}: 待办页有输入框与添加按钮，空态给提示`,
        todoPage.hasInput && todoPage.hasAdd &&
          todoPage.emptyText.includes('还没有待办') &&
          todoPage.shiftOptions === 0,
        JSON.stringify(todoPage)
      )
      check(
        `${name}: 待办页底栏只有「完成」（改动立即生效，不走保存）`,
        JSON.stringify(todoPage.footButtons) === JSON.stringify(['完成']),
        JSON.stringify(todoPage.footButtons)
      )

      // 添加一条待办
      check(
        `${name}: 输入待办并添加`,
        await client.evaluate(setInputBySelector('.dialog-page input[aria-label="新增待办"]', '交班记录表'))
      )
      await sleep(120)
      check(
        `${name}: 点「添加」`,
        await client.evaluate(clickByText('.dialog-page button', '添加'))
      )
      await sleep(250)

      const todoAdded = await client.evaluate(`(() => {
        const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
        let parsed = null
        try { parsed = JSON.parse(raw || 'null') } catch { parsed = null }
        const items = Array.from(document.querySelectorAll('.dialog-page .todo-list-item'))
        return {
          count: parsed?.todos?.length ?? -1,
          text: parsed?.todos?.[0]?.text ?? '',
          date: parsed?.todos?.[0]?.date ?? '',
          done: parsed?.todos?.[0]?.done ?? null,
          listItems: items.length,
          listText: items.map(node => node.textContent.replace(/\\s+/g, ' ').trim())
        }
      })()`)
      check(
        `${name}: 待办立即写入存储（不走保存按钮）`,
        todoAdded.count === 1 &&
          todoAdded.text === '交班记录表' &&
          todoAdded.done === false &&
          todoAdded.listItems === 1,
        JSON.stringify(todoAdded)
      )

      // 勾选完成 → 立即生效
      check(
        `${name}: 点勾选框标记完成`,
        await client.evaluate(`(() => {
          const box = document.querySelector('.dialog-page .todo-list-item .todo-check')
          if (!box) return false
          box.click()
          return true
        })()`)
      )
      await sleep(250)
      const todoDone = await client.evaluate(`(() => {
        const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
        let parsed = null
        try { parsed = JSON.parse(raw || 'null') } catch { parsed = null }
        return {
          done: parsed?.todos?.[0]?.done ?? null,
          // 界面上要划线置灰
          struck: Boolean(document.querySelector('.dialog-page .todo-list-item.is-done'))
        }
      })()`)
      check(
        `${name}: 勾选立即生效且界面划线`,
        todoDone.done === true && todoDone.struck === true,
        JSON.stringify(todoDone)
      )

      // 关闭弹层 → 待办卡上应出现这条待办，日历格子上应有小圆点
      check(`${name}: 关掉待办页弹层`, await client.evaluate(clickByText('.dialog-foot button', '完成')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(300)

      const todoCard = await client.evaluate(`(() => {
        const card = document.querySelector('.todo-card')
        const dots = document.querySelectorAll('.cal-todo')
        const dot = dots[0]
        const day = dot?.closest('.cal-dayline')?.querySelector('.cal-day')
        const dotRect = dot?.getBoundingClientRect()
        const dayRect = day?.getBoundingClientRect()
        return {
          items: Array.from(card?.querySelectorAll('.todo-item') ?? [])
            .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          // 已完成的那条要划线
          doneItems: card?.querySelectorAll('.todo-item.is-done').length ?? -1,
          stat: card?.querySelector('.todo-card-stat')?.textContent.trim() ?? '',
          dots: dots.length,
          // 圆点必须跟日期数字同一行、紧挨它右侧（不是角标区，也不是格子左下角）
          dotInCorner: Array.from(dots).some(d => Boolean(d.closest('.cal-corner'))),
          dotNextToDay: Boolean(
            dot && day && dotRect && dayRect &&
            Math.abs(dotRect.top + dotRect.height / 2 - (dayRect.top + dayRect.height / 2)) < 4 &&
            dotRect.left >= dayRect.right - 1 &&
            dotRect.left - dayRect.right < 8
          )
        }
      })()`)
      check(
        `${name}: 待办卡上出现这条待办（已完成划线）`,
        todoCard.items.length === 1 &&
          todoCard.items[0].includes('交班记录表') &&
          todoCard.doneItems === 1,
        JSON.stringify(todoCard)
      )
      check(
        `${name}: 日历格子上标出当天有待办（圆点紧挨左上角日期）`,
        todoCard.dots === 1 && todoCard.dotInCorner === false && todoCard.dotNextToDay,
        JSON.stringify(todoCard)
      )

      // 重新打开弹层，接着走加班流程（待办页把弹层关掉了）
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      await sleep(200)

      check(`${name}: 点选加班预设 3h`, await client.evaluate(clickByText('.ot-presets .chip-mini', '3h')))
      await sleep(120)
      check(`${name}: 保存整天记录`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')

      let dayStored = null
      const dayDeadline = Date.now() + 3000
      while (Date.now() < dayDeadline) {
        const raw = await client.evaluate(`window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})`)
        try {
          dayStored = JSON.parse(raw || 'null')
        } catch {
          dayStored = null
        }
        if (dayStored?.overrides?.length === 1 && dayStored.overrides[0].overtimeHours === 3) break
        await sleep(150)
      }
      check(
        `${name}: 加班写进记录（班次不变、只加 3h）`,
        Boolean(dayStored?.overrides?.length === 1 && dayStored.overrides[0].overtimeHours === 3),
        JSON.stringify(dayStored?.overrides ?? null)
      )

      const otLabel = await client.evaluate(`(() => {
        const cell = document.querySelectorAll('.cal-cell')[${workCell.index}]
        if (!cell) return null
        const tag = cell.querySelector('.cal-ot')
        return {
          text: tag ? tag.textContent.trim() : null,
          // 必须在右上角（.cal-corner 里），不能塞进班次色块
          inCorner: Boolean(tag && tag.closest('.cal-corner')),
          inShiftBlock: Boolean(tag && tag.closest('.cal-shift'))
        }
      })()`)
      check(
        `${name}: 加班数显示在格子右上角`,
        otLabel?.text === '+3h' && otLabel.inCorner === true && otLabel.inShiftBlock === false,
        JSON.stringify(otLabel)
      )

      // 统计跟着记录走：加班分布、每日明细、薪资三块都要立刻更新
      const statsWithOvertime = await client.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        const ot = card('加班分布')
        const salaryCard = card('薪资计算')
        const detail = card('每日明细')
        return {
          otValues: Array.from(ot?.querySelectorAll('.ot-col-value') ?? [])
            .map(node => node.textContent.trim()),
          moneyRows: salaryCard?.querySelectorAll('.money-row').length ?? 0,
          // 组标题（基本项 / 加班工资 / 扣款项）各自带一个右侧小计
          moneyGroups: Array.from(salaryCard?.querySelectorAll('.money-group') ?? [])
            .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          // 组内明细：三个基本项 + 三类加班工资 + 社保
          moneySubs: Array.from(salaryCard?.querySelectorAll('.money-row.is-sub') ?? [])
            .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          net: salaryCard?.querySelector('.money-row.is-total span:last-child')?.textContent.trim() ?? '',
          detailRows: detail?.querySelectorAll('tbody tr').length ?? 0,
          detailPay: detail?.querySelector('tbody tr td.is-num:last-child')?.textContent.trim() ?? ''
        }
      })()`)
      check(
        `${name}: 加班分布与每日明细立刻跟上`,
        statsWithOvertime.otValues.includes('3h') && statsWithOvertime.detailRows === 1,
        JSON.stringify(statsWithOvertime)
      )

      // 加班分布改成柱形图：五根柱（白班/夜班/白特/夜特/法定），横轴分类 + 柱顶数值
      const otChart = await client.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        const ot = card('加班分布')
        const cols = Array.from(ot?.querySelectorAll('.ot-col') ?? [])
        const labels = Array.from(ot?.querySelectorAll('.ot-axis-row .ot-col-label') ?? [])
        const plot = ot?.querySelector('.ot-plot-row')
        const axis = ot?.querySelector('.ot-axis-row')
        return {
          colCount: cols.length,
          labels: labels.map(node => node.textContent.trim()),
          values: cols.map(col => col.querySelector('.ot-col-value')?.textContent.trim() ?? ''),
          barHeights: cols.map(col => Math.round(col.querySelector('.ot-bar')?.getBoundingClientRect().height ?? 0)),
          barWidths: cols.map(col => Math.round(col.querySelector('.ot-bar')?.getBoundingClientRect().width ?? 0)),
          // 柱顶到自己数值的底边间距（数值应紧贴柱顶）
          valueGaps: cols.map(col => {
            const bar = col.querySelector('.ot-bar')
            const val = col.querySelector('.ot-col-value')
            if (!bar || !val) return -1
            return Math.round(bar.getBoundingClientRect().top - val.getBoundingClientRect().bottom)
          }),
          tones: cols.map(col => col.querySelector('.ot-bar')?.className ?? ''),
          // 柱子的底色必须与日历里同名班次色块一致
          barBg: cols.map(col => {
            const bar = col.querySelector('.ot-bar')
            return bar ? getComputedStyle(bar).backgroundColor : ''
          }),
          // 柱子不画描边
          barShadow: cols.map(col => {
            const bar = col.querySelector('.ot-bar')
            return bar ? getComputedStyle(bar).boxShadow : ''
          }),
          // 横轴线在类目名上方；柱底贴着横轴线
          plotBottom: plot ? Math.round(plot.getBoundingClientRect().bottom) : -1,
          axisTop: axis ? Math.round(axis.getBoundingClientRect().top) : -1,
          barBottom: cols[0]?.querySelector('.ot-bar')
            ? Math.round(cols[0].querySelector('.ot-bar').getBoundingClientRect().bottom)
            : -1,
          // 不再有「合计」行
          hasFoot: Boolean(ot?.querySelector('.stat-foot'))
        }
      })()`)
      check(
        `${name}: 加班分布是五根柱的柱形图`,
        otChart.colCount === 5 &&
          JSON.stringify(otChart.labels) ===
            JSON.stringify(['白班加班', '夜班加班', '白特加班', '夜特加班', '法定加班']),
        JSON.stringify(otChart)
      )
      check(
        `${name}: 柱顶标出加班小时数`,
        // 本场景只记了一天 3h 加班（白班或夜班），那根柱是唯一非零的
        otChart.values.filter(text => text === '3h').length === 1 &&
          otChart.values.filter(text => text === '0h').length === 4,
        JSON.stringify(otChart.values)
      )
      check(
        `${name}: 柱高按数值排布（非零那根最高，其余贴地）`,
        // 有值那根的高度显著大于零值那几根（零值只留 2px 基线）
        Math.max(...otChart.barHeights) > 40 &&
          otChart.barHeights.filter(h => h <= 3).length === 4,
        JSON.stringify(otChart.barHeights)
      )
      check(
        `${name}: 每根柱按班次取语义色`,
        otChart.tones.every(cls => /is-(day|night|dayx|nightx|legal)\b/.test(cls)),
        JSON.stringify(otChart.tones)
      )
      check(
        `${name}: 柱色与日历班次色块一致`,
        // 白班 #dff3ff / 夜班 #e3eaf3 / 白特 #fff0c2 / 夜特 #fde7c7 / 法定 #fde68a
        JSON.stringify(otChart.barBg) ===
          JSON.stringify([
            'rgb(223, 243, 255)',
            'rgb(227, 234, 243)',
            'rgb(255, 240, 194)',
            'rgb(253, 231, 199)',
            'rgb(253, 230, 138)'
          ]),
        JSON.stringify(otChart.barBg)
      )
      check(
        `${name}: 柱子不画描边`,
        otChart.barShadow.every(shadow => shadow === 'none'),
        JSON.stringify(otChart.barShadow)
      )
      check(
        `${name}: 横轴线在类目名上方、柱底贴着轴线`,
        otChart.plotBottom === otChart.axisTop && Math.abs(otChart.barBottom - otChart.plotBottom) <= 2,
        JSON.stringify({
          plotBottom: otChart.plotBottom,
          axisTop: otChart.axisTop,
          barBottom: otChart.barBottom
        })
      )
      check(
        `${name}: 加班分布不再显示合计行`,
        otChart.hasFoot === false,
        JSON.stringify({ hasFoot: otChart.hasFoot })
      )
      check(
        `${name}: 数值紧贴各自柱顶（不是水平排成一行）`,
        // 每根柱顶到自己数值的底边间距都在 1~3px；
        // 若数值被改成排在绘图区顶部，各柱间距会各不相同且远大于 3
        otChart.valueGaps.length === 5 &&
          otChart.valueGaps.every(gap => gap >= 1 && gap <= 3),
        JSON.stringify(otChart.valueGaps)
      )

      // 加班分布卡的高度必须由「本月概览」决定，不能反过来把它撑高
      const cardHeights = await client.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        const overview = card('本月概览')
        const ot = card('加班分布')
        const h = el => (el ? Math.round(el.getBoundingClientRect().height) : -1)
        // 本月概览里最后一个元素（脚注）的底边 → 卡片内实际用到的高度
        const foot = overview?.querySelector('.stat-foot')
        return {
          overviewH: h(overview),
          otH: h(ot),
          // 概览内容底边离卡片底边还剩多少：被拉伸时会出现一大段空白
          overviewSlack: foot && overview
            ? Math.round(overview.getBoundingClientRect().bottom - foot.getBoundingClientRect().bottom)
            : -1
        }
      })()`)
      check(
        `${name}: 加班分布与本月概览等高`,
        cardHeights.overviewH > 0 && Math.abs(cardHeights.overviewH - cardHeights.otH) <= 2,
        JSON.stringify(cardHeights)
      )
      check(
        `${name}: 本月概览没被撑高（底部不留大片空白）`,
        // 脚注有 margin-top:auto 会贴着卡片底，所以留白应只有 padding 量级
        cardHeights.overviewSlack >= 0 && cardHeights.overviewSlack <= 24,
        JSON.stringify(cardHeights)
      )
      check(
        `${name}: 每日明细算出了当天加班费`,
        // 基本工资 8000 → 时薪 45.977；平日 3h × 1.5 = 206.90
        statsWithOvertime.detailPay === '206.90',
        JSON.stringify(statsWithOvertime)
      )
      check(
        `${name}: 薪资块算到实发（8000 + 加班费 + 夜班津贴）`,
        // 8000 + 平日加班 206.90 + 夜班津贴 8 天 × 15 = 120 → 8326.90
        statsWithOvertime.net === '8,326.90',
        JSON.stringify(statsWithOvertime)
      )
      check(
        `${name}: 薪资卡分三组，组标题右侧带小计`,
        statsWithOvertime.moneyGroups.length === 3 &&
          statsWithOvertime.moneyGroups[0].startsWith('基本项') &&
          statsWithOvertime.moneyGroups[0].includes('8,000.00') &&
          statsWithOvertime.moneyGroups[1].startsWith('加班工资') &&
          // 加班工资小计含夜班津贴：206.90 + 120 = 326.90
          statsWithOvertime.moneyGroups[1].includes('326.90') &&
          statsWithOvertime.moneyGroups[2].startsWith('扣款项'),
        JSON.stringify(statsWithOvertime.moneyGroups)
      )
      check(
        `${name}: 基本项列三个细项、三类加班工资逐项列出、夜班津贴挂在其下`,
        statsWithOvertime.moneySubs.length === 8 &&
          ['基本工资', '绩效津贴', '岗位津贴', '平日加班', '特勤加班', '法定加班', '夜班津贴', '社保公积金']
            .every((label, index) => statsWithOvertime.moneySubs[index].startsWith(label)) &&
          statsWithOvertime.moneySubs[3].includes('206.90') &&
          // 夜班津贴行带天数与金额
          statsWithOvertime.moneySubs[6].includes('8 天') &&
          statsWithOvertime.moneySubs[6].includes('120.00'),
        JSON.stringify(statsWithOvertime.moneySubs)
      )

      // 本月概览的六张卡片：加了班的那个班次要带上小时数（不带 + 号）
      const shiftCardOt = await client.evaluate(`(() => {
        const counts = Array.from(document.querySelectorAll('.stat-card .day-count'))
        const target = counts.find(node =>
          node.querySelector('.day-count-label')?.textContent.trim() === ${JSON.stringify(workCell.shift)}
        )
        const extra = target?.querySelector('.day-count-extra')
        return {
          text: extra?.textContent.trim() ?? '',
          isLeave: extra ? extra.classList.contains('is-leave') : null,
          allBadges: document.querySelectorAll('.stat-card .day-count-extra').length
        }
      })()`)
      check(
        `${name}: 班次卡片写出该班次的加班小时`,
        shiftCardOt.text === '3h' && shiftCardOt.isLeave === false && shiftCardOt.allBadges === 1,
        JSON.stringify(shiftCardOt)
      )

      // 薪资 / 每日明细两张卡：明细不自定高度，跟随薪资卡；内容在卡片里滚
      const tallCards = await client.evaluate(`(() => {
        const salary = document.querySelector('.stat-card[aria-label="薪资计算"]')
        const detail = document.querySelector('.stat-card-detail')
        const fill = detail?.querySelector('.stat-card-fill')
        const scroll = detail?.querySelector('.detail-scroll')
        const foot = detail?.querySelector('.stat-foot')
        const th = detail?.querySelector('.detail-table thead th')
        const h = node => (node ? Math.round(node.getBoundingClientRect().height) : -1)
        return {
          salaryH: h(salary),
          detailH: h(detail),
          fillH: h(fill),
          // 明细外壳必须没有写死高度，否则「跟随薪资卡」就不成立了
          detailInlineHeight: detail ? detail.style.height || '' : 'missing',
          scrollH: h(scroll),
          scrollOverflow: scroll ? getComputedStyle(scroll).overflowY : '',
          thPosition: th ? getComputedStyle(th).position : '',
          // 合计行必须在滚动区之外，否则它会跟着内容一起滚走
          footInsideScroll: foot ? Boolean(foot.closest('.detail-scroll')) : null
        }
      })()`)
      check(
        `${name}: 每日明细高度跟随薪资卡（两卡等高）`,
        tallCards.salaryH > 200 &&
          Math.abs(tallCards.salaryH - tallCards.detailH) <= 1 &&
          tallCards.detailInlineHeight === '',
        JSON.stringify(tallCards)
      )
      check(
        `${name}: 明细内层铺满、表格区可滚、表头冻结、合计行在滚动区外`,
        Math.abs(tallCards.fillH - tallCards.detailH) <= 2 &&
          tallCards.scrollOverflow === 'auto' &&
          tallCards.thPosition === 'sticky' &&
          tallCards.footInsideScroll === false &&
          tallCards.scrollH > 0 &&
          tallCards.scrollH < tallCards.detailH,
        JSON.stringify(tallCards)
      )

      // 每日明细的滚动条要彻底隐藏（卡片内部就几行，滑块反而抢眼）
      const detailBar = await client.evaluate(`(() => {
        const el = document.querySelector('.detail-scroll')
        if (!el) return null
        return {
          // offsetWidth - clientWidth 就是滚动条 + 边框占掉的宽度
          barWidth: el.offsetWidth - el.clientWidth,
          borderWidth: el.offsetWidth - el.clientWidth -
            (parseFloat(getComputedStyle(el).borderLeftWidth) + parseFloat(getComputedStyle(el).borderRightWidth))
        }
      })()`)
      check(
        `${name}: 每日明细的滚动条彻底隐藏`,
        detailBar !== null && detailBar.barWidth === 0,
        JSON.stringify(detailBar)
      )

      // 描边只表示「班次与默认不同」。刚才只记了加班、班次没动，所以不该有描边。
      const ringOnOvertimeOnly = await client.evaluate(`(() => {
        const cell = document.querySelectorAll('.cal-cell')[${workCell.index}]
        const block = cell ? cell.querySelector('.cal-shift') : null
        return { hasRing: Boolean(block && block.classList.contains('is-changed')) }
      })()`)
      check(
        `${name}: 只记加班、班次未动 → 班次块不加描边`,
        ringOnOvertimeOnly?.hasRing === false,
        JSON.stringify(ringOnOvertimeOnly)
      )

      // 真改班次后描边必须出现，否则上面那条是空断言
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 日历弹层里把班次改成休息`, await client.evaluate(clickByText('.dialog-day .option', '休息')))
      await sleep(120)
      check(`${name}: 保存改班`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(250)
      const ringAfterShiftChange = await client.evaluate(`(() => {
        const cell = document.querySelectorAll('.cal-cell')[${workCell.index}]
        const block = cell ? cell.querySelector('.cal-shift') : null
        return {
          hasRing: Boolean(block && block.classList.contains('is-changed')),
          text: block ? block.textContent.trim() : null
        }
      })()`)
      check(
        `${name}: 班次与默认不同 → 班次块出现描边`,
        ringAfterShiftChange?.hasRing === true && ringAfterShiftChange.text === '休息',
        JSON.stringify(ringAfterShiftChange)
      )

      // 换人必须先问：有记录时改本人姓名 → 弹影响清单，取消则什么都不动
      await client.evaluate(clickByText('.rail-item', '设置'))
      await waitFor(client, 'Boolean(document.querySelector(".canvas-tools .segmented"))', '设置页 tab')
      await switchSettingsTab(client, '个人资料')
      await waitFor(client, 'Boolean(document.querySelector(".profile-block"))', '个人信息区块')
      await client.evaluate(setInputBySelector('.profile-form input', '张三丰'))
      await sleep(150)
      check(
        `${name}: 改本人姓名触发保存`,
        await client.evaluate(clickByText('.profile-block .btn-primary', '保存本人信息'))
      )
      await waitFor(client, 'Boolean(document.querySelector(".impact-list"))', '换人确认弹层')
      const impactText = await client.evaluate('document.querySelector(".impact-list").textContent.trim()')
      check(
        `${name}: 确认弹层列出将清掉的条数`,
        impactText.includes('改班记录') && impactText.includes('薪资'),
        impactText
      )
      check(`${name}: 取消换人`, await client.evaluate(clickByText('.dialog-foot button', '取消')))
      await waitFor(client, '!document.querySelector(".impact-list")', '弹层关闭')
      await sleep(200)

      const keptAfterCancel = await client.evaluate(`(() => {
        const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
        const parsed = raw ? JSON.parse(raw) : null
        const self = parsed?.members?.find(member => member.id === parsed?.profile?.memberId)
        return { name: self?.name ?? null, overrides: parsed?.overrides?.length ?? -1 }
      })()`)
      check(
        `${name}: 取消后本人与记录都没动`,
        keptAfterCancel.name === '张三' && keptAfterCancel.overrides === 1,
        JSON.stringify(keptAfterCancel)
      )

      // 新增成员不能与本人同名（回到人员配置页）
      await switchSettingsTab(client, '人员配置')
      await waitFor(client, 'Boolean(document.querySelector(".member-editor"))', '成员表')
      check(`${name}: 成员表加一行`, await client.evaluate(clickByText('.btn-add', '添加成员')))
      await sleep(150)
      // 每行现在有「姓名 + 岗位」两个 input，不能再用全局索引定位姓名框，直接取末行
      await client.evaluate(`(() => {
        const rows = Array.from(document.querySelectorAll('.member-row'))
        const input = rows[rows.length - 1]?.querySelector('input[aria-label$="姓名"]')
        if (!input) return false
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, '张三')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      await sleep(200)
      const sameNameError = await client.evaluate(
        `document.querySelector('.error-list')?.textContent.trim() ?? ''`
      )
      check(
        `${name}: 与本人同名被拦下`,
        sameNameError.includes('与本人同名'),
        sameNameError
      )

      await goOverview(client)

      // 恢复默认：加班一并清掉
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 日历弹层能恢复默认`, await client.evaluate(clickByText('.dialog-foot button', '恢复默认')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(250)
      const afterRestore = await client.evaluate(`window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})`)
      let restoreParsed = null
      try {
        restoreParsed = JSON.parse(afterRestore || 'null')
      } catch {
        restoreParsed = null
      }
      check(
        `${name}: 恢复默认连加班一起清掉`,
        restoreParsed?.overrides?.length === 0,
        JSON.stringify(restoreParsed?.overrides ?? null)
      )

      const statsAfterRestore = await client.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        return {
          otValues: Array.from(card('加班分布')?.querySelectorAll('.ot-col-value') ?? [])
            .map(node => node.textContent.trim()),
          otEmpty: Boolean(card('加班分布')?.querySelector('.stat-empty')),
          detailRows: card('每日明细')?.querySelectorAll('tbody tr').length ?? -1,
          net: card('薪资计算')?.querySelector('.money-row.is-total span:last-child')?.textContent.trim() ?? '',
          // 卡片上的小时标记也要跟着消失（既没有加班也没有事假）
          badges: document.querySelectorAll('.stat-card .day-count-extra').length
        }
      })()`)
      check(
        `${name}: 恢复默认后统计回到零（卡片上的小时标记也清掉）`,
        // 加班分布没有加班了 → 回到空态（柱形图整体收起）
        statsAfterRestore.otEmpty === true &&
          statsAfterRestore.detailRows === 0 &&
          statsAfterRestore.badges === 0,
        JSON.stringify(statsAfterRestore)
      )

      // --- 5c. 事假时长：4h 要真的从工资里扣 ---
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 弹层里选事假`, await client.evaluate(clickByText('.dialog-day .option', '事假')))
      await sleep(150)

      const leaveSection = await client.evaluate(`(() => ({
        durations: Array.from(document.querySelectorAll('.dialog-day .segmented-item'))
          .map(node => node.textContent.trim())
          .filter(text => text === '4h' || text === '8h'),
        note: document.querySelector('.dialog-day .section-note:last-of-type')?.textContent.trim() ?? ''
      }))()`)
      check(
        `${name}: 选事假后出现「4h / 8h」`,
        JSON.stringify(leaveSection.durations) === JSON.stringify(['4h', '8h']),
        JSON.stringify(leaveSection)
      )

      check(`${name}: 选 4h`, await client.evaluate(clickByText('.dialog-day .segmented-item', '4h')))
      await sleep(120)
      check(`${name}: 保存 4h 事假`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(300)

      const leaveStored = await client.evaluate(`(() => {
        const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
        const parsed = raw ? JSON.parse(raw) : null
        const record = parsed?.overrides?.[0] ?? null
        return { shift: record?.shift ?? null, duration: record?.leaveDuration ?? null, count: parsed?.overrides?.length ?? -1 }
      })()`)
      check(
        `${name}: 4h 事假落盘（只存「4h」，8h 走默认值）`,
        leaveStored.shift === '事假' && leaveStored.duration === '4h' && leaveStored.count === 1,
        JSON.stringify(leaveStored)
      )

      const leaveUi = await client.evaluate(`(() => {
        const cell = document.querySelectorAll('.cal-cell')[${workCell.index}]
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        const rows = Array.from(card('薪资计算')?.querySelectorAll('.money-row') ?? [])
          .map(row => row.textContent.replace(/\\s+/g, ' ').trim())
        const counts = Array.from(card('本月概览')?.querySelectorAll('.day-count') ?? [])
        const leaveCard = counts.find(node => node.querySelector('.day-count-label')?.textContent.trim() === '事假')
        const extra = leaveCard?.querySelector('.day-count-extra')
        return {
          corner: cell?.querySelector('.cal-leave')?.textContent.trim() ?? null,
          overviewFoot: card('本月概览')?.querySelector('.stat-foot')?.textContent.replace(/\\s+/g, '') ?? '',
          leaveCardExtra: extra?.textContent.trim() ?? '',
          leaveCardIsLeave: extra ? extra.classList.contains('is-leave') : null,
          groups: Array.from(card('薪资计算')?.querySelectorAll('.money-group') ?? [])
            .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          leaveRow: rows.find(text => text.includes('事假扣款')) ?? '',
          net: rows.find(text => text.startsWith('实发')) ?? ''
        }
      })()`)
      check(`${name}: 日历角标标出「4h」`, leaveUi.corner === '4h', JSON.stringify(leaveUi))
      check(
        `${name}: 事假卡片写 4h，底部不再重复小时`,
        leaveUi.leaveCardExtra === '4h' && leaveUi.leaveCardIsLeave === true &&
          leaveUi.overviewFoot.includes('事假1天') && !leaveUi.overviewFoot.includes('4h'),
        JSON.stringify(leaveUi)
      )
      check(
        `${name}: 事假扣款按时薪×4h 扣`,
        // 8000 ÷ 21.75 ÷ 8 = 45.977；× 4 = 183.91
        // 实发 = 8000 + 夜班津贴 120 − 183.91 = 7936.09
        leaveUi.leaveRow.includes('183.91') && leaveUi.net.includes('7,936.09'),
        JSON.stringify(leaveUi)
      )
      check(
        `${name}: 扣款项小计含事假扣款（183.91）`,
        Boolean(leaveUi.groups[2]?.startsWith('扣款项')) && Boolean(leaveUi.groups[2]?.includes('183.91')),
        JSON.stringify(leaveUi.groups)
      )
      check(
        `${name}: 扣款金额不带负号`,
        !leaveUi.leaveRow.includes('−') && !leaveUi.leaveRow.includes('-'),
        leaveUi.leaveRow
      )

      // 改选 8h：8h 是默认值不落字段，但角标也要标出实际时长
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 改选 8h`, await client.evaluate(clickByText('.dialog-day .segmented-item', '8h')))
      await sleep(120)
      check(`${name}: 保存 8h 事假`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(250)
      const leave8hCorner = await client.evaluate(
        `document.querySelectorAll('.cal-cell')[${workCell.index}].querySelector('.cal-leave')?.textContent.trim() ?? null`
      )
      check(`${name}: 8h 事假也挂角标`, leave8hCorner === '8h', JSON.stringify(leave8hCorner))

      // 收尾：清掉这条事假，后续步骤从干净状态开始
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 清掉事假`, await client.evaluate(clickByText('.dialog-foot button', '恢复默认')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(250)

      // --- 5d. 法定独立成卡片：从原班次里扣掉，六格相加仍等于本期天数 ---
      const readCards = `(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card .day-count'))
        const read = label => {
          const node = cards.find(item => item.querySelector('.day-count-label')?.textContent.trim() === label)
          return node ? Number(node.querySelector('.day-count-num').textContent.trim()) : -1
        }
        const hours = label => {
          const node = cards.find(item => item.querySelector('.day-count-label')?.textContent.trim() === label)
          return node?.querySelector('.day-count-extra')?.textContent.trim() ?? ''
        }
        return {
          labels: cards.map(item => item.querySelector('.day-count-label')?.textContent.trim()),
          day: read('白班'),
          night: read('夜班'),
          special: read('特勤'),
          legal: read('法定'),
          dayHours: hours('白班'),
          nightHours: hours('夜班'),
          legalHours: hours('法定'),
          total: cards.reduce((sum, item) => sum + Number(item.querySelector('.day-count-num').textContent.trim()), 0)
        }
      })()`

      const beforeLegal = await client.evaluate(readCards)
      check(
        `${name}: 本月概览是 白/夜/休/特勤/事假/法定 六格（白特夜特已合并）`,
        JSON.stringify(beforeLegal.labels) ===
          JSON.stringify(['白班', '夜班', '休息', '特勤', '事假', '法定']),
        JSON.stringify(beforeLegal.labels)
      )
      check(`${name}: 六格天数相加等于本期天数`, beforeLegal.total === 31, String(beforeLegal.total))

      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(
        `${name}: 把这一天标为法定`,
        await client.evaluate(clickByText('.dialog-day .segmented-sm .segmented-item', '是'))
      )
      await sleep(150)
      // 法定日切到整天特勤档 [10, 11, 11.5]，不再是 [2, 3, 3.5]
      check(
        `${name}: 法定日点选加班预设 10h`,
        await client.evaluate(clickByText('.ot-presets .chip-mini', '10h'))
      )
      await sleep(120)
      check(`${name}: 保存法定标记`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(300)

      const afterLegal = await client.evaluate(readCards)
      const workKey = workCell.shift === '白班' ? 'day' : 'night'
      const workHoursKey = workCell.shift === '白班' ? 'dayHours' : 'nightHours'
      check(
        `${name}: 法定从原班次剥离（白/夜 −1、法定 +1、总数不变）`,
        afterLegal.legal === 1 &&
          afterLegal[workKey] === beforeLegal[workKey] - 1 &&
          afterLegal.total === beforeLegal.total,
        JSON.stringify({ before: beforeLegal, after: afterLegal, cell: workCell.shift })
      )
      check(
        `${name}: 法定日的加班归到「法定」格，原班次格不带小时`,
        afterLegal.legalHours === '10h' && afterLegal[workHoursKey] === '',
        JSON.stringify({ legalHours: afterLegal.legalHours, workHours: afterLegal[workHoursKey] })
      )

      // 夜班津贴的口径是「所有夜间出勤」：法定夜班在卡片上归「法定」格，津贴照发。
      // 只有当被标法定的那天原本是夜班时，天数才会 +1。
      const nightAllowanceUi = await client.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        const rows = Array.from(card('薪资计算')?.querySelectorAll('.money-row.is-sub') ?? [])
        const num = text => Number(String(text).replace(/[^0-9.]/g, ''))
        const allowanceRow = rows.find(row => row.textContent.trim().startsWith('夜班津贴'))
        // 三类加班费之和（平日/特勤/法定）
        const overtimeSum = rows
          .filter(row => /加班/.test(row.children[0].textContent) && !row.textContent.includes('夜班津贴'))
          .reduce((sum, row) => sum + num(row.children[1].textContent), 0)
        return {
          allowanceText: allowanceRow ? allowanceRow.textContent.replace(/\\s+/g, ' ').trim() : '',
          allowanceDays: allowanceRow ? num(allowanceRow.children[0].textContent) : -1,
          allowanceAmount: allowanceRow ? num(allowanceRow.children[1].textContent) : -1,
          overtimeSum,
          groups: Array.from(card('薪资计算')?.querySelectorAll('.money-group') ?? [])
            .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          groupAmounts: Array.from(card('薪资计算')?.querySelectorAll('.money-group') ?? [])
            .map(node => num(node.children[1].textContent))
        }
      })()`)
      check(
        `${name}: 夜班津贴挂在加班工资下并进小计`,
        // 津贴行带天数与金额（15 元/天），天数 × 15 必须等于金额
        nightAllowanceUi.allowanceDays >= 0 &&
          nightAllowanceUi.allowanceDays * 15 === nightAllowanceUi.allowanceAmount &&
          // 加班工资组的小计 = 三类加班费之和 + 夜班津贴
          Boolean(nightAllowanceUi.groups[1]?.startsWith('加班工资')) &&
          Math.abs(
            nightAllowanceUi.groupAmounts[1] -
              (nightAllowanceUi.overtimeSum + nightAllowanceUi.allowanceAmount)
          ) < 0.01,
        JSON.stringify(nightAllowanceUi)
      )
      if (workCell.shift === '夜班') {
        check(
          `${name}: 法定夜班仍计夜班津贴（口径是所有夜间出勤）`,
          // 标法定前夜班 8 天，标了法定后夜班卡片减 1，但津贴天数不变
          nightAllowanceUi.allowanceDays === 8,
          `津贴 ${nightAllowanceUi.allowanceDays} 天`
        )
      }

      // 收尾：清掉法定标记，后续步骤从干净状态开始
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 清掉法定标记`, await client.evaluate(clickByText('.dialog-foot button', '恢复默认')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(250)

    }

    await goMatrix(client)
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 3', '切开矩阵')

    // --- 6. 设置页 ---
    await client.evaluate(clickByText('.rail-item', '设置'))
    await waitFor(client, 'Boolean(document.querySelector(".settings-section"))', '设置页')
    const settingsRows = await client.evaluate('document.querySelectorAll(".member-row").length')
    check(`${name}: 设置页读到 3 位成员`, settingsRows === 3, String(settingsRows))

    const builtinCount = await client.evaluate('document.querySelectorAll(".pattern-chip").length')
    check(`${name}: 设置页列出 13 条内置班序`, builtinCount === 13, String(builtinCount))

    // 内置班序可点开只读预览
    await client.evaluate(`document.querySelectorAll('.pattern-chip')[0].click(); true`)
    await waitFor(client, 'Boolean(document.querySelector(".pattern-preview"))', '班序预览')
    const previewCells = await client.evaluate('document.querySelectorAll(".pattern-preview .shift-cell").length')
    check(`${name}: 内置班序可预览 24 格`, previewCells === 24, String(previewCells))
    await client.evaluate(`document.querySelectorAll('.pattern-chip')[0].click(); true`)

    // --- 7. 新建自建班序：24 格逐格填 ---
    check(`${name}: 点开新建班序`, await client.evaluate(clickByText('.pattern-block .btn-add', '新建班序')))
    await waitFor(client, 'Boolean(document.querySelector(".dialog-wide"))', '班序编辑器')
    const editorCells = await client.evaluate('document.querySelectorAll(".dialog-wide .shift-cell").length')
    check(`${name}: 编辑器有 24 个格子`, editorCells === 24, String(editorCells))

    const palette = await client.evaluate(
      `Array.from(document.querySelectorAll('.shift-palette .palette-option')).map(node => node.textContent.trim())`
    )
    check(
      `${name}: 班次选项只有白/夜/休三种`,
      JSON.stringify(palette) === JSON.stringify(['白班', '夜班', '休息']),
      JSON.stringify(palette)
    )

    check(
      `${name}: 填班序名称`,
      await client.evaluate(setInputBySelector('.dialog-wide input[aria-label="班序名称"]', '甲班'))
    )

    // 点第 1 格 → 连点「夜班」两次 → 再点「白班」：选完自动往后推进一格
    await client.evaluate(`document.querySelectorAll('.dialog-wide .shift-cell')[0].click(); true`)
    for (const shiftLabel of ['夜班', '夜班', '白班']) {
      const ok = await client.evaluate(clickByText('.shift-palette .palette-option', shiftLabel))
      if (!ok) check(`${name}: 点选班次「${shiftLabel}」`, false)
    }
    const filled = await client.evaluate(
      `Array.from(document.querySelectorAll('.dialog-wide .shift-cell .shift-cell-text')).slice(0, 3).map(node => node.textContent)`
    )
    check(
      `${name}: 前 3 格按顺序填成 夜/夜/白`,
      JSON.stringify(filled) === JSON.stringify(['夜', '夜', '白']),
      JSON.stringify(filled)
    )

    check(`${name}: 保存新班序`, await client.evaluate(clickByText('.dialog-wide .dialog-foot button', '创建班序')))
    await waitFor(client, 'document.querySelectorAll(".pattern-row").length === 1', '自建班序出现在列表')
    const patternName = await client.evaluate('document.querySelector(".pattern-row-name").textContent.trim()')
    check(`${name}: 自建班序出现在列表`, patternName === '甲班', patternName)

    // 详情必须展开在这张卡片自己下方，而不是共用内置班序那块预览区
    const inlinePanel = await client.evaluate(`(() => {
      const panel = document.querySelector('.pattern-item .pattern-preview')
      if (!panel) return null
      return {
        cells: panel.querySelectorAll('.shift-cell').length,
        // 详情里只放 24 格，不重复班序名与说明
        head: panel.querySelectorAll('.pattern-preview-head').length,
        text: panel.textContent.trim()
      }
    })()`)
    check(`${name}: 自建班序详情就地展开在卡片下方`, inlinePanel?.cells === 24, String(inlinePanel?.cells))
    check(`${name}: 详情里没有标题文字`, inlinePanel?.head === 0, JSON.stringify(inlinePanel?.text ?? null))

    check(`${name}: 再点「收起」能关掉详情`, await client.evaluate(clickByText('.pattern-row-actions button', '收起')))
    await sleep(150)
    const collapsed = await client.evaluate('document.querySelectorAll(".pattern-item .pattern-preview").length')
    check(`${name}: 收起后详情消失`, collapsed === 0, String(collapsed))

    // 文档层不能出现第二根滚动条：.visually-hidden 用 absolute 时会以初始包含块定位，
    // 逃出 .canvas 的 overflow 裁剪把文档撑高，表现就是「双层滚动条 + 底部空白」。
    const overflow = await client.evaluate(`(() => ({
      doc: document.documentElement.scrollHeight,
      view: window.innerHeight,
      bar: window.innerWidth - document.documentElement.clientWidth
    }))()`)
    check(
      `${name}: 设置页没有文档层滚动条`,
      overflow.doc <= overflow.view + 1 && overflow.bar === 0,
      JSON.stringify(overflow)
    )

    const customId = await client.evaluate(`(() => {
      const parsed = JSON.parse(window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)}) || '{}')
      return parsed.patterns?.[0]?.id ?? null
    })()`)
    check(`${name}: 自建班序写进 roster v2`, Boolean(customId), String(customId))

    // --- 8. 把成员挂到自建班序 ---
    const attached = await client.evaluate(`(() => {
      const select = document.querySelectorAll('.member-row select')[0]
      if (!select) return false
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      setter.call(select, ${JSON.stringify(customId)})
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return select.value === ${JSON.stringify(customId)}
    })()`)
    check(`${name}: 成员下拉能选到自建班序`, attached)
    check(
      `${name}: 下拉里列出「甲班」`,
      await client.evaluate(
        `Array.from(document.querySelectorAll('.member-row select')[0].options).some(option => option.textContent.trim() === '甲班')`
      )
    )

    check(`${name}: 保存成员设置`, await client.evaluate(clickByText('.settings-actions button', '保存成员设置')))
    await sleep(350)

    // --- 9. 排班页用上了新班序 ---
    await client.evaluate(clickByText('.rail-item', '全员矩阵'))
    await waitFor(client, 'Boolean(document.querySelector(".matrix"))', '回到排班页')
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 3', '矩阵 3 行')
    // 第一行现在是本人（4F），所以要看整列而不是只看第一行
    const rowLabels = await client.evaluate(
      `Array.from(document.querySelectorAll('.matrix-row .matrix-pattern')).map(node => node.textContent.trim())`
    )
    check(`${name}: 矩阵里显示自建班序名`, rowLabels.includes('甲班'), rowLabels.join(','))

    // --- 10. 导出备份：v4 且带上自建班序 ---
    await client.evaluate(clickByText('.topbar-right button', '导出备份'))

    let backupFile = null
    const downloadDeadline = Date.now() + 8000
    while (Date.now() < downloadDeadline && !backupFile) {
      const files = fs.readdirSync(downloadDir)
        .filter(file => file.endsWith('.json') && !file.endsWith('.crdownload'))
        .map(file => ({ file, mtime: fs.statSync(path.join(downloadDir, file)).mtimeMs }))
        .sort((left, right) => right.mtime - left.mtime)
      if (files.length > 0) backupFile = files[0].file
      else await sleep(200)
    }

    if (backupFile) {
      const backup = JSON.parse(fs.readFileSync(path.join(downloadDir, backupFile), 'utf8'))
      check(
        `${name}: 导出备份是 v5`,
        backup?.version === 5,
        `version=${backup?.version}`
      )
      check(
        `${name}: 备份带上自建班序（24 格）`,
        Array.isArray(backup?.roster?.patterns)
          && backup.roster.patterns.length === 1
          && backup.roster.patterns[0].name === '甲班'
          && backup.roster.patterns[0].shifts.length === 24,
        JSON.stringify(backup?.roster?.patterns?.map(item => ({ name: item.name, cells: item.shifts?.length })) ?? null)
      )
      check(`${name}: 备份带上 3 位成员`, backup?.roster?.members?.length === 3, String(backup?.roster?.members?.length))
    } else {
      check(`${name}: 导出备份是 v5`, false, '没有等到下载文件')
    }

    // --- 11. 删除自建班序：必须输入名字 ---
    await client.evaluate(clickByText('.rail-item', '设置'))
    await waitFor(client, 'document.querySelectorAll(".pattern-row").length === 1', '回到设置页')
    check(`${name}: 打开删除确认`, await client.evaluate(clickByText('.pattern-row-actions button', '删除')))
    await waitFor(client, 'Boolean(document.querySelector(".dialog-narrow"))', '删除确认弹层')
    check(
      `${name}: 未输入名字时删除按钮禁用`,
      await client.evaluate('document.querySelector(".dialog-narrow .btn-danger").disabled === true')
    )

    await client.evaluate(setInputBySelector('.dialog-narrow .confirm-label input', '甲'))
    await sleep(150)
    check(
      `${name}: 名字不对时仍禁用`,
      await client.evaluate('document.querySelector(".dialog-narrow .btn-danger").disabled === true')
    )

    await client.evaluate(setInputBySelector('.dialog-narrow .confirm-label input', '甲班'))
    await sleep(150)
    check(
      `${name}: 输对名字后可以删除`,
      await client.evaluate('document.querySelector(".dialog-narrow .btn-danger").disabled === false')
    )
    check(`${name}: 确认删除班序`, await client.evaluate(clickByText('.dialog-narrow .dialog-foot button', '删除班序')))
    await waitFor(client, '!document.querySelector(".dialog-narrow")', '弹层关闭')
    await sleep(350)

    const afterDelete = await client.evaluate(`(() => ({
      patterns: document.querySelectorAll('.pattern-row').length,
      members: document.querySelectorAll('.member-row').length
    }))()`)
    check(
      `${name}: 班序与其成员一并删除`,
      afterDelete.patterns === 0 && afterDelete.members === 2,
      JSON.stringify(afterDelete)
    )

    // --- 12. 翻月不崩 ---
    await client.evaluate(clickByText('.rail-item', '全员矩阵'))
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 2', '矩阵剩 2 行')
    check(`${name}: 删除后矩阵同步更新`, true)

    await client.evaluate(clickByText('.month-track button', '回到本期'))
    const titleBefore = await client.evaluate('document.querySelector(".month-title").textContent.trim()')
    await client.evaluate(`document.querySelectorAll('.month-step')[1].click(); true`)
    await sleep(200)
    const titleAfter = await client.evaluate('document.querySelector(".month-title").textContent.trim()')
    check(`${name}: 切换月份`, titleBefore !== titleAfter, `${titleBefore} → ${titleAfter}`)
    check(`${name}: 切月后矩阵仍在`, await client.evaluate('document.querySelectorAll(".matrix-row").length === 2'))

    const scheduleOverflow = await client.evaluate(
      'document.documentElement.scrollHeight <= window.innerHeight + 1'
    )
    check(`${name}: 排班页也没有文档层滚动条`, scheduleOverflow)

    // --- 13. 导入 fixtures/班组13人.json（真实班组数据的导入链路） ---
    await client.evaluate(clickByText('.rail-item', '设置'))
    await waitFor(client, 'Boolean(document.querySelector(".canvas-tools .segmented"))', '设置页 tab')
    await switchSettingsTab(client, '个人资料')
    await waitFor(client, 'Boolean(document.querySelector(".btn-file input[type=file]"))', '导入入口')
    await client.send('DOM.enable')
    const { root } = await client.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await client.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '.btn-file input[type=file]'
    })
    check(`${name}: 找到导入用的文件输入框`, Boolean(nodeId), String(nodeId))

    await client.send('DOM.setFileInputFiles', { files: [fixturePath], nodeId })
    await sleep(400)
    // 导入后仍停在个人资料页，成员表在另一页
    await switchSettingsTab(client, '人员配置')
    await waitFor(client, 'document.querySelectorAll(".member-row").length === 13', '成员表 13 行')
    const imported = await client.evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('.member-row'))
      const first = rows[0]
      return {
        count: rows.length,
        // 本人那一行是只读的（没有 input / select），姓名与班序读锁定的那两个 span
        firstName: first?.querySelector('.member-locked-name')?.textContent.trim() ?? '',
        firstPattern: first?.querySelector('.member-locked-pattern')?.textContent.trim() ?? '',
        selfBadges: document.querySelectorAll('.member-row .badge-self').length
      }
    })()`)
    check(
      `${name}: 导入 13 人样例备份（本人行只读且带徽章）`,
      imported.count === 13 &&
        imported.firstName === '华文达' &&
        imported.firstPattern === '4F' &&
        imported.selfBadges === 1,
      JSON.stringify(imported)
    )

    // 成员表新增「岗位」列；本人行岗位只读显示（fixture 里华文达 = 班长）
    const positionCol = await client.evaluate(`(() => {
      const head = document.querySelector('.member-editor-head')
      const first = document.querySelector('.member-row')
      return {
        hasCol: Array.from(head.querySelectorAll('span')).some(s => s.textContent.trim() === '岗位'),
        selfPosition: first.querySelector('.member-locked-position')?.textContent.trim() ?? ''
      }
    })()`)
    check(
      `${name}: 成员表有岗位列且本人行只读显示岗位`,
      positionCol.hasCol && positionCol.selfPosition === '班长',
      JSON.stringify(positionCol)
    )

    // --- 13b. 滚动条槽位常驻：出现 / 不出现滚动条时内容宽度不得变 ---
    // .canvas 加了 scrollbar-gutter: stable，竖向滚动条的槽位永远预留。
    // 验证方式：在同一个 tab 里把视口拉高（内容不再超长 → 滚动条消失），
    // 对比拉高前后 .settings-section 的宽度 —— 不加 stable 时这里会差一个滚动条宽度。
    const widthOf = `(() => {
      const canvas = document.querySelector('.canvas')
      const section = document.querySelector('.settings-section')
      return {
        canvasClient: canvas?.clientWidth ?? 0,
        sectionWidth: section?.getBoundingClientRect().width ?? 0,
        scrolls: canvas ? canvas.scrollHeight > canvas.clientHeight + 1 : false
      }
    })()`
    const scrolledState = await client.evaluate(widthOf)
    // 把视口拉高到 2200，人员配置页不再超长 → 滚动条应当消失
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 2200,
      deviceScaleFactor: 1,
      mobile: false
    })
    await sleep(250)
    const fittedState = await client.evaluate(widthOf)
    // 复原视口
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    })
    await sleep(250)
    check(
      `${name}: 滚动条出现/消失时内容宽度不变（槽位常驻）`,
      // 短视口下超长（滚动条在），高视口下不超长（滚动条没了）
      scrolledState.scrolls === true &&
        fittedState.scrolls === false &&
        Math.abs(scrolledState.sectionWidth - fittedState.sectionWidth) < 1 &&
        scrolledState.canvasClient === fittedState.canvasClient,
      JSON.stringify({ scrolledState, fittedState })
    )

    // --- 13c. 覆盖式滚动条：静止隐藏，滚动淡入，停下淡出 ---
    const overlayState = `(() => {
      const root = document.querySelector('.scroll-overlay')
      const thumbs = Array.from(document.querySelectorAll('.scroll-overlay-thumb'))
      const visible = thumbs.filter(t => t.classList.contains('is-visible'))
      const thumb = visible[0] ?? thumbs[0] ?? null
      const canvas = document.querySelector('.canvas')
      return {
        rootExists: Boolean(root),
        exists: Boolean(root && thumb),
        visibleCount: visible.length,
        opacity: thumb ? Number(getComputedStyle(thumb).opacity) : 0,
        // 滑块必须在容器可视矩形内，且高度合理
        thumbTop: thumb ? Math.round(thumb.getBoundingClientRect().top) : -1,
        thumbHeight: thumb ? Math.round(thumb.getBoundingClientRect().height) : -1,
        canvasRight: canvas ? Math.round(canvas.getBoundingClientRect().right) : -1
      }
    })()`
    // 初始：完全隐藏（滑块是按需创建的，静止时可能一条都还没有）
    const idleOverlay = await client.evaluate(overlayState)
    check(
      `${name}: 覆盖式滚动条初始隐藏`,
      idleOverlay.rootExists && idleOverlay.visibleCount === 0 && idleOverlay.opacity === 0,
      JSON.stringify(idleOverlay)
    )

    // 滚动画布 → 滑块淡入
    await client.evaluate(`(() => {
      const canvas = document.querySelector('.canvas')
      if (canvas) canvas.scrollTop = 200
      return true
    })()`)
    await sleep(300)
    const scrolledOverlay = await client.evaluate(overlayState)
    check(
      `${name}: 滚动时滑块淡入`,
      scrolledOverlay.visibleCount === 1 &&
        scrolledOverlay.opacity > 0.9 &&
        scrolledOverlay.thumbHeight > 10 &&
        scrolledOverlay.thumbTop > 0,
      JSON.stringify(scrolledOverlay)
    )

    // 停下 0.7 秒后 → 淡出
    await sleep(1400)
    const fadedOverlay = await client.evaluate(overlayState)
    check(
      `${name}: 停止滚动后滑块淡出`,
      fadedOverlay.visibleCount === 0 && fadedOverlay.opacity === 0,
      JSON.stringify(fadedOverlay)
    )

    await client.evaluate(clickByText('.rail-item', '全员矩阵'))
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 13', '矩阵 13 行')
    check(`${name}: 导入后矩阵 13 行`, true)
    const firstPattern = await client.evaluate(
      `document.querySelector('.matrix-row .matrix-pattern')?.textContent.trim() ?? ''`
    )
    check(`${name}: 矩阵班序旁拼岗位（4F · 班长）`, firstPattern === '4F · 班长', firstPattern)

    // --- 14. 人员排序：设置里的行顺序必须映射成矩阵的行顺序 ---
    await client.evaluate(clickByText('.rail-item', '设置'))
    await waitFor(client, 'document.querySelectorAll(".member-row").length === 13', '回到成员表')

    // 把第 1 行（华文达）下移一位
    const moved = await client.evaluate(`(() => {
      const row = document.querySelectorAll('.member-row')[0]
      const buttons = row.querySelectorAll('.btn-icon')
      if (buttons.length < 2) return false
      buttons[1].click()
      return true
    })()`)
    check(`${name}: 成员行可以下移`, moved)
    await sleep(150)

    // 本人那一行没有 input，所以统一按「有 input 读 value，没 input 读锁定文本」取名字
    const orderAfterMove = await client.evaluate(`(() => {
      return Array.from(document.querySelectorAll('.member-row')).slice(0, 3).map(row => {
        const input = row.querySelector('input')
        if (input) return input.value
        return (row.querySelector('.member-locked-name')?.textContent ?? '').trim()
      })
    })()`)
    check(
      `${name}: 下移一位后表内顺序变化`,
      JSON.stringify(orderAfterMove) === JSON.stringify(['张舒棋', '华文达', '陈泳智']),
      JSON.stringify(orderAfterMove)
    )

    check(`${name}: 保存排序`, await client.evaluate(clickByText('.settings-actions button', '保存成员设置')))
    await sleep(300)

    await client.evaluate(clickByText('.rail-item', '全员矩阵'))
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 13', '矩阵 13 行')
    const matrixOrder = await client.evaluate(
      `Array.from(document.querySelectorAll('.matrix-name')).slice(0, 3).map(node => node.textContent.trim())`
    )
    check(
      `${name}: 矩阵行顺序跟随设置`,
      JSON.stringify(matrixOrder) === JSON.stringify(['张舒棋', '华文达', '陈泳智']),
      JSON.stringify(matrixOrder)
    )
  } catch (error) {
    check(`${name}: 场景执行`, false, error.message)
  } finally {
    client?.close()
    chrome.kill()
    await sleep(300)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
}

async function main() {
  if (!fs.existsSync(distIndex)) {
    console.error('没有找到 dist/index.html，请先运行 pnpm build')
    process.exit(1)
  }

  const browser = findBrowser()
  if (!browser) {
    console.error('没有找到 Chrome / Edge，可通过 CHROME_PATH 指定')
    process.exit(1)
  }

  console.log(`浏览器: ${browser}`)

  const downloadDir = path.join(os.tmpdir(), `shift-verify-download-${Date.now()}`)
  fs.mkdirSync(downloadDir, { recursive: true })

  const { server, port } = await startStaticServer(distDir)

  try {
    if (only !== 'file') {
      await runScenario('http', `http://127.0.0.1:${port}/index.html`, path.join(downloadDir, 'http'))
    }
    if (only !== 'http') {
      await runScenario('file', pathToFileURL(distIndex).href, path.join(downloadDir, 'file'))
    }
  } finally {
    server.close()
    fs.rmSync(downloadDir, { recursive: true, force: true })
  }

  const failed = results.filter(item => !item.ok)
  console.log(`\n=== 汇总：${results.length - failed.length}/${results.length} 通过 ===`)

  if (failed.length > 0) {
    failed.forEach(item => console.log(`  FAIL  ${item.name}  ${item.detail}`))
    process.exit(1)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
