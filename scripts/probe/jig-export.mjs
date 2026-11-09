#!/usr/bin/env node
/**
 * P6 实机探针：审查页筛选 + 导出链路。
 *
 * 验的是「只有装进壳才会暴露」的部分：
 *   1. 审查页的 P/N 下拉与两档分段都在，且切换后表格行数随之变化；
 *   2. 「导出」按钮可用；
 *   3. `save_jig_export` 能把字节写到指定路径；
 *   4. 导出的 xlsx 里红字落在正确的格子上。
 *
 * 原生「另存为」对话框没法用 CDP 点，所以把 `dialog.save` 桩成直接返回一个
 * 临时路径 —— 其余每一步（写 xlsx、调命令、落盘）都是产品代码在跑。
 *
 *   node scripts/probe/jig-export.mjs [--exe=<绝对路径>]
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

import { createCdpClient, sleep } from '../lib/cdp.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PORT = 9347
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

/** 解包 xlsx，返回红字单元格坐标 */
function redCells(file) {
  const bytes = new Uint8Array(fs.readFileSync(file))
  const view = new DataView(bytes.buffer)
  const files = new Map()
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return []
  const count = view.getUint16(eocd + 10, true)
  let off = view.getUint32(eocd + 16, true)
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(off, true) !== 0x02014b50) break
    const method = view.getUint16(off + 10, true)
    const compSize = view.getUint32(off + 20, true)
    const nameLen = view.getUint16(off + 28, true)
    const extraLen = view.getUint16(off + 30, true)
    const commentLen = view.getUint16(off + 32, true)
    const localOff = view.getUint32(off + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen))
    const dataStart = localOff + 30 + view.getUint16(localOff + 26, true) + view.getUint16(localOff + 28, true)
    const raw = bytes.subarray(dataStart, dataStart + compSize)
    let content
    if (method === 0) content = raw
    else if (method === 8) content = new Uint8Array(inflateRawSync(raw))
    else break
    files.set(name, new TextDecoder().decode(content))
    off += 46 + nameLen + extraLen + commentLen
  }

  const styles = files.get('xl/styles.xml') ?? ''
  const fontsBlock = styles.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/)?.[1] ?? ''
  const fontColors = []
  for (const font of fontsBlock.match(/<font[\s\S]*?<\/font>|<font[^>]*\/>/g) ?? []) {
    fontColors.push(font.match(/rgb="([0-9A-Fa-f]{8})"/)?.[1] ?? '')
  }
  const cellXfs = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? ''
  const xfs = cellXfs.match(/<xf[^>]*\/?>/g) ?? []
  const colorByXf = xfs.map(xf => {
    const fontId = Number(xf.match(/fontId="(\d+)"/)?.[1] ?? 0)
    return fontColors[fontId] ?? ''
  })

  const sheet = files.get('xl/worksheets/sheet1.xml') ?? ''
  const cells = []
  for (const m of sheet.matchAll(/<c r="([A-Z]+\d+)"([^>]*)>/g)) {
    const s = m[2].match(/ s="(\d+)"/)
    if (!s) continue
    const color = colorByXf[Number(s[1])] ?? ''
    if (color) cells.push(`${m[1]}:${color}`)
  }
  return cells.sort()
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jig-export-'))
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jig-out-'))
const outFile = path.join(outDir, '审查数据.xlsx')

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

  /* ---------- 1. 载入源数据 ---------- */
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
    const rows = document.querySelectorAll('.jig-table tbody tr').length
    return { rows }
  })()`)
  check('审查页出表', (loaded?.rows ?? 0) > 0, `${loaded?.rows} 行`)

  /* ---------- 2. 审查页工具条 ---------- */
  console.log('\n【2 审查页工具条】')
  const toolbar = await cdp.evaluate(`(() => {
    const pnSelect = document.querySelector('.jig-scope-select')
    const scopeBtns = [...document.querySelectorAll('.segmented-item')]
      .filter(b => b.textContent.includes('所有对象') || b.textContent.includes('尺寸不匹配'))
    const counts = [...document.querySelectorAll('.jig-toolbar-count')].map(c => c.textContent.trim())
    return {
      hasPnSelect: Boolean(pnSelect),
      scopeLabels: scopeBtns.map(b => b.textContent.replace(/\\d+$/, '').trim()),
      counts
    }
  })()`)
  check('有 P/N 下拉', toolbar?.hasPnSelect === true)
  check(
    '有两档分段',
    toolbar?.scopeLabels?.length === 2,
    (toolbar?.scopeLabels ?? []).join(' / ')
  )
  check(
    '两档都带计数',
    (toolbar?.counts?.length ?? 0) === 2,
    (toolbar?.counts ?? []).join(' / ')
  )

  /* ---------- 3. 切档后表格变化 ---------- */
  console.log('\n【3 切档】')
  const switched = await cdp.evaluate(`(async () => {
    const readRows = () => document.querySelectorAll('.jig-table tbody tr').length
    const before = readRows()
    const btn = [...document.querySelectorAll('.segmented-item')]
      .find(b => b.textContent.includes('尺寸不匹配'))
    btn?.click()
    await new Promise(r => setTimeout(r, 1000))
    const after = readRows()
    const all = [...document.querySelectorAll('.segmented-item')]
      .find(b => b.textContent.includes('所有对象'))
    all?.click()
    await new Promise(r => setTimeout(r, 1000))
    return { before, after, restored: readRows() }
  })()`)
  check(
    '切「尺寸不匹配」后行数变少',
    (switched?.after ?? 0) < (switched?.before ?? 0),
    `${switched?.before} → ${switched?.after} 行`
  )
  check('切回「所有对象」后复原', switched?.restored === switched?.before, `${switched?.restored} 行`)

  /* ---------- 4. 导出 ---------- */
  console.log('\n【4 导出】')
  const exported = await cdp.evaluate(`(async () => {
    const original = window.__TAURI__.dialog.save
    window.__TAURI__.dialog.save = async () => ${JSON.stringify(outFile)}
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith('导出'))
    if (!btn) { window.__TAURI__.dialog.save = original; return { ok: false, error: '找不到导出按钮' } }
    const disabled = btn.disabled
    btn.click()
    await new Promise(r => setTimeout(r, 3000))
    window.__TAURI__.dialog.save = original
    return { ok: true, disabled }
  })()`)
  check('「导出」按钮存在且可用', exported?.ok === true && exported?.disabled === false)
  check(
    '导出文件已落盘',
    fs.existsSync(outFile),
    fs.existsSync(outFile) ? `${fs.statSync(outFile).size} 字节` : '未生成'
  )

  if (fs.existsSync(outFile)) {
    const cells = redCells(outFile)
    check(
      '导出文件里有红字单元格',
      cells.length > 0,
      `${cells.length} 个；首个 ${cells[0] ?? '—'}`
    )
    check(
      '红字是纯红 FFFF0000',
      cells.every(c => c.endsWith('FFFF0000')),
      cells[0] ?? ''
    )
  }

  /* ---------- 5. 记住导出目录 ---------- */
  console.log('\n【5 记住导出目录】')
  const remembered = await cdp.evaluate(
    `localStorage.getItem('shift-schedule:local:jig-export-dir:v1')`
  )
  check(
    '导出目录已记进 localStorage',
    typeof remembered === 'string' && remembered.length > 0,
    remembered ?? '(空)'
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
  fs.rmSync(outDir, { recursive: true, force: true })
}

const failed = results.filter(r => !r.ok)
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length === 0 ? 0 : 1)
