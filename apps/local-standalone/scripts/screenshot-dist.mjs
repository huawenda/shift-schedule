#!/usr/bin/env node
/**
 * 大屏视觉审计工具：在多个桌面分辨率下把 dist/ 打开并截图。
 *
 *   node scripts/screenshot-dist.mjs
 *   node scripts/screenshot-dist.mjs --sizes=1440x900,1920x1080
 *   node scripts/screenshot-dist.mjs --out=D:\tmp\shots
 *
 * 每个尺寸截三张：排班页、统计·个人、统计·全员。
 * 默认输出到 screenshots/（已在 .gitignore 里）。
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

const defaultSizes = ['390x844', '768x1024', '1024x768', '1280x800', '1440x900', '1920x1080', '2560x1440', '3440x1440']

function readArg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find(arg => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

const sizes = readArg('sizes', defaultSizes.join(',')).split(',').map(item => item.trim()).filter(Boolean)
const outDir = path.resolve(readArg('out', path.join(projectDir, 'screenshots')))
const useFileProtocol = process.argv.includes('--file')

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
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
    '.webmanifest': 'application/manifest+json',
    '.txt': 'text/plain; charset=utf-8'
  }

  const server = http.createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url || '/').split('?')[0])
    const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
    const filePath = path.join(rootDir, relative)

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
      // 还没起来
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
    socket.addEventListener('error', () => reject(new Error('CDP 连接失败')))
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

async function waitFor(client, expression, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return
    await sleep(100)
  }
  throw new Error(`等待超时：${label}`)
}

async function capture(client, filePath) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
  return fs.statSync(filePath).size
}

/** 量一下布局实际占了多大、哪里有溢出。 */
async function measure(client) {
  return client.evaluate(`(() => {
    const rect = selector => {
      const node = document.querySelector(selector)
      if (!node) return null
      const box = node.getBoundingClientRect()
      return { w: Math.round(box.width), h: Math.round(box.height), top: Math.round(box.top), left: Math.round(box.left) }
    }
    const style = (selector, prop) => {
      const node = document.querySelector(selector)
      return node ? getComputedStyle(node)[prop] : null
    }
    const scroller = document.querySelector('.matrix-scroll')
    const shell = document.querySelector('.app-shell')
    const shellRect = shell ? shell.getBoundingClientRect() : null

    // 表头与数据行的列是否逐列对齐（WP3 用各行独立 1fr 分配，必须验证对齐）
    const headerLefts = Array.from(document.querySelectorAll('.date-head'))
      .map(node => Math.round(node.getBoundingClientRect().left))
    const firstBodyRow = document.querySelector('.roster-row')
    const bodyLefts = firstBodyRow
      ? Array.from(firstBodyRow.children).map(node => Math.round(node.getBoundingClientRect().left))
      : []
    const aligned = headerLefts.length > 0 &&
      headerLefts.length === bodyLefts.length &&
      headerLefts.every((left, index) => Math.abs(left - bodyLefts[index]) <= 1)

    // 实际列宽（≥1440 之后 grid-auto-columns 是 minmax(...)，取不到定值，直接量单元格）
    const firstCell = firstBodyRow?.querySelector('.roster-cell')
    const dateColumnPx = firstCell ? Math.round(firstCell.getBoundingClientRect().width) : null
    const dateColumnPxExact = firstCell ? firstCell.getBoundingClientRect().width : null

    // 班次标签是否撑破单元格：格子内文字溢出就会被 overflow 裁掉
    let worstChipOverflow = 0
    document.querySelectorAll('.roster-cell').forEach(cell => {
      const overflow = cell.scrollWidth - cell.clientWidth
      if (overflow > worstChipOverflow) worstChipOverflow = overflow
    })

    // 排班日历：.calendar-cell 是 overflow:hidden，内容一旦超出就会被裁掉
    const calendarCard = document.querySelector('.side-col .panel')
    const cardOverflow = calendarCard ? calendarCard.scrollWidth - calendarCard.clientWidth : 0
    const calendarCells = Array.from(document.querySelectorAll('.calendar-cell'))
    let calendarClippedCount = 0
    let calendarWorstOverflow = 0
    let calendarWorstChild = null
    calendarCells.forEach(cell => {
      const box = cell.getBoundingClientRect()
      const overflowX = cell.scrollWidth - cell.clientWidth
      const overflowY = cell.scrollHeight - cell.clientHeight
      const worst = Math.max(overflowX, overflowY)
      if (worst > calendarWorstOverflow) calendarWorstOverflow = worst

      let childClipped = false
      Array.from(cell.querySelectorAll('*')).forEach(node => {
        const rect = node.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        const dx = Math.max(rect.right - box.right, box.left - rect.left)
        const dy = Math.max(rect.bottom - box.bottom, box.top - rect.top)
        const over = Math.max(dx, dy)
        if (over <= 0.5) return
        childClipped = true
        if (!calendarWorstChild || over > calendarWorstChild.over) {
          calendarWorstChild = {
            cls: String(node.className || node.tagName),
            over: Math.round(over * 10) / 10,
            dx: Math.round(dx * 10) / 10,
            dy: Math.round(dy * 10) / 10
          }
        }
      })

      if (worst > 0 || childClipped) calendarClippedCount += 1
    })

    // 首个日历单元格的盒模型细节（排查裁剪用）
    const firstCal = document.querySelector('.calendar-cell:not([aria-hidden])') ||
      document.querySelector('.calendar-cell')
    const calendarDetail = firstCal ? (() => {
      const round = value => Math.round(value * 10) / 10
      const pick = selector => {
        const node = firstCal.querySelector(selector)
        if (!node) return null
        const cs = getComputedStyle(node)
        const r = node.getBoundingClientRect()
        return {
          w: round(r.width), h: round(r.height), left: round(r.left), right: round(r.right),
          cssWidth: cs.width, flexBasis: cs.flexBasis, flexShrink: cs.flexShrink, gap: cs.columnGap
        }
      }
      const cellRect = firstCal.getBoundingClientRect()
      const cellStyle = getComputedStyle(firstCal)
      return {
        cell: {
          w: round(cellRect.width), h: round(cellRect.height),
          left: round(cellRect.left), right: round(cellRect.right),
          clientW: firstCal.clientWidth, clientH: firstCal.clientHeight,
          scrollW: firstCal.scrollWidth, scrollH: firstCal.scrollHeight,
          padding: cellStyle.padding, overflow: cellStyle.overflow
        },
        content: pick('.calendar-cell .calendar-day'),
        wrap: null,
        spacer: null,
        day: pick('.calendar-day'),
        lunar: pick('.calendar-lunar'),
        shiftRow: pick('.calendar-bar'),
        chip: null
      }
    })() : null

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      calendarDetail,
      shell: rect('.app-shell'),
      shellWidthRatio: shellRect ? Number((shellRect.width / window.innerWidth).toFixed(3)) : null,
      sideMargin: shellRect ? Math.round((window.innerWidth - shellRect.width) / 2) : null,
      contentBottom: Math.round(document.querySelector('.matrix')?.getBoundingClientRect().bottom ?? 0),
      calendarCard: rect('.side-col .panel'),
      tableCard: rect('.schedule-card'),
      tableOverflow: scroller ? { visible: scroller.clientWidth, needed: scroller.scrollWidth, hidden: scroller.scrollWidth - scroller.clientWidth } : null,
      headerBodyAligned: aligned,
      worstChipOverflow,
      calendarCardOverflow: cardOverflow,
      calendarCellCount: calendarCells.length,
      calendarClippedCount,
      calendarWorstOverflow,
      calendarWorstChild,
      dateColumnPx,
      dateColumnPxExact,
      dayCount: headerLefts.length,
      docScrollHeight: document.documentElement.scrollHeight,
      stickyTop: rect('.top-bar'),
      monthTab: rect('.stepper'),
      monthTabsRow: rect('.summary-bar'),
      bodyUserSelect: getComputedStyle(document.body).userSelect,
      hoverCapable: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
      dateColumnWidth: style('.roster-row', 'gridAutoColumns'),
      fonts: {
        calendarDay: style('.calendar-day', 'fontSize'),
        shiftChip: style('.roster-cell', 'fontSize'),
        personName: style('.rail-name', 'fontSize'),
        sectionTitle: style('.section-title', 'fontSize'),
        headerH1: style('.brand-name', 'fontSize')
      }
    }
  })()`)
}

/** 统计页的垂直填充率：内容底部 / 视口高度。 */
async function measureStats(client) {
  return client.evaluate(`(() => {
    const boxes = ['.stats-main', '.stats-bar']
      .map(selector => document.querySelector(selector)?.getBoundingClientRect())
      .filter(Boolean)
    const bottom = boxes.length ? Math.round(Math.max(...boxes.map(box => box.bottom))) : 0
    const ratio = Number((bottom / window.innerHeight * 100).toFixed(0))
    return { bottom, ratio, docH: document.documentElement.scrollHeight }
  })()`)
}

async function main() {
  if (!fs.existsSync(distIndex)) {
    console.error('没有找到 dist/index.html，请先 pnpm build')
    process.exit(1)
  }

  const measurements = []
  const browser = findBrowser()
  if (!browser) {
    console.error('没有找到 Chrome / Edge，可用 CHROME_PATH 指定')
    process.exit(1)
  }

  fs.mkdirSync(outDir, { recursive: true })

  const { server, port } = await startStaticServer(distDir)
  const startUrl = useFileProtocol ? pathToFileURL(distIndex).href : `http://127.0.0.1:${port}/index.html`
  console.log(`浏览器: ${browser}`)
  console.log(`地址  : ${useFileProtocol ? 'file://' : 'http://127.0.0.1'}`)
  console.log(`输出  : ${outDir}\n`)

  const userDataDir = path.join(os.tmpdir(), `dsh-shots-${Date.now()}`)
  const debugPort = 9700 + Math.floor(Math.random() * 200)
  const chrome = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars=false',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debugPort}`,
    startUrl
  ], { stdio: 'ignore' })

  let client = null

  try {
    const page = await waitForJsonEndpoint(debugPort)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')

    // 用工具自带的清空方式，保证每个尺寸从同一状态出发
    await client.evaluate(`(() => { window.localStorage.clear(); return true })()`)

    for (const size of sizes) {
      const [width, height] = size.split('x').map(Number)
      if (!width || !height) continue

      const tag = `${width}x${height}`
      // ≤768 按真实移动端模拟（mobile: true + 触摸），这样 (hover: hover) 不会命中，
      // 才能验证「移动端仍禁选、PC 才放开」这条规则
      const isMobile = width <= 768
      console.log(`--- ${tag} ---`)

      await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: isMobile
      })
      if (isMobile) {
        await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
      } else {
        await client.send('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {})
      }

      await client.send('Page.navigate', { url: startUrl })
      await waitFor(client, 'Boolean(document.querySelector(".calendar"))', '排班页渲染')
      await sleep(500)

      const scheduleBytes = await capture(client, path.join(outDir, `${tag}-01-排班.png`))
      console.log(`  排班页            ${(scheduleBytes / 1024).toFixed(0)} KB`)

      const metrics = await measure(client)
      if (process.env.DUMP_CALENDAR) console.log(JSON.stringify(metrics.calendarDetail, null, 2))
      metrics.size = tag
      measurements.push(metrics)
      const visibleDays = metrics.tableOverflow && metrics.dateColumnPx
        ? Math.round(metrics.tableOverflow.visible / metrics.dateColumnPxExact)
        : 0
      console.log(`    应用宽度 ${metrics.shell.w}px (占视口 ${(metrics.shellWidthRatio * 100).toFixed(0)}%)  两侧留白 ${metrics.sideMargin}px  内容底部 y=${metrics.contentBottom}/${metrics.viewport.h}`)
      console.log(`    sticky ${metrics.stickyTop.h}px  月份tab ${metrics.monthTab.w}px  日期列 ${metrics.dateColumnWidth}  可见天数 ${visibleDays}/${metrics.dayCount}  横向溢出 ${metrics.tableOverflow ? metrics.tableOverflow.hidden : 0}px`)
      console.log(`    行列对齐=${metrics.headerBodyAligned}  标签最宽溢出=${metrics.worstChipOverflow}px  文字可选=${metrics.bodyUserSelect}`)

      /* 「按姓名」视图显示的是人名（3 个汉字），比班次标签更容易撑破列。
         之前只测了默认的「按班次」模式，恰好漏掉了这一类溢出 ——
         所以这里单独切过去复测一次。 */
      const nameModeOverflow = await client.evaluate(`(() => {
        const tab = Array.from(document.querySelectorAll('.segmented button'))
          .find(b => b.textContent.trim() === '按姓名')
        if (!tab) return -1
        tab.click()
        return new Promise(resolve => {
          requestAnimationFrame(() => {
            let worst = 0
            let worstText = ''
            document.querySelectorAll('.roster-cell').forEach(cell => {
              const over = cell.scrollWidth - cell.clientWidth
              if (over > worst) { worst = over; worstText = cell.textContent.trim() }
            })
            resolve({ worst, worstText })
          })
        })
      })()`)
      metrics.nameModeOverflow = nameModeOverflow.worst
      const backToShift = await client.evaluate(`(() => {
        const tab = Array.from(document.querySelectorAll('.segmented button'))
          .find(b => b.textContent.trim() === '按班次')
        if (tab) tab.click()
        return true
      })()`)
      await sleep(200)
      console.log(`    姓名视图溢出 ${nameModeOverflow.worst}px${nameModeOverflow.worst > 0 ? `（最严重「${nameModeOverflow.worstText}」）` : ''}`)

      // 遍历所有月份，确认最坏情况（31 天）也不横滚
      const monthSweep = await client.evaluate(`(async () => {
        const next = document.querySelector('.stepper button:last-of-type')
        const results = []
        for (let i = 0; i < 8; i += 1) {
          await new Promise(resolve => setTimeout(resolve, 240))
          const scroller = document.querySelector('.matrix-scroll')
          results.push({
            month: document.querySelector('.stepper-value')?.textContent?.trim() ?? '',
            days: document.querySelectorAll('.date-head').length,
            hidden: scroller ? scroller.scrollWidth - scroller.clientWidth : 0
          })
          if (next) next.click()
        }
        return results
      })()`)
      metrics.maxDays = Math.max(...monthSweep.map(item => item.days))
      metrics.worstMonthOverflow = Math.max(...monthSweep.map(item => item.hidden))
      console.log(`    各月份: 最多 ${metrics.maxDays} 天, 最大横滚 ${metrics.worstMonthOverflow}px`)
      console.log(`    日历: 卡片溢出 ${metrics.calendarCardOverflow}px, ${metrics.calendarClippedCount}/${metrics.calendarCellCount} 个单元格内容被裁, 最大溢出 ${metrics.calendarWorstOverflow}px` +
        (metrics.calendarWorstChild ? `  最严重: .${metrics.calendarWorstChild.cls} 溢出 ${metrics.calendarWorstChild.over}px (水平${metrics.calendarWorstChild.dx}/垂直${metrics.calendarWorstChild.dy})` : ''))

      // 日历卡片局部截图（2x），方便肉眼确认有没有裁剪
      const cardBox = await client.evaluate(`(() => {
        const cell = document.querySelector('.calendar-cell')
        const card = document.querySelector('.side-col .panel')
        if (!card) return null
        const r = card.getBoundingClientRect()
        return {
          x: Math.max(0, Math.round(r.x)),
          y: Math.max(0, Math.round(r.y)),
          width: Math.min(Math.round(r.width), window.innerWidth),
          height: Math.min(Math.round(r.height), window.innerHeight - Math.max(0, Math.round(r.y))),
          cellWidth: cell ? Math.round(cell.getBoundingClientRect().width) : null
        }
      })()`)
      if (cardBox && cardBox.width > 0 && cardBox.height > 0) {
        const { data } = await client.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: { x: cardBox.x, y: cardBox.y, width: cardBox.width, height: cardBox.height, scale: 2 }
        })
        fs.writeFileSync(path.join(outDir, `${tag}-04-日历卡片.png`), Buffer.from(data, 'base64'))
        console.log(`    日历卡片截图: ${cardBox.width}×${cardBox.height}px, 单元格宽 ${cardBox.cellWidth}px`)
      }

      // 统计 · 个人
      await client.evaluate(`Array.from(document.querySelectorAll('.top-bar-actions button')).find(b => b.textContent.trim() === '统计')?.click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".stats"))', '统计页')
      await sleep(500)
      const statsBytes = await capture(client, path.join(outDir, `${tag}-02-统计-个人.png`))
      console.log(`  统计·个人         ${(statsBytes / 1024).toFixed(0)} KB`)
      const personalFill = await measureStats(client)
      console.log(`    统计·个人 内容底部 y=${personalFill.bottom}/${metrics.viewport.h} (${personalFill.ratio}%)`)

      // 统计 · 每日明细（全员排名页已删除）
      const switched = await client.evaluate(`(() => {
        const tab = Array.from(document.querySelectorAll('.stats-filters [role="tablist"] button'))
          .find(item => item.textContent.includes('每日明细'))
        if (!tab) return false
        tab.click()
        return true
      })()`)
      if (switched) {
        await waitFor(client, 'Boolean(document.querySelector(".daily"))', '每日明细')
        await sleep(400)
        const dailyBytes = await capture(client, path.join(outDir, `${tag}-03-统计-每日.png`))
        console.log(`  统计·每日         ${(dailyBytes / 1024).toFixed(0)} KB`)
        const dailyFill = await measureStats(client)
        console.log(`    统计·每日 内容底部 y=${dailyFill.bottom}/${metrics.viewport.h} (${dailyFill.ratio}%)`)
      }
    }
  } finally {
    client?.close()
    chrome.kill()
    await sleep(300)
    fs.rmSync(userDataDir, { recursive: true, force: true })
    server.close()
  }

  console.log('\n=== 布局度量汇总 ===')
  console.log('视口        应用宽  占比  sticky  可见天数  列宽  横滚  行列对齐  标签溢出  姓名溢出  内容底部  字号(日期/标签/姓名/标题)')
  for (const item of measurements) {
    const visibleDays = item.tableOverflow && item.dateColumnPx
      ? Math.round(item.tableOverflow.visible / item.dateColumnPxExact)
      : 0
    console.log(
      `${item.size.padEnd(11)} ${String(item.shell.w).padStart(5)}  ${String(Math.round(item.shellWidthRatio * 100)).padStart(3)}% ` +
      `${String(item.stickyTop.h).padStart(6)} ${String(`${visibleDays}/${item.dayCount}`).padStart(9)} ` +
      `${String(item.dateColumnPx ?? '-').padStart(5)}px ` +
      `${String(item.tableOverflow ? item.tableOverflow.hidden : 0).padStart(5)} ` +
      `${String(item.headerBodyAligned ? '是' : '否').padStart(8)} ` +
      `${String(item.worstChipOverflow).padStart(8)} ` +
      `${String(item.nameModeOverflow).padStart(8)} ` +
      `${String(item.contentBottom).padStart(8)}  ` +
      `${item.fonts.calendarDay}/${item.fonts.shiftChip}/${item.fonts.personName}/${item.fonts.sectionTitle}`
    )
  }

  console.log('\n=== 硬性检查 ===')
  let failures = 0
  const assert = (name, ok, detail = '') => {
    if (!ok) failures += 1
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
  }

  for (const item of measurements) {
    assert(`${item.size}: 表头与数据行列对齐`, item.headerBodyAligned)
    assert(`${item.size}: 班次标签未溢出单元格`, item.worstChipOverflow <= 0, `最大溢出 ${item.worstChipOverflow}px`)
    assert(`${item.size}: 姓名视图未溢出单元格`, item.nameModeOverflow >= 0 && item.nameModeOverflow <= 0, `最大溢出 ${item.nameModeOverflow}px`)
    assert(
      `${item.size}: 日历单元格内容未被裁`,
      item.calendarClippedCount === 0,
      `${item.calendarClippedCount}/${item.calendarCellCount} 个被裁，最大溢出 ${item.calendarWorstOverflow}px`
    )
  }

  for (const item of measurements) {
    const width = Number(item.size.split('x')[0])
    if (width < 1800) continue
    assert(`${item.size}: 整月排班无需横向滚动`, item.tableOverflow.hidden === 0, `仍溢出 ${item.tableOverflow.hidden}px`)
    assert(
      `${item.size}: 所有月份（最多 ${item.maxDays} 天）都无需横向滚动`,
      item.worstMonthOverflow === 0,
      `最差月份仍溢出 ${item.worstMonthOverflow}px`
    )
  }

  for (const item of measurements) {
    const width = Number(item.size.split('x')[0])
    if (width < 1440) continue
    // 超宽屏保留 2600px 上限：再宽单行就要横扫 3000px 以上，反而难跟踪；
    // 这里只要求大屏利用率不低于 70%（改造前 1920 是 71%、2560 是 53%、3440 是 40%）
    assert(`${item.size}: 大屏宽度利用率 ≥70%`, item.shellWidthRatio >= 0.7, `${Math.round(item.shellWidthRatio * 100)}%`)
    assert(`${item.size}: PC 上文字可选中复制`, item.bodyUserSelect === 'text', item.bodyUserSelect)
  }

  for (const item of measurements) {
    const width = Number(item.size.split('x')[0])
    if (width > 768) continue
    assert(`${item.size}: 移动端文字仍不可选`, item.bodyUserSelect === 'none', item.bodyUserSelect)
    assert(`${item.size}: 移动端未命中鼠标媒体查询`, item.hoverCapable === false, String(item.hoverCapable))
  }

  console.log(`\n${failures === 0 ? '全部硬性检查通过' : `${failures} 项硬性检查未通过`}`)
  console.log('\n完成。')
  if (failures > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
