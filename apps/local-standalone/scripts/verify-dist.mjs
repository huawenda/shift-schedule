#!/usr/bin/env node
/**
 * 产物验收：真实启动无头浏览器，把 dist/ 打开跑一遍关键流程。
 *
 *   node scripts/verify-dist.mjs                # HTTP 托管 + file:// 双击，两种都测
 *   node scripts/verify-dist.mjs --only=file
 *
 * 覆盖（对应 PRD §8 验收标准）：
 *   1. 空数据首次打开 → 出现三步向导
 *   2. 向导建 3 人 → 排班页出现 3 行
 *   3. 独立浏览器存储可写（file:// 下尤其要确认）
 *   4. 点格子改班 → 弹层 → 保存 → 写入 roster v2
 *   5. 刷新后改动仍在（真持久化）
 *   6. 恢复默认 → 记录被删除
 *   7. 导出备份 → 文件里是 v2 花名册
 *   8. 设置页可进入，能读到成员表
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

const ROSTER_KEY = 'shift-schedule:local:roster:v2'
const LEGACY_RECORDS_KEY = 'shift-schedule:local:day-records:v1'
const LEGACY_SETTINGS_KEY = 'shift-schedule:local:settings:v1'

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
    try {
      await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
    } catch {
      await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {})
    }

    // --- 1. 空数据首次打开 → 向导 ---
    await client.evaluate(`(() => {
      [${JSON.stringify(ROSTER_KEY)}, ${JSON.stringify(LEGACY_RECORDS_KEY)}, ${JSON.stringify(LEGACY_SETTINGS_KEY)}]
        .forEach(key => window.localStorage.removeItem(key))
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

    // --- 2. 向导建 3 人 ---
    check(`${name}: 向导第 1 步可继续`, await client.evaluate(clickByText('.wizard-foot button', '下一步')))
    await waitFor(client, 'Boolean(document.querySelector(".member-editor"))', '成员表')

    const names = ['张三', '李四', '王五']
    for (let index = 0; index < names.length; index += 1) {
      const ok = await client.evaluate(setInputAt('.member-row input', index, names[index]))
      check(`${name}: 填第 ${index + 1} 位成员姓名`, ok)
    }

    await sleep(150)
    check(`${name}: 向导第 2 步可继续`, await client.evaluate(clickByText('.wizard-foot button', '下一步')))
    await waitFor(client, 'Boolean(document.querySelector(".wizard-summary"))', '确认页')
    check(`${name}: 向导进入第 3 步`, await client.evaluate(clickByText('.wizard-foot button', '进入排班表')))

    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 3', '矩阵出现 3 行')
    check(`${name}: 排班页出现 3 位成员`, true)

    // --- 3. 改班 ---
    const before = await client.evaluate(`document.querySelector(${JSON.stringify(firstCell)}).textContent.trim()`)
    const targetShift = ['白特', '夜特', '事假', '休息', '白班', '夜班'].find(shift => SHORT_LABEL[shift] !== before) ?? '白特'

    await client.evaluate(`document.querySelector(${JSON.stringify(firstCell)}).click(); true`)
    await waitFor(client, 'Boolean(document.querySelector(".dialog"))', '改班弹层')
    check(`${name}: 点击格子打开改班弹层`, true)

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
      return { text: cell.textContent.trim(), edited: cell.classList.contains('is-edited') }
    })()`)
    check(
      `${name}: 刷新后改动仍在`,
      Boolean(afterReload && afterReload.text === SHORT_LABEL[targetShift] && afterReload.edited),
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

    // --- 6. 导出备份 ---
    await client.evaluate(clickByText('.topbar-right button', '导出备份'))

    let backupFile = null
    const downloadDeadline = Date.now() + 8000
    while (Date.now() < downloadDeadline && !backupFile) {
      const files = fs.readdirSync(downloadDir).filter(file => file.endsWith('.json') && !file.endsWith('.crdownload'))
      if (files.length > 0) backupFile = files[0]
      else await sleep(200)
    }

    if (backupFile) {
      const backup = JSON.parse(fs.readFileSync(path.join(downloadDir, backupFile), 'utf8'))
      check(
        `${name}: 导出备份是 v2 花名册`,
        backup?.version === 2 && Array.isArray(backup?.roster?.members) && backup.roster.members.length === 3,
        backupFile
      )
    } else {
      check(`${name}: 导出备份是 v2 花名册`, false, '没有等到下载文件')
    }

    // --- 7. 设置页 ---
    await client.evaluate(clickByText('.rail-item', '设置'))
    await waitFor(client, 'Boolean(document.querySelector(".settings-section"))', '设置页')
    const settingsRows = await client.evaluate('document.querySelectorAll(".member-row").length')
    check(`${name}: 设置页读到 3 位成员`, settingsRows === 3, String(settingsRows))

    await client.evaluate(clickByText('.rail-item', '排班'))
    await waitFor(client, 'Boolean(document.querySelector(".matrix"))', '回到排班页')
    check(`${name}: 能从设置返回排班`, true)

    // --- 8. 翻月不崩 ---
    await client.evaluate(clickByText('.month-track button', '回到本期'))
    const titleBefore = await client.evaluate('document.querySelector(".month-title").textContent.trim()')
    await client.evaluate(`document.querySelectorAll('.month-step')[1].click(); true`)
    await sleep(200)
    const titleAfter = await client.evaluate('document.querySelector(".month-title").textContent.trim()')
    check(`${name}: 切换月份`, titleBefore !== titleAfter, `${titleBefore} → ${titleAfter}`)
    check(`${name}: 切月后矩阵仍在`, await client.evaluate('document.querySelectorAll(".matrix-row").length === 3'))
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
