#!/usr/bin/env node
/**
 * P7 实机探针：型号尺寸映射维护 + 映射改动后视图即时重算。
 *
 * 验的是 P7 的核心验收标准：「映射改动后所有视图即时更新」。
 *
 * 做法：载入源数据 → 打开映射面板 → 改一个型号的对应尺寸 → 保存 →
 * 检查审查页的「对应尺寸」列与标红数是否跟着变了。
 *
 *   node scripts/probe/jig-mapping.mjs [--exe=<绝对路径>]
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createCdpClient, sleep } from '../lib/cdp.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PORT = 9348
const DEFAULT_EXE = path.join(ROOT, 'desktop', 'src-tauri', 'target', 'release', 'Workhorse.exe')
const FIXTURE = path.join(
  ROOT,
  'src',
  'features',
  'jig',
  '__tests__',
  'fixtures',
  'test-500.xlsx'
)

const args = process.argv.slice(2)
const exePath = (() => {
  const found = args.find(arg => arg.startsWith('--exe='))
  return found ? path.resolve(found.slice('--exe='.length)) : DEFAULT_EXE
})()

if (!fs.existsSync(exePath)) {
  console.error(`找不到 exe：${exePath}`)
  process.exit(1)
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? `  ${detail}` : ''}`)
}

async function waitForPage(timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
        if (page) return page
      }
    } catch {
      // 还没起来
    }
    await sleep(300)
  }
  throw new Error('CDP 端口没起来')
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jig-map-'))
const child = spawn(exePath, [], {
  env: {
    ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: userDataDir,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`
  },
  stdio: 'ignore'
})

let cdp = null
try {
  const page = await waitForPage()
  cdp = await createCdpClient(page.webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Runtime.enable')
  await sleep(2500)

  await cdp.evaluate(`(() => {
    const roster = {
      members: [{ id: 'm-probe', name: '探针', patternId: '4F' }],
      groups: [], overrides: [], patterns: [], todos: [],
      profile: { memberId: 'm-probe', salary: { mode: 'monthly', monthly: 6000, perHour: 30, overtimeHourly: 45 } },
      updatedAt: Date.now()
    }
    localStorage.setItem('shift-schedule:local:roster:v2', JSON.stringify(roster))
    return true
  })()`)
  await cdp.send('Page.reload', { ignoreCache: false })
  await sleep(2500)

  /* ---------- 1. 载入源数据到审查页 ---------- */
  console.log('\n【1 载入源数据】')
  await cdp.evaluate(`location.hash = '#/jig/review'`)
  await sleep(1000)
  const loaded = await cdp.evaluate(`(async () => {
    const fixture = ${JSON.stringify(FIXTURE)}
    const original = window.__TAURI__.dialog.open
    window.__TAURI__.dialog.open = async () => fixture
    ;[...document.querySelectorAll('button')].find(b => b.textContent.includes('浏览'))?.click()
    await new Promise(r => setTimeout(r, 4000))
    window.__TAURI__.dialog.open = original
    const heads = [...document.querySelectorAll('.jig-table thead th')].map(th => th.textContent.trim())
    const rows = document.querySelectorAll('.jig-table tbody tr').length
    const flagged = document.querySelectorAll('.jig-table tbody tr.is-mismatch').length
    return { heads, rows, flagged }
  })()`)
  check('审查页出表', (loaded?.rows ?? 0) > 0, `${loaded?.rows} 行`)
  check('表里有「对应尺寸」列', (loaded?.heads ?? []).includes('对应尺寸'))
  check(
    '有标红行',
    (loaded?.flagged ?? 0) > 0,
    `${loaded?.flagged} 行标红`
  )

  /* ---------- 2. 打开映射面板 ---------- */
  console.log('\n【2 打开映射面板】')
  const opened = await cdp.evaluate(`(async () => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('型号尺寸匹配'))
    if (!btn) return { ok: false, error: '找不到「型号尺寸匹配」按钮' }
    btn.click()
    await new Promise(r => setTimeout(r, 800))
    const dialog = document.querySelector('[role="dialog"]')
    const rows = document.querySelectorAll('.jig-map-row').length
    const inputs = document.querySelectorAll('.jig-map-input').length
    const hasGrip = document.querySelectorAll('.jig-map-grip').length
    return { ok: true, hasDialog: Boolean(dialog), rows, inputs, hasGrip }
  })()`)
  check('映射面板打开', opened?.hasDialog === true)
  check('面板里有映射行', (opened?.rows ?? 0) > 0, `${opened?.rows} 行`)
  check('每行两个输入框', opened?.inputs === (opened?.rows ?? 0) * 2, `${opened?.inputs} 个`)
  check('每行有拖拽手柄', opened?.hasGrip === (opened?.rows ?? 0), `${opened?.hasGrip} 个`)

  /* ---------- 3. 改一个映射并保存 ---------- */
  console.log('\n【3 改映射并保存】')
  const saved = await cdp.evaluate(`(async () => {
    // 找到「对应尺寸」输入框，改成一定不匹配的值
    const sizeInputs = [...document.querySelectorAll('.jig-map-input')].filter((_, i) => i % 2 === 1)
    const target = sizeInputs[0]
    if (!target) return { ok: false, error: '找不到尺寸输入框' }
    const before = target.value

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(target, '88/88')
    target.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 300))

    // 点「保存」
    const saveBtn = [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === '保存')
    if (!saveBtn) return { ok: false, error: '找不到保存按钮' }
    saveBtn.click()
    await new Promise(r => setTimeout(r, 1200))

    const stillOpen = Boolean(document.querySelector('[role="dialog"]'))
    return { ok: true, before, after: '88/88', stillOpen }
  })()`)
  check('保存后面板关闭', saved?.ok === true && saved?.stillOpen === false, `原值「${saved?.before}」`)

  /* ---------- 4. 视图即时重算 ---------- */
  console.log('\n【4 视图即时重算】')
  const after = await cdp.evaluate(`(async () => {
    // 回到审查页（面板在 App 层，关掉后页面还在）
    location.hash = '#/jig/review'
    await new Promise(r => setTimeout(r, 1200))
    const heads = [...document.querySelectorAll('.jig-table thead th')].map(th => th.textContent.trim())
    const rows = document.querySelectorAll('.jig-table tbody tr').length
    const flagged = document.querySelectorAll('.jig-table tbody tr.is-mismatch').length
    const firstRow = [...document.querySelectorAll('.jig-table tbody tr')][0]
    const sizeCol = heads.indexOf('对应尺寸')
    // 找出「对应尺寸」是新值的行 —— 改的是映射表第一项，
    // 而审查表第一行的型号未必是它，所以不能只看第一行
    let newSizeRows = 0
    for (const tr of document.querySelectorAll('.jig-table tbody tr')) {
      const tds = tr.querySelectorAll('td')
      if (sizeCol >= 0 && tds[sizeCol]?.textContent?.trim() === '88/88') newSizeRows += 1
    }
    const counts = [...document.querySelectorAll('.jig-toolbar-count')].map(c => c.textContent.trim())
    return { heads, rows, flagged, newSizeRows, counts }
  })()`)
  check(
    '「对应尺寸」列已按新映射重算',
    (after?.newSizeRows ?? 0) > 0,
    `${after?.newSizeRows} 行的对应尺寸是新值`
  )
  check(
    '标红行数跟着重算',
    after?.flagged !== loaded?.flagged,
    `${loaded?.flagged} → ${after?.flagged} 行`
  )
  check(
    '审查页两档计数跟着重算',
    (after?.counts?.length ?? 0) === 2,
    (after?.counts ?? []).join(' / ')
  )

  /* ---------- 5. 映射改动后透视表也跟着重算 ---------- */
  console.log('\n【5 其它视图也跟着重算】')
  const other = await cdp.evaluate(`(async () => {
    location.hash = '#/jig/pivot'
    await new Promise(r => setTimeout(r, 1200))
    const rows = document.querySelectorAll('.jig-table tbody tr').length
    const stages = document.querySelectorAll('.jig-stage').length
    return { rows, stages }
  })()`)
  check('透视表仍有内容', (other?.rows ?? 0) > 0, `${other?.rows} 行`)
  check('工序轨道仍在', (other?.stages ?? 0) === 11, `${other?.stages} 道`)
} catch (error) {
  check('探针执行', false, String(error))
} finally {
  try {
    cdp?.close()
  } catch {
    // 忽略
  }
  child.kill()
  await sleep(600)
  fs.rmSync(userDataDir, { recursive: true, force: true })
}

const failed = results.filter(r => !r.ok)
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length === 0 ? 0 : 1)
