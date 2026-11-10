#!/usr/bin/env node
/**
 * 生成速查页的静态数据。
 *
 * 输入（都是已验收的业务表）：
 *   docs/JIG-FSPM-属性表.xlsx / 属性表
 *   docs/JIG-查询表.xlsx / JIG 组合、组合-FSPM 明细
 * 输出：
 *   src/features/lookup/data/lookupData.ts
 *
 * 运行时不读 Excel：生成物提交进仓库，保证 file:// 离线可用。
 * 改表后手动跑 `pnpm lookup:data`。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const attrFile = path.join(root, 'docs/JIG-FSPM-属性表.xlsx')
const queryFile = path.join(root, 'docs/JIG-查询表.xlsx')
const outFile = path.join(root, 'src/features/lookup/data/lookupData.ts')

function readSheet(file, sheet) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' })
  const ws = wb.Sheets[sheet]
  if (!ws) throw new Error(`${path.basename(file)} 缺少工作表「${sheet}」`)
  return XLSX.utils.sheet_to_json(ws, { defval: '' })
}

const str = v => String(v ?? '').trim()

// ---------- FSPM 属性 ----------
const fspm = {}
for (const r of readSheet(attrFile, '属性表')) {
  const id = str(r['材料型号'])
  if (!id) continue
  const entry = {
    id,
    size: str(r['尺寸']),
    maker: str(r['生产厂家']),
    material: str(r['材质']),
    bezel: str(r['Bezel']),
  }
  for (const key of ['size', 'maker', 'material', 'bezel']) {
    if (!entry[key]) throw new Error(`${id} 的 ${key} 为空`)
  }
  if (fspm[id]) throw new Error(`FSPM 重复：${id}`)
  fspm[id] = entry
}

// ---------- 组合 ----------
const groups = []
const groupById = new Map()
for (const r of readSheet(queryFile, 'JIG 组合')) {
  const id = str(r['组合ID'])
  if (!id) continue
  const inch = str(r['英寸组合'])
  const [mainSize, subSize] = inch.split('/')
  const models = str(r['GLS 型号（组内等同）'])
    .split('/')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
  const group = {
    id,
    inch,
    jigPn: str(r['JIG P/N']),
    recipe: str(r['Recipe']),
    mainSize: str(r['主尺寸']),
    subSize: str(r['副尺寸']),
    mainBezel: str(r['主 Bezel']),
    subBezel: str(r['副 Bezel']),
    models,
    mainFspm: [],
    subFspm: [],
    source: str(r['来源']),
  }
  if (group.mainSize !== mainSize || group.subSize !== subSize) {
    throw new Error(`${id} 的主/副尺寸与英寸组合不一致`)
  }
  if (groupById.has(id)) throw new Error(`组合重复：${id}`)
  groups.push(group)
  groupById.set(id, group)
}

for (const r of readSheet(queryFile, '组合-FSPM 明细')) {
  const id = str(r['组合ID'])
  const group = groupById.get(id)
  if (!group) throw new Error(`明细里的组合不存在：${id}`)
  const part = str(r['主/副'])
  const fid = str(r['FSPM 型号'])
  if (!fspm[fid]) throw new Error(`${id} 引用了不存在的 FSPM：${fid}`)
  const target = part === 'Main' ? group.mainFspm : part === 'Sub' ? group.subFspm : null
  if (!target) throw new Error(`${id} 的 Main/Sub 值非法：${part}`)
  if (!target.includes(fid)) target.push(fid)
  if (fspm[fid].size !== str(r['尺寸'])) {
    throw new Error(`${fid} 的属性尺寸与明细尺寸不一致`)
  }
}

groups.sort((a, b) => a.id.localeCompare(b.id))

// ---------- 校验 ----------
if (groups.length !== 47) throw new Error(`组合数应为 47，实际 ${groups.length}`)
const allModels = groups.flatMap(g => g.models)
const modelSet = new Set(allModels)
if (allModels.length !== modelSet.size) throw new Error('存在重复的 GLS 型号')
if (modelSet.size !== 110) throw new Error(`型号数应为 110，实际 ${modelSet.size}`)
if (Object.keys(fspm).length !== 92) throw new Error(`FSPM 数应为 92，实际 ${Object.keys(fspm).length}`)

const recipeToJig = new Map()
for (const g of groups) {
  if (!g.mainFspm.length || !g.subFspm.length) throw new Error(`${g.id} 缺少主/副 FSPM`)
  if (!g.models.length) throw new Error(`${g.id} 缺少型号`)
  if (recipeToJig.has(g.recipe) && recipeToJig.get(g.recipe) !== g.jigPn) {
    throw new Error(`Recipe ${g.recipe} 对应了多个 JIG P/N`)
  }
  recipeToJig.set(g.recipe, g.jigPn)
}

if (groups.some(g => g.jigPn === '7742D' && g.models.includes('CR'))) {
  throw new Error('已归档的 7742D CR 不应出现在数据里')
}

// ---------- 输出 ----------
const version = new Date().toISOString().slice(0, 10)
const lines = []
lines.push('/**')
lines.push(' * 速查页数据 —— 由 scripts/build-lookup-data.mjs 生成，不要手改。')
lines.push(' * 重新生成：pnpm lookup:data')
lines.push(` * 数据快照：${version}`)
lines.push(' */')
lines.push("import type { Fspm, LookupGroup } from '../core/types'")
lines.push('')
lines.push(`export const LOOKUP_DATA_VERSION = '${version}'`)
lines.push('')
lines.push(`export const LOOKUP_GROUPS: readonly LookupGroup[] = ${JSON.stringify(groups, null, 2)}`)
lines.push('')
lines.push(`export const FSPM_TABLE: Readonly<Record<string, Fspm>> = ${JSON.stringify(fspm, null, 2)}`)
lines.push('')

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, lines.join('\n'), 'utf8')

console.log(
  `lookup data: ${groups.length} 组 / ${modelSet.size} 型号 / ${Object.keys(fspm).length} FSPM → ${path.relative(root, outFile)}`,
)
