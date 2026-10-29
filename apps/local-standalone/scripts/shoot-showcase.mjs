#!/usr/bin/env node
/**
 * 产品展示图生成器。
 *
 *   node scripts/shoot-showcase.mjs                 # 输出到 design/screenshots/
 *   node scripts/shoot-showcase.mjs --out=D:\tmp    # 换输出目录
 *
 * 做两件事：
 *   1. 把 fixtures/展示样例6人.json 注入 localStorage，逐视图截原始图；
 *   2. 再把每张原始图放进圆角窗口 + 阴影的浅色画板，合成宣传物料风格的成图。
 *
 * 数据全部虚构，与 fixtures/班组13人.json 无关，人名也不重合。
 * 依赖：本机 Chrome/Edge，Node 18+（用全局 fetch / WebSocket），零第三方依赖。
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
const fixturePath = path.join(projectDir, 'fixtures', '展示样例6人.json')

const ROSTER_KEY = 'shift-schedule:local:roster:v2'

/** 应用允许的最小窗口宽度，也是展示画布的逻辑尺寸 */
const VIEW_W = 1466
/**
 * 比应用最小高度（720）高出不少，原因是展示图要在一屏里看到整页：
 * 日历 + 本月概览 + 薪资计算（含应发/实发）+ 每日明细（含合计脚注）。
 * 这个高度是逐档试出来的：900 切掉半个薪资卡，1160 差实发，1320 还差底部边线与合计。
 */
const VIEW_H = 1400
/** 2 倍像素密度，输出 2932×2800，贴进文档或宣传页都够清晰 */
const SCALE = 2

const outArg = process.argv.find(arg => arg.startsWith('--out='))
const outDir = outArg
  ? path.resolve(outArg.slice('--out='.length))
  : path.join(projectDir, 'design', 'screenshots')

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('dist/ 不存在，先跑 pnpm build')
  process.exit(1)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

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

  const found = candidates.find(candidate => fs.existsSync(candidate))
  if (!found) throw new Error('找不到 Chrome 或 Edge，可用 CHROME_PATH 指定')
  return found
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
    await sleep(200)
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

async function waitFor(client, expression, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return true
    await sleep(120)
  }
  throw new Error(`等待超时：${label}`)
}

function clickByText(selector, text) {
  return `(() => {
    const target = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .find(item => item.textContent.trim() === ${JSON.stringify(text)})
    if (!target) return false
    target.click()
    return true
  })()`
}

/** 画板四周留白（输出像素，与截图的 2 倍密度同一量纲） */
const PAD = 110
const boardWidth = () => VIEW_W * SCALE + PAD * 2
const boardHeight = logicalH => logicalH * SCALE + PAD * 2

/**
 * 每张图各自定高，而不是一张画板套所有截图：
 * 概览页内容最高（日历 + 两张统计卡 + 薪资 + 明细），矩阵页只到图例，
 * 弹层页取一个真实窗口的身高就够 —— 统一高度只会在矩阵页留下一大片死白。
 */
const SHOT_HEIGHT = {
  overview: 1400,
  matrix: 700,
  dialog: 900
}

/**
 * 把一张应用截图包进浅色画板：圆角窗口、双层阴影、1px 边。
 * 背景取比侧栏略深一档的冷灰青，让白色画布浮起来，又不抢截图里的颜色。
 */
function wrapHtml(dataUri, logicalH) {
  const bw = boardWidth()
  const bh = boardHeight(logicalH)
  return `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #e9edef; }
  .board {
    width: ${bw}px; height: ${bh}px;
    display: flex; align-items: center; justify-content: center;
  }
  .shot {
    display: block; width: ${VIEW_W * SCALE}px; height: ${logicalH * SCALE}px;
    border-radius: 18px; overflow: hidden;
    border: 1px solid rgba(19, 20, 22, 0.08);
    box-shadow: 0 28px 80px rgba(20, 63, 75, 0.16), 0 4px 14px rgba(19, 20, 22, 0.06);
  }
</style>
<div class="board"><img class="shot" src="${dataUri}"></div>`
}

/** 按指定身高渲染并截图（视口一变，页内布局会重排，所以留一拍再截） */
async function shootRaw(client, filePath, logicalH) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: VIEW_W,
    height: logicalH,
    deviceScaleFactor: SCALE,
    mobile: false
  })
  await sleep(340)
  const { data } = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
}

/** 把原始图合成宣传板，再截一次 */
async function compose(client, rawPath, targetPath, boardFile, logicalH) {
  const base64 = fs.readFileSync(rawPath).toString('base64')
  fs.writeFileSync(boardFile, wrapHtml(`data:image/png;base64,${base64}`, logicalH), 'utf8')

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: boardWidth(),
    height: boardHeight(logicalH),
    deviceScaleFactor: 1,
    mobile: false
  })
  await client.send('Page.navigate', { url: pathToFileURL(boardFile).href })
  await waitFor(client, 'document.readyState === "complete"', '画板加载')
  // 等图片解码完成，否则截出来是空板
  await waitFor(client, 'Boolean(document.querySelector("img.shot")?.complete)', '截图解码')
  await sleep(120)
  const { data } = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(targetPath, Buffer.from(data, 'base64'))
}

async function main() {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  if (fixture.version !== 5 || !fixture.roster?.members?.length) {
    throw new Error('展示数据格式不对：需要 v5 备份结构且含成员')
  }

  // 备份里没有 updatedAt（那是运行时的字段），注入时补上
  const roster = { ...fixture.roster, updatedAt: Date.now() }

  const tmpDir = path.join(os.tmpdir(), `shift-showcase-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  fs.mkdirSync(outDir, { recursive: true })

  const userDataDir = path.join(tmpDir, 'profile')
  const debugPort = 9333 + Math.floor(Math.random() * 400)
  const browser = findBrowser()
  const { server, port } = await startStaticServer(distDir)
  const entryUrl = `http://127.0.0.1:${port}/index.html`

  const chrome = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--allow-file-access-from-files',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debugPort}`,
    'about:blank'
  ], { stdio: 'ignore' })

  let client = null

  try {
    const page = await waitForJsonEndpoint(debugPort)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: VIEW_W,
      height: VIEW_H,
      deviceScaleFactor: SCALE,
      mobile: false
    })

    await client.send('Page.navigate', { url: entryUrl })
    await waitFor(client, 'document.readyState === "complete"', '首屏加载')
    await client.evaluate(`(() => {
      window.localStorage.clear()
      window.localStorage.setItem(${JSON.stringify(ROSTER_KEY)}, ${JSON.stringify(JSON.stringify(roster))})
      return true
    })()`)
    await client.send('Page.reload', { ignoreCache: true })
    await waitFor(client, 'document.readyState === "complete"', '数据注入后加载')
    await waitFor(client, 'Boolean(document.querySelector(".calendar"))', '排班日历')

    console.log('数据已注入，开始截图')

    // ── 1. 月度概览 ─────────────────────────────────────────────
    await client.evaluate(clickByText('.rail-item', '月度概览'))
    await waitFor(client, 'Boolean(document.querySelector(".stats-grid"))', '月度概览页')
    await sleep(400)
    await shootRaw(client, path.join(tmpDir, '01-overview.png'), SHOT_HEIGHT.overview)

    // ── 2. 全员矩阵 ─────────────────────────────────────────────
    await client.evaluate(clickByText('.rail-item', '全员矩阵'))
    await waitFor(client, 'Boolean(document.querySelector(".matrix"))', '全员矩阵页')
    await sleep(400)
    await shootRaw(client, path.join(tmpDir, '02-matrix.png'), SHOT_HEIGHT.matrix)

    // ── 3. 日历日弹层 · 班次页 ────────────────────────────────
    await client.evaluate(clickByText('.rail-item', '月度概览'))
    await waitFor(client, 'Boolean(document.querySelector(".calendar"))', '回到月度概览')
    await sleep(250)
    // 点 10/23：那天是法定节假日 + 10h 加班，弹层里「法」与加班卡都是激活态。
    // 格子没有纯日期属性（title 是「日期 · 班次 · …」拼出来的），而 is-outside 已经
    // 排除了相邻月的同号日期，所以按日期数字定位即可。
    const opened = await client.evaluate(`(() => {
      const cells = Array.from(document.querySelectorAll('.cal-cell:not(.is-outside)'))
      const target = cells.find(cell => {
        const day = cell.querySelector('.cal-day')
        return day && day.textContent.trim() === '23'
      })
      if (!target) return false
      target.click()
      return true
    })()`)
    if (!opened) throw new Error('日历里没找到 10/23 的格子')
    await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
    await sleep(320)
    await shootRaw(client, path.join(tmpDir, '03-day-shift.png'), SHOT_HEIGHT.dialog)

    // ── 4. 待办页：换到 10/29 再开弹层 ──────────────────────
    // 待办是「按天」的，10/23 那天一条也没有；样例数据把三条都放在今天，
    // 才能一屏看到三种便笺色 + 一条已完成态。
    // 这里是直接重载页面而不是点「取消」—— 弹层打开时底层日历被遮罩挡住，
    // 重载能保证回到干净状态，也避免依赖底部按钮的交互细节。
    await client.send('Page.reload', { ignoreCache: true })
    await waitFor(client, 'document.readyState === "complete"', '重载回干净状态')
    await waitFor(client, 'Boolean(document.querySelector(".calendar"))', '重载后的日历')
    await sleep(250)

    const openedToday = await client.evaluate(`(() => {
      const cells = Array.from(document.querySelectorAll('.cal-cell:not(.is-outside)'))
      const target = cells.find(cell => {
        const day = cell.querySelector('.cal-day')
        return day && day.textContent.trim() === '29'
      })
      if (!target) return false
      target.click()
      return true
    })()`)
    if (!openedToday) throw new Error('日历里没找到 10/29 的格子')
    await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层（今天）')

    // tab 上有待办条数时会显示成「待办 3」，所以用前缀匹配而不是整串相等
    await client.evaluate(`(() => {
      const target = Array.from(document.querySelectorAll('.dialog-tab'))
        .find(tab => tab.textContent.trim().startsWith('待办'))
      if (!target) return false
      target.click()
      return true
    })()`)
    // 用待办页独有的输入框作标记：班次页里没有这个元素，比猜列表容器的类名可靠
    await waitFor(
      client,
      'Boolean(document.querySelector(\'.dialog-page input[aria-label="新增待办"]\'))',
      '弹层待办页'
    )
    await sleep(320)
    await shootRaw(client, path.join(tmpDir, '04-day-todo.png'), SHOT_HEIGHT.dialog)

    // ── 合成宣传板 ────────────────────────────────────────────
    const shots = [
      { raw: '01-overview.png', out: '01-overview.png', h: SHOT_HEIGHT.overview },
      { raw: '02-matrix.png', out: '02-matrix.png', h: SHOT_HEIGHT.matrix },
      { raw: '03-day-shift.png', out: '03-day-shift.png', h: SHOT_HEIGHT.dialog },
      { raw: '04-day-todo.png', out: '04-day-todo.png', h: SHOT_HEIGHT.dialog }
    ]

    for (const shot of shots) {
      await compose(
        client,
        path.join(tmpDir, shot.raw),
        path.join(outDir, shot.out),
        path.join(tmpDir, `board-${shot.out}.html`),
        shot.h
      )
      console.log(`  合成 ${shot.out}`)
    }

    console.log(`\n输出目录：${outDir}`)
  } finally {
    client?.close()
    chrome.kill()
    server.close()
    await sleep(800)
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Chrome 退出后仍会短时间攥着 user-data-dir 里的文件，删不掉就留给系统回收 ——
      // 四张图都已经落盘，清理失败不该把整个脚本判成失败。
    }
  }
}

main().catch(error => {
  console.error('生成失败：', error.message)
  process.exitCode = 1
})
