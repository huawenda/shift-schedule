#!/usr/bin/env node
/**
 * 一次性探针：速查浏览板筛选框聚焦后左侧被裁。
 *
 *   node scripts/probe/measure-lookup-filter.mjs
 *
 * 量 input 的 padding、图标与容器的盒子，聚焦前后各一次，
 * 并各存一张截图到 shots-check/ 供前后对照。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchHeadlessChrome } from '../lib/browser.mjs'
import { createCdpClient, waitForJsonEndpoint, waitFor, sleep } from '../lib/cdp.mjs'
import { startStaticServer } from '../lib/server.mjs'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const shotDir = path.join(projectDir, 'shots-check')
const fixturePath = path.join(projectDir, 'fixtures', '班组13人.json')
const ROSTER_KEY = 'shift-schedule:local:roster:v2'

const PROBE = `(() => {
  const input = document.querySelector('.lookup-filter-input input')
  const wrap = input && input.closest('.lookup-filter-input')
  const icon = wrap && wrap.querySelector('.lookup-input-icon')
  const flow = document.querySelector('.canvas-flow')
  const cs = el => el ? getComputedStyle(el) : null
  const rect = el => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  const i = cs(input)
  const ic = cs(icon)
  const w = cs(wrap)
  const f = cs(flow)
  return {
    input: rect(input),
    wrap: rect(wrap),
    icon: rect(icon),
    paddingLeft: i && i.paddingLeft,
    paddingRight: i && i.paddingRight,
    paddingInlineStart: i && i.paddingInlineStart,
    inputPosition: i && i.position,
    iconPosition: ic && ic.position,
    iconLeft: ic && ic.left,
    iconColor: ic && ic.color,
    iconDisplay: ic && ic.display,
    wrapOverflow: w && w.overflow,
    flowOverflowX: f && f.overflowX,
    flowOverflowY: f && f.overflowY,
    flowPaddingLeft: f && f.paddingLeft,
    flowRect: rect(flow),
    boxShadow: i && i.boxShadow,
    value: input && input.value,
    placeholder: input && input.placeholder
  }
})()`

async function main() {
  const { server, port } = await startStaticServer(path.join(projectDir, 'dist'))
  const base = `http://127.0.0.1:${port}/`
  const url = `${base}#/lookup/browse/inch`
  const userDataDir = path.join(os.tmpdir(), `dsh-lf-${Date.now()}`)
  const { child: chrome, debugPort } = launchHeadlessChrome({ userDataDir, target: 'about:blank' })

  let client = null
  try {
    const page = await waitForJsonEndpoint(debugPort)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1080, height: 720, deviceScaleFactor: 1, mobile: false
    })
    // 先在同源页写入样例班组，跳过首次向导；再进速查浏览板
    await client.send('Page.navigate', { url: base })
    await waitFor(client, `location.href.startsWith(${JSON.stringify(base)})`, '标签页加载')
    await sleep(300)
    const roster = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).roster
    await client.evaluate(
      `localStorage.setItem(${JSON.stringify(ROSTER_KEY)}, ${JSON.stringify(JSON.stringify({ ...roster, updatedAt: Date.now() }))}); true`
    )
    // 同文档只加 hash 不会重新读存储：必须真 reload 一次
    await client.send('Page.reload', { ignoreCache: true })
    await sleep(1000)
    await client.send('Page.navigate', { url })
    await sleep(1200)
    const diag = await client.evaluate(`(() => ({
      hash: location.hash,
      title: document.title,
      hasWizard: Boolean(document.querySelector('.wizard')),
      hasCanvas: Boolean(document.querySelector('.canvas')),
      inputs: document.querySelectorAll('input').length,
      filter: document.querySelectorAll('.lookup-filter-input').length,
      text: document.body.innerText.slice(0, 160)
    }))()`)
    console.log('诊断:', JSON.stringify(diag, null, 2))
    await waitFor(client, 'Boolean(document.querySelector(".lookup-filter-input input"))', '筛选框')
    await sleep(400)

    const before = await client.evaluate(PROBE)
    console.log('聚焦前:', JSON.stringify(before, null, 2))

    const shot1 = await client.send('Page.captureScreenshot', { format: 'png' })
    fs.mkdirSync(shotDir, { recursive: true })
    fs.writeFileSync(path.join(shotDir, 'filter-before.png'), Buffer.from(shot1.data, 'base64'))

    // 用真实点击聚焦，程序 focus() 不一定匹配 :focus-visible，看不到 ring
    const center = await client.evaluate(`(() => {
      const r = document.querySelector('.lookup-filter-input input').getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })()`)
    for (const type of ['mousePressed', 'mouseReleased']) {
      await client.send('Input.dispatchMouseEvent', {
        type, x: center.x, y: center.y, button: 'left', clickCount: 1
      })
    }
    await sleep(250)

    const after = await client.evaluate(PROBE)
    console.log('聚焦后:', JSON.stringify(after, null, 2))

    const shot2 = await client.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(shotDir, 'filter-after.png'), Buffer.from(shot2.data, 'base64'))

    // 聚焦后光标处的元素，判断图标是否被 input 盖住
    const top = await client.evaluate(`(() => {
      const r = document.querySelector('.lookup-filter-input input').getBoundingClientRect()
      const el = document.elementFromPoint(r.x + 18, r.y + r.height / 2)
      return el ? { tag: el.tagName, cls: el.className } : null
    })()`)
    console.log('文字起点处的顶层元素:', JSON.stringify(top))
    console.log(`截图: ${path.join(shotDir, 'filter-before.png')} / filter-after.png`)
  } finally {
    client?.close()
    chrome.kill()
    server.close()
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* 忽略 */ }
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
