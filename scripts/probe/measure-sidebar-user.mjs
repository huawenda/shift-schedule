#!/usr/bin/env node
/**
 * 一次性探针：侧栏底部用户区与它的浮层菜单。
 *
 *   node scripts/probe/measure-sidebar-user.mjs dark
 *
 * 截图两张：默认态（头像 + 姓名）与浮层展开态（设置 / 退出应用）。
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
const { child, debugPort } = launchHeadlessChrome({ userDataDir: path.join(os.tmpdir(), `sb-${Date.now()}`), target: 'about:blank' })
const page = await waitForJsonEndpoint(debugPort)
const client = createCdpClient(page.webSocketDebuggerUrl)
await client.ready
await client.send('Runtime.enable')
await client.send('Page.enable')
await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
await client.send('Page.navigate', { url: base })
await waitFor(client, 'document.readyState === "complete"', '首屏')
await sleep(300)
const roster = JSON.parse(fs.readFileSync(path.join(projectDir, 'fixtures/班组13人.json'), 'utf8')).roster
await client.evaluate(`localStorage.setItem('shift-schedule:local:roster:v2', ${JSON.stringify(JSON.stringify({ ...roster, updatedAt: Date.now() }))}); localStorage.setItem('shift-schedule:local:theme:v1', '${theme}'); true`)
await client.send('Page.reload', { ignoreCache: true })
await sleep(1200)

const trigger = await client.evaluate(`(() => {
  const btn = document.querySelector('[data-slot="sidebar-footer"] [aria-label$="的菜单"]')
  if (!btn) return null
  btn.click()
  return { label: btn.getAttribute('aria-label'), text: btn.innerText.replace(/\\n/g, ' | ') }
})()`)
console.log('触发按钮:', JSON.stringify(trigger))
await sleep(500)

const menu = await client.evaluate(`(() => {
  const items = [...document.querySelectorAll('.user-menu-item')]
  const card = document.querySelector('.user-menu')
  const cs = card ? getComputedStyle(card) : null
  return {
    count: items.length,
    labels: items.map(n => n.textContent.trim()),
    oldSettingsLinks: document.querySelectorAll('a[data-view="settings"]').length,
    cardBg: cs?.backgroundColor ?? '',
    cardBorder: cs?.borderTopColor ?? '',
    cardRect: card ? (r => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)])(card.getBoundingClientRect()) : null
  }
})()`)
console.log('浮层菜单:', JSON.stringify(menu))

// 展开态先截一张
fs.mkdirSync(path.join(projectDir, 'shots-check'), { recursive: true })
const openShot = await client.send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync(
  path.join(projectDir, 'shots-check', `sidebar-user-${theme}.png`),
  Buffer.from(openShot.data, 'base64')
)

/**
 * 关键断言：点「设置」之后浮层必须自己收起。
 *
 * 非受控 Popover 只认「点外部 / Esc / 再点触发器」，点里面的普通按钮只会触发导航，
 * 浮层会一直挂在侧栏底部，挡住内容和用户区。这里量三件事：
 * hash 是否落到设置页、浮层元素是否还在文档里且可见、触发器 aria-expanded 是否为 false。
 */
await client.evaluate(`(() => {
  const item = [...document.querySelectorAll('.user-menu-item')].find(n => n.textContent.trim() === '设置')
  if (item) item.click()
  return Boolean(item)
})()`)
await sleep(500)
const afterSettings = await client.evaluate(`(() => {
  const card = document.querySelector('.user-menu')
  const trigger = document.querySelector('[data-slot="sidebar-footer"] [aria-label$="的菜单"]')
  return {
    hash: location.hash,
    menuInDom: Boolean(card),
    menuVisible: card ? (r => r.width > 0 && r.height > 0)(card.getBoundingClientRect()) : false,
    ariaExpanded: trigger?.getAttribute('aria-expanded') ?? 'n/a'
  }
})()`)
console.log('点设置之后:', JSON.stringify(afterSettings))
fs.writeFileSync(
  path.join(projectDir, 'shots-check', `sidebar-after-settings-${theme}.png`),
  Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')
)

// 收起侧栏后再截一张：折叠成 44px 图标条时只剩头像
const collapsed = await client.evaluate(`(() => {
  const trigger = document.querySelector('[data-slot="sidebar-trigger"]')
  if (trigger) trigger.click()
  return Boolean(trigger)
})()`)
await sleep(600)
const collapsedInfo = await client.evaluate(`(() => {
  const bar = document.querySelector('[data-slot="sidebar"]')
  const avatar = document.querySelector('.user-avatar')
  const r = avatar ? avatar.getBoundingClientRect() : null
  return { collapsed: bar?.getAttribute('data-state'), avatarRect: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width)] : null }
})()`)
console.log('折叠态:', JSON.stringify({ clicked: collapsed, ...collapsedInfo }))
const shot = await client.send('Page.captureScreenshot', { format: 'png' })
const out = path.join(projectDir, 'shots-check', `sidebar-collapsed-${theme}.png`)
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('截图:', out)
client.close?.(); child?.kill?.(); server?.close?.()
