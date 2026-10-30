#!/usr/bin/env node
/**
 * 验证「隐藏滚动条但保留滚动能力」是否真的生效。
 *
 * 需求：月度概览溢出时允许滚，但不要出现滚动条。
 *
 * 要点：不能用 overflow: hidden —— 那会把滚动能力一起关掉，
 * 用户就彻底看不到下面的内容了。正确做法是把滚动条本身的
 * 绘制宽度设为 0（scrollbar-width: none / ::-webkit-scrollbar 全透明）。
 *
 * 这个脚本量三件事：
 *   1. 滚动条占位宽度（内高 - clientWidth）
 *   2. 程序化滚动是否可用（能滚 = 能力保留）
 *   3. ::-webkit-scrollbar 规则是否真的被应用
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(__dirname, '..', '..')

function readArg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find(arg => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

const useDev = process.argv.includes('--dev')
const url = readArg('url', useDev
  ? 'http://127.0.0.1:6180/index.html'
  : pathToFileURL(path.join(projectDir, 'dist', 'index.html')).href)
const sizes = readArg('sizes', '1440x930,1440x900,1024x768,2560x1440')
  .split(',').map(s => s.trim()).filter(Boolean)

function findBrowser() {
  const c = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean)
  return c.find(x => fs.existsSync(x)) ?? null
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitForJsonEndpoint(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (res.ok) {
        const t = await res.json()
        const page = t.find(x => x.type === 'page' && x.webSocketDebuggerUrl)
        if (page) return page
      }
    } catch { /* 等 */ }
    await sleep(200)
  }
  throw new Error('连接无头浏览器超时')
}

function createCdpClient(ws) {
  const socket = new WebSocket(ws)
  const pending = new Map()
  let nextId = 1
  const ready = new Promise((res, rej) => {
    socket.addEventListener('open', () => res())
    socket.addEventListener('error', () => rej(new Error('CDP 连接失败')))
  })
  socket.addEventListener('message', e => {
    let m
    try { m = JSON.parse(e.data) } catch { return }
    if (!m.id || !pending.has(m.id)) return
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    if (m.error) reject(new Error(m.error.message || 'CDP 调用失败'))
    else resolve(m.result)
  })
  function send(method, params = {}) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || '求值失败')
    return r.result.value
  }
  return { ready, send, evaluate, close: () => { try { socket.close() } catch { /* 忽略 */ } } }
}

async function waitFor(client, expr, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await client.evaluate(expr).catch(() => false)) return
    await sleep(120)
  }
  throw new Error(`等待超时：${label}`)
}

const PROBE = `(() => {
  const de = document.documentElement
  const before = window.scrollY
  window.scrollTo(0, 300)
  const after = window.scrollY
  window.scrollTo(0, before)

  const cs = getComputedStyle(de)
  return {
    scrollable: de.scrollHeight > de.clientHeight,
    gutter: de.scrollHeight - de.clientWidth,
    barWidth: de.offsetWidth - de.clientWidth,
    scrollbarWidth: cs.scrollbarWidth,
    scrollTopBefore: before,
    scrollTopAfter: after,
    canScroll: after > before
  }
})()`

async function main() {
  const browser = findBrowser()
  if (!browser) { console.error('没有找到 Chrome / Edge'); process.exit(1) }

  const udd = path.join(os.tmpdir(), `dsh-sb-${Date.now()}`)
  const port = 9600 + Math.floor(Math.random() * 90)
  const chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', `--user-data-dir=${udd}`,
    `--remote-debugging-port=${port}`, url
  ], { stdio: 'ignore' })

  let client = null
  try {
    const page = await waitForJsonEndpoint(port)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')

    console.log(`地址: ${url}\n`)
    console.log('尺寸        可滚动  滚动条占位  scrollbar-width  程序化滚动')
    console.log('─'.repeat(72))

    for (const size of sizes) {
      const [w, h] = size.split('x').map(Number)
      if (!w || !h) continue

      await client.send('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: 1, mobile: w <= 768
      })
      await client.send('Page.navigate', { url })
      await waitFor(client, 'Boolean(document.querySelector(".calendar"))', '排班页')
      await sleep(300)
      await client.evaluate(`Array.from(document.querySelectorAll('.top-bar-actions button')).find(b => b.textContent.trim() === '统计')?.click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".stats"))', '统计页')
      await sleep(300)

      const m = await client.evaluate(PROBE)
      console.log(
        `${size.padEnd(11)} ${String(m.scrollable).padEnd(7)} ` +
        `${(m.barWidth + 'px').padEnd(11)} ${String(m.scrollbarWidth).padEnd(16)} ` +
        `${m.canScroll ? '可用 (' + m.scrollTopBefore + '→' + m.scrollTopAfter + ')' : '不可用'}`
      )
    }
  } finally {
    client?.close()
    chrome.kill()
    try { fs.rmSync(udd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* 忽略 */ }
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
