#!/usr/bin/env node
/**
 * 每日明细「月历网格」的内容密度测量。
 *
 *   node scripts/measure-daily.mjs
 *   node scripts/measure-daily.mjs --sizes=1440x900,1920x1080
 *   node scripts/measure-daily.mjs --url=http://127.0.0.1:6180/index.html
 *
 * 对每个尺寸报出：格子尺寸、格子内三行内容（日期/班次/数值）各自的高度与
 * 上下留白，以及「内容高度 / 格子高度」这个密度比。
 * 密度比低 = 格子空旷 = 用户说的「太松垮」。
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(__dirname, '..')

function readArg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find(arg => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

const sizes = readArg('sizes', '2560x1440,1920x1080,1440x900,1280x800,1024x768,768x1024')
  .split(',').map(item => item.trim()).filter(Boolean)
const useDev = process.argv.includes('--dev')
const url = readArg('url', useDev
  ? 'http://127.0.0.1:6180/index.html'
  : pathToFileURL(path.join(projectDir, 'dist', 'index.html')).href)

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean)
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null
}

function startStaticServer(rootDir) {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png'
  }
  const server = http.createServer((request, response) => {
    const rel = decodeURIComponent((request.url || '/').split('?')[0])
    const filePath = path.join(rootDir, rel === '/' ? 'index.html' : rel.replace(/^\/+/, ''))
    fs.readFile(filePath, (error, data) => {
      if (error) return response.writeHead(404).end('not found')
      response.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' })
      response.end(data)
    })
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })))
}

async function waitForJsonEndpoint(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
        if (page) return page
      }
    } catch { /* 还没起来 */ }
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
    socket.addEventListener('error', () => reject(new Error('CDP 连接失败')))
  })
  ready.catch(() => {})
  socket.addEventListener('message', event => {
    let message
    try { message = JSON.parse(event.data) } catch { return }
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message || 'CDP 调用失败'))
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || '求值失败')
    return result.result.value
  }
  return { ready, send, evaluate, close: () => { try { socket.close() } catch { /* 忽略 */ } } }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(client, expression, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return
    await sleep(120)
  }
  throw new Error(`等待超时：${label}`)
}

/* 页面内测量：取一个「有加班」的格子（内容最满的那种），
   量它的高度构成：padding / 日期行 / 班次色牌 / 数值行 / 三段间隙。 */
const PROBE = `(() => {
  const all = Array.from(document.querySelectorAll('.daily-cell'))
  const cells = all.filter(c => !c.classList.contains('is-blank'))
  const rich = cells.find(c => !c.classList.contains('is-zero'))
  const grid = document.querySelector('.daily-grid')
  const gridCs = getComputedStyle(grid)
  const rowTops = new Map()
  all.forEach(c => {
    const top = Math.round(c.getBoundingClientRect().top)
    rowTops.set(top, (rowTops.get(top) ?? 0) + 1)
  })

  if (!rich) {
    return {
      noRich: true, rows: rowTops.size, cells: cells.length,
      gridRows: gridCs.gridTemplateRows, cellsH: cells[0] ? Math.round(cells[0].getBoundingClientRect().height) : 0
    }
  }

  const r = rich.getBoundingClientRect()
  const cs = getComputedStyle(rich)
  const pick = sel => {
    const el = rich.querySelector(sel)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return {
      h: Math.round(b.height * 10) / 10,
      top: Math.round((b.top - r.top) * 10) / 10,
      bottom: Math.round((b.bottom - r.top) * 10) / 10,
      w: Math.round(b.width)
    }
  }
  const when = pick('.daily-cell-when')
  const shift = pick('.daily-cell-shift')
  const foot = pick('.daily-cell-foot')

  const gaps = []
  if (when && shift) gaps.push(Math.round((shift.top - when.bottom) * 10) / 10)
  if (shift && foot) gaps.push(Math.round((foot.top - shift.bottom) * 10) / 10)

  const contentH = when && foot ? Math.round((foot.bottom - when.top) * 10) / 10 : null
  const padTop = parseFloat(cs.paddingTop)
  const padBottom = parseFloat(cs.paddingBottom)
  const innerH = Math.round((r.height - padTop - padBottom) * 10) / 10

  const widths = cells.map(c => Math.round(c.getBoundingClientRect().width))
  const heights = cells.map(c => Math.round(c.getBoundingClientRect().height))

  /* 有没有格子装不下自己的内容 —— 放大字号后这一项必须盯着，
     溢出在缩略图上看不出来，但用户一眼就能看见被切掉的金额。 */
  const overflow = { worst: 0, worstText: '', clipX: 0, clipY: 0 }
  cells.forEach(c => {
    const cb = c.getBoundingClientRect()
    const over = Math.max(c.scrollWidth - c.clientWidth, c.scrollHeight - c.clientHeight)
    if (over > overflow.worst) {
      overflow.worst = over
      overflow.worstText = c.textContent.trim().slice(0, 20)
      overflow.clipX = c.scrollWidth - c.clientWidth
      overflow.clipY = c.scrollHeight - c.clientHeight
    }
  })

  /* 横向：内容最宽能占格子的多少。用所有子元素的并集，
     也就是「格子里实际有东西的那段宽度」。 */
  const kidRects = Array.from(rich.children)
    .filter(el => !el.classList.contains('is-blank'))
    .map(el => el.getBoundingClientRect())
  const contentW = kidRects.length
    ? Math.round((Math.max(...kidRects.map(b => b.right)) - Math.min(...kidRects.map(b => b.left))) * 10) / 10
    : null
  const padLeft = parseFloat(cs.paddingLeft)
  const padRight = parseFloat(cs.paddingRight)
  const innerW = Math.round((r.width - padLeft - padRight) * 10) / 10

  const csDate = getComputedStyle(rich.querySelector('.daily-cell-date'))
  const csShift = getComputedStyle(rich.querySelector('.daily-cell-shift'))
  const csPay = rich.querySelector('.daily-cell-pay')
    ? getComputedStyle(rich.querySelector('.daily-cell-pay')) : csDate

  /* 纵向预算：面板 → 网格 / 汇总 / 合计各占多少，有多少富余。 */
  const box = sel => {
    const el = document.querySelector(sel)
    return el ? Math.round(el.getBoundingClientRect().height) : null
  }

  return {
    cell: { w: Math.round(r.width), h: Math.round(r.height) },
    padding: { top: cs.paddingTop, bottom: cs.paddingBottom, left: cs.paddingLeft, right: cs.paddingRight },
    innerH, contentH,
    density: contentH && innerH ? Math.round((contentH / innerH) * 100) : null,
    contentW, innerW,
    densityW: contentW && innerW ? Math.round((contentW / innerW) * 100) : null,
    when, shift, foot, gaps,
    headGap: when ? Math.round((when.top - padTop) * 10) / 10 : null,
    tailGap: foot ? Math.round((r.height - padBottom - foot.bottom) * 10) / 10 : null,
    rows: rowTops.size,
    gridRowH: gridCs.gridTemplateRows,
    gridRows: gridCs.gridTemplateRows.split(' ').map(v => Math.round(parseFloat(v) * 10) / 10),
    gridMaxH: gridCs.maxHeight,
    cells: cells.length,
    zeroCells: all.filter(c => c.classList.contains('is-zero') && !c.classList.contains('is-blank')).length,
    cellW: { min: Math.min(...widths), max: Math.max(...widths) },
    cellH: { min: Math.min(...heights), max: Math.max(...heights) },
    scrollY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    budget: {
      viewport: window.innerHeight,
      panel: box('.stats-fill'),
      daily: box('.daily'),
      gridWrap: box('.daily-grid-wrap'),
      grid: box('.daily-grid'),
      breakdown: box('.daily-breakdown'),
      foot: box('.daily-foot')
    },
    gridH: Math.round(grid.getBoundingClientRect().height),
    /* 面板里还剩多少高度没被用掉：网格有 150px×6 的行高上限，
       视口更高时上限先到，剩下的高度就空在面板底部。 */
    slackInPanel: (() => {
      const wrap = document.querySelector('.daily-grid-wrap')
      const g = grid.getBoundingClientRect()
      const w = wrap.getBoundingClientRect()
      return Math.round(w.height - g.height)
    })(),
    containerType: cs.containerType,
    cqSupported: typeof CSS !== 'undefined' && typeof CSS.containerSize === 'function',
    fontSizes: {
      date: csDate.fontSize,
      shift: csShift.fontSize,
      pay: csPay.fontSize
    },
    overflow,
    dateFont: Math.round(parseFloat(getComputedStyle(rich.querySelector('.daily-cell-date')).fontSize)),
    shiftFont: Math.round(parseFloat(getComputedStyle(rich.querySelector('.daily-cell-shift')).fontSize))
  }
})()`

/** 造一份贴近真实使用的种子数据：30 天周期里混排六种班次，
 *  休息与事假不带加班（休息本就不产生加班，见 canRecordOvertime）。 */
function buildSeed() {
  const plan = [
    ['白班', 1.5], ['夜班', 2], ['休息', 0], ['白班', 3], ['夜特', 2.5],
    ['白班', 1], ['事假', 0], ['夜班', 3], ['休息', 0], ['白班', 0],
    ['夜班', 1.5], ['白特', 4], ['白班', 2], ['休息', 0], ['夜班', 0],
    ['白班', 2.5], ['夜特', 2], ['白班', 1], ['休息', 0], ['事假', 0],
    ['夜班', 2], ['白班', 1], ['休息', 0], ['白班', 3], ['夜班', 1],
    ['休息', 0], ['白班', 1.5], ['白班', 2], ['事假', 0], ['休息', 0]
  ]
  const records = plan.map(([shift, hours], index) => {
    const date = new Date(2026, 8, 20 + index) // 09/20 起 30 天
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const isLegal = hours > 0 && index % 13 === 5
    return {
      personName: '华文达',
      date: `${mm}/${dd}`,
      shiftOverride: shift,
      overtimeHours: hours,
      ...(isLegal ? { isLegalOvertime: true } : {}),
      updatedAt: 1758000000000 + index
    }
  })
  return records
}

const SEED_KEY = 'shift-schedule:local:day-records:v1'

async function main() {
  const browser = findBrowser()
  if (!browser) {
    console.error('没有找到 Chrome / Edge')
    process.exit(1)
  }

  let server = null
  let startUrl = url
  /* url 默认已经是 file:// 绝对地址；只有当它既不是 http 也不是 file
     （比如传了裸路径）时才交给本地静态服务器托管。
     早前这里对 file:// 地址又套了一次 pathToFileURL，
     结果拼成 file:///.../file:///.../dist/index.html，页面直接 404。 */
  if (!startUrl.startsWith('http') && !startUrl.startsWith('file:')) {
    const started = await startStaticServer(path.join(projectDir, 'dist'))
    server = started.server
    startUrl = `http://127.0.0.1:${started.port}/index.html`
  }

  const userDataDir = path.join(os.tmpdir(), `dsh-daily-${Date.now()}`)
  const debugPort = 9900 + Math.floor(Math.random() * 90)
  const chrome = spawnBrowser(browser, userDataDir, debugPort, startUrl)

  let client = null
  try {
    const page = await waitForJsonEndpoint(debugPort)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')

    console.log(`地址: ${startUrl}\n`)
    console.log('尺寸        格子       行  日期  班次  数值  内容高/内高  密度  行间空隙      上下留白    溢出')
    console.log('─'.repeat(104))

    for (const size of sizes) {
      const [width, height] = size.split('x').map(Number)
      if (!width || !height) continue

      await client.send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: width <= 768
      })
      if (width <= 768) await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

      // 先把种子数据写进 localStorage，再导航，让首屏就是满数据状态
      await client.send('Page.navigate', { url: startUrl })
      await waitFor(client, 'Boolean(document.querySelector(".calendar"))', '排班页')
      await client.evaluate(`(() => {
        window.localStorage.setItem(${JSON.stringify(SEED_KEY)}, ${JSON.stringify(JSON.stringify(buildSeed()))})
        return true
      })()`)

      await client.send('Page.navigate', { url: startUrl })
      await waitFor(client, 'Boolean(document.querySelector(".calendar"))', '排班页（已播种）')
      await sleep(400)

      await client.evaluate(`Array.from(document.querySelectorAll('.top-bar-actions button')).find(b => b.textContent.trim() === '统计')?.click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".stats"))', '统计页')
      await sleep(300)

      await client.evaluate(`(() => {
        const tab = Array.from(document.querySelectorAll('.stats-filters [role="tablist"] button'))
          .find(i => i.textContent.includes('每日明细'))
        if (tab) tab.click()
        return true
      })()`)
      await waitFor(client, 'Boolean(document.querySelector(".daily"))', '每日明细')
      await sleep(400)

      if (process.env.SHOT_DIR) {
        const { data } = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
        fs.mkdirSync(process.env.SHOT_DIR, { recursive: true })
        fs.writeFileSync(path.join(process.env.SHOT_DIR, `daily-${size}.png`), Buffer.from(data, 'base64'))
      }

      const m = await client.evaluate(PROBE)

      if (m.noRich) {
        console.log(`${size.padEnd(11)} 无加班数据（${m.cells} 格，${m.rows} 行）`)
        continue
      }

      const b = m.budget
      console.log(
        `${size.padEnd(11)} ${(m.cell.w + '×' + m.cell.h).padEnd(10)} ${String(m.rows).padEnd(3)} ` +
        `${(m.when.h + '/' + m.shift.h + '/' + m.foot.h).padEnd(16)} ` +
        `V ${(m.contentH + '/' + m.innerH + ' ' + m.density + '%').padEnd(17)} ` +
        `H ${(m.contentW + '/' + m.innerW + ' ' + m.densityW + '%').padEnd(17)} ` +
        `余${m.tailGap}`
      )
      console.log(
        `${''.padEnd(11)} 字号 ${m.fontSizes.date}/${m.fontSizes.shift}/${m.fontSizes.pay}  ` +
        `溢出 格${m.overflow.worst}px(${m.overflow.clipX}x/${m.overflow.clipY}y ${m.overflow.worstText})  页${m.scrollY}`
      )
    }
  } finally {
    client?.close()
    chrome.kill()
    server?.close()
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* 忽略 */ }
  }
}

function spawnBrowser(browser, userDataDir, debugPort, startUrl) {
  return spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars=false',
    `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${debugPort}`, startUrl
  ], { stdio: 'ignore' })
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
