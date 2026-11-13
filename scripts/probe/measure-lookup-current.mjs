#!/usr/bin/env node
/**
 * 一次性探针：生产速查「同 INCH 型号对比」里当前行在深色下的底色。
 *
 *   node scripts/probe/measure-lookup-current.mjs dark
 *
 * 当前行原用 --accent-weak（深色 #123039），比卡片底更暗且带青相；
 * 改成 --raised 后这里量「当前行 / 普通行」两档，并留一张截图。
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
const { child, debugPort } = launchHeadlessChrome({ userDataDir: path.join(os.tmpdir(), `lk-${Date.now()}`), target: 'about:blank' })
const page = await waitForJsonEndpoint(debugPort)
const client = createCdpClient(page.webSocketDebuggerUrl)
await client.ready
await client.send('Runtime.enable')
await client.send('Page.enable')
await client.send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 820, deviceScaleFactor: 1, mobile: false })
await client.send('Page.navigate', { url: base })
await waitFor(client, 'document.readyState === "complete"', '首屏')
await sleep(300)
const roster = JSON.parse(fs.readFileSync(path.join(projectDir, 'fixtures/班组13人.json'), 'utf8')).roster
await client.evaluate(`localStorage.setItem('shift-schedule:local:roster:v2', ${JSON.stringify(JSON.stringify({ ...roster, updatedAt: Date.now() }))}); localStorage.setItem('shift-schedule:local:theme:v1', '${theme}'); true`)
await client.send('Page.reload', { ignoreCache: true })
await sleep(1000)
await client.evaluate(`location.hash = '#/lookup/model/FY'; true`)
try {
  await waitFor(client, 'Boolean(document.querySelector(".lookup-compare-card.is-current"))', '对比表当前行')
} catch {
  console.log('现场:', await client.evaluate(`JSON.stringify({ hash: location.hash, cards: document.querySelectorAll('.lookup-compare-card').length, text: document.body.innerText.slice(0, 200) })`))
  throw new Error('对比表未渲染')
}
await sleep(400)
const info = await client.evaluate(`(() => {
  const cs = el => el ? { bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor, bar: getComputedStyle(el).boxShadow } : null
  return {
    hash: location.hash,
    dark: document.documentElement.dataset.theme,
    current: cs(document.querySelector('.lookup-compare-card.is-current')),
    other: cs(document.querySelector('.lookup-compare-card:not(.is-current)'))
  }
})()`)
console.log(JSON.stringify(info, null, 2))
fs.mkdirSync(path.join(projectDir, 'shots-check'), { recursive: true })
const shot = await client.send('Page.captureScreenshot', { format: 'png' })
const out = path.join(projectDir, 'shots-check', `lookup-${theme}.png`)
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('截图:', out)
client.close?.(); child?.kill?.(); server?.close?.()
