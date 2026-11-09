#!/usr/bin/env node
/**
 * JIG 页的壳内能力探针（P3 验收用）。
 *
 * 只验「只有装进壳才会暴露」的东西：
 *   1. `window.__TAURI__.core.invoke` 在壳里可用；
 *   2. `read_picked_file` 能把 MES 导出的 Excel 原样读回来（且是 xlsx 的 zip 头）；
 *   3. `read_clipboard_text` 能读出系统剪贴板里的文本；
 *   4. 读不存在的文件要报错而不是静默成功；
 *   5. JIG 路由能打开，四段页签在，「浏览…」按钮可用。
 *
 * 不走系统文件对话框（原生对话框没法用 CDP 点）—— 直接在页面里
 * `window.__TAURI__.core.invoke(...)`，验的是同一条命令、同一条数据通路。
 *
 *   node scripts/probe/jig-shell.mjs [--exe=<绝对路径>]
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createCdpClient, sleep } from '../lib/cdp.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PORT = 9345
const DEFAULT_EXE = path.join(ROOT, 'desktop', 'src-tauri', 'target', 'release', '昼夜.exe')
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
  console.error(`找不到 exe：${exePath}\n先跑 pnpm exec tauri build --config desktop/src-tauri/tauri.conf.json --no-bundle`)
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

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jig-shell-'))

/**
 * 往系统剪贴板写一段文本。
 *
 * 用 PowerShell 的 Set-Clipboard —— 它写的是真正的系统剪贴板，
 * 正是 Tauri 的 clipboard-manager 插件能读到的那个。
 */
function setSystemClipboard(text) {
  return new Promise((resolve, reject) => {
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-Command', `Set-Clipboard -Value @'\n${text}\n'@`],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    )
    let stderr = ''
    ps.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })
    ps.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`Set-Clipboard 失败（code=${code}）：${stderr}`))
    })
  })
}
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
  await sleep(2500) // 等前端把路由挂起来

  /* ---------- 0. 壳注入 ---------- */
  console.log('\n【0 壳注入】')
  const injected = await cdp.evaluate(
    `typeof window.__TAURI__?.core?.invoke === 'function'`
  )
  check('window.__TAURI__.core.invoke 可用', injected === true)

  /* ---------- 1. 跳过首次向导 ---------- */
  // 全新用户数据目录里没有花名册，App 会停在三步向导上，JIG 页面根本进不去。
  // 这里塞一份最小的花名册（一个成员 + 本人），把向导跳过去。
  console.log('\n【1 跳过错导】')
  await cdp.evaluate(`(() => {
    const roster = {
      members: [{ id: 'm-probe', name: '探针', patternId: '4F' }],
      groups: [],
      overrides: [],
      patterns: [],
      todos: [],
      profile: { memberId: 'm-probe', salary: { mode: 'monthly', monthly: 6000, perHour: 30, overtimeHourly: 45 } },
      updatedAt: Date.now()
    }
    localStorage.setItem('shift-schedule:local:roster:v2', JSON.stringify(roster))
    return true
  })()`)
  await cdp.send('Page.reload', { ignoreCache: false })
  await sleep(2500)

  /* ---------- 2. 读系统剪贴板 ---------- */
  console.log('\n【2 读系统剪贴板】')
  const clip = await cdp.evaluate(`(async () => {
    try {
      const t = await window.__TAURI__.core.invoke('read_clipboard_text')
      return { ok: true, type: typeof t, length: typeof t === 'string' ? t.length : -1 }
    } catch (e) { return { ok: false, error: String(e) } }
  })()`)
  check(
    'read_clipboard_text 有返回',
    clip?.ok === true,
    clip?.ok ? `字符串 ${clip.length} 字` : clip?.error ?? '无返回'
  )

  /* ---------- 3. 读 MES Excel ---------- */
  console.log('\n【3 读 MES 导出的 Excel】')
  const excel = await cdp.evaluate(`(async () => {
    const p = ${JSON.stringify(FIXTURE)}
    try {
      const bytes = await window.__TAURI__.core.invoke('read_picked_file', { path: p })
      return { ok: true, length: bytes.length, head: Array.from(bytes.slice(0, 4)) }
    } catch (e) { return { ok: false, error: String(e) } }
  })()`)
  check(
    'read_picked_file 读回字节',
    excel?.ok === true,
    excel?.ok ? `${excel.length} 字节` : excel?.error ?? '无返回'
  )
  check(
    '字节是 xlsx 的 zip 头（PK\\x03\\x04）',
    Array.isArray(excel?.head) && excel.head[0] === 0x50 && excel.head[1] === 0x4b,
    excel?.head?.map(b => b.toString(16)).join(' ') ?? ''
  )

  /* ---------- 4. 读不存在的文件要报错 ---------- */
  console.log('\n【4 错误路径】')
  const missing = await cdp.evaluate(`(async () => {
    try {
      await window.__TAURI__.core.invoke('read_picked_file', { path: 'D:/__不存在的文件__.xlsx' })
      return { threw: false }
    } catch (e) { return { threw: true, message: String(e) } }
  })()`)
  check('读不存在的文件会报错', missing?.threw === true, missing?.message ?? '')

  /* ---------- 5. JIG 路由 ---------- */
  console.log('\n【5 JIG 页面】')
  await cdp.evaluate(`location.hash = '#/jig/detail'`)
  await sleep(1500)
  const jig = await cdp.evaluate(`(() => {
    const title = document.querySelector('.canvas-title')
    const tabs = [...document.querySelectorAll('[role="tab"]')].map(t => t.textContent.trim())
    const browse = [...document.querySelectorAll('button')].find(b => b.textContent.includes('浏览'))
    const input = document.querySelector('.jig-side-input')
    return {
      title: title?.textContent ?? '',
      tabs,
      browseDisabled: browse ? browse.disabled : null,
      hasInput: Boolean(input)
    }
  })()`)
  check('JIG 页标题是「JIG 数据」', jig?.title === 'JIG 数据', jig?.title ?? '')
  check('四个 Tab 都在', Array.isArray(jig?.tabs) && jig.tabs.length === 4, (jig?.tabs ?? []).join(' / '))
  check('「浏览…」按钮可用', jig?.browseDisabled === false, `disabled=${jig?.browseDisabled}`)
  check('Jig ID 输入框在', jig?.hasInput === true)

  /* ---------- 6. 切页签 ---------- */
  console.log('\n【6 切页签】')
  const pivots = []
  for (const slug of ['query-pivot', 'pivot', 'review']) {
    await cdp.evaluate(`location.hash = '#/jig/${slug}'`)
    await sleep(700)
    const active = await cdp.evaluate(
      `document.querySelector('[role="tab"][data-state="active"]')?.textContent?.trim() ?? ''`
    )
    pivots.push(`${slug}→${active}`)
  }
  check('三个页签都能切', pivots.every(p => p.includes('→') && !p.endsWith('→')), pivots.join('  '))

  /* ---------- 7. 端到端：选文件 → 读 → 解析 → 出表 ---------- */
  // 前面验的是「字节读回来了」；这一条验的是**完整真实链路**：
  // 选文件 → invoke 读字节 → xlsx 解析 → validate → 透视 → 渲染成表。
  // 原生文件对话框没法用 CDP 点，所以把 window.__TAURI__.dialog.open 桩成
  // 直接返回夹具路径 —— 其余每一步都是产品代码在跑。
  console.log('\n【7 端到端：选文件 → 读 → 解析 → 出表】')
  await cdp.evaluate(`location.hash = '#/jig/pivot'`)
  await sleep(900)
  const e2e = await cdp.evaluate(`(async () => {
    const fixture = ${JSON.stringify(FIXTURE)}
    const original = window.__TAURI__.dialog.open
    window.__TAURI__.dialog.open = async () => fixture
    const browse = [...document.querySelectorAll('button')].find(b => b.textContent.includes('浏览'))
    if (!browse) { window.__TAURI__.dialog.open = original; return { ok: false, error: '找不到「浏览…」按钮' } }
    browse.click()
    // 等读取与解析完成（读 44KB 文件 + 解析 500 行）
    await new Promise(r => setTimeout(r, 4000))
    window.__TAURI__.dialog.open = original
    const note = document.querySelector('.jig-toolbar-note')?.textContent ?? ''
    const rows = document.querySelectorAll('.jig-table tbody tr').length
    const cols = document.querySelectorAll('.jig-table thead th').length
    return { ok: true, note, rows, cols }
  })()`)
  check(
    '选文件后数据解析完成并出表',
    e2e?.ok === true && e2e?.rows > 0 && e2e?.cols > 0,
    e2e?.ok ? `${e2e.rows} 行 × ${e2e.cols} 列；状态「${e2e.note}」` : e2e?.error ?? '无返回'
  )
  check(
    '全量透视表有内容（500 行源数据）',
    (e2e?.rows ?? 0) >= 30,
    `${e2e?.rows ?? 0} 行`
  )

  /* ---------- 8. 查询链路 ---------- */
  // 输入 ID → 查 → 明细表出结果。这一条走的是 useJigData.runQuery，
  // 命中判定用的是「P/N != 【未找到】」的旧口径。
  console.log('\n【8 查询链路】')
  await cdp.evaluate(`location.hash = '#/jig/detail'`)
  await sleep(900)
  const query = await cdp.evaluate(`(async () => {
    const fixture = ${JSON.stringify(FIXTURE)}
    const original = window.__TAURI__.dialog.open
    window.__TAURI__.dialog.open = async () => fixture
    ;[...document.querySelectorAll('button')].find(b => b.textContent.includes('浏览'))?.click()
    await new Promise(r => setTimeout(r, 4000))
    window.__TAURI__.dialog.open = original

    // 夹具里的真实 Jig ID（前两个命中 + 一个不存在的，用来验左连接）
    const sample = ['CJJ070000001', 'C4M000700037', '__不存在的ID__']
    const input = document.querySelector('.jig-side-input')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(input, sample.join('\\n'))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 400))

    ;[...document.querySelectorAll('button')].find(b => b.textContent.includes('开始查询'))?.click()
    await new Promise(r => setTimeout(r, 1200))

    const rows = document.querySelectorAll('.jig-table tbody tr').length
    const cells = [...document.querySelectorAll('.jig-table tbody tr')].slice(0, 3)
      .map(tr => [...tr.querySelectorAll('td')].slice(0, 3).map(td => td.textContent.trim()).join(' | '))
    const notFound = [...document.querySelectorAll('.jig-table tbody tr')]
      .filter(tr => [...tr.querySelectorAll('td')].some(td => td.textContent.includes('【未找到】'))).length
    return { ok: true, sample, rows, cells, notFound }
  })()`)
  check(
    '查询后明细表出结果',
    query?.ok === true && (query?.rows ?? 0) > 0,
    query?.ok ? `查 ${query.sample.length} 个 ID → ${query.rows} 行` : query?.error ?? '无返回'
  )
  check(
    '不存在的 ID 走左连接标【未找到】',
    query?.ok === true && (query?.notFound ?? 0) >= 1,
    `${query?.notFound ?? 0} 行标未找到`
  )

  /* ---------- 9. 粘贴提取 Jig ID ---------- */
  // 「从邮件正文直接粘贴 → 自动挑出 Jig ID」是 P3 的核心用法。
  // 做法：先把一段带邮件正文的文本放进**系统剪贴板**，再在输入框上派发
  // 一个 paste 事件 —— 产品的 onPaste 会走插件去读系统剪贴板，
  // 提取、填进输入框。全程是产品代码在跑。
  console.log('\n【9 粘贴提取 Jig ID】')
  const mailBody = [
    '各位好，',
    '本次需要核查以下 Jig：',
    'CJJ070000001',
    'C4M000700037',
    '请协助确认，谢谢。'
  ].join('\n')
  await setSystemClipboard(mailBody)

  const pasted = await cdp.evaluate(`(async () => {
    const input = document.querySelector('.jig-side-input')
    if (!input) return { ok: false, error: '找不到输入框' }
    const before = input.value
    input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true }))
    await new Promise(r => setTimeout(r, 1200))
    return { ok: true, before, after: input.value }
  })()`)
  const extracted = (pasted?.after ?? '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
  check(
    '粘贴后自动挑出 Jig ID',
    pasted?.ok === true && extracted.includes('CJJ070000001') && extracted.includes('C4M000700037'),
    extracted.join(' / ') || pasted?.error || '无返回'
  )
  check(
    '邮件正文没有混进输入框',
    !(extracted ?? []).some(line => line.includes('请协助确认')),
    extracted.join(' / ')
  )

  /* ---------- 10. 工序轨道 ---------- */
  console.log('\n【10 工序轨道】')
  await cdp.evaluate(`location.hash = '#/jig/pivot'`)
  await sleep(900)
  const rail = await cdp.evaluate(`(async () => {
    const fixture = ${JSON.stringify(FIXTURE)}
    const original = window.__TAURI__.dialog.open
    window.__TAURI__.dialog.open = async () => fixture
    ;[...document.querySelectorAll('button')].find(b => b.textContent.includes('浏览'))?.click()
    await new Promise(r => setTimeout(r, 4000))
    window.__TAURI__.dialog.open = original

    const stages = [...document.querySelectorAll('.jig-stage')].map(el => ({
      name: el.querySelector('.jig-stage-name')?.textContent?.trim() ?? '',
      count: el.querySelector('.jig-stage-count')?.textContent?.trim() ?? ''
    }))
    // 透视表总计行的工序计数，应与轨道上的数字一致
    const table = document.querySelector('.jig-table')
    const heads = [...(table?.querySelectorAll('thead th') ?? [])].map(th => th.textContent.trim())
    const totalRow = [...(table?.querySelectorAll('tbody tr') ?? [])].pop()
    const cells = [...(totalRow?.querySelectorAll('td') ?? [])].map(td => td.textContent.trim())
    const total = {}
    heads.forEach((h, i) => { total[h] = cells[i] })
    return { stages, total, heads }
  })()`)
  check(
    '轨道上有 11 道工序',
    (rail?.stages?.length ?? 0) === 11,
    `${rail?.stages?.length ?? 0} 道`
  )
  check(
    '工序顺序按 order 排（PNP 在首、Jig入库 在末）',
    rail?.stages?.[0]?.name === 'PNP' &&
      rail?.stages?.[rail.stages.length - 1]?.name === 'Jig入库',
    `${rail?.stages?.[0]?.name} → ${rail?.stages?.[rail.stages.length - 1]?.name}`
  )
  const railMismatch = (rail?.stages ?? []).filter(
    s => rail?.total?.[s.name] !== s.count
  )
  check(
    '轨道计数与透视表总计行逐项一致',
    railMismatch.length === 0,
    railMismatch.length > 0
      ? railMismatch.map(s => `${s.name}: 轨道${s.count} vs 表${rail.total[s.name]}`).join('; ')
      : `${rail?.stages?.length ?? 0} 道全对`
  )

  /* ---------- 11. 显示范围与可用性筛选 ---------- */
  console.log('\n【11 显示范围与可用性筛选】')
  const filter = await cdp.evaluate(`(async () => {
    const readTable = () => {
      const table = document.querySelector('.jig-table')
      return {
        rows: table ? table.querySelectorAll('tbody tr').length : 0,
        heads: [...(table?.querySelectorAll('thead th') ?? [])].map(th => th.textContent.trim())
      }
    }
    const before = readTable()
    // 可用性分段：点「可用」
    const availBtns = [...document.querySelectorAll('.segmented-item')]
    const availBtn = availBtns.find(b => b.textContent.includes('可用') && !b.textContent.includes('非'))
    availBtn?.click()
    await new Promise(r => setTimeout(r, 800))
    const afterAvail = readTable()
    const counts = [...document.querySelectorAll('.jig-toolbar-count')].map(c => c.textContent.trim())

    // 切回全部
    availBtns.find(b => b.textContent.trim().startsWith('全部'))?.click()
    await new Promise(r => setTimeout(r, 800))
    const afterAll = readTable()

    return { before, afterAvail, afterAll, counts }
  })()`)
  check(
    '可用性分段有三档且带计数',
    (filter?.counts?.length ?? 0) === 3,
    (filter?.counts ?? []).join(' / ')
  )
  check(
    '切「可用」后表格变了',
    filter?.before?.rows !== filter?.afterAvail?.rows,
    `${filter?.before?.rows} → ${filter?.afterAvail?.rows} 行`
  )
  check(
    '切回「全部」后行数复原',
    filter?.afterAll?.rows === filter?.before?.rows,
    `${filter?.afterAll?.rows} 行`
  )
  check(
    '「可用」档的表头只剩五道可用工序',
    (filter?.afterAvail?.heads ?? []).length < (filter?.before?.heads ?? []).length,
    `${(filter?.before?.heads ?? []).length} → ${(filter?.afterAvail?.heads ?? []).length} 列`
  )
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
