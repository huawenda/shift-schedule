#!/usr/bin/env node
/**
 * 在真实 Tauri 窗口里验证滚动条已隐藏、且滚动仍然可用。
 *
 * 无头浏览器默认用覆盖式滚动条（overlay），占位宽度恒为 0，
 * 根本看不出差别 —— 那个 bug 只在 Tauri/WebView2 的经典滚动条上出现。
 * 所以这里改用 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS 打开壳的真实窗口，
 * 直接量它的 scrollHeight / clientWidth 与程序化滚动结果。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = 9345
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

const PROBE = `(() => {
  const de = document.documentElement
  const cs = getComputedStyle(de)

  // 量滚动条占位：offsetWidth 含滚动条，clientWidth 不含
  const gutter = de.offsetWidth - de.clientWidth

  // 程序化滚动：能力是否保留
  window.scrollTo(0, 0)
  const top0 = window.scrollY
  window.scrollTo(0, 9999)
  const top1 = window.scrollY
  window.scrollTo(0, 0)

  return {
    innerW: window.innerWidth,
    offsetW: de.offsetWidth,
    clientW: de.clientWidth,
    gutter,
    scrollable: de.scrollHeight > de.clientHeight,
    scrollHeight: de.scrollHeight,
    clientHeight: de.clientHeight,
    maxScroll: de.scrollHeight - de.clientHeight,
    scrollbarWidth: cs.scrollbarWidth,
    msOverflowStyle: cs.msOverflowStyle,
    canScrollToBottom: top1 > 0,
    scrolledTo: top1
  }
})()`

async function main() {
  const page = await waitForJsonEndpoint(PORT)
  const client = createCdpClient(page.webSocketDebuggerUrl)
  await client.ready
  await client.send('Runtime.enable')

  // 切到月度概览（默认就是），并等页面稳定
  const deadline = Date.now() + 30000
  for (;;) {
    const ok = await client.evaluate('Boolean(document.querySelector(".stats-cards"))').catch(() => false)
    if (ok) break
    if (Date.now() > deadline) throw new Error('统计页未渲染')
    await sleep(400)
  }
  await sleep(800)

  const m = await client.evaluate(PROBE)

  console.log('【Tauri 窗口实测】')
  console.log(`  窗口宽            ${m.innerW}px`)
  console.log(`  offsetWidth       ${m.offsetW}px`)
  console.log(`  clientWidth       ${m.clientW}px`)
  console.log(`  滚动条占位宽度    ${m.gutter}px   ${m.gutter === 0 ? '← 已隐藏' : '← 仍占位！'}`)
  console.log(`  可滚动            ${m.scrollable}`)
  console.log(`  内容高/视口高     ${m.scrollHeight} / ${m.clientHeight}`)
  console.log(`  最大可滚动        ${m.maxScroll}px`)
  console.log(`  scrollbar-width   ${m.scrollbarWidth}`)
  console.log(`  ms-overflow-style ${m.msOverflowStyle}`)
  console.log(`  滚到底部          ${m.canScrollToBottom ? `可用（0→${m.scrolledTo}）` : '不可用！'}`)

  const ok = m.gutter === 0 && m.canScrollToBottom
  console.log(`\n=== ${ok ? '通过' : '未通过'}：滚动条${m.gutter === 0 ? '不显示' : '仍显示'}，滚动${m.canScrollToBottom ? '仍可用' : '失效'} ===`)
  client.close()
  process.exit(ok ? 0 : 1)
}

main().catch(e => { console.error(e.message); process.exit(1) })
