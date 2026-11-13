#!/usr/bin/env node
/**
 * 一次性探针：矩阵页的分组筛选换成成员页那套胶囊 tab 之后的样子。
 *
 *   node scripts/probe/measure-matrix-groups.mjs dark
 *
 * 夹具没有分组，这里现造三个，量胶囊条与选中胶囊的实际盒模型，
 * 并点一下分组确认矩阵真的被过滤。
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
  userDataDir: path.join(os.tmpdir(), `mg-${Date.now()}`),
  target: 'about:blank'
})
const page = await waitForJsonEndpoint(debugPort)
const client = createCdpClient(page.webSocketDebuggerUrl)
await client.ready
await client.send('Runtime.enable')
await client.send('Page.enable')
await client.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false
})
await client.send('Page.navigate', { url: base })
await waitFor(client, 'document.readyState === "complete"', '首屏')
await sleep(300)

const roster = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'fixtures/班组13人.json'), 'utf8')
).roster
const groups = [
  { id: 'g-encap', name: 'Encap' },
  { id: 'g-zen', name: '蒸镀' },
  { id: 'g-yun', name: '运营' }
]
const seeded = {
  ...roster,
  groups,
  members: roster.members.map((member, index) => ({
    ...member,
    groupId: index % 5 === 4 ? null : groups[index % 3].id
  })),
  updatedAt: Date.now()
}
await client.evaluate(
  `localStorage.setItem('shift-schedule:local:roster:v2', ${JSON.stringify(
    JSON.stringify(seeded)
  )}); localStorage.setItem('shift-schedule:local:theme:v1', '${theme}'); true`
)
await client.send('Page.reload', { ignoreCache: true })
await sleep(1300)

// 进矩阵页
await client.evaluate(`(() => {
  const link = document.querySelector('[data-view="matrix"]')
  if (link) link.click()
  return Boolean(link)
})()`)
await waitFor(client, 'Boolean(document.querySelector(".matrix-groups"))', '分组筛选')
await sleep(600)

const read = () => client.evaluate(`(() => {
  const r0 = el => (el ? el.getBoundingClientRect() : { left: 0, top: 0, height: 0, right: 0, width: 0 })
  const head = document.querySelector('.canvas-head')
  const period = document.querySelector('.matrix-period')
  const tools = document.querySelector('.canvas-tools')
  const hr = head?.getBoundingClientRect()
  const pr = period?.getBoundingClientRect()
  const tr = tools?.getBoundingClientRect()
  const headInfo = hr && pr && tr ? {
    headWidth: Math.round(hr.width),
    chipsLeftGap: Math.round(r0(document.querySelector('.matrix-groups')).left - hr.left),
    periodLeftGap: Math.round(pr.left - hr.left),
    periodRightGap: Math.round(hr.right - pr.right),
    periodWidth: Math.round(pr.width),
    toolsRightGap: Math.round(hr.right - tr.right),
    sameRow: Math.abs(pr.top + pr.height / 2 - (r0(document.querySelector('.matrix-groups')).top + r0(document.querySelector('.matrix-groups')).height / 2)) < 20
  } : null
  const bar = document.querySelector('.matrix-groups')
  const chips = [...bar.querySelectorAll('.chip-tab')]
  const cs = getComputedStyle(bar)
  const active = bar.querySelector('.chip-tab.is-on')
  const acs = active ? getComputedStyle(active) : null
  return {
    labels: chips.map(n => n.textContent.replace(/\\s+/g, ' ').trim()),
    barHeight: Math.round(bar.getBoundingClientRect().height),
    barBg: cs.backgroundColor,
    barRadius: cs.borderRadius,
    barPadding: cs.padding,
    chipHeight: chips[0] ? Math.round(chips[0].getBoundingClientRect().height) : null,
    chipRadius: chips[0] ? getComputedStyle(chips[0]).borderRadius : '',
    active: active?.textContent.replace(/\\s+/g, ' ').trim() ?? '',
    activeBg: acs?.backgroundColor ?? '',
    activeShadow: acs?.boxShadow ?? '',
    rows: document.querySelectorAll('.matrix-row').length,
    head: headInfo
  }
})()`)

console.log('全部:', JSON.stringify(await read(), null, 2))
fs.mkdirSync(path.join(projectDir, 'shots-check'), { recursive: true })
fs.writeFileSync(
  path.join(projectDir, 'shots-check', `matrix-groups-${theme}.png`),
  Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')
)

// 点「蒸镀」：胶囊换过去，矩阵只留这个组的人
await client.evaluate(`(() => {
  const chip = [...document.querySelectorAll('.matrix-groups .chip-tab')]
    .find(n => n.textContent.includes('蒸镀'))
  if (chip) chip.click()
  return Boolean(chip)
})()`)
await sleep(600)
console.log('点蒸镀:', JSON.stringify(await read(), null, 2))
fs.writeFileSync(
  path.join(projectDir, 'shots-check', `matrix-groups-zen-${theme}.png`),
  Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')
)

client.close?.()
child?.kill?.()
server?.close?.()
