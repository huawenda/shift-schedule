#!/usr/bin/env node
/**
 * P4 交叉验证 —— 原项目 vs 移植后，逐值比对。
 *
 * P4 的验收标准是「与原项目数值一致」。做法是**同一份 500 行真实 MES 夹具**
 * 同时喂给两套代码，比对：
 *
 *   1. 生产中过滤后的行数（filterActive）
 *   2. P/N 候选列表
 *   3. 全部范围 / 生产中范围 / 每个 P/N 范围 × 可用/非可用两档的透视表（逐值）
 *   4. 可用性分档计数（三档）
 *   5. 工序轨道各道工序的计数
 *
 * 两边各打一个包跑：原项目用 `D:\Dev\JIG-Data-Finder\src\core`，
 * 移植后用本项目 `src\features\jig\core`。**只有 core 不同**，
 * 夹具、算法调用、口径复刻全是同一段脚本 —— 这样比对才有意义。
 *
 * 打包用 esbuild（两边都装了），跑用 node。
 *
 *   node scripts/probe/jig-cross-p4.mjs [--orig=<原项目路径>]
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

if (!fs.existsSync(FIXTURE)) {
  console.error(`找不到夹具：${FIXTURE}`)
  process.exit(1)
}
if (!fs.existsSync(path.join(ORIG, 'src', 'core', 'pivot.ts'))) {
  console.error(`原项目不在 ${ORIG}`)
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * 同一段脚本，两处跑。差别只有 import 路径（用 __CORE__ 占位替换）。
 * ------------------------------------------------------------------ */

const SCRIPT = `
import { readFileSync } from 'node:fs'

const CORE = {
  pivot: await import('__CORE__/pivot.ts'),
  query: await import('__CORE__/query.ts'),
  config: await import('__CORE__/config.ts'),
}

// 源行由驱动脚本读好后传进来 —— 不用在包里 bundle xlsx（CJS 动态 require
// 在 ESM bundle 里会炸），而且两边拿到的输入**逐字节相同**，比对才干净。
const data = JSON.parse(readFileSync(process.env.JIG_ROWS_FILE, 'utf8'))

const cfg = CORE.config.createDefaultConfig
  ? CORE.config.createDefaultConfig()
  : CORE.config.createDefaultJigConfig()

// 原项目的 filterActive 是 App.tsx 里的私有函数，这里逐字复刻一份
function filterActive(rows, c) {
  const col = c.jigStatusColumn
  if (!rows.some((r) => col in r)) return rows
  return rows.filter((r) => r[col] === c.jigStatusActiveValue)
}

const activeRows = filterActive(data.rows, cfg)

// 工序顺序
const stageNames = Object.entries(cfg.engineeringConfig)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([name]) => name)

const out = {}
out.totalRows = data.rows.length
out.activeRows = activeRows.length

function pivotScopePn(scope) { return scope.startsWith('pn:') ? scope.slice(3) : '' }
function isProd(scope) { return scope === 'prod' }

function computeScope(scope, avail) {
  const pn = pivotScopePn(scope)
  const countRows = (() => {
    const prepared = CORE.pivot.preparePivotRows(activeRows, isProd(scope), cfg)
    return pn ? prepared.filter((r) => r['P/N'] === pn) : prepared
  })()
  const availCounts = CORE.pivot.countStageCategories(countRows, cfg)
  const baseRows = CORE.pivot.filterRowsByStageCategory(
    pn ? activeRows.filter((r) => r['P/N'] === pn) : activeRows,
    avail,
    cfg,
  )
  const table = CORE.pivot.generatePivot(baseRows, isProd(scope), cfg)
  return { table, availCounts, baseRows: baseRows.length }
}

// P/N 候选
const pnOptions = []
{
  const all = CORE.pivot.generatePivot(activeRows, false, cfg)
  for (const r of all.rows) {
    const pn = r['P/N']
    if (r['CST ID'] === CORE.pivot.SUMMARY_CST && pn && pn !== cfg.keywordTotal) pnOptions.push(pn)
  }
}
out.pnOptions = pnOptions

// 各范围 × 各档
out.scopes = {}
for (const scope of ['all', 'prod', ...pnOptions.map((pn) => 'pn:' + pn)]) {
  out.scopes[scope] = {}
  for (const avail of ['all', 'available', 'unavailable']) {
    const r = computeScope(scope, avail)
    out.scopes[scope][avail] = {
      columns: r.table.columns,
      rows: r.table.rows,
      availCounts: r.availCounts,
      baseRows: r.baseRows,
    }
  }
}

// 工序轨道计数
out.stages = {}
for (const scope of ['all', 'prod', ...pnOptions.map((pn) => 'pn:' + pn)]) {
  const t = computeScope(scope, 'all').table
  const totalRow = t.rows[t.rows.length - 1]
  const counts = {}
  for (const name of stageNames) {
    const raw = totalRow ? totalRow[name] : undefined
    const n = raw === undefined || raw === '' ? 0 : Number(raw)
    counts[name] = Number.isFinite(n) ? n : 0
  }
  out.stages[scope] = counts
}

console.log(JSON.stringify(out))
`

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jig-cross-'))

/**
 * 先把夹具读成行数据（用本项目的 xlsx-js-style，与产品读文件走同一套库）。
 * 读一次，两边共用 —— 输入逐字节相同，比对才有意义。
 */
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

async function run(side, coreDir, resolveDir) {
  const source = SCRIPT.replaceAll('__CORE__', coreDir.replace(/\\/g, '/'))

  const result = await esbuild.build({
    bundle: true,
    format: 'esm',
    platform: 'node',
    stdin: {
      contents: source,
      resolveDir,
      sourcefile: `cross-${side}.ts`
    },
    write: false,
    logLevel: 'silent'
  })

  const outFile = path.join(tmpDir, `cross-${side}.mjs`)
  fs.writeFileSync(outFile, result.outputFiles[0].text, 'utf8')

  const res = spawnSync(process.execPath, [outFile], {
    encoding: 'utf8',
    env: { ...process.env, JIG_ROWS_FILE: rowsFile }
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

const orig = await run('orig', path.join(ORIG, 'src', 'core'), ORIG)
const port = await run(
  'port',
  path.join(ROOT, 'src', 'features', 'jig', 'core'),
  ROOT
)

/* ------------------------------------------------------------------ */

let failures = 0
function check(label, ok, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures += 1
}

console.log('【1 生产中过滤】')
check('总行数一致', orig.totalRows === port.totalRows, `${orig.totalRows} / ${port.totalRows}`)
check(
  '生产中行数一致',
  orig.activeRows === port.activeRows,
  `${orig.activeRows} / ${port.activeRows}`
)

console.log('\n【2 P/N 候选】')
check(
  'P/N 候选列表一致',
  JSON.stringify(orig.pnOptions) === JSON.stringify(port.pnOptions),
  `${orig.pnOptions.length} / ${port.pnOptions.length} 个`
)

console.log('\n【3 各范围 × 各可用性档的透视表】')
const scopeKeys = Object.keys(orig.scopes)
let compared = 0
let mismatch = 0
for (const scope of scopeKeys) {
  for (const avail of ['all', 'available', 'unavailable']) {
    const a = orig.scopes[scope][avail]
    const b = port.scopes?.[scope]?.[avail]
    compared += 1
    if (!b) {
      mismatch += 1
      continue
    }
    const same =
      JSON.stringify(a.columns) === JSON.stringify(b.columns) &&
      JSON.stringify(a.rows) === JSON.stringify(b.rows) &&
      JSON.stringify(a.availCounts) === JSON.stringify(b.availCounts) &&
      a.baseRows === b.baseRows
    if (!same) mismatch += 1
  }
}
check(`${compared} 组范围×档位逐值一致`, mismatch === 0, `${mismatch} 组不一致`)

console.log('\n【4 工序轨道计数】')
let stageMismatch = 0
for (const scope of Object.keys(orig.stages)) {
  if (
    JSON.stringify(orig.stages[scope]) !==
    JSON.stringify(port.stages?.[scope])
  ) {
    stageMismatch += 1
  }
}
check(
  `所有范围的工序计数一致`,
  stageMismatch === 0,
  `${Object.keys(orig.stages).length} 个范围，${stageMismatch} 处不一致`
)

fs.rmSync(tmpDir, { recursive: true, force: true })

console.log('')
console.log(failures === 0 ? '结果：全部一致' : `结果：${failures} 处不一致`)
process.exit(failures === 0 ? 0 : 1)
