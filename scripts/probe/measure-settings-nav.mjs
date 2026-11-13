#!/usr/bin/env node
/**
 * 一次性探针：进入设置后「左侧主侧栏整体换成设置导航」的实际效果。
 *
 *   node scripts/probe/measure-settings-nav.mjs dark
 *
 * 量四件事：侧栏里是否只剩设置导航（品牌是否让位给「返回」）、选中态、
 * 内容区宽度是否回到与矩阵同档、切页后 hash 是否跟着变。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchHeadlessChrome } from '../lib/browser.mjs'
import { createCdpClient, waitForJsonEndpoint, waitFor, sleep } from '../lib/cdp.mjs'
import { startStaticServer } from '../lib/server.mjs'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const theme = process.argv[2] ?? 'dark'
const { server, port } = await startStaticServer(path.join(projectDir, 'dist'))
const base = `http://127.0.0.1:${port}/`
const { child, debugPort } = launchHeadlessChrome({
  userDataDir: path.join(os.tmpdir(), `sn-${Date.now()}`),
  target: 'about:blank'
})
const page = await waitForJsonEndpoint(debugPort)
const client = createCdpClient(page.webSocketDebuggerUrl)
await client.ready
await client.send('Runtime.enable')
await client.send('Page.enable')
await client.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 860,
  deviceScaleFactor: 1,
  mobile: false
})
await client.send('Page.navigate', { url: base })
await waitFor(client, 'document.readyState === "complete"', '首屏')
await sleep(300)
const roster = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'fixtures/班组13人.json'), 'utf8')
).roster
await client.evaluate(
  `localStorage.setItem('shift-schedule:local:roster:v2', ${JSON.stringify(
    JSON.stringify({ ...roster, updatedAt: Date.now() })
  )}); localStorage.setItem('shift-schedule:local:theme:v1', '${theme}'); true`
)
await client.send('Page.reload', { ignoreCache: true })
await sleep(1200)

// 进入设置前先记一份主侧栏的状态，好对比「换了什么」
const before = await client.evaluate(`(() => ({
  brand: Boolean(document.querySelector('[data-slot="sidebar"] .brand-lockup')),
  views: [...document.querySelectorAll('[data-view]')].map(n => n.getAttribute('data-view'))
}))()`)
console.log('进入设置前:', JSON.stringify(before))

// 从侧栏用户浮层进设置（真实路径）
await client.evaluate(`(() => {
  const btn = document.querySelector('[data-slot="sidebar-footer"] [aria-label$="的菜单"]')
  if (btn) btn.click()
  return Boolean(btn)
})()`)
await sleep(300)
await client.evaluate(`(() => {
  const item = [...document.querySelectorAll('.user-menu-item')].find(n => n.textContent.trim() === '设置')
  if (item) item.click()
  return Boolean(item)
})()`)
await waitFor(client, 'Boolean(document.querySelector("[data-settings-tab]"))', '设置导航')
await sleep(500)

const readLayout = () => client.evaluate(`(() => {
  const bar = document.querySelector('[data-slot="sidebar"]')
  const body = document.querySelector('.settings-body') ?? document.querySelector('.canvas-flow')
  const canvas = document.querySelector('.canvas.is-settings')
  const b = body ? body.getBoundingClientRect() : null
  const c = canvas ? canvas.getBoundingClientRect() : null
  return {
    hash: location.hash,
    sidebarWidth: bar ? Math.round(bar.getBoundingClientRect().width) : null,
    brand: Boolean(document.querySelector('[data-slot="sidebar"] .brand-lockup')),
    back: document.querySelector('.settings-side-head')?.innerText.trim() ?? '',
    groups: [...document.querySelectorAll('[data-slot="sidebar-group-label"]')].map(n => n.textContent.trim()),
    tabs: [...document.querySelectorAll('[data-settings-tab]')].map(n => ({
      id: n.getAttribute('data-settings-tab'),
      on: n.getAttribute('data-active') === 'true' || n.getAttribute('aria-current') === 'page',
      current: n.getAttribute('aria-current') ?? ''
    })),
    leftViews: [...document.querySelectorAll('[data-view]')].map(n => n.getAttribute('data-view')),
    canvasWidth: c ? Math.round(c.width) : null,
    bodyWidth: b ? Math.round(b.width) : null,
    bodyScrollable: body ? body.scrollHeight > body.clientHeight + 1 : null
  }
})()`)

console.log('人员配置页:', JSON.stringify(await readLayout(), null, 2))
fs.mkdirSync(path.join(projectDir, 'shots-check'), { recursive: true })
fs.writeFileSync(
  path.join(projectDir, 'shots-check', `settings-side-roster-${theme}.png`),
  Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')
)

// 切到系统设置
await client.evaluate(`(() => {
  const item = document.querySelector('[data-settings-tab="system"]')
  if (item) item.click()
  return Boolean(item)
})()`)
await sleep(600)
const system = await readLayout()
console.log('系统设置页:', JSON.stringify({ hash: system.hash, tabs: system.tabs, brand: system.brand }, null, 2))
fs.writeFileSync(
  path.join(projectDir, 'shots-check', `settings-side-system-${theme}.png`),
  Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')
)

// 折叠成图标条：设置导航应当只剩三个图标（返回 + 人员配置 + 系统设置）
await client.evaluate(`(() => {
  const t = document.querySelector('[data-slot="sidebar-trigger"]')
  if (t) t.click()
  return Boolean(t)
})()`)
await sleep(600)
const collapsed = await client.evaluate(`(() => {
  const bar = document.querySelector('[data-slot="sidebar"]')
  const back = document.querySelector('.settings-side-head [data-slot="sidebar-menu-button"]')
  const first = document.querySelector('[data-settings-tab]')
  const rect = el => (el ? (r => [Math.round(r.x), Math.round(r.y), Math.round(r.width)])(el.getBoundingClientRect()) : null)
  return {
    state: bar?.getAttribute('data-state'),
    width: bar ? Math.round(bar.getBoundingClientRect().width) : null,
    back: rect(back),
    firstTab: rect(first)
  }
})()`)
console.log('折叠态:', JSON.stringify(collapsed))
fs.writeFileSync(
  path.join(projectDir, 'shots-check', `settings-side-collapsed-${theme}.png`),
  Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')
)
// 展开回来，后面的「返回」断言按展开态量
await client.evaluate(`(() => {
  const t = document.querySelector('[data-slot="sidebar-trigger"]')
  if (t) t.click()
  return Boolean(t)
})()`)
await sleep(500)

// 返回：应当回到概览，且侧栏恢复成品牌 + 主视图
await client.evaluate(`(() => {
  const btn = document.querySelector('.settings-side-head [data-slot="sidebar-menu-button"]')
  if (btn) btn.click()
  return Boolean(btn)
})()`)
await sleep(700)
console.log('点返回后:', await client.evaluate(`JSON.stringify({
  hash: location.hash,
  brand: Boolean(document.querySelector('[data-slot="sidebar"] .brand-lockup')),
  views: [...document.querySelectorAll('[data-view]')].map(n => n.getAttribute('data-view'))
})`))

client.close?.()
child?.kill?.()
server?.close?.()
