#!/usr/bin/env node
/**
 * Tauri 壳的数据留存验证。
 *
 * 壳跑在 WebView2 里，默认不开放调试端口。用 WebView2 官方的
 * WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS 注入 --remote-debugging-port 就能复用
 * 项目里已有的 CDP 客户端，直接读壳内页面的 localStorage。
 *
 * 验证的是「写入 → 杀进程 → 重启 → 还能读到」这条链路，
 * 也就是套壳要解决的那件事本身。
 *
 *   node scripts/verify-tauri-storage.mjs --exe=<绝对路径>
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SEED_KEY = 'shift-schedule:local:day-records:v1'
const SETTINGS_KEY = 'shift-schedule:local:settings:v1'
const PORT = 9333

function readArg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find(arg => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

const defaultExe = path.resolve(
  'desktop/src-tauri/target/release/shift-schedule-desktop.exe'
)
const exePath = readArg('exe', defaultExe)

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitForJsonEndpoint(port, timeoutMs = 30000) {
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
    await sleep(300)
  }
  throw new Error('连接 WebView2 调试端口超时')
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

/** 起一个壳进程，带上 WebView2 调试端口。 */
function launchApp() {
  return spawn(exePath, [], {
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`
    }
  })
}

async function stopApp(child) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null) return resolve()
    child.on('exit', () => resolve())
    child.kill()
    setTimeout(() => { try { child.kill('SIGKILL') } catch { /* 已退出 */ } }, 4000)
  })
}

const SEED = JSON.stringify([
  { personName: '华文达', date: '09/20', shiftOverride: '夜特', overtimeHours: 2.5, updatedAt: 1758000000000 },
  { personName: '华文达', date: '09/21', shiftOverride: '休息', overtimeHours: 0, updatedAt: 1758000000001 }
])

async function main() {
  if (!fs.existsSync(exePath)) {
    console.error(`找不到可执行文件：${exePath}`)
    console.error('先跑 pnpm run desktop:build')
    process.exit(1)
  }

  console.log(`壳程序: ${exePath}\n`)

  // written 要跨两个 try 块用，提到外层
  let written = 0

  // ---- 第一次启动：写入 ----
  let app = launchApp()
  let client = null
  try {
    const page = await waitForJsonEndpoint(PORT)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')

    // 等页面真的跑起来（有 root 且有内容）
    const deadline = Date.now() + 30000
    for (;;) {
      const ok = await client.evaluate(
        'Boolean(document.querySelector(".calendar")) || Boolean(document.querySelector(".stats"))'
      ).catch(() => false)
      if (ok) break
      if (Date.now() > deadline) throw new Error('壳内页面未渲染')
      await sleep(400)
    }

    const env = await client.evaluate(`(async () => ({
      origin: location.origin,
      protocol: location.protocol,
      hostname: location.hostname,
      hasTauri: typeof window.__TAURI_INTERNALS__ !== 'undefined',
      swController: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
      swReg: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0
    }))()`)

    console.log('【壳内环境】')
    console.log(`  origin        ${env.origin}`)
    console.log(`  protocol      ${env.protocol}`)
    console.log(`  __TAURI_INTERNALS__  ${env.hasTauri}`)
    console.log(`  SW 已注册数量        ${env.swReg}  ← 期望 0`)
    console.log(`  SW controller       ${env.swController}  ← 期望 false`)

    await client.evaluate(`(() => {
      localStorage.setItem(${JSON.stringify(SEED_KEY)}, ${JSON.stringify(SEED)})
      localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify({ personName: '华文达' }))
      return localStorage.getItem(${JSON.stringify(SEED_KEY)}).length
    })()`)
    written = await client.evaluate(
      `JSON.parse(localStorage.getItem(${JSON.stringify(SEED_KEY)})).length`
    )
    console.log(`\n【第一步：写入】  ${written} 条记录已写入壳内 localStorage`)
  } finally {
    client?.close()
    await stopApp(app)
  }

  // 确认进程真的没了
  await sleep(1500)

  // ---- 第二次启动：读回 ----
  console.log('\n【第二步：重启进程后再读】')
  app = launchApp()
  client = null
  let survived = 0
  let person = ''
  try {
    const page = await waitForJsonEndpoint(PORT)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')

    const deadline = Date.now() + 30000
    for (;;) {
      const ok = await client.evaluate(
        'Boolean(document.querySelector(".calendar")) || Boolean(document.querySelector(".stats"))'
      ).catch(() => false)
      if (ok) break
      if (Date.now() > deadline) throw new Error('壳内页面未渲染')
      await sleep(400)
    }

    const readBack = await client.evaluate(`(() => {
      const raw = localStorage.getItem(${JSON.stringify(SEED_KEY)})
      return {
        raw: raw ? raw.length : 0,
        count: raw ? JSON.parse(raw).length : 0,
        person: JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}').personName || ''
      }
    })()`)

    survived = readBack.count
    person = readBack.person
    console.log(`  读回记录数    ${survived} / ${written}`)
    console.log(`  读回人员      ${person || '(空)'}`)
  } finally {
    client?.close()
    await stopApp(app)
  }

  const pass = survived === 2 && person === '华文达'

  // ---- 备份导出：壳里 <a download> 能不能真的落盘 ----
  console.log('\n【第三步：备份导出在壳内是否可用】')
  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-tauri-dl-'))
  app = launchApp()
  client = null
  let exportInfo = null
  try {
    const page = await waitForJsonEndpoint(PORT)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allowAndName',
      downloadPath: dlDir,
      eventsEnabled: true
    })

    const deadline = Date.now() + 30000
    for (;;) {
      const ok = await client.evaluate('Boolean(document.querySelector(".top-bar-actions"))').catch(() => false)
      if (ok) break
      if (Date.now() > deadline) throw new Error('壳内页面未渲染')
      await sleep(400)
    }

    // 点「导出」，看是否触发下载
    const clicked = await client.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('.top-bar-actions button'))
        .find(b => b.textContent.trim() === '导出')
      if (!btn) return false
      btn.click()
      return true
    })()`)
    await sleep(2500)

    const files = fs.readdirSync(dlDir).filter(f => !f.endsWith('.crdownload'))
    // 内容必须真的是备份 JSON：allowAndName 会把文件改名成 GUID，
    // 但内容仍是原 Blob，所以这里读回来验证格式而不是看文件名。
    let parsed = null
    let firstFile = files[0]
    if (firstFile) {
      try {
        const text = fs.readFileSync(path.join(dlDir, firstFile), 'utf8')
        const json = JSON.parse(text)
        parsed = {
          app: json.app,
          version: json.version,
          dayRecords: Array.isArray(json.dayRecords) ? json.dayRecords.length : -1,
          hasSalary: typeof json.salaryInputs === 'object'
        }
      } catch (error) {
        parsed = { error: error.message }
      }
    }
    exportInfo = { clicked, files, parsed, status: await client.evaluate(
      `document.querySelector('.status-text, [class*="status"]')?.textContent?.trim() ?? ''`
    ) }
  } finally {
    client?.close()
    await stopApp(app)
    try { fs.rmSync(dlDir, { recursive: true, force: true }) } catch { /* 忽略 */ }
  }

  console.log(`  点了导出按钮    ${exportInfo.clicked}`)
  console.log(`  落盘文件        ${exportInfo.files.length ? exportInfo.files.join(', ') : '（无）'}`)
  console.log(`  内容校验        ${exportInfo.parsed
    ? (exportInfo.parsed.error
      ? `解析失败：${exportInfo.parsed.error}`
      : `app=${exportInfo.parsed.app} v${exportInfo.parsed.version} 记录${exportInfo.parsed.dayRecords} 条 薪资项=${exportInfo.parsed.hasSalary}`)
    : '（无文件）'}`)
  console.log(`  界面状态        ${exportInfo.status || '(无)'}`)

  const exportOk = exportInfo.clicked
    && exportInfo.files.length > 0
    && exportInfo.parsed?.app === 'shift-schedule-local'
    && exportInfo.parsed?.dayRecords === 2
  console.log(
    `\n=== ${pass && exportOk ? '通过' : '未通过'}：` +
    `数据留存 ${pass ? 'OK' : 'FAIL'}，导出 ${exportOk ? 'OK' : '需改用 Tauri 对话框'} ===`
  )
  process.exit(pass && exportOk ? 0 : 2)
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
