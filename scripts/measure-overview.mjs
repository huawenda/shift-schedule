#!/usr/bin/env node
/**
 * 统计页「月度概览」标签的纵向溢出测量。
 *
 * 每日明细那套用 .stats-fill 撑满高度，所以不滚；
 * 月度概览走 .stats-cards，内容高度由内容本身决定，
 * 超出视口就滚。这个脚本量出「到底超了多少」，
 * 以及是哪几块把高度撑破的。
 *
 *   node scripts/measure-overview.mjs --dev
 *   node scripts/measure-overview.mjs --sizes=1440x900,1440x930
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
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

const sizes = readArg('sizes', '1440x930,1440x900,1280x800,1024x768,2560x1440')
  .split(',').map(s => s.trim()).filter(Boolean)
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
  return candidates.find(c => fs.existsSync(c)) ?? null
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

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
    socket.addEventListener('error', () => reject(new Error('CDP 连接失败')))
  })
  socket.addEventListener('message', event => {
    let m
    try { m = JSON.parse(event.data) } catch { return }
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

/** 量一次月度概览：谁在撑高度、超了多少。 */
const PROBE = `(() => {
  const h = el => el ? Math.round(el.getBoundingClientRect().height) : null
  const pick = sel => document.querySelector(sel)
  const cards = pick('.stats-cards')
  const salary = pick('.salary-block, [class*="salary"]')
  const doc = document.documentElement

  // 逐块列出高度，看谁最大
  const blocks = Array.from(document.querySelectorAll('.stats-cards > *')).map(el => ({
    cls: el.className.split(' ')[0],
    h: Math.round(el.getBoundingClientRect().height)
  }))

  const salaryBlocks = Array.from(document.querySelectorAll('.salary-block')).map(el => ({
    name: (el.querySelector('.salary-block-title')?.textContent || '?').trim(),
    h: Math.round(el.getBoundingClientRect().height)
  }))

  // 薪资面板里除了四个 block，还剩多少是标题/内边距/间隙
  const salaryPanelEl = document.querySelector('.salary-block')?.closest('.panel')
  const panelCs = salaryPanelEl ? getComputedStyle(salaryPanelEl) : null
  const panelInner = salaryPanelEl
    ? Math.round(salaryPanelEl.getBoundingClientRect().height
      - parseFloat(panelCs.paddingTop) - parseFloat(panelCs.paddingBottom))
    : null
  const blocksSum = salaryBlocks.reduce((s, b) => s + b.h, 0)
  const gap = 16
  const salaryHead = salaryPanelEl?.querySelector('.section-head')
  const salaryTitle = salaryHead ? Math.round(salaryHead.getBoundingClientRect().height) : 0

  return {
    viewport: window.innerHeight,
    docH: doc.scrollHeight,
    bodyH: Math.round(document.body.getBoundingClientRect().height),
    overflowY: Math.max(0, doc.scrollHeight - window.innerHeight),
    stats: h(pick('.stats')),
    statsMain: h(pick('.stats-main')),
    statsCards: h(cards),
    row: h(pick('.stats-row')),
    overviewPanel: h(pick('.overview')?.closest('.panel')),
    salaryPanel: h(salaryPanelEl),
    blocks,
    salaryBlocks,
    salaryBlockTotal: blocksSum,
    salaryPanelInner: panelInner,
    salaryChrome: salaryTitle + (blocksSum > 0 ? (salaryBlocks.length - 1) * gap : 0),
    salaryGapRemainder: panelInner - salaryTitle - blocksSum - gap * (salaryBlocks.length - 1),
    padding: getComputedStyle(pick('.stats-main')).padding
  }
})()`

async function main() {
  const browser = findBrowser()
  if (!browser) { console.error('没有找到 Chrome / Edge'); process.exit(1) }

  const userDataDir = path.join(os.tmpdir(), `dsh-ov-${Date.now()}`)
  const debugPort = 9500 + Math.floor(Math.random() * 90)
  const chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debugPort}`, url
  ], { stdio: 'ignore' })

  let client = null
  try {
    const page = await waitForJsonEndpoint(debugPort)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')

    console.log(`地址: ${url}\n`)
    console.log('尺寸        视口  内容  溢出  | stats-row 概览  薪资面板  薪资四块')
    console.log('─'.repeat(92))

    for (const size of sizes) {
      const [width, height] = size.split('x').map(Number)
      if (!width || !height) continue

      await client.send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: width <= 768
      })
      await client.send('Page.navigate', { url })
      await waitFor(client, 'Boolean(document.querySelector(".calendar"))', '排班页')
      await sleep(300)

      await client.evaluate(`Array.from(document.querySelectorAll('.top-bar-actions button')).find(b => b.textContent.trim() === '统计')?.click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".stats"))', '统计页')
      await sleep(300)

      const m = await client.evaluate(PROBE)
      if (!m || m.error) { console.log(`${size.padEnd(11)} 探测失败: ${m && m.error}`); continue }
      if (!m.salaryBlocks || m.salaryBlocks.length === 0) {
        console.log(`${size.padEnd(11)} 无薪资块`)
        continue
      }
      const sb = m.salaryBlocks.map(b => `${b.name}:${b.h}`).join(' ')

      console.log(
        `${size.padEnd(11)} ${String(m.viewport).padEnd(5)} ${String(m.docH).padEnd(5)} ` +
        `${String(m.overflowY).padEnd(5)} | ${String(m.row).padEnd(5)} ${String(m.overviewPanel).padEnd(5)} ` +
        `${String(m.salaryPanel).padEnd(9)} ${sb}`
      )
      console.log(
        `${''.padEnd(11)} ${''.padEnd(16)}薪资面板内高 ${m.salaryPanelInner} = 标题 ${m.salaryChrome - m.salaryBlockTotal} ` +
        `+ 四块 ${m.salaryBlockTotal} + 间隙 ${m.salaryGapRemainder}`
      )
    }
  } finally {
    client?.close()
    chrome.kill()
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* 忽略 */ }
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
