#!/usr/bin/env node
/**
 * 统计页「月度概览」标签的纵向溢出测量。
 *
 * 每日明细那套用 .stats-fill 撑满高度，所以不滚；
 * 月度概览走 .stats-cards，内容高度由内容本身决定，
 * 超出视口就滚。这个脚本量出「到底超了多少」，
 * 以及是哪几块把高度撑破的。
 *
 *   node scripts/probe/measure-overview.mjs --dev
 *   node scripts/probe/measure-overview.mjs --sizes=1440x900,1440x930
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

/** 量一次月度概览：谁在撑高度、超了多少。 */
const PROBE = `(() => {
  const h = el => el ? Math.round(el.getBoundingClientRect().height) : null
  const pick = sel => document.querySelector(sel)
  const cards = pick('.stats-cards')
  const salary = pick('.salary-block, [class*="salary"]')
  const doc = document.documentElement

  // 逐块列出高度，看谁最大
  const blocks = Array.from(document.querySelectorAll('.stats-cards > *')).map(el => ({
    cls: el.className.split(' ')[0],
    h: Math.round(el.getBoundingClientRect().height)
  }))

  const salaryBlocks = Array.from(document.querySelectorAll('.salary-block')).map(el => ({
    name: (el.querySelector('.salary-block-title')?.textContent || '?').trim(),
    h: Math.round(el.getBoundingClientRect().height)
  }))

  // 薪资面板里除了四个 block，还剩多少是标题/内边距/间隙
  const salaryPanelEl = document.querySelector('.salary-block')?.closest('.panel')
  const panelCs = salaryPanelEl ? getComputedStyle(salaryPanelEl) : null
  const panelInner = salaryPanelEl
    ? Math.round(salaryPanelEl.getBoundingClientRect().height
      - parseFloat(panelCs.paddingTop) - parseFloat(panelCs.paddingBottom))
    : null
  const blocksSum = salaryBlocks.reduce((s, b) => s + b.h, 0)
  const gap = 16
  const salaryHead = salaryPanelEl?.querySelector('.section-head')
  const salaryTitle = salaryHead ? Math.round(salaryHead.getBoundingClientRect().height) : 0

  return {
    viewport: window.innerHeight,
    docH: doc.scrollHeight,
    bodyH: Math.round(document.body.getBoundingClientRect().height),
    overflowY: Math.max(0, doc.scrollHeight - window.innerHeight),
    stats: h(pick('.stats')),
    statsMain: h(pick('.stats-main')),
    statsCards: h(cards),
    row: h(pick('.stats-row')),
    overviewPanel: h(pick('.overview')?.closest('.panel')),
    salaryPanel: h(salaryPanelEl),
    blocks,
    salaryBlocks,
    salaryBlockTotal: blocksSum,
    salaryPanelInner: panelInner,
    salaryChrome: salaryTitle + (blocksSum > 0 ? (salaryBlocks.length - 1) * gap : 0),
    salaryGapRemainder: panelInner - salaryTitle - blocksSum - gap * (salaryBlocks.length - 1),
    padding: getComputedStyle(pick('.stats-main')).padding
  }
})()`

async function main() {
  const userDataDir = path.join(os.tmpdir(), `dsh-ov-${Date.now()}`)
  const { child: chrome, debugPort } = launchHeadlessChrome({ userDataDir, target: url })

  let client = null
  try {
    const page = await waitForJsonEndpoint(debugPort)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')

    console.log(`地址: ${url}\n`)
    console.log('尺寸        视口  内容  溢出  | stats-row 概览  薪资面板  薪资四块')
    console.log('─'.repeat(92))

    for (const size of sizes) {
      const [width, height] = size.split('x').map(Number)
      if (!width || !height) continue

      await client.send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: width <= 768
      })
      await client.send('Page.navigate', { url })
      await waitFor(client, 'Boolean(document.querySelector(".calendar"))', '排班页')
      await sleep(300)

      await client.evaluate(`Array.from(document.querySelectorAll('.top-bar-actions button')).find(b => b.textContent.trim() === '统计')?.click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".stats"))', '统计页')
      await sleep(300)

      const m = await client.evaluate(PROBE)
      if (!m || m.error) { console.log(`${size.padEnd(11)} 探测失败: ${m && m.error}`); continue }
      if (!m.salaryBlocks || m.salaryBlocks.length === 0) {
        console.log(`${size.padEnd(11)} 无薪资块`)
        continue
      }
      const sb = m.salaryBlocks.map(b => `${b.name}:${b.h}`).join(' ')

      console.log(
        `${size.padEnd(11)} ${String(m.viewport).padEnd(5)} ${String(m.docH).padEnd(5)} ` +
        `${String(m.overflowY).padEnd(5)} | ${String(m.row).padEnd(5)} ${String(m.overviewPanel).padEnd(5)} ` +
        `${String(m.salaryPanel).padEnd(9)} ${sb}`
      )
      console.log(
        `${''.padEnd(11)} ${''.padEnd(16)}薪资面板内高 ${m.salaryPanelInner} = 标题 ${m.salaryChrome - m.salaryBlockTotal} ` +
        `+ 四块 ${m.salaryBlockTotal} + 间隙 ${m.salaryGapRemainder}`
      )
    }
  } finally {
    client?.close()
    chrome.kill()
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* 忽略 */ }
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
