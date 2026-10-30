#!/usr/bin/env node
/**
 * 验证「隐藏滚动条但保留滚动能力」是否真的生效。
 *
 * 需求：月度概览溢出时允许滚，但不要出现滚动条。
 *
 * 要点：不能用 overflow: hidden —— 那会把滚动能力一起关掉，
 * 用户就彻底看不到下面的内容了。正确做法是把滚动条本身的
 * 绘制宽度设为 0（scrollbar-width: none / ::-webkit-scrollbar 全透明）。
 *
 * 这个脚本量三件事：
 *   1. 滚动条占位宽度（内高 - clientWidth）
 *   2. 程序化滚动是否可用（能滚 = 能力保留）
 *   3. ::-webkit-scrollbar 规则是否真的被应用
 */


import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launchHeadlessChrome } from '../lib/browser.mjs'
import { createCdpClient, waitForJsonEndpoint, waitFor, sleep } from '../lib/cdp.mjs'
import { readArg } from '../lib/cli.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(__dirname, '..', '..')

const PROBE = `(() => {
  const de = document.documentElement
  const before = window.scrollY
  window.scrollTo(0, 300)
  const after = window.scrollY
  window.scrollTo(0, before)

  const cs = getComputedStyle(de)
  return {
    scrollable: de.scrollHeight > de.clientHeight,
    gutter: de.scrollHeight - de.clientWidth,
    barWidth: de.offsetWidth - de.clientWidth,
    scrollbarWidth: cs.scrollbarWidth,
    scrollTopBefore: before,
    scrollTopAfter: after,
    canScroll: after > before
  }
})()`

async function main() {
  const udd = path.join(os.tmpdir(), `dsh-sb-${Date.now()}`)
  const { child: chrome, debugPort: port } = launchHeadlessChrome({ userDataDir: udd, target: url })

  let client = null
  try {
    const page = await waitForJsonEndpoint(port)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')

    console.log(`地址: ${url}\n`)
    console.log('尺寸        可滚动  滚动条占位  scrollbar-width  程序化滚动')
    console.log('─'.repeat(72))

    for (const size of sizes) {
      const [w, h] = size.split('x').map(Number)
      if (!w || !h) continue

      await client.send('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: 1, mobile: w <= 768
      })
      await client.send('Page.navigate', { url })
      await waitFor(client, 'Boolean(document.querySelector(".calendar"))', '排班页')
      await sleep(300)
      await client.evaluate(`Array.from(document.querySelectorAll('.top-bar-actions button')).find(b => b.textContent.trim() === '统计')?.click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".stats"))', '统计页')
      await sleep(300)

      const m = await client.evaluate(PROBE)
      console.log(
        `${size.padEnd(11)} ${String(m.scrollable).padEnd(7)} ` +
        `${(m.barWidth + 'px').padEnd(11)} ${String(m.scrollbarWidth).padEnd(16)} ` +
        `${m.canScroll ? '可用 (' + m.scrollTopBefore + '→' + m.scrollTopAfter + ')' : '不可用'}`
      )
    }
  } finally {
    client?.close()
    chrome.kill()
    try { fs.rmSync(udd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* 忽略 */ }
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
