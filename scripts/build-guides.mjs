#!/usr/bin/env node
/**
 * 从 docs/使用说明模板.txt 生成两份面向最终用户的说明：
 *   - public/使用说明.txt          → 静态版（会随 dist/ 一起分发）
 *   - desktop/绿色版使用说明.txt    → 绿色版（打包 zip 时使用）
 *
 * 模板里用 <<STATIC>> / <<DESKTOP>> ... <<END>> 标出各自专属的段落，
 * 公共正文只维护一份，避免改一处忘另一处。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(__dirname, '..')

const templatePath = path.join(projectDir, 'docs', '使用说明模板.txt')
const outputs = {
  static: path.join(projectDir, 'public', '使用说明.txt'),
  desktop: path.join(projectDir, 'desktop', '绿色版使用说明.txt')
}

const lines = fs.readFileSync(templatePath, 'utf8').split(/\r?\n/)

function render(variant) {
  const result = []
  let skipping = null

  for (const line of lines) {
    if (line === '<<STATIC>>' || line === '<<DESKTOP>>') {
      const block = line.slice(2, -2).toLowerCase()
      skipping = block === variant ? null : block
      continue
    }
    if (line === '<<END>>') {
      skipping = null
      continue
    }
    if (skipping !== null) continue
    result.push(line)
  }

  return result.join('\n')
}

for (const [variant, target] of Object.entries(outputs)) {
  fs.writeFileSync(target, render(variant), 'utf8')
  console.log(`已生成 ${path.relative(projectDir, target)}`)
}
