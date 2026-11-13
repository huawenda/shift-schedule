#!/usr/bin/env node
/**
 * 一次性探针：设置页「组卡 + 行」的控件是否被压扁 / 溢出卡片。
 *
 *   node scripts/probe/measure-settings-rows.mjs
 *
 * 起因：`.settings-row-control` 曾写 `max-width: 62%`，百分比按 auto 轨道
 * 解析，把控件反向压窄 —— 分段控件文字竖排、导入备份被卡片 overflow 裁掉。
 * 这里量三件事：行内控件右缘是否越过卡片内边、分段控件是否发生折行、
 * 行高是否落在 48 / 56。截图存 shots-check/。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchHeadlessChrome } from '../lib/browser.mjs'
import { createCdpClient, waitForJsonEndpoint, waitFor, sleep, clickByText } from '../lib/cdp.mjs'
import { startStaticServer } from '../lib/server.mjs'

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const shotDir = path.join(projectDir, 'shots-check')
const fixturePath = path.join(projectDir, 'fixtures', '班组13人.json')
const ROSTER_KEY = 'shift-schedule:local:roster:v2'

const PROBE = `(() => {
  const card = document.querySelector('.settings-card')
  const cardRect = card?.getBoundingClientRect()
  const rows = [...document.querySelectorAll('.settings-row')]
  const detail = rows.map(row => {
    const label = row.querySelector('.settings-row-label')
    const control = row.querySelector('.settings-row-control')
    const seg = row.querySelector('.segmented')
    const segItem = row.querySelector('.segmented-item')
    const r = row.getBoundingClientRect()
    const c = control?.getBoundingClientRect()
    const l = label?.getBoundingClientRect()
    return {
      name: label?.firstElementChild?.textContent?.trim() ?? '',
      rowH: Math.round(r.height),
      labelW: l ? Math.round(l.width) : -1,
      controlW: c ? Math.round(c.width) : -1,
      overflowRight: cardRect && c ? Math.round(c.right - cardRect.right) : null,
      segW: seg ? Math.round(seg.getBoundingClientRect().width) : null,
      segItemWrap: segItem ? segItem.scrollWidth > segItem.clientWidth + 1 : null,
      segItemH: segItem ? Math.round(segItem.getBoundingClientRect().height) : null
    }
  })
  return {
    hash: location.hash,
    cards: document.querySelectorAll('.settings-card').length,
    groups: document.querySelectorAll('.settings-group').length,
    rows: rows.length,
    detail,
    pathW: document.querySelector('.settings-path')
      ? Math.round(document.querySelector('.settings-path').getBoundingClientRect().width)
      : null
  }
})()`

async function main() {
  const { server, port } = await startStaticServer(path.join(projectDir, 'dist'))
  const base = `http://127.0.0.1:${port}/`
  const hash = process.argv[2] ?? '#/settings/system'
  const userDataDir = path.join(os.tmpdir(), `dsh-settings-${Date.now()}`)
  const { child: chrome, debugPort } = launchHeadlessChrome({ userDataDir, target: 'about:blank' })

  let client = null
  try {
    const page = await waitForJsonEndpoint(debugPort)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false
    })

    // 走真实点击路径：先落首页写入样例班组，再从侧栏进设置、点目标页签。
    // 直接以 `#/settings/...` 首次加载在本机的 CDP 里会被应用自身的
    // hash 规范化覆盖成 `#/overview`，点击路径反而稳定。
    await client.send('Page.navigate', { url: base })
    // 首次打开还没有花名册，会落在向导上：这里只等文档加载完再写存储
    await waitFor(client, 'document.readyState === "complete"', '首屏')
    await sleep(300)
    const roster = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).roster
    await client.evaluate(
      `localStorage.setItem(${JSON.stringify(ROSTER_KEY)}, ${JSON.stringify(JSON.stringify({ ...roster, updatedAt: Date.now() }))}); true`
    )
    await client.send('Page.reload', { ignoreCache: true })
    await sleep(1000)

    await client.evaluate(clickByText('[data-view="settings"]', '设置'))
    await waitFor(client, 'Boolean(document.querySelector("[data-slot=\\"tabs-trigger\\"]"))', '设置页页签')
    await sleep(250)
    // 页签由 hash 驱动（Radix 触发器只认 mousedown），直接改 hash 最稳
    if (hash.includes('system')) {
      await client.evaluate(`location.hash = '#/settings/system'; true`)
      await waitFor(client, 'location.hash === "#/settings/system"', '切到系统设置')
      await sleep(350)
    }
    try {
      await waitFor(client, 'Boolean(document.querySelector(".settings-card"))', '设置组卡')
    } catch (error) {
      const dump = await client.evaluate(`(() => ({
        hash: location.hash,
        cards: document.querySelectorAll('.settings-card').length,
        profile: document.querySelectorAll('.profile-section').length,
        triggers: [...document.querySelectorAll('[data-slot="tabs-trigger"]')].map(n => n.textContent.trim()),
        text: document.body.innerText.slice(0, 240)
      }))()`)
      console.log('等待失败，现场：', JSON.stringify(dump, null, 2))
      throw error
    }
    await sleep(400)

    const diag = await client.evaluate(PROBE)
    console.log(JSON.stringify(diag, null, 2))

    fs.mkdirSync(shotDir, { recursive: true })
    const shot = await client.send('Page.captureScreenshot', { format: 'png' })
    const out = path.join(shotDir, `settings-${hash.split('/').pop()}.png`)
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
    console.log('截图:', out)

    const bad = diag.detail.filter(row =>
      (row.overflowRight ?? 0) > 0 || row.segItemWrap === true || row.rowH < 48
    )
    console.log(bad.length === 0 ? '结论：无压扁 / 无溢出' : `结论：${bad.length} 行异常 ` + JSON.stringify(bad))
  } finally {
    client?.close?.()
    chrome?.kill?.()
    server?.close?.()
  }
}

void main()
