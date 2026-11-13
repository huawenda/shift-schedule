#!/usr/bin/env node
/**
 * 一次性探针：矩阵「今天」列在两种主题下的表头底色与色带。
 *
 *   node scripts/probe/measure-today-marker.mjs dark
 *
 * 深色下今天曾是深青色底（--accent-weak #123039），比表头更暗、带色相，
 * 读起来像一块凹进去的色斑。改成 --raised 后这里量三档底：
 * 普通列 / 周末 / 今天，确认它们是递进而不是打架。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchHeadlessChrome } from '../lib/browser.mjs'
import { createCdpClient, waitForJsonEndpoint, waitFor, sleep, clickByText } from '../lib/cdp.mjs'
import { startStaticServer } from '../lib/server.mjs'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const theme = process.argv[2] ?? 'dark'
const { server, port } = await startStaticServer(path.join(projectDir, 'dist'))
const base = `http://127.0.0.1:${port}/`
const { child, debugPort } = launchHeadlessChrome({ userDataDir: path.join(os.tmpdir(), `td-${Date.now()}`), target: 'about:blank' })
const page = await waitForJsonEndpoint(debugPort)
const client = createCdpClient(page.webSocketDebuggerUrl)
await client.ready
await client.send('Runtime.enable')
await client.send('Page.enable')
await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await client.send('Page.navigate', { url: base })
await waitFor(client, 'document.readyState === "complete"', '首屏')
await sleep(300)
const roster = JSON.parse(fs.readFileSync(path.join(projectDir, 'fixtures/班组13人.json'), 'utf8')).roster
await client.evaluate(`localStorage.setItem('shift-schedule:local:roster:v2', ${JSON.stringify(JSON.stringify({ ...roster, updatedAt: Date.now() }))}); localStorage.setItem('shift-schedule:local:theme:v1', '${theme}'); true`)
await client.send('Page.reload', { ignoreCache: true })
await sleep(1200)
await client.evaluate(clickByText('[data-view="matrix"]', '全员矩阵'))
await waitFor(client, 'Boolean(document.querySelector(".matrix-day.is-today"))', '矩阵与今日列')
await sleep(400)
const info = await client.evaluate(`(() => {
  const today = document.querySelector('.matrix-day.is-today')
  const normal = document.querySelector('.matrix-day:not(.is-today)')
  const weekend = document.querySelector('.matrix-day.is-weekend:not(.is-today)')
  const cs = el => el ? { bg: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow } : null
  return { hash: location.hash, today: cs(today), normal: cs(normal), weekend: cs(weekend) }
})()`)
console.log(JSON.stringify(info, null, 2))
fs.mkdirSync(path.join(projectDir, 'shots-check'), { recursive: true })
const shot = await client.send('Page.captureScreenshot', { format: 'png' })
const out = path.join(projectDir, 'shots-check', `matrix-${theme}.png`)
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('截图:', out)
client.close?.(); child?.kill?.(); server?.close?.()
