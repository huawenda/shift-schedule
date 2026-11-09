#!/usr/bin/env node
/**
 * P6 交叉验证 —— 原项目 vs 移植后，比对**审查页**与**导出文件**。
 *
 * P6 新写的是：
 *   1. 审查页的 P/N 过滤 + 两档视野（`core/reviewView.ts`）
 *   2. 导出目标的挑选（`core/export.ts`）
 *   3. 导出文件里的红色标记（`writeExcel` + `RedMark`）
 *
 * `writeExcel` 本身是 P1 原样平移的，但「哪些行标红」由新代码决定，
 * 所以必须比对导出的**实际文件内容**。
 *
 * 做法：同一份 500 行夹具、同一套配置，两边各自导出审查数据，
 * 然后**解包 xlsx 内部 XML**，比对 styles.xml 里的字体色与
 * sheet1.xml 里每个单元格的样式索引 —— 即红字落在哪些格子上。
 *
 *   node scripts/probe/jig-cross-p6.mjs [--orig=<原项目路径>]
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
 * 审查部分两边都复刻原项目的口径（原项目在 App.tsx 里），
 * 导出部分调各自的 writeExcel —— 那才是要验证的产物。
 */
const SCRIPT = `
import { readFileSync } from 'node:fs'

const CORE = {
  pivot: await import('__CORE__/pivot.ts'),
  query: await import('__CORE__/query.ts'),
  config: await import('__CORE__/config.ts'),
  review: await import('__CORE__/review.ts'),
  validate: await import('__CORE__/validate.ts'),
  excel: await import('__CORE__/excel.ts'),
}

const SIDE = process.env.JIG_SIDE
const data = JSON.parse(readFileSync(process.env.JIG_ROWS_FILE, 'utf8'))

const cfg = CORE.config.createDefaultConfig
  ? CORE.config.createDefaultConfig()
  : CORE.config.createDefaultJigConfig()
const rows = data.rows

const rules = CORE.validate.rulesFromConfig(cfg)
const reviewAll = CORE.query.processSourceData(rows, cfg)

// --- 原项目的审查页逻辑（App.tsx），逐字复刻 ---
function reviewByPnOrig(pnFilter) {
  if (reviewAll.rows.length === 0) return { columns: [], rows: [] }
  if (pnFilter === '全部') return reviewAll
  return {
    columns: reviewAll.columns,
    rows: reviewAll.rows.filter((r) => r['P/N'] === pnFilter),
  }
}

function reviewCountsOrig(kinds, table) {
  return {
    all: table.rows.length,
    mismatch: kinds.filter((k) => CORE.review.isFlagged(k)).length,
  }
}

function reviewFilteredOrig(table, scope, kinds) {
  const flags = kinds.map((k) => CORE.review.isFlagged(k))
  if (scope === 'all' || kinds.length === 0) {
    return { table, flags }
  }
  const outRows = []
  const outFlags = []
  table.rows.forEach((r, i) => {
    if (CORE.review.matchesScope(kinds[i], scope)) {
      outRows.push(r)
      outFlags.push(true)
    }
  })
  return { table: { columns: table.columns, rows: outRows }, flags: outFlags }
}

const uniquePns = (() => {
  if (reviewAll.rows.length === 0) return []
  const set = new Set()
  for (const r of reviewAll.rows) {
    const v = r['P/N']
    if (v && v !== CORE.query.NOT_FOUND) set.add(v)
  }
  return [...set].sort()
})()

const out = { pnOptions: uniquePns, scopes: {}, exports: {} }

for (const pn of ['全部', ...uniquePns]) {
  const byPn = reviewByPnOrig(pn)
  const kinds = CORE.review.classifyReviewTable(byPn, rules)
  for (const scope of ['all', 'mismatch']) {
    const counts = reviewCountsOrig(kinds, byPn)
    const filtered = reviewFilteredOrig(byPn, scope, kinds)
    out.scopes[pn + '/' + scope] = {
      counts,
      columns: filtered.table.columns,
      rows: filtered.table.rows,
      flags: filtered.flags,
    }
  }
}

// --- 导出：把审查数据（全量 + 尺寸不匹配档）写成 xlsx ---
for (const scope of ['all', 'mismatch']) {
  const byPn = reviewByPnOrig('全部')
  const kinds = CORE.review.classifyReviewTable(byPn, rules)
  const filtered = reviewFilteredOrig(byPn, scope, kinds)
  const buffer = await CORE.excel.writeExcel(
    filtered.table,
    { rows: filtered.flags, column: '对应尺寸' },
  )
  // 传 base64，驱动脚本那边解包比对
  out.exports[scope] = Buffer.from(buffer).toString('base64')
}

console.log(JSON.stringify(out))
`

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jig-cross-p6-'))

/** 读夹具成行数据 */
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
    stdin: { contents: source, resolveDir, sourcefile: `cross-${side}.ts` },
    write: false,
    logLevel: 'silent',
    // xlsx-js-style 是 CJS，bundle 成 ESM 时它内部的 require('stream') 会炸。
    // 给 bundle 注入一个基于 createRequire 的 require，Node 侧就能正常跑。
    banner: {
      js: [
        "import { createRequire as __wbCreateRequire } from 'node:module';",
        "const require = __wbCreateRequire(import.meta.url);"
      ].join('\n')
    }
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

/* ------------------------------------------------------------------ *
 * 解包 xlsx，读出「哪些单元格是红字」。
 *
 * 不靠 xlsx 读回 —— xlsx-js-style 读文件时不还原 font.color，
 * 会把有样式的单元格误报成无样式。直接看 styles.xml + sheet1.xml。
 * ------------------------------------------------------------------ */
const { inflateRawSync } = await import('node:zlib')

function unzip(buf) {
  const bytes = new Uint8Array(buf)
  const view = new DataView(bytes.buffer)
  const out = new Map()
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 zip')
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
    else throw new Error(`不支持的压缩方式 ${method}`)
    out.set(name, new TextDecoder().decode(content))
    off += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** 读出所有红字单元格的坐标 */
function redCells(base64) {
  const buf = Buffer.from(base64, 'base64')
  const files = unzip(buf)

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
    const ref = m[1]
    const attrs = m[2]
    const s = attrs.match(/ s="(\d+)"/)
    if (!s) continue
    const color = colorByXf[Number(s[1])] ?? ''
    if (color) cells.push(`${ref}:${color}`)
  }
  return cells.sort()
}

console.log('原项目：', ORIG)
console.log('夹具：  ', FIXTURE)
console.log('')

const orig = await run('orig', path.join(ORIG, 'src', 'core'), ORIG)
const port = await run('port', path.join(ROOT, 'src', 'features', 'jig', 'core'), ROOT)

let failures = 0
function check(label, ok, detail = '') {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures += 1
}

console.log('【1 P/N 候选】')
check(
  'P/N 候选列表一致',
  JSON.stringify(orig.pnOptions) === JSON.stringify(port.pnOptions),
  `${orig.pnOptions.length} / ${port.pnOptions.length} 个`
)

console.log('\n【2 审查页各 P/N × 各档】')
const scopeKeys = Object.keys(orig.scopes)
let scopeMismatch = 0
for (const key of scopeKeys) {
  const a = orig.scopes[key]
  const b = port.scopes[key]
  const same =
    b &&
    JSON.stringify(a.counts) === JSON.stringify(b.counts) &&
    JSON.stringify(a.columns) === JSON.stringify(b.columns) &&
    JSON.stringify(a.rows) === JSON.stringify(b.rows) &&
    JSON.stringify(a.flags) === JSON.stringify(b.flags)
  if (!same) {
    scopeMismatch += 1
    if (scopeMismatch <= 3) {
      console.log(`        ${key}: 原 ${a.counts?.all ?? '?'} 行 / 本 ${b?.counts?.all ?? '?'} 行`)
    }
  }
}
check(`${scopeKeys.length} 组「P/N × 档位」逐值一致`, scopeMismatch === 0, `${scopeMismatch} 组不一致`)

console.log('\n【3 导出文件的红字位置】')
for (const scope of ['all', 'mismatch']) {
  const a = redCells(orig.exports[scope])
  const b = redCells(port.exports[scope])
  const same = JSON.stringify(a) === JSON.stringify(b)
  check(
    `档位「${scope}」的导出文件红字一致`,
    same,
    same ? `${a.length} 个红字单元格` : `原 ${a.length} / 本 ${b.length}，首个差异 ${a.find((x, i) => x !== b[i]) ?? '—'}`
  )
}

fs.rmSync(tmpDir, { recursive: true, force: true })

console.log('')
console.log(failures === 0 ? '结果：全部一致' : `结果：${failures} 处不一致`)
process.exit(failures === 0 ? 0 : 1)
