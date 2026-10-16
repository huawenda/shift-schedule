#!/usr/bin/env node
/**
 * 产物验收脚本：真实启动一个无头浏览器，把 dist/ 打开并跑一遍关键流程。
 *
 *   node scripts/verify-dist.mjs            # HTTP 托管 + file:// 双击，两种都测
 *   node scripts/verify-dist.mjs --only=file
 *
 * 覆盖：
 *   1. 页面能渲染出排班表（JS 没被 file:// 的 CORS 拦掉）
 *   2. localStorage 是否可用（file:// 下尤其要确认）
 *   3. 改班次 -> 落盘 -> 刷新后仍在（持久化）
 *   4. 改回默认 -> 记录被删除
 *   5. 统计页的团队视图可用（本地版视为管理员）
 *   6. 导出备份真的落出一个 JSON，内容是刚才的记录
 *
 * 依赖：本机 Chrome/Edge，Node 18+（用到全局 fetch / WebSocket）。没有第三方依赖。
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

const DAY_RECORDS_KEY = 'shift-schedule:local:day-records:v1'
const SALARY_KEY = 'shift-schedule:local:salary-inputs:v1'
const SETTINGS_KEY = 'shift-schedule:local:settings:v1'

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
  // 连接失败时，调用方可能已经走了清理分支；这里先吞掉，避免未处理的拒绝把进程带崩。
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
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })

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

async function reload(client) {
  await client.send('Page.reload', { ignoreCache: true })
  await waitFor(client, 'document.readyState === "complete"', '页面重新加载')
  await waitFor(client, 'Boolean(document.querySelector(".calendar-grid .calendar-cell:not(.calendar-cell-empty)"))', '排班表渲染')
}

const cellSelector = '.calendar-grid .calendar-cell:not(.calendar-cell-empty)'

async function runScenario(name, url, downloadDir) {
  console.log(`\n=== 场景：${name} ===`)

  fs.mkdirSync(downloadDir, { recursive: true })

  const userDataDir = path.join(os.tmpdir(), `dsh-verify-${name}-${Date.now()}`)
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
      // 老版本 Chrome 走 Page 域
      await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {})
    }

    await waitFor(client, 'Boolean(document.querySelector(".calendar-grid .calendar-cell:not(.calendar-cell-empty)"))', '排班表渲染')
    check(`${name}: 排班表渲染成功`, true)

    const storageState = await client.evaluate(`(() => {
      try {
        window.localStorage.setItem('__probe', '1')
        window.localStorage.removeItem('__probe')
        return 'ok'
      } catch (error) {
        return 'unavailable: ' + error.message
      }
    })()`)
    check(`${name}: localStorage 可用`, storageState === 'ok', storageState === 'ok' ? '' : storageState)

    if (storageState !== 'ok') {
      // 存不了的话后面的持久化断言没有意义
      return
    }

    // 从干净状态开始
    await client.evaluate(`(() => {
      [${JSON.stringify(DAY_RECORDS_KEY)}, ${JSON.stringify(SALARY_KEY)}, ${JSON.stringify(SETTINGS_KEY)}]
        .forEach(key => window.localStorage.removeItem(key))
      return true
    })()`)
    await reload(client)

    // --- 改班次并落盘 ---
    const picked = await client.evaluate(`(() => {
      const cell = document.querySelector(${JSON.stringify(cellSelector)})
      if (!cell) return null
      const chip = cell.querySelector('.shift-chip')
      return { day: cell.querySelector('.calendar-day')?.textContent, shift: chip ? chip.textContent : null }
    })()`)

    const nextShift = ['夜班', '白班', '休息', '白特', '夜特'].find(shift => shift !== picked.shift)
    check(`${name}: 找到可编辑的排班单元格`, Boolean(picked && nextShift), `第${picked?.day}日 当前「${picked?.shift}」→「${nextShift}」`)

    await client.evaluate(`document.querySelector(${JSON.stringify(cellSelector)}).click(); true`)
    await waitFor(client, 'Boolean(document.querySelector(".shift-editor"))', '班次编辑弹窗')
    check(`${name}: 点击单元格能打开编辑弹窗`, true)

    const shiftClicked = await client.evaluate(`(() => {
      const options = Array.from(document.querySelectorAll('.shift-editor .editor-option'))
      const target = options.find(option => option.querySelector('.shift-chip')?.textContent === ${JSON.stringify(nextShift)})
      if (!target) return false
      target.click()
      return true
    })()`)
    check(`${name}: 选中目标班次「${nextShift}」`, shiftClicked)

    await client.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('.shift-editor .editor-actions button'))
        .find(item => item.textContent.trim() === '保存')
      if (!button) return false
      button.click()
      return true
    })()`)

    await waitFor(client, '!document.querySelector(".shift-editor")', '弹窗关闭')

    const storedRaw = await client.evaluate(`window.localStorage.getItem(${JSON.stringify(DAY_RECORDS_KEY)})`)
    let storedRecords = []
    try {
      storedRecords = JSON.parse(storedRaw || '[]')
    } catch {
      storedRecords = []
    }

    const savedRecord = storedRecords[0]
    check(
      `${name}: 改动写入 localStorage`,
      Boolean(savedRecord && savedRecord.shiftOverride === nextShift),
      savedRecord ? `${savedRecord.personName} ${savedRecord.date} = ${savedRecord.shiftOverride}` : String(storedRaw)
    )

    // --- 刷新后仍然存在 ---
    await reload(client)

    const afterReload = await client.evaluate(`(() => {
      const cell = Array.from(document.querySelectorAll('.calendar-grid .calendar-cell'))
        .find(item => item.querySelector('.calendar-day')?.textContent === ${JSON.stringify(picked.day)})
      if (!cell) return null
      return {
        shift: cell.querySelector('.shift-chip')?.textContent ?? null,
        marked: cell.classList.contains('edited-calendar-cell')
      }
    })()`)

    check(
      `${name}: 刷新后改动仍在（真正的持久化）`,
      Boolean(afterReload && afterReload.shift === nextShift && afterReload.marked),
      JSON.stringify(afterReload)
    )

    // --- 导出备份真的落文件 ---
    await client.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('.status-strip button'))
        .find(item => item.textContent.trim() === '导出备份')
      if (!button) return false
      button.click()
      return true
    })()`)

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
        `${name}: 导出备份文件内容正确`,
        Array.isArray(backup.dayRecords) && backup.dayRecords.some(record => record.shiftOverride === nextShift),
        backupFile
      )
    } else {
      check(`${name}: 导出备份文件内容正确`, false, '没有等到下载文件')
    }

    // --- 改回默认 -> 记录被删除 ---
    await client.evaluate(`document.querySelector(${JSON.stringify(cellSelector)}).click(); true`)
    await waitFor(client, 'Boolean(document.querySelector(".shift-editor"))', '班次编辑弹窗')
    const resetClicked = await client.evaluate(`(() => {
      // 「默认班次」的文案在 editor-label 上，按钮本体只有班次 chip
      const label = Array.from(document.querySelectorAll('.shift-editor .editor-label'))
        .find(item => item.textContent.trim() === '默认班次')
      const option = label?.parentElement?.querySelector('.editor-option')
      if (!option) return false
      option.click()
      return true
    })()`)
    // 必须等 React 重新渲染：把「选班次」和「保存」放在同一次求值里，
    // 保存读到的还是旧 state（React 会批处理）。
    await sleep(200)
    await client.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('.shift-editor .editor-actions button'))
        .find(item => item.textContent.trim() === '保存')
      if (!button) return false
      button.click()
      return true
    })()`)
    check(`${name}: 选中「默认班次」并保存`, resetClicked)
    await waitFor(client, '!document.querySelector(".shift-editor")', '弹窗关闭')

    const afterDelete = await client.evaluate(`window.localStorage.getItem(${JSON.stringify(DAY_RECORDS_KEY)})`)
    let afterDeleteRecords = []
    try {
      afterDeleteRecords = JSON.parse(afterDelete || '[]')
    } catch {
      afterDeleteRecords = []
    }
    check(`${name}: 改回默认后记录被删除`, afterDeleteRecords.length === 0, afterDelete)

    // --- 团队统计（本地版视为管理员） ---
    await client.evaluate(`(() => {
      const button = document.querySelector('.stats-entry-button')
      if (!button) return false
      button.click()
      return true
    })()`)
    await waitFor(client, 'Boolean(document.querySelector(".stats-page-mini"))', '统计页')
    check(`${name}: 能进入统计页`, true)

    const adminTabs = await client.evaluate(`(() => {
      const labels = Array.from(document.querySelectorAll('.stats-view-tab')).map(item => item.textContent.trim())
      return labels
    })()`)
    check(
      `${name}: 统计页显示管理员专属标签（个人统计 + 全员统计）`,
      adminTabs.includes('个人统计') && adminTabs.includes('全员统计'),
      JSON.stringify(adminTabs)
    )

    const teamTabClicked = await client.evaluate(`(() => {
      const tab = Array.from(document.querySelectorAll('.stats-view-tab'))
        .find(item => item.textContent.includes('全员统计'))
      if (!tab) return false
      tab.click()
      return true
    })()`)
    check(`${name}: 能切到全员统计`, teamTabClicked)

    if (teamTabClicked) {
      const hasChart = await waitFor(client, 'Boolean(document.querySelector(".stats-team-chart"))', '团队对比图', 8000)
        .then(() => true)
        .catch(() => false)
      check(`${name}: 全员加班对比图渲染`, hasChart)
    }

    const backClicked = await client.evaluate(`(() => {
      const button = document.querySelector('.stats-back-button')
      if (!button) return false
      button.click()
      return true
    })()`)
    const backHome = backClicked
      ? await waitFor(client, 'Boolean(document.querySelector(".calendar-grid"))', '返回排班页', 8000).then(() => true).catch(() => false)
      : false
    check(`${name}: 从统计页返回排班页`, backHome)

    // --- 薪资输入能落盘 ---
    await client.evaluate(`(() => {
      const button = document.querySelector('.stats-entry-button')
      if (button) button.click()
      return true
    })()`)
    await waitFor(client, 'Boolean(document.querySelector(".stats-page-mini"))', '统计页')

    // 统计页会记住上次看的是「全员统计」，薪资输入在「个人统计」页
    await client.evaluate(`(() => {
      const tab = Array.from(document.querySelectorAll('.stats-view-tab'))
        .find(item => item.textContent.includes('个人统计'))
      if (tab) tab.click()
      return true
    })()`)
    const hasSalaryInput = await waitFor(client, 'Boolean(document.querySelector(".salary-input"))', '薪资输入框', 8000)
      .then(() => true)
      .catch(() => false)

    const salaryFilled = hasSalaryInput && await client.evaluate(`(() => {
      const input = document.querySelector('.salary-input')
      if (!input) return false
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '5000')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)

    if (salaryFilled) {
      let salaryRaw = null
      const salaryDeadline = Date.now() + 5000
      while (Date.now() < salaryDeadline && !salaryRaw) {
        salaryRaw = await client.evaluate(`window.localStorage.getItem(${JSON.stringify(SALARY_KEY)})`)
        if (!salaryRaw) await sleep(200)
      }
      check(`${name}: 薪资输入写入 localStorage`, Boolean(salaryRaw && salaryRaw.includes('5000')), salaryRaw ?? '(空)')
    } else {
      check(`${name}: 薪资输入写入 localStorage`, false, '没找到薪资输入框')
    }
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

  const downloadDir = path.join(os.tmpdir(), `dsh-verify-download-${Date.now()}`)
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
