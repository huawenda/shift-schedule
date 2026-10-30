#!/usr/bin/env node
/**
 * 在真实 Tauri 窗口里切到月度概览并截图，同时量滚动条状态。
 *
 * 无头浏览器用覆盖式滚动条（占位恒 0），看不出差别；
 * 那个 bar 只在 Tauri/WebView2 的经典滚动条上出现，所以必须开真窗口量。
 */

import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.CDP_PORT || 9345)
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitForJsonEndpoint(port, timeoutMs = 30000) {
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
    await sleep(300)
  }
  throw new Error('连接 WebView2 调试端口超时')
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

const MEASURE = `(() => {
  const de = document.documentElement
  window.scrollTo(0, 0)
  const top0 = window.scrollY
  window.scrollTo(0, 99999)
  const top1 = window.scrollY
  window.scrollTo(0, 0)
  return {
    gutter: de.offsetWidth - de.clientWidth,
    scrollbarWidth: getComputedStyle(de).scrollbarWidth,
    scrollHeight: de.scrollHeight,
    clientHeight: de.clientHeight,
    canScroll: top1 > 0,
    scrolledTo: top1
  }
})()`

async function main() {
  const page = await waitForJsonEndpoint(PORT)
  const client = createCdpClient(page.webSocketDebuggerUrl)
  await client.ready
  await client.send('Runtime.enable')
  await client.send('Page.enable')

  // 若还在排班页，先进统计页
  const onCalendar = await client.evaluate('Boolean(document.querySelector(".calendar"))').catch(() => false)
  if (onCalendar) {
    await client.evaluate(`Array.from(document.querySelectorAll('.top-bar-actions button')).find(b => b.textContent.trim() === '统计')?.click(); true`)
    await sleep(1500)
  }

  // 切到月度概览
  const switched = await client.evaluate(`(() => {
    const tab = Array.from(document.querySelectorAll('.stats-filters [role="tablist"] button'))
      .find(b => b.textContent.includes('月度概览'))
    if (!tab) return false
    tab.click()
    return true
  })()`)

  const deadline = Date.now() + 15000
  for (;;) {
    const ok = await client.evaluate('Boolean(document.querySelector(".stats-cards"))').catch(() => false)
    if (ok) break
    if (Date.now() > deadline) throw new Error('月度概览未渲染')
    await sleep(300)
  }
  await sleep(900)

  const m = await client.evaluate(MEASURE)

  console.log('【月度概览 · Tauri 窗口实测】')
  console.log(`  切到概览          ${switched}`)
  console.log(`  滚动条占位        ${m.gutter}px   ${m.gutter === 0 ? '← 不显示' : '← 仍占位！'}`)
  console.log(`  scrollbar-width   ${m.scrollbarWidth}`)
  console.log(`  内容高/视口高     ${m.scrollHeight} / ${m.clientHeight}`)
  console.log(`  可滚动到底        ${m.canScroll ? `是（0→${m.scrolledTo}）` : '否'}`)

  const shot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  const dir = path.resolve('shots-sb')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, 'overview-in-tauri.png')
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`  截图              ${out}`)

  client.close()
  process.exit(m.gutter === 0 && m.canScroll ? 0 : 1)
}

main().catch(e => { console.error(e.message); process.exit(1) })
