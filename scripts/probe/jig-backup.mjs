#!/usr/bin/env node
/**
 * P8 实机探针：备份往返带 JIG 配置。
 *
 * 验的是：
 *   1. 导出备份里带 `jig` 段（业务配置），且不含本机偏好；
 *   2. 备份文件版本是 6；
 *   3. 导入备份后 JIG 配置被回填（映射表恢复）；
 *   4. 改过映射后重启应用（重新读 localStorage）配置还在。
 *
 * 原生「保存/打开」对话框没法用 CDP 点，所以把 `dialog.save` 与
 * `dialog.open` 桩成直接返回指定路径 —— 落盘与读盘都是真代码在跑。
 *
 *   node scripts/probe/jig-backup.mjs [--exe=<绝对路径>]
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createCdpClient, sleep } from '../lib/cdp.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PORT = 9349
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

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jig-backup-'))
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jig-bk-'))
const backupFile = path.join(outDir, 'backup.json')

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

  // 塞一份最小花名册跳过向导；顺便设好备份目录 ——
  // 备份目录是在 hook 初始化时读的，必须在挂载前设好。
  await cdp.evaluate(`(() => {
    localStorage.setItem('shift-schedule:local:backup-dir:v1', ${JSON.stringify(outDir)})
    const roster = {
      members: [{ id: 'm-probe', name: '探针', patternId: '4F' }],
      groups: [], overrides: [], patterns: [], todos: [],
      profile: { memberId: 'm-probe', salary: { baseSalary: '6000', performanceAllowance: '0', positionAllowance: '0', socialFund: '0' } },
      updatedAt: Date.now()
    }
    localStorage.setItem('shift-schedule:local:roster:v2', JSON.stringify(roster))
    return true
  })()`)
  await cdp.send('Page.reload', { ignoreCache: false })
  await sleep(2500)

  /* ---------- 1. 改一处映射 ---------- */
  console.log('\n【1 改一处映射】')
  const changed = await cdp.evaluate(`(async () => {
    location.hash = '#/jig/review'
    await new Promise(r => setTimeout(r, 800))
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('型号尺寸匹配'))
    if (!btn) return { ok: false, error: '找不到按钮' }
    btn.click()
    await new Promise(r => setTimeout(r, 800))

    const sizeInputs = [...document.querySelectorAll('.jig-map-input')].filter((_, i) => i % 2 === 1)
    const target = sizeInputs[0]
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(target, '77/48')
    target.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 300))
    ;[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === '保存')?.click()
    await new Promise(r => setTimeout(r, 800))

    const stored = localStorage.getItem('shift-schedule:local:jig-config:v1')
    const parsed = stored ? JSON.parse(stored) : null
    const firstModel = parsed?.jigSizeMappingOrder?.[0]
    return { ok: true, firstModel, size: parsed?.jigSizeMapping?.[firstModel] }
  })()`)
  check('映射已改并写进 localStorage', changed?.size === '77/48', `${changed?.firstModel} → ${changed?.size}`)

  /* ---------- 2. 导出备份 ---------- */
  // 备份走的是「设了默认目录 → save_backup_to 命令写盘」这条路，
  // 不是 Tauri 的 save 对话框。所以先设目录，再把 invoke 桩掉自己写文件。
  console.log('\n【2 导出备份】')
  // 备份走的是壳里的 `save_backup_to` 命令（目录 + 文件名 → 写盘），
  // 这里**不桩** —— 让 Rust 侧真写，验的才是完整链路。
  const exported = await cdp.evaluate(`(async () => {
    // 备份按钮在顶栏，而 JIG 页有自己的顶栏（没有备份按钮）——
    // 先切到概览页再点。
    location.hash = '#/overview'
    await new Promise(r => setTimeout(r, 1000))

    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('导出备份'))
    if (!btn) return { ok: false, error: '找不到「导出备份」按钮' }
    btn.click()
    await new Promise(r => setTimeout(r, 2500))
    // 抓一下提示条（导出失败时会有说明）
    const toasts = [...document.querySelectorAll('[data-sonner-toast], .toast, [role="status"]')]
      .map(t => t.textContent.trim()).filter(Boolean)
    return { ok: true, toasts }
  })()`)
  check('点了导出备份', exported?.ok === true, exported?.error ?? (exported?.toasts ?? []).join(' | '))

  // 备份文件名带时间戳（昼夜-备份-20261109-1711.json），找目录下那个 json
  const written = fs.readdirSync(outDir).filter(f => f.endsWith('.json'))
  if (written.length > 0) {
    fs.copyFileSync(path.join(outDir, written[0]), backupFile)
  }
  check(
    '备份文件已落盘',
    fs.existsSync(backupFile),
    fs.existsSync(backupFile) ? `${fs.statSync(backupFile).size} 字节 · ${written.join(',')}` : '未生成'
  )

  /* ---------- 3. 检查备份内容 ---------- */
  console.log('\n【3 备份内容】')
  let backup = null
  if (fs.existsSync(backupFile)) {
    backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'))
  }
  check('版本号是 6', backup?.version === 6, `v${backup?.version}`)
  check('有 jig 段', backup?.jig !== undefined && backup?.jig !== null)
  check(
    'jig 段含映射表',
    backup?.jig?.jigSizeMapping && Object.keys(backup.jig.jigSizeMapping).length > 0,
    `${Object.keys(backup?.jig?.jigSizeMapping ?? {}).length} 条`
  )
  check(
    'jig 段不含本机偏好',
    backup?.jig &&
      !('sourceDir' in backup.jig) &&
      !('exportDir' in backup.jig) &&
      !('rowHeight' in backup.jig) &&
      !('clipboardAutoProcessEnabled' in backup.jig) &&
      !('exportTimestampEnabled' in backup.jig),
    Object.keys(backup?.jig ?? {}).filter(k =>
      ['sourceDir', 'exportDir', 'rowHeight', 'clipboardAutoProcessEnabled', 'exportTimestampEnabled'].includes(k)
    ).join(',') || '（无）'
  )
  check(
    '备份里的映射是改过的那份',
    backup?.jig?.jigSizeMapping?.[changed?.firstModel] === '77/48',
    `${changed?.firstModel} → ${backup?.jig?.jigSizeMapping?.[changed?.firstModel]}`
  )

  /* ---------- 4. 改掉本机配置，再导入备份恢复 ---------- */
  console.log('\n【4 导入备份恢复】')
  const backupText = fs.readFileSync(backupFile, 'utf8')
  const restored = await cdp.evaluate(`(async () => {
    const BACKUP_TEXT = ${JSON.stringify(backupText)}
    // 先把本机的映射改掉（模拟「这台机器的配置不对」）
    const raw = localStorage.getItem('shift-schedule:local:jig-config:v1')
    const cfg = raw ? JSON.parse(raw) : null
    const firstModel = cfg?.jigSizeMappingOrder?.[0]
    if (cfg && firstModel) {
      cfg.jigSizeMapping[firstModel] = '99/99'
      localStorage.setItem('shift-schedule:local:jig-config:v1', JSON.stringify(cfg))
    }

    // 导入备份
    const originalOpen = window.__TAURI__.dialog.open
    window.__TAURI__.dialog.open = async () => ${JSON.stringify(backupFile)}
    const input = document.querySelector('input[name="backup-file"]')
    if (!input) { window.__TAURI__.dialog.open = originalOpen; return { ok: false, error: '找不到备份文件输入框' } }

    // 用 DataTransfer 塞一个 File 进去 —— 备份内容从环境变量传进来
    const dt = new DataTransfer()
    dt.items.add(new File([BACKUP_TEXT], 'backup.json'))
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 2000))
    window.__TAURI__.dialog.open = originalOpen

    const after = localStorage.getItem('shift-schedule:local:jig-config:v1')
    const parsed = after ? JSON.parse(after) : null
    return {
      ok: true,
      model: firstModel,
      size: parsed?.jigSizeMapping?.[firstModel]
    }
  })()`)
  check(
    '导入后映射恢复成备份里的值',
    restored?.size === '77/48',
    `${restored?.model} → ${restored?.size}`
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
