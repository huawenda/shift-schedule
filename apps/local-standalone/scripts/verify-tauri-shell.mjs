#!/usr/bin/env node
/**
 * 壳内行为验证：release exe + WebView2 远程调试。
 *
 * 验证的是「静态版能跑」之外、只有装进壳才会暴露的东西：
 *   1. 壳内 origin / 协议 / __TAURI_INTERNALS__ 是否正确注入
 *   2. Service Worker 是否真的没被注册（缓存优先会让新版本不生效）
 *   3. 前端是否只写 roster:v2、有没有回头去碰 v1 的旧键
 *   4. **点「导出备份」到底能不能落盘** —— 壳内最大的不确定项，
 *      静态版靠 <a download>，WebView2 不一定认
 *   5. **改班 → 杀进程 → 重启，数据还在不在**（套壳要解决的正是这件事）
 *   6. **导入备份能不能走通**（静态版用 <input type=file>，这里用 CDP 直接塞文件，
 *      绕过系统对话框，只验 React 侧的文件处理链路）
 *
 * 两个环境变量的作用：
 *   - WEBVIEW2_USER_DATA_FOLDER：把壳的用户数据目录指到临时目录，
 *     全程不碰用户真实的 %LOCALAPPDATA%\com.huawenda.shiftschedule\EBWebView。
 *   - WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS：开 CDP 端口，复用项目里的 CDP 客户端。
 *
 *   node scripts/verify-tauri-shell.mjs [--exe=<绝对路径>] [--keep]
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = 9333
const DEFAULT_EXE = path.resolve('desktop/src-tauri/target/release/倒班表.exe')

const args = process.argv.slice(2)
const exePath = (() => {
  const found = args.find(arg => arg.startsWith('--exe='))
  return found ? path.resolve(found.slice('--exe='.length)) : DEFAULT_EXE
})()
const keepTemp = args.includes('--keep')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  ${detail}` : ''}`)
}

/* ------------------------------ CDP ------------------------------ */

async function waitForPage(timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl)
        if (page) return page
      }
    } catch {
      // 还没起来
    }
    await sleep(300)
  }
  throw new Error('连接 WebView2 调试端口超时（壳没起来，或端口被占）')
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
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description || result.exceptionDetails.text || '求值失败'
      )
    }
    return result.result.value
  }

  return { ready, send, evaluate, close: () => { try { socket.close() } catch { /* 忽略 */ } } }
}

/* ------------------------------ 启动 / 停止 ------------------------------ */

function launch(userDataDir) {
  return spawn(exePath, [], {
    stdio: 'ignore',
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: userDataDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`
    }
  })
}

function stop(child) {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null) return resolve()
    const pid = child.pid
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }

    child.on('exit', done)

    if (process.platform === 'win32' && pid) {
      // 关键：不能一上来就 taskkill /T /F。
      // 强杀会把 msedgewebview2.exe 一起干掉，WebView2 来不及把 localStorage
      // 异步刷进磁盘 —— 下次启动就读不到了，「持久化」当场变成假象
      // （实测踩过：改完这里，第二阶段 4 项直接红）。
      // 先不带 /F：taskkill 会发 WM_CLOSE，壳正常关窗、WebView2 优雅退出。
      try {
        spawn('taskkill', ['/PID', String(pid)], { stdio: 'ignore' })
      } catch {
        child.kill()
      }
      // 5 秒还没退（比如卡在对话框上）才强杀整棵树兜底
      setTimeout(() => {
        try {
          spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
        } catch {
          // 已退出
        }
        setTimeout(done, 800)
      }, 5000)
    } else {
      child.kill()
      setTimeout(done, 5000)
    }
  })
}

/** WebView2 退出后文件句柄释放有延迟，删除要重试几次 */
async function cleanupDir(dir) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      return true
    } catch {
      await sleep(800)
    }
  }
  return !fs.existsSync(dir)
}

/** 起一个壳、连上 CDP，等页面渲染出内容 */
async function boot(userDataDir) {
  const child = launch(userDataDir)
  const page = await waitForPage()
  const client = createCdpClient(page.webSocketDebuggerUrl)
  await client.ready
  await client.send('Runtime.enable')

  const deadline = Date.now() + 30000
  for (;;) {
    const state = await client
      .evaluate(`(() => {
        const root = document.querySelector('#root')
        return {
          html: root ? root.innerHTML.length : 0,
          wizard: Boolean(document.querySelector('.wizard')),
          app: Boolean(document.querySelector('.app')),
          text: (document.body.innerText || '').slice(0, 120)
        }
      })()`)
      .catch(() => null)
    if (state?.html > 200) return { child, client, state }
    if (Date.now() > deadline) throw new Error(`壳内页面未渲染（${JSON.stringify(state)}）`)
    await sleep(400)
  }
}

/* ------------------------------ 交互辅助 ------------------------------ */

const clickByText = (selector, text) => `(() => {
  const target = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
    .find(node => (node.textContent || '').trim() === ${JSON.stringify(text)})
  if (!target) return false
  target.click()
  return true
})()`

const setInputs = (selector, values) => `(() => {
  const inputs = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
  if (inputs.length < ${values.length}) return { ok: false, count: inputs.length }
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const values = ${JSON.stringify(values)}
  inputs.forEach((input, index) => {
    if (values[index] === undefined) return
    setter.call(input, values[index])
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return { ok: true, count: inputs.length }
})()`

async function waitForFiles(dir, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(name => !name.endsWith('.crdownload') && !name.endsWith('.tmp'))
      : []
    if (files.length > 0) return files
    await sleep(250)
  }
  return []
}

/** 用 CDP 直接把文件塞进 input[type=file]，绕过系统对话框 */
async function setFileInput(client, filePath) {
  await client.send('DOM.enable')
  const { root } = await client.send('DOM.getDocument', { depth: -1 })
  const { nodeId } = await client.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: 'input[type=file]'
  })
  if (!nodeId) throw new Error('页面里找不到 input[type=file]')
  await client.send('DOM.setFileInputFiles', { files: [filePath], nodeId })
}

/* ------------------------------ 阶段一 ------------------------------ */

async function phaseOne(userDataDir, downloadDir) {
  console.log('【阶段一：首开 → 建人 → 改班 → 导出】\n')
  const { child, client, state } = await boot(userDataDir)
  const out = {}

  try {
    /* 1. 壳内环境 */
    console.log('【1 壳内环境】')
    const env = await client.evaluate(`(async () => ({
      origin: location.origin,
      protocol: location.protocol,
      hasTauri: typeof window.__TAURI_INTERNALS__ !== 'undefined',
      hasGlobalTauri: typeof window.__TAURI__ !== 'undefined',
      dialogApi: typeof window.__TAURI__?.dialog?.save,
      swRegs: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
      swController: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      viewport: innerWidth + 'x' + innerHeight,
      title: document.title
    }))()`)

    console.log(`  origin             ${env.origin}`)
    console.log(`  __TAURI_INTERNALS__   ${env.hasTauri}`)
    console.log(`  __TAURI__ (global)    ${env.hasGlobalTauri}  dialog.save=${env.dialogApi ?? '（无）'}`)
    console.log(`  SW registrations   ${env.swRegs}   controller=${env.swController}`)
    console.log(`  color-scheme       ${env.colorScheme}`)
    console.log(`  系统偏好暗色       ${env.prefersDark}  ← 壳窗口 theme=Light 时应为 false`)
    console.log(`  视口               ${env.viewport}`)
    console.log(`  title              ${env.title}`)
    console.log('')

    check('壳内注入 __TAURI_INTERNALS__', env.hasTauri)
    check('Service Worker 未注册', env.swRegs === 0 && env.swController === false, `regs=${env.swRegs} controller=${env.swController}`)
    check('页面声明浅色', String(env.colorScheme).includes('light'), env.colorScheme)
    check('壳窗口主题为浅色（WebView2 未报暗色偏好）', env.prefersDark === false, `prefers-dark=${env.prefersDark}`)
    check('页面渲染出内容（非白屏）', state.app || state.wizard)

    /* 2. 首开形态 */
    console.log('\n【2 首开形态】')
    check('空数据进入三步向导', state.wizard, state.wizard ? '' : `看到的是：${state.text}`)

    /* 3. 建 3 位成员 */
    console.log('\n【3 建成员】')
    check('向导第 1 步可继续', await client.evaluate(clickByText('.wizard-foot button', '下一步')))
    await sleep(300)
    const filled = await client.evaluate(setInputs('input[aria-label$="的姓名"]', ['王磊', '李静', '赵鹏']))
    check('填 3 位成员姓名', filled.ok, `找到 ${filled.count} 个姓名框`)
    await sleep(300)
    check('向导第 2 步可继续（校验通过）', await client.evaluate(clickByText('.wizard-foot button', '下一步')))
    await sleep(300)
    check('向导第 3 步进入排班表', await client.evaluate(clickByText('.wizard-foot button', '进入排班表')))
    await sleep(800)

    /* 4. 排班页与存储 */
    console.log('\n【4 排班页与存储】')
    const board = await client.evaluate(`(() => {
      const raw = localStorage.getItem('shift-schedule:local:roster:v2')
      const roster = raw ? JSON.parse(raw) : null
      return {
        hasApp: Boolean(document.querySelector('.app')),
        summaryCells: document.querySelectorAll('.summary-cell').length,
        cells: document.querySelectorAll('.matrix-cell').length,
        legend: document.querySelectorAll('.legend-item').length,
        memberCount: roster?.members?.length ?? 0,
        overrideCount: roster?.overrides?.length ?? 0,
        keys: Object.keys(localStorage)
      }
    })()`)

    console.log(`  localStorage 键    ${board.keys.join(', ') || '（空）'}`)
    console.log(`  成员 / 改班记录    ${board.memberCount} / ${board.overrideCount}`)
    console.log(`  矩阵格 / 图例项    ${board.cells} / ${board.legend}`)
    console.log('')

    check('排班页出现', board.hasApp)
    check('只写 roster:v2，无 v1 旧键', board.keys.includes('shift-schedule:local:roster:v2') && !board.keys.some(key => key.includes(':v1')))
    check('成员落库 3 人', board.memberCount === 3, String(board.memberCount))
    check('概览条 4 格齐全', board.summaryCells === 4, String(board.summaryCells))
    check('矩阵格子已渲染', board.cells > 0, `${board.cells} 个`)
    check('六色图例齐全', board.legend === 6, String(board.legend))

    /* 5. 改一个班次 */
    console.log('\n【5 改班】')
    const opened = await client.evaluate(`(() => {
      const cell = Array.from(document.querySelectorAll('.matrix-cell'))
        .find(node => !node.classList.contains('is-blank'))
      if (!cell) return false
      cell.click()
      return true
    })()`)
    check('点矩阵格子打开改班弹层', opened && await client.evaluate('Boolean(document.querySelector(".dialog"))'))
    await sleep(300)

    check('弹层里有 6 个班次选项', (await client.evaluate('document.querySelectorAll(".dialog-options .option").length')) === 6)
    const picked = await client.evaluate(clickByText('.dialog-options .option', '事假'))
    check('选中「事假」', picked)
    await sleep(200)
    check('点保存', await client.evaluate(clickByText('.dialog-foot button', '保存')))
    await sleep(600)

    const afterEdit = await client.evaluate(`(() => {
      const raw = localStorage.getItem('shift-schedule:local:roster:v2')
      const roster = raw ? JSON.parse(raw) : null
      return {
        overrides: roster?.overrides ?? [],
        editedMarks: document.querySelectorAll('.matrix-cell.is-edited').length
      }
    })()`)
    check('改班写入 1 条覆盖记录', afterEdit.overrides.length === 1, JSON.stringify(afterEdit.overrides[0] ?? null))
    check('矩阵上出现「改过」标记', afterEdit.editedMarks === 1, String(afterEdit.editedMarks))
    out.override = afterEdit.overrides[0] ?? null

    /* 6. 导出备份 */
    console.log('\n【6 导出备份（壳内关键项）】')
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allowAndName',
      downloadPath: downloadDir,
      eventsEnabled: true
    })
    check('点到「导出备份」按钮', await client.evaluate(clickByText('.topbar-right button', '导出备份')))

    const files = await waitForFiles(downloadDir)
    let parsed = null
    if (files.length > 0) {
      try {
        const json = JSON.parse(fs.readFileSync(path.join(downloadDir, files[0]), 'utf8'))
        parsed = {
          app: json.app,
          version: json.version,
          members: json.roster?.members?.length ?? -1,
          overrides: json.roster?.overrides?.length ?? -1
        }
      } catch (error) {
        parsed = { error: error.message }
      }
    }
    console.log(`  落盘文件数         ${files.length}`)
    console.log(`  内容               ${parsed ? JSON.stringify(parsed) : '（无文件）'}`)

    out.exported = { files, parsed }
    check('导出备份在壳内真的落盘', files.length > 0 && parsed?.app === 'shift-schedule-local' && parsed?.version === 2, files.length ? '' : '未落盘 → 需改走 Tauri 对话框')
    check('备份里含 3 人 + 1 条改班', parsed?.members === 3 && parsed?.overrides === 1, `${parsed?.members}/${parsed?.overrides}`)
  } finally {
    client.close()
    await stop(child)
  }

  return out
}

/* ------------------------------ 阶段二 ------------------------------ */

async function phaseTwo(userDataDir, importFile) {
  console.log('\n【阶段二：重启后读回 + 导入】\n')
  await sleep(1500)
  const { child, client } = await boot(userDataDir)
  const out = {}

  try {
    /* 7. 持久化 */
    console.log('【7 重启后数据还在吗】')
    const persisted = await client.evaluate(`(() => {
      const raw = localStorage.getItem('shift-schedule:local:roster:v2')
      const roster = raw ? JSON.parse(raw) : null
      return {
        members: roster?.members?.map(m => m.name) ?? [],
        overrides: roster?.overrides ?? [],
        editedMarks: document.querySelectorAll('.matrix-cell.is-edited').length,
        sawWizard: Boolean(document.querySelector('.wizard'))
      }
    })()`)

    console.log(`  读回成员           ${persisted.members.join(', ') || '（空）'}`)
    console.log(`  读回改班记录       ${persisted.overrides.length} 条`)
    console.log(`  界面「改过」标记   ${persisted.editedMarks}`)
    console.log('')

    check('重启后 3 位成员还在', persisted.members.length === 3, persisted.members.join(','))
    check('重启后改班记录还在', persisted.overrides.length === 1)
    check('重启后未回到向导', persisted.sawWizard === false)
    check('重启后矩阵仍显示改过标记', persisted.editedMarks === 1, String(persisted.editedMarks))
    out.persisted = persisted

    /* 8. 导入 */
    console.log('\n【8 导入备份】')
    await setFileInput(client, importFile)
    await sleep(1200)

    const imported = await client.evaluate(`(() => {
      const raw = localStorage.getItem('shift-schedule:local:roster:v2')
      const roster = raw ? JSON.parse(raw) : null
      const notice = document.querySelector('.sheet-notice')
      return {
        members: roster?.members?.map(m => m.name) ?? [],
        overrides: roster?.overrides?.length ?? 0,
        notice: notice ? notice.textContent.trim() : ''
      }
    })()`)

    console.log(`  导入后成员         ${imported.members.join(', ') || '（空）'}`)
    console.log(`  界面提示           ${imported.notice || '（无）'}`)
    console.log('')

    check('导入后成员被替换为备份里的 2 人', imported.members.length === 2, imported.members.join(','))
    check('导入有界面反馈', Boolean(imported.notice), imported.notice)
    out.imported = imported
  } finally {
    client.close()
    await stop(child)
  }

  return out
}

/* ------------------------------ 主流程 ------------------------------ */

async function main() {
  if (!fs.existsSync(exePath)) {
    console.error(`找不到可执行文件：${exePath}`)
    console.error('先跑：pnpm exec tauri build --no-bundle --config desktop/src-tauri/tauri.conf.json')
    process.exit(1)
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shift-shell-profile-'))
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shift-shell-dl-'))
  const importFile = path.join(os.tmpdir(), `shift-shell-import-${Date.now()}.json`)

  // 一份 2 人的 v2 备份，用来验证导入
  fs.writeFileSync(
    importFile,
    JSON.stringify(
      {
        app: 'shift-schedule-local',
        version: 2,
        exportedAt: new Date().toISOString(),
        roster: {
          members: [
            { id: 'imp-a', name: '孙强', patternId: '4R' },
            { id: 'imp-b', name: '周敏', patternId: '4S' }
          ],
          overrides: [{ memberId: 'imp-a', date: '2026-10-21', shift: '休息' }]
        }
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`壳程序     ${exePath}`)
  console.log(`临时数据   ${userDataDir}`)
  console.log('（全程使用临时用户目录，不碰真实的 EBWebView 数据）\n')

  try {
    await phaseOne(userDataDir, downloadDir)
    await phaseTwo(userDataDir, importFile)
  } finally {
    fs.rmSync(importFile, { force: true })
    if (keepTemp) {
      console.log(`\n保留临时目录：${userDataDir}\n              ${downloadDir}`)
    } else {
      const leftovers = []
      for (const dir of [userDataDir, downloadDir]) {
        if (!(await cleanupDir(dir))) leftovers.push(dir)
      }
      if (leftovers.length > 0) {
        console.log('\n⚠ 以下临时目录没能删掉（文件仍被占用），可以手动删除：')
        leftovers.forEach(dir => console.log(`  ${dir}`))
      }
    }
  }

  const failed = results.filter(item => !item.ok)
  console.log('\n' + '─'.repeat(56))
  console.log(`总计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
  if (failed.length > 0) {
    console.log('\n未通过：')
    failed.forEach(item => console.log(`  · ${item.name}${item.detail ? `  ${item.detail}` : ''}`))
  }

  process.exit(failed.length === 0 ? 0 : 2)
}

main().catch(error => {
  console.error(`\n验证中断：${error.message}`)
  process.exit(1)
})
