/**
 * 把 `src/data` 打包成小程序能直接 require 的 CommonJS 产物。
 *
 * 为什么不在两边各写一份：法定、出勤、半天事假、倍率这些口径每隔几天就会动一次，
 * 复制一份必然会漂移。这里让 `src/data` 保持唯一来源，小程序侧的 `lib/data` 只是构建产物，
 * 不进版本库（见 .gitignore）。
 *
 * 为什么每个模块单独打一个包：小程序用 CommonJS 按路径 require，
 * 保持目录结构比塞成一个大 bundle 更好定位；代价是共享模块会被内联多份，
 * 这点体积换「报错能指到具体文件」是划算的。
 */
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as esbuild from 'esbuild'

const SRC = 'src/data'
const OUT = 'miniapp/lib/data'

/** 收集需要打包的源文件：排除测试与类型声明 */
function collect(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collect(full, acc)
      continue
    }
    if (!entry.name.endsWith('.ts')) continue
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.d.ts')) continue
    acc.push(full)
  }
  return acc
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const files = collect(SRC)

await esbuild.build({
  entryPoints: files,
  outdir: OUT,
  outbase: SRC,
  bundle: true,
  format: 'cjs',
  platform: 'neutral',
  target: 'es2017',
  minify: true,
  keepNames: true,
  // 小程序没有 process.env，把环境判断折叠掉
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning'
})

let total = 0
for (const name of readdirSync(OUT, { recursive: true })) {
  const full = join(OUT, String(name))
  if (full.endsWith('.js')) total += statSync(full).size
}

/*
 * 产物是 CommonJS（小程序只认 require/module.exports），
 * 而仓库根 package.json 是 "type": "module" —— Node 会把这里的 .js 当成 ESM 并报
 * "module is not defined"。放一个只声明类型的 package.json 进产物目录即可：
 * Node 认它，微信开发者工具不读它。
 */
writeFileSync(join(OUT, 'package.json'), '{\n  "type": "commonjs"\n}\n')

console.log(`core 打包完成：${files.length} 个模块 → ${OUT}（${(total / 1024).toFixed(1)} KB）`)
