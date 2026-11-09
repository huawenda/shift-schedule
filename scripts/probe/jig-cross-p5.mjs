#!/usr/bin/env node
/**
 * P5 交叉验证 —— 原项目 vs 移植后，比对**下钻定位逻辑**。
 *
 * P1 已经验证过 `drillPivotRows`（原样平移，逐字节一致）。P5 新写的是
 * **点一个格子 → 推出定位键与面包屑**这段逻辑（`openDrill`），
 * 它决定了下钻能钻到哪、面包屑怎么显示。这段必须与原项目一致。
 *
 * 做法：同一份 500 行真实夹具、同一张透视表，两边各自对**每一个格子**
 * 点一遍，比对推出的 {pn, cst, eng} 三个键与面包屑数组。
 *
 *   node scripts/probe/jig-cross-p5.mjs [--orig=<原项目路径>]
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as esbuild from 'esbuild'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ORIG = (() => {
  const found = process.argv.slice(2).find(a => a.startsWith('--orig='))
  return found ? path.resolve(found.slice('--orig='.length)) : 'D:\\Dev\\JIG-Data-Finder'
})()

const FIXTURE = path.join(
  ROOT,
  'src',
  'features',
  'jig',
  '__tests__',
  'fixtures',
  'test-500.xlsx'
)

if (!fs.existsSync(path.join(ORIG, 'src', 'core', 'pivot.ts'))) {
  console.error(`原项目不在 ${ORIG}`)
  process.exit(1)
}

/**
 * 同一段比对脚本，两处跑。
 *
 * 原项目那边没有 `openDrill`（它在 App.tsx 里），所以这里**复刻**它的逻辑
 * —— 逐字照抄 App.tsx 的 openDrill + resolvePivotPns。
 * 移植后那边直接调用 `core/drill.ts` 的 openDrill。
 *
 * 这样比的是「原项目的逻辑」与「移植后的逻辑」的产出，不是同一份代码自比。
 */
const SCRIPT = `
import { readFileSync } from 'node:fs'

const CORE = {
  pivot: await import('__CORE__/pivot.ts'),
  query: await import('__CORE__/query.ts'),
  config: await import('__CORE__/config.ts'),
}

const SIDE = process.env.JIG_SIDE
const data = JSON.parse(readFileSync(process.env.JIG_ROWS_FILE, 'utf8'))

const cfg = CORE.config.createDefaultConfig
  ? CORE.config.createDefaultConfig()
  : CORE.config.createDefaultJigConfig()
const rows = data.rows

// --- 原项目的 filterActive（App.tsx 私有函数），逐字复刻 ---
function filterActive(rs, c) {
  const col = c.jigStatusColumn
  if (!rs.some((r) => col in r)) return rs
  return rs.filter((r) => r[col] === c.jigStatusActiveValue)
}

// --- 原项目的 resolvePivotPns（App.tsx 私有函数），逐字复刻 ---
function resolvePivotPns(table, keywordTotal) {
  const out = []
  let current = ''
  for (const r of table.rows) {
    if (r['CST ID'] === CORE.pivot.SUMMARY_CST) current = r['P/N'] ?? ''
    out.push(r['P/N'] === keywordTotal ? '' : r['P/N'] || current)
  }
  return out
}

const activeRows = filterActive(rows, cfg)

// --- 当前要验证的透视表：全部数据范围（scope='all'）---
const currentPivot = CORE.pivot.generatePivot(activeRows, false, cfg)
const pivotViewPns = resolvePivotPns(currentPivot, cfg.keywordTotal)

/**
 * 原项目的 openDrill（App.tsx），逐字复刻。
 * 移植后那边不用这段，直接调 core/drill.ts 的 openDrill。
 */
function openDrillOrig(from, rowIndex, column, table, viewPns, scopePn, scopeIsProd) {
  const row = table.rows[rowIndex]
  if (!row) return null

  const isTotalRow = row['P/N'] === cfg.keywordTotal
  const isSub = row['CST ID'] === CORE.pivot.SUMMARY_CST
  const pn = scopePn || (isTotalRow ? '' : viewPns[rowIndex] ?? '')

  const key = {}
  if (pn) key.pn = pn
  if (!isTotalRow && !isSub) key.cst = row['CST ID']
  if (column !== cfg.keywordTotal) key.eng = column

  const base = from === 'pivot'
    ? (scopeIsProd ? '全量透视 · 生产中' : '全量透视')
    : '结果透视'

  const crumbs = [base]
  if (key.pn) crumbs.push(key.pn)
  if (key.cst) crumbs.push(key.cst)
  else if (key.pn) crumbs.push('全部 CST')
  if (key.eng) crumbs.push(key.eng)
  else if (key.pn) crumbs.push('全部工序')
  if (!key.pn && !key.cst && !key.eng) crumbs.push('全表')

  return { from, key, crumbs, filterProduction: from === 'pivot' && scopeIsProd }
}

const out = { cells: [], rowCount: currentPivot.rows.length, colCount: currentPivot.columns.length }

__DRILL_BRANCH__

console.log(JSON.stringify(out))
`

/**
 * 两个分支的模板。
 *
 * 分成两段而不是一个带 if 的脚本：esbuild 会静态解析所有 import，
 * 原项目侧没有 core/drill.ts，写成字面量 import 会直接报「无法解析」。
 */
const BRANCH_ORIG = `
  // 原项目：逐格复刻 openDrill
  for (let rowIndex = 0; rowIndex < currentPivot.rows.length; rowIndex++) {
    for (const column of currentPivot.columns) {
      const d = openDrillOrig('pivot', rowIndex, column, currentPivot, pivotViewPns, '', false)
      out.cells.push(d ? { key: d.key, crumbs: d.crumbs, filterProduction: d.filterProduction } : null)
    }
  }
`

const BRANCH_PORT = `
  // 移植后：调用 core/drill.ts 的 openDrill
  const drillMod = await import('__DRILL__/drill.ts')
  for (let rowIndex = 0; rowIndex < currentPivot.rows.length; rowIndex++) {
    for (const column of currentPivot.columns) {
      const d = drillMod.openDrill({
        rowIndex,
        column,
        from: 'pivot',
        table: currentPivot,
        viewPns: pivotViewPns,
        scopePn: '',
        scopeIsProd: false,
        config: cfg
      })
      out.cells.push(d ? { key: d.key, crumbs: d.crumbs, filterProduction: d.filterProduction } : null)
    }
  }
`

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jig-cross-p5-'))

/** 读夹具成行数据（与 P4 脚本同一套） */
const rowsFile = path.join(tmpDir, 'rows.json')
{
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const XLSX = require('xlsx-js-style')
  const wb = XLSX.read(fs.readFileSync(FIXTURE), { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
  const headerRow = XLSX.utils.sheet_to_json(ws, { header: 1 })[0]
  const columns = (Array.isArray(headerRow) ? headerRow : []).map(c =>
    String(c ?? '').trim()
  )
  const rows = raw.map(rec => {
    const out = {}
    for (const c of columns) {
      const v = rec[c]
      out[c] = v === undefined || v === null ? '' : String(v)
    }
    return out
  })
  fs.writeFileSync(rowsFile, JSON.stringify({ columns, rows }), 'utf8')
}

async function run(side, coreDir, drillDir, resolveDir) {
  const branch = side === 'orig' ? BRANCH_ORIG : BRANCH_PORT
  const source = SCRIPT.replace('__DRILL_BRANCH__', branch)
    .replaceAll('__CORE__', coreDir.replace(/\\/g, '/'))
    .replaceAll('__DRILL__', drillDir.replace(/\\/g, '/'))

  const result = await esbuild.build({
    bundle: true,
    format: 'esm',
    platform: 'node',
    stdin: { contents: source, resolveDir, sourcefile: `cross-${side}.ts` },
    write: false,
    logLevel: 'silent'
  })

  const outFile = path.join(tmpDir, `cross-${side}.mjs`)
  fs.writeFileSync(outFile, result.outputFiles[0].text, 'utf8')

  const res = spawnSync(process.execPath, [outFile], {
    encoding: 'utf8',
    env: { ...process.env, JIG_ROWS_FILE: rowsFile, JIG_SIDE: side }
  })

  if (res.status !== 0) {
    console.error(`[${side}] 退出码 ${res.status}`)
    console.error(res.stdout)
    console.error(res.stderr)
    process.exit(1)
  }

  const lines = res.stdout.trim().split(/\r?\n/)
  return JSON.parse(lines[lines.length - 1])
}

console.log('原项目：', ORIG)
console.log('夹具：  ', FIXTURE)
console.log('')

const orig = await run('orig', path.join(ORIG, 'src', 'core'), ORIG, ORIG)
const port = await run(
  'port',
  path.join(ROOT, 'src', 'features', 'jig', 'core'),
  path.join(ROOT, 'src', 'features', 'jig', 'core'),
  ROOT
)

let failures = 0
function check(label, ok, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures += 1
}

console.log('【1 透视表规模】')
check(
  '透视表行列数一致',
  orig.rowCount === port.rowCount && orig.colCount === port.colCount,
  `${orig.rowCount}×${orig.colCount} / ${port.rowCount}×${port.colCount}`
)

console.log('\n【2 逐格下钻定位】')
const total = orig.cells.length
let mismatch = 0
const samples = []
for (let i = 0; i < total; i += 1) {
  const a = JSON.stringify(orig.cells[i])
  const b = JSON.stringify(port.cells[i])
  if (a !== b) {
    mismatch += 1
    if (samples.length < 5) samples.push(`#${i}: ${a} ≠ ${b}`)
  }
}
check(`全部 ${total} 个格子的定位键与面包屑一致`, mismatch === 0, `${mismatch} 处不一致`)
for (const s of samples) console.log(`        ${s}`)

// 抽查几条面包屑的实际内容，便于人工确认
console.log('\n【3 面包屑抽样】')
const picks = [0, 1, total - 1, Math.floor(total / 2)]
for (const i of picks) {
  const c = port.cells[i]
  console.log(`  #${i}: ${c ? c.crumbs.join(' › ') : '(不下钻)'}`)
}

fs.rmSync(tmpDir, { recursive: true, force: true })

console.log('')
console.log(failures === 0 ? '结果：全部一致' : `结果：${failures} 处不一致`)
process.exit(failures === 0 ? 0 : 1)
