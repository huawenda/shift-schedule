#!/usr/bin/env node
/**
 * 产物验收：真实启动无头浏览器，把 dist/ 打开跑一遍关键流程。
 *
 *   node scripts/verify-dist.mjs                # HTTP 托管 + file:// 双击，两种都测
 *   node scripts/verify-dist.mjs --only=file
 *   node scripts/verify-dist.mjs --only=wide     # 只跑宽屏不变式（含源码层断言）
 *
 * 覆盖（对应 PRD §8 验收标准）：
 *   1. 空数据首次打开 → 出现三步向导
 *   2. 向导先填本人（姓名 + 班序）再加 2 位同事 → 排班页出现 3 行
 *   3. 独立浏览器存储可写（file:// 下尤其要确认）
 *   4. 点格子改班 → 弹层 → 保存 → 写入 roster v2（矩阵弹层不含加班录入）
 *   5. 刷新后改动仍在（真持久化）
 *   6. 恢复默认 → 记录被删除
 *   6b. 个人日历记加班 3h → 落盘 → 格子显示 +3h → 恢复默认连加班清掉
 *   7. 设置页：20 条内置班序可预览 24 格
 *   8. 新建自建班序（24 格逐格填）→ 出现在列表 → 能挂到成员上
 *   9. 矩阵里显示自建班序名
 *  10. 导出备份是 v5，且带上自建班序
 *  11. 删除自建班序要输入名字确认，成员与改班记录一并删除
 *  12. 翻月不崩
 *  13. 宽屏不变式（--only=wide）：1024 / 1280 / 1466 / 1008 四档下侧栏展开 224px、折叠 48px、
 *      无移动端底部 tab / 抽屉、无窄屏重排；并做源码层断言防止窄屏分支回流
 *
 * 依赖：本机 Chrome/Edge，Node 18+（用全局 fetch / WebSocket）。没有第三方依赖。
 */

import { findBrowser, launchHeadlessChrome } from './lib/browser.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCdpClient, waitForJsonEndpoint, waitFor, sleep, clickByText } from './lib/cdp.mjs'
import { startStaticServer } from './lib/server.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(__dirname, '..')
const distDir = path.join(projectDir, 'dist')
const distIndex = path.join(distDir, 'index.html')
/** 真实班组的样例备份：13 人挂在内置班序 4A–4X 上，用来验导入链路 */
const fixturePath = path.join(projectDir, 'fixtures', '班组13人.json')

const ROSTER_KEY = 'shift-schedule:local:roster:v2'

/** 班次 → 矩阵格子里的单字，与 src/data/shifts.ts 保持一致 */
const SHORT_LABEL = { 白班: '白', 夜班: '夜', 休息: '休', 白特: '特', 夜特: '特', 事假: '假' }

const onlyArg = process.argv.find(arg => arg.startsWith('--only='))
const only = onlyArg ? onlyArg.slice('--only='.length) : null

const results = []

function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

/** 给受控 input 赋值（React 需要原生 setter + input 事件）；用索引取第 n 个 */
function setInputAt(selector, index, value) {
  return `(() => {
    const input = document.querySelectorAll(${JSON.stringify(selector)})[${index}]
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`
}

/** 按选择器给受控 input 赋值（React 需要原生 setter + input 事件） */
function setInputBySelector(selector, value) {
  return `(() => {
    const input = document.querySelector(${JSON.stringify(selector)})
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(value)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`
}

/** 侧栏跳转：三页各自等一个稳定标记 */
async function goMatrix(client) {
  await client.evaluate(clickByText('[data-view="matrix"]', '全员矩阵'))
  await waitFor(client, 'Boolean(document.querySelector(".matrix"))', '全员矩阵页')
}

async function goOverview(client) {
  await client.evaluate(clickByText('[data-view="overview"]', '月度概览'))
  await waitFor(client, 'Boolean(document.querySelector(".stats-grid"))', '月度概览页')
}

/** 设置页分两个 tab：人员配置 / 系统设置（JIG DATA 只在桌面壳出现） */
async function switchSettingsTab(client, label) {
  // 页签是 shadcn Tabs（data-slot="tabs-trigger"），不是 .segmented-item
  await client.evaluate(clickByText('.canvas-tools [data-slot="tabs-trigger"]', label))
  await sleep(150)
}

const firstCell = '.matrix-row:not(.is-self) .matrix-cell'

async function runScenario(name, url, downloadDir) {
  console.log(`\n=== 场景：${name} ===`)
  fs.mkdirSync(downloadDir, { recursive: true })

  const userDataDir = path.join(os.tmpdir(), `shift-verify-${name}-${Date.now()}`)
  const { child: chrome, debugPort } = launchHeadlessChrome({ userDataDir, target: url })

  let client = null

  try {
    const page = await waitForJsonEndpoint(debugPort)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    // 固定到设计基准 1440×900：headless 默认 800×600，
    // 在那种宽度下「日历 900 上限」「统计两列」这些布局判断根本测不出来。
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    })
    try {
      await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
    } catch {
      await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {})
    }

    // --- 1. 空数据首次打开 → 向导 ---
    // 连上来时标签页可能还停在 about:blank，此时访问 localStorage 会抛 SecurityError，
    // 所以先等真正加载到目标地址（否则整场会因为一个竞态直接判失败）。
    await waitFor(
      client,
      `location.href.startsWith(${JSON.stringify(url.replace(/[^/]*$/, ''))})`,
      '标签页加载到目标地址'
    )
    await client.evaluate(`(() => {
      window.localStorage.clear()
      return true
    })()`)
    await client.send('Page.reload', { ignoreCache: true })
    await waitFor(client, 'document.readyState === "complete"', '页面加载')
    await waitFor(client, 'Boolean(document.querySelector(".wizard"))', '首次配置向导')
    check(`${name}: 无数据时进入三步向导`, true)

    const storageState = await client.evaluate(`(() => {
      try {
        window.localStorage.setItem('__probe', '1')
        window.localStorage.removeItem('__probe')
        return 'ok'
      } catch (error) {
        return 'unavailable: ' + error.message
      }
    })()`)
    check(`${name}: 本机存储可用`, storageState === 'ok', storageState === 'ok' ? '' : storageState)
    if (storageState !== 'ok') return

    // --- 2. 向导：第 1 步先填本人，第 2 步加同事 ---
    check(`${name}: 向导第 1 步先问本人`, await client.evaluate(setInputBySelector('.wizard-self input', '张三')))
    await sleep(150)
    check(`${name}: 向导第 1 步可继续`, await client.evaluate(clickByText('.wizard-foot button', '下一步')))
    await waitFor(client, 'Boolean(document.querySelector(".member-editor"))', '同事表')

    // 同事这一步初始只有一行空行，先加一行凑成两位
    check(`${name}: 同事表可以再加一行`, await client.evaluate(clickByText('.btn-add', '添加成员')))
    await sleep(150)

    const names = ['李四', '王五']
    for (let index = 0; index < names.length; index += 1) {
      const ok = await client.evaluate(setInputAt('.member-row input[aria-label$="姓名"]', index, names[index]))
      check(`${name}: 填第 ${index + 1} 位同事姓名`, ok)
    }

    await sleep(150)
    check(`${name}: 向导第 2 步可继续`, await client.evaluate(clickByText('.wizard-foot button', '下一步')))
    await waitFor(client, 'Boolean(document.querySelector(".wizard-summary"))', '确认页')

    const summarySelf = await client.evaluate(
      `document.querySelector('.wizard-summary-row.is-self')?.textContent.trim() ?? ''`
    )
    check(
      `${name}: 确认页把本人单独标出来`,
      summarySelf.includes('张三') && summarySelf.includes('本人'),
      summarySelf
    )
    check(`${name}: 向导进入第 3 步`, await client.evaluate(clickByText('.wizard-foot button', '进入排班表')))

    // 默认落地是「月度概览」：日历 + 四块统计，且没有全员概览条
    await waitFor(client, 'Boolean(document.querySelector(".stats-grid"))', '月度概览页')
    const landing = await client.evaluate(`(() => ({
      active: document.querySelector('.rail-item.is-active')?.textContent.trim() ?? '',
      rails: Array.from(document.querySelectorAll('.rail-item')).map(node => node.textContent.trim()),
      cards: document.querySelectorAll('.stat-card').length,
      summary: document.querySelectorAll('.summary').length,
      calendar: document.querySelectorAll('.calendar').length,
      sub: (document.querySelector('.canvas.is-overview .canvas-sub')?.textContent ?? '')
        .replace(/\\s+/g, ' ').trim()
    }))()`)
    check(`${name}: 默认落在月度概览`, landing.active === '月度概览', JSON.stringify(landing))
    check(
      `${name}: 侧栏是全员矩阵 / 月度概览 / 设置`,
      JSON.stringify(landing.rails) === JSON.stringify(['全员矩阵', '月度概览', '设置']),
      JSON.stringify(landing.rails)
    )

    // 侧栏观感：深色框上每项带图标、选中是半透明青底 + 亮青字、底部设置单独成段
    const railLook = await client.evaluate(`(() => {
      const items = Array.from(document.querySelectorAll('.rail-item'))
      const active = document.querySelector('.rail-item.is-active')
      const cs = active ? getComputedStyle(active) : null
      const icon = active?.querySelector('svg.rail-icon')
      const foot = document.querySelector('.rail-foot')
      return {
        icons: items.filter(node => node.querySelector('svg.rail-icon')).length,
        label: document.querySelector('.rail-group-label')?.textContent.trim() ?? '',
        activeBg: cs?.backgroundColor ?? '',
        activeColor: cs?.color ?? '',
        activeIcon: icon ? getComputedStyle(icon).color : '',
        itemH: active ? Math.round(active.getBoundingClientRect().height) : -1,
        footDivider: foot ? getComputedStyle(foot).borderTopWidth : ''
      }
    })()`)
    check(
      `${name}: 侧栏每项都有图标，选中项是半透明青底 + 亮青字（深框上可读）`,
      railLook.icons === 3 && railLook.activeBg === 'rgba(127, 210, 226, 0.22)' &&
        railLook.activeColor === 'rgb(127, 210, 226)' &&
        railLook.activeIcon === 'rgb(127, 210, 226)' && railLook.itemH === 34,
      JSON.stringify(railLook)
    )
    check(
      `${name}: 侧栏有分组标题，底部设置用分隔线隔开`,
      railLook.label === '视图' && parseFloat(railLook.footDivider) >= 1,
      JSON.stringify(railLook)
    )
    check(
      `${name}: 概览页有日历和四块统计、没有全员概览条`,
      landing.calendar === 1 && landing.cards === 4 && landing.summary === 0,
      JSON.stringify(landing)
    )
    check(
      `${name}: 结算周期用「-」连接（不用长破折号）`,
      /月\d+日 - \d+月\d+日/.test(landing.sub) && !landing.sub.includes('—'),
      landing.sub
    )

    // 副标题（结算区间 / 天数 / 成员）做成铭牌：胶囊底 + 1px 边 + 不横贯整行
    const subBadge = await client.evaluate(`(() => {
      const sub = document.querySelector('.canvas-sub')
      const canvas = document.querySelector('.canvas')
      if (!sub) return null
      const cs = getComputedStyle(sub)
      const rect = sub.getBoundingClientRect()
      return {
        display: cs.display,
        radius: parseFloat(cs.borderTopLeftRadius),
        borderW: parseFloat(cs.borderTopWidth),
        bg: cs.backgroundColor,
        padX: [parseFloat(cs.paddingLeft), parseFloat(cs.paddingRight)],
        subW: Math.round(rect.width),
        canvasW: canvas ? Math.round(canvas.getBoundingClientRect().width) : -1
      }
    })()`)
    check(
      `${name}: 副标题是铭牌胶囊（浅底 + 全圆角，宽度贴合内容）`,
      Boolean(subBadge) &&
        subBadge.display === 'inline-block' &&
        subBadge.radius >= 999 && subBadge.borderW === 1 &&
        subBadge.bg === 'rgb(244, 246, 248)' &&
        JSON.stringify(subBadge.padX) === JSON.stringify([10, 10]) &&
        subBadge.subW < subBadge.canvasW / 2,
      JSON.stringify(subBadge)
    )

    // 今日值班牌：三列 + 整期节奏条，宽度与统计块一致，深青底
    const plaque = await client.evaluate(`(() => {
      const p = document.querySelector('.plaque')
      const grid = document.querySelector('.stats-grid')
      return {
        exists: Boolean(p),
        cells: document.querySelectorAll('.plaque-cell').length,
        bars: document.querySelectorAll('.plaque-rhythm i').length,
        tally: document.querySelectorAll('.plaque-tally > div').length,
        todayBars: document.querySelectorAll('.plaque-rhythm i.is-today').length,
        barsGap: document.querySelectorAll('.plaque-rhythm-gap').length,
        barWidths: Array.from(document.querySelectorAll('.plaque-rhythm i')).map(node =>
          Math.round(node.getBoundingClientRect().width * 100) / 100
        ),
        bg: p ? getComputedStyle(p).backgroundColor : '',
        w: Math.round(p?.getBoundingClientRect().width ?? 0),
        h: Math.round(p?.getBoundingClientRect().height ?? 0),
        gridW: Math.round(grid?.getBoundingClientRect().width ?? 0)
      }
    })()`)
    check(
      `${name}: 概览页有今日值班牌（三列 + 整期节奏条）`,
      plaque.exists && plaque.cells === 3 && plaque.bars >= 30 &&
        plaque.tally > 0 && Math.abs(plaque.w - plaque.gridW) <= 1 &&
        // 900 高窗口下画布会内容溢出：牌面不能被 flex 收缩压成 0 高
        plaque.h >= 150 && plaque.bg === 'rgb(14, 34, 40)' &&
        // 节奏条：色块等宽，且按默认班次分组（组间有 gap 元素）
        plaque.barsGap >= 1 &&
        Math.max(...plaque.barWidths) - Math.min(...plaque.barWidths) <= 1,
      JSON.stringify(plaque)
    )

    // 统计卡观感：抬头有发丝线 + 强调色小竖条；六格带班次色条；实发是浅青结算贴片
    const statLook = await client.evaluate(`(() => {
      const head = document.querySelector('.stat-card .stat-head')
      const title = head?.querySelector('.stat-title')
      const before = title ? getComputedStyle(title, '::before') : null
      const cells = Array.from(document.querySelectorAll('.day-count'))
      const first = cells[0]
      const firstCs = first ? getComputedStyle(first) : null
      return {
        headBorder: head ? getComputedStyle(head).borderBottomWidth : '',
        barW: before ? parseFloat(before.width) : -1,
        barBg: before?.backgroundColor ?? '',
        cells: cells.length,
        cellBg: firstCs?.backgroundColor ?? '',
        leftW: firstCs ? parseFloat(firstCs.borderLeftWidth) : -1,
        leftColor: firstCs?.borderLeftColor ?? ''
      }
    })()`)
    check(
      `${name}: 统计卡有抬头分隔线与强调色小竖条`,
      statLook.headBorder === '1px' && statLook.barW === 3 &&
        statLook.barBg === 'rgb(27, 108, 128)',
      JSON.stringify(statLook)
    )
    // 竖条是概览页所有卡片的统一抬头锚点：四张统计卡 + 待办卡都要有
    const cardBars = await client.evaluate(`(() => {
      const titles = Array.from(document.querySelectorAll('.stat-title'))
      const todo = document.querySelector('.todo-card-title')
      const bar = node => getComputedStyle(node, '::before').backgroundColor
      return {
        statCount: titles.length,
        statBars: titles.filter(node => bar(node) === 'rgb(27, 108, 128)').length,
        todoBar: todo ? bar(todo) : ''
      }
    })()`)
    check(
      `${name}: 概览页统计卡与待办卡都带同一根竖条`,
      cardBars.statCount >= 4 && cardBars.statBars === cardBars.statCount &&
        cardBars.todoBar === 'rgb(27, 108, 128)',
      JSON.stringify(cardBars)
    )
    check(
      `${name}: 本月概览六格是班次色贴片（白班底 #dff3ff，格间不画分隔线）`,
      statLook.cells === 6 && statLook.cellBg === 'rgb(223, 243, 255)' &&
        statLook.leftW === 0,
      JSON.stringify(statLook)
    )

    const layout = await client.evaluate(`(() => {
      const cal = document.querySelector('.calendar-grid')?.getBoundingClientRect()
      const grid = document.querySelector('.stats-grid')?.getBoundingClientRect()
      return {
        cal: Math.round(cal?.width ?? 0),
        grid: Math.round(grid?.width ?? 0),
        viewport: window.innerWidth
      }
    })()`)
    check(
      `${name}: 日历固定 840、统计区更宽`,
      layout.cal >= 839 && layout.cal <= 841 && layout.grid > layout.cal,
      JSON.stringify(layout)
    )

    // 待办卡片：日历右侧，高度与**日历网格**等高，右边界与统计块对齐
    const todoLayout = await client.evaluate(`(() => {
      const rect = sel => document.querySelector(sel)?.getBoundingClientRect()
      const calGrid = rect('.calendar-grid')
      const todo = rect('.todo-card')
      const grid = rect('.stats-grid')
      const top = rect('.overview-top')
      return {
        calGridH: Math.round(calGrid?.height ?? 0),
        todoH: Math.round(todo?.height ?? 0),
        todoW: Math.round(todo?.width ?? 0),
        calRight: Math.round(calGrid?.right ?? 0),
        todoLeft: Math.round(todo?.left ?? 0),
        todoRight: Math.round(todo?.right ?? 0),
        gridRight: Math.round(grid?.right ?? 0),
        topW: Math.round(top?.width ?? 0)
      }
    })()`)
    check(
      `${name}: 待办卡在日历右侧，与日历网格等高`,
      todoLayout.todoH === todoLayout.calGridH && todoLayout.todoH > 0 &&
        todoLayout.todoLeft > todoLayout.calRight,
      JSON.stringify(todoLayout)
    )
    check(
      `${name}: 待办卡右边界与统计块对齐`,
      todoLayout.todoRight === todoLayout.gridRight,
      JSON.stringify(todoLayout)
    )

    // 统计区块：刚建完数据还没有加班，也没有薪资
    const emptyStats = await client.evaluate(`(() => ({
      days: document.querySelectorAll('.day-count').length,
      noOvertime: Array.from(document.querySelectorAll('.stat-empty')).map(node => node.textContent.trim()),
      profileCta: Boolean(Array.from(document.querySelectorAll('.stat-empty-block button'))
        .find(node => node.textContent.trim() === '去「个人信息」填'))
    }))()`)
    check(`${name}: 本月概览列出六个班次天数`, emptyStats.days === 6, JSON.stringify(emptyStats))
    check(
      `${name}: 没有加班时两块给空态，薪资块给填工资的入口`,
      // 加班分布 + 每日明细各一条「还没有加班记录」，薪资块一条「还没填基本工资」
      emptyStats.noOvertime.filter(text => text === '这个月还没有加班记录。').length === 2 &&
        emptyStats.noOvertime.some(text => text.includes('基本工资')) &&
        emptyStats.profileCta === true,
      JSON.stringify(emptyStats)
    )

    await goMatrix(client)
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 3', '矩阵出现 3 行')
    check(`${name}: 矩阵页出现 1 本人 + 2 同事`, true)
    check(`${name}: 今日概览条只在矩阵页`, await client.evaluate('document.querySelectorAll(".summary").length === 1'))

    // 矩阵概览条与值班牌同一套材质：深青底、亮字、发丝分隔
    const summaryLook = await client.evaluate(`(() => {
      const card = document.querySelector('.summary')
      const cell = document.querySelector('.summary-cell')
      const label = document.querySelector('.summary-label')
      const value = document.querySelector('.summary-value')
      const more = document.querySelector('.summary-more')
      return {
        cells: document.querySelectorAll('.summary-cell').length,
        bg: getComputedStyle(card).backgroundColor,
        color: getComputedStyle(card).color,
        cellBorder: getComputedStyle(cell).borderRightColor,
        labelColor: getComputedStyle(label).color,
        labelSize: getComputedStyle(label).fontSize,
        valueColor: getComputedStyle(value).color,
        valueSize: getComputedStyle(value).fontSize,
        valueWeight: getComputedStyle(value).fontWeight,
        moreColor: getComputedStyle(more).color
      }
    })()`)
    check(
      `${name}: 矩阵概览条与值班牌同材质（深青底 + 发丝分隔）`,
      summaryLook.cells === 3 &&
        summaryLook.bg === 'rgb(14, 34, 40)' &&
        summaryLook.color === 'rgb(233, 242, 244)' &&
        summaryLook.cellBorder === 'rgb(39, 68, 77)' &&
        summaryLook.labelColor === 'rgb(163, 183, 188)' &&
        summaryLook.labelSize === '11px' &&
        summaryLook.valueColor === 'rgb(233, 242, 244)' &&
        summaryLook.valueSize === '34px' &&
        summaryLook.valueWeight === '700' &&
        summaryLook.moreColor === 'rgb(127, 210, 226)',
      JSON.stringify(summaryLook)
    )

    // 名单浮层（桌面）：宽度取格子的一半，贴着「查看名单」按钮的左缘，不出屏
    await client.evaluate(`document.querySelector('.summary-more')?.click(); true`)
    await waitFor(client, 'Boolean(document.querySelector(".summary-popover-panel"))', '名单浮层')
    await sleep(150)
    const summaryPopover = await client.evaluate(`(() => {
      const node = document.querySelector('.summary-popover-panel')
      const trigger = document.querySelector('.summary-more')
      const cell = trigger.parentElement
      const rect = node.getBoundingClientRect()
      const trigRect = trigger.getBoundingClientRect()
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        w: Math.round(rect.width),
        trigLeft: Math.round(trigRect.left),
        trigBottom: Math.round(trigRect.bottom),
        cellW: Math.round(cell.getBoundingClientRect().width),
        vw: window.innerWidth
      }
    })()`)
    /* 桌面档有 `min-width: 200px` 下限：窄窗口里「格子一半」只有 109–127px，
     * 扣掉内边距 / 列间距 / 56px 岗位列后姓名列仅剩约 15px，中文姓名会逐字换行。
     * 所以期望宽度是 max(格子一半, 200)，而不是严格等于格子一半。 */
    const expectedPopoverW = Math.max(200, Math.round(summaryPopover.cellW / 2))
    check(
      `${name}: 名单浮层贴按钮、宽度=max(格子一半,200)且不出屏`,
      Math.abs(summaryPopover.left - summaryPopover.trigLeft) <= 1 &&
        Math.abs(summaryPopover.w - expectedPopoverW) <= 2 &&
        summaryPopover.top > summaryPopover.trigBottom &&
        summaryPopover.right <= summaryPopover.vw,
      JSON.stringify(summaryPopover)
    )
    // 再点一次触发按钮即收起（Radix 的 toggle）
    await client.evaluate(`document.querySelector('.summary-more')?.click(); true`)
    await waitFor(client, '!document.querySelector(".summary-popover-panel")', '名单浮层关闭')

    // 矩阵里本人那一行带徽章，同事没有
    const selfBadges = await client.evaluate(`(() => {
      const badges = document.querySelectorAll('.matrix-row .badge-self').length
      const selfRow = document.querySelector('.matrix-row.is-self')
      return {
        badges,
        selfName: selfRow?.querySelector('.matrix-name')?.textContent.trim() ?? '',
        nameIsButton: Boolean(document.querySelector('.matrix-name-cell button'))
      }
    })()`)
    check(
      `${name}: 矩阵里只有本人行带徽章`,
      selfBadges.badges === 1 && selfBadges.selfName.startsWith('张三'),
      JSON.stringify(selfBadges)
    )
    check(`${name}: 矩阵姓名不再可点（日历已锁本人）`, selfBadges.nameIsButton === false)

    // 矩阵观感：药丸块由 ::before 画（格子保持直角 → 列线连续）；今天只在表头标
    const matrixLook = await client.evaluate(`(() => {
      const cell = document.querySelector('.matrix-row .matrix-cell')
      const cs = cell ? getComputedStyle(cell) : null
      const before = cell ? getComputedStyle(cell, '::before') : null
      const rect = cell?.getBoundingClientRect()
      const head = document.querySelector('.matrix-day.is-today')
      const todayCell = document.querySelector('.matrix-cell.is-today')
      const nameCell = document.querySelector('.matrix-row .matrix-name-cell')
      const names = Array.from(document.querySelectorAll('.matrix-row .matrix-name, .matrix-row .matrix-pattern'))
      return {
        // 格子本身是直角 + 透明底，列线才是连续的
        cellRadius: cs?.borderRadius ?? '',
        cellBg: cs?.backgroundColor ?? '',
        // 药丸画在 ::before 上：四边留白必须**同一个值**（等宽），3px 圆角、有底色
        pillTop: before ? parseFloat(before.top) : -1,
        pillRight: before ? parseFloat(before.right) : -1,
        pillBottom: before ? parseFloat(before.bottom) : -1,
        pillLeft: before ? parseFloat(before.left) : -1,
        pillRadius: before?.borderRadius ?? '',
        pillBg: before?.backgroundColor ?? '',
        cellH: rect ? Math.round(rect.height) : -1,
        todayHeadBg: head ? getComputedStyle(head).backgroundColor : '',
        todayHeadBand: head ? getComputedStyle(head).boxShadow : '',
        todayCellShadow: todayCell ? getComputedStyle(todayCell).boxShadow : 'none',
        nameW: nameCell ? Math.round(nameCell.getBoundingClientRect().width) : -1,
        // 姓名 / 班序两行都不该被省略号截断
        nameClipped: names.some(node => node.scrollWidth > node.clientWidth + 1),
        // 画布内的重要文字必须继承正文色，不能继承深色外框的文字色
        titleColor: getComputedStyle(
          document.querySelector('.topbar-title') ?? document.querySelector('.canvas')
        ).color,
        nameColor: getComputedStyle(document.querySelector('.matrix-name')).color
      }
    })()`)
    check(
      `${name}: 画布标题与矩阵姓名用正文色（不继承深框的灰）`,
      matrixLook.titleColor === 'rgb(19, 20, 22)' &&
        matrixLook.nameColor === 'rgb(19, 20, 22)',
      JSON.stringify({ title: matrixLook.titleColor, name: matrixLook.nameColor })
    )
    check(
      `${name}: 矩阵色块四边留白等宽（格子直角 + ::before 画块，列线才连续）`,
      matrixLook.cellRadius === '0px' && matrixLook.cellBg === 'rgba(0, 0, 0, 0)' &&
        matrixLook.pillTop === 4 && matrixLook.pillLeft === 4 &&
        matrixLook.pillRight === matrixLook.pillTop &&
        matrixLook.pillBottom === matrixLook.pillTop &&
        matrixLook.pillRadius === '3px' && matrixLook.pillBg !== 'rgba(0, 0, 0, 0)',
      JSON.stringify(matrixLook)
    )
    check(
      `${name}: 今天只标在表头，正文格子不再画描边`,
      matrixLook.todayHeadBg !== '' && matrixLook.todayHeadBand !== 'none' &&
        matrixLook.todayCellShadow === 'none',
      JSON.stringify(matrixLook)
    )
    check(
      `${name}: 成员列收窄到 120（内容不被省略号截断）`,
      matrixLook.nameW >= 100 && matrixLook.nameW <= 124 && matrixLook.nameClipped === false,
      JSON.stringify(matrixLook)
    )

    // 矩阵视图切换：按班次（单字）→ 按姓名（格子里写人名，列宽固定 56）
    const shiftView = await client.evaluate(`(() => {
      const cell = document.querySelector('.matrix-row .matrix-cell')
      return {
        active: document.querySelector('.segmented-item.is-on')?.textContent.trim() ?? '',
        text: cell?.textContent.trim() ?? '',
        hasName: document.querySelectorAll('.matrix-name').length > 0
      }
    })()`)
    check(
      `${name}: 矩阵默认「按班次」，格子里是单字`,
      shiftView.active === '按班次' && shiftView.text.length === 1 && shiftView.hasName,
      JSON.stringify(shiftView)
    )

    await client.evaluate(clickByText('.segmented-item', '按姓名'))
    await sleep(250)
    const nameView = await client.evaluate(`(() => {
      const row = document.querySelector('.matrix-row')
      const cell = row?.querySelector('.matrix-cell')
      const cellRect = cell?.getBoundingClientRect()
      const scroll = document.querySelector('.matrix-scroll')
      const days = row?.querySelector('.matrix-days')
      const cells = Array.from(days?.querySelectorAll('.matrix-cell') ?? [])
      const last = cells[cells.length - 1]
      const headCell = row?.querySelector('.matrix-name-cell')
      return {
        active: document.querySelector('.segmented-item.is-on')?.textContent.trim() ?? '',
        // 行头 title 是「姓名 · 班序·岗位」，用它反查这一行是谁
        rowName: (headCell?.getAttribute('title') ?? '').split(' · ')[0],
        cellText: cell?.textContent.trim() ?? '',
        cellW: cellRect ? Math.round(cellRect.width) : -1,
        // 姓名已经搬进格子，行头不该再有姓名
        nameInHead: document.querySelectorAll('.matrix-name').length,
        headLabel: document.querySelector('.matrix-head .matrix-name-cell')?.textContent.trim() ?? '',
        scrolls: scroll ? scroll.scrollWidth > scroll.clientWidth : false,
        // 班序与按班次视图同样左对齐
        justify: headCell ? getComputedStyle(headCell).justifyContent : '',
        // 换视图不换几何：色块四边留白仍是同一个值
        pillGaps: (() => {
          const before = cell ? getComputedStyle(cell, '::before') : null
          if (!before) return []
          return [before.top, before.right, before.bottom, before.left].map(v => parseFloat(v))
        })(),
        // 最后一列右边不该再有一条空白（列宽 1fr 拉伸后应正好铺满）
        tailGap: last && days
          ? Math.round(days.getBoundingClientRect().right - last.getBoundingClientRect().right)
          : -1,
        // 横向滚动条既然隐藏了，就不该再占高度（扣掉上下边框，别把边框当成滚动条）
        barHidden: (() => {
          if (!scroll) return false
          const cs = getComputedStyle(scroll)
          const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
          return scroll.offsetHeight - scroll.clientHeight - border === 0
        })()
      }
    })()`)
    check(
      `${name}: 按姓名视图格子里写人名、行头只剩班序（左对齐）`,
      nameView.active === '按姓名' && nameView.cellText === nameView.rowName &&
        nameView.cellText.length > 1 && nameView.nameInHead === 0 &&
        nameView.headLabel === '班序' && nameView.justify === 'flex-start',
      JSON.stringify(nameView)
    )
    check(
      `${name}: 按姓名视图列宽至少 56、最后一列不留空白、滚动条不占位`,
      nameView.cellW >= 56 && nameView.scrolls === true &&
        nameView.tailGap === 0 && nameView.barHidden === true,
      JSON.stringify(nameView)
    )
    check(
      `${name}: 按姓名视图色块四边留白等宽（与按班次视图同一套数值）`,
      nameView.pillGaps.length === 4 && nameView.pillGaps.every(gap => gap === 4),
      JSON.stringify(nameView)
    )

    // 滚动条藏起来了，滚轮必须能横滚
    const wheelScroll = await client.evaluate(`(() => {
      const scroll = document.querySelector('.matrix-scroll')
      if (!scroll) return { ok: false }
      const before = scroll.scrollLeft
      scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, bubbles: true, cancelable: true }))
      const after = scroll.scrollLeft
      scroll.scrollLeft = 0
      return { ok: after > before, before, after }
    })()`)
    check(
      `${name}: 鼠标在矩阵上滚滚轮即横向滚动`,
      wheelScroll.ok === true,
      JSON.stringify(wheelScroll)
    )

    await client.evaluate(clickByText('.segmented-item', '按班次'))
    await sleep(250)
    const backToShift = await client.evaluate(`(() => {
      const cell = document.querySelector('.matrix-row .matrix-cell')
      return {
        active: document.querySelector('.segmented-item.is-on')?.textContent.trim() ?? '',
        text: cell?.textContent.trim() ?? '',
        nameInHead: document.querySelectorAll('.matrix-name').length
      }
    })()`)
    check(
      `${name}: 切回按班次恢复单字与姓名行头`,
      backToShift.active === '按班次' && backToShift.text.length === 1 && backToShift.nameInHead > 0,
      JSON.stringify(backToShift)
    )

    // 切到日历：没有人员下拉，本人只由页面副标题说明（日历上方不再重复一遍）
    await goOverview(client)
    const calendarLock = await client.evaluate(`(() => ({
      selects: document.querySelectorAll('.canvas-tools select, .canvas-tools .select-trigger, .calendar select, .calendar .select-trigger').length,
      // 日历自己不该有标题块 —— 姓名/班序只在页面副标题出现一次
      dupHead: document.querySelectorAll('.calendar-head, .calendar-name, .calendar-sub').length,
      sub: (document.querySelector('.canvas.is-overview .canvas-sub')?.textContent ?? '')
        .replace(/\\s+/g, ' ').trim()
    }))()`)
    check(
      `${name}: 个人日历锁定本人、且不再重复一遍姓名`,
      calendarLock.selects === 0 && calendarLock.dupHead === 0 && calendarLock.sub.includes('张三'),
      JSON.stringify(calendarLock)
    )
    await goMatrix(client)

    // --- 2b. 设置分页 + 个人信息：区块到位，薪资能落盘 ---
    await client.evaluate(clickByText('[data-view="settings"]', '设置'))
    await waitFor(client, 'Boolean(document.querySelector(".canvas-tools [data-slot=\\"tabs-trigger\\"]"))', '设置页 tab')

    const tabState = await client.evaluate(`(() => ({
      labels: Array.from(document.querySelectorAll('.canvas-tools [data-slot="tabs-trigger"]')).map(node => node.textContent.trim()),
      active: document.querySelector('.canvas-tools [data-slot="tabs-trigger"][data-state="active"]')?.textContent.trim() ?? '',
      patterns: document.querySelectorAll('.pattern-block').length,
      members: document.querySelectorAll('.member-editor').length,
      profile: document.querySelectorAll('.profile-section').length
    }))()`)
    check(
      `${name}: 设置分两页且默认落在人员配置（JIG DATA 只在桌面壳出现）`,
      JSON.stringify(tabState.labels) === JSON.stringify(['人员配置', '系统设置']) &&
        tabState.active === '人员配置' &&
        tabState.patterns === 1 &&
        tabState.members === 1 &&
        tabState.profile === 0,
      JSON.stringify(tabState)
    )

    // 内置班序默认收起：先用一枚折叠条占位
    const builtinCollapsed = await client.evaluate(`(() => ({
      toggle: Boolean(document.querySelector('.pattern-collapsed')),
      chips: document.querySelectorAll('.pattern-chip').length
    }))()`)
    check(
      `${name}: 内置班序默认收起`,
      builtinCollapsed.toggle === true && builtinCollapsed.chips === 0,
      JSON.stringify(builtinCollapsed)
    )

    // 展开一次，后面的观感与预览断言都在展开态下做
    await client.evaluate(`(() => {
      const toggle = document.querySelector('.pattern-collapsed')
      if (toggle) toggle.click()
      return true
    })()`)
    await waitFor(client, 'document.querySelectorAll(".pattern-chip").length === 20', '展开内置班序')

    // 人员配置页观感：区块抬头竖条、面板有边界、班序卡是「轨道 + 色块」、成员表头有分隔线
    const settingsLook = await client.evaluate(`(() => {
      const title = document.querySelector('.settings-label h2')
      const bar = title ? getComputedStyle(title, '::before') : null
      const panel = document.querySelector('.settings-panel')
      const chip = document.querySelector('.pattern-chip')
      const chipCs = chip ? getComputedStyle(chip) : null
      const track = document.querySelector('.pattern-bar')
      const head = document.querySelector('.member-editor-head')
      const row = document.querySelector('.member-row')
      return {
        barW: bar ? parseFloat(bar.width) : -1,
        barBg: bar?.backgroundColor ?? '',
        panelBorder: panel ? parseFloat(getComputedStyle(panel).borderTopWidth) : -1,
        chipRadius: chipCs?.borderRadius ?? '',
        chipPad: chipCs ? [parseFloat(chipCs.paddingTop), parseFloat(chipCs.paddingLeft)] : [],
        trackH: track ? parseFloat(getComputedStyle(track).height) : -1,
        trackBg: track ? getComputedStyle(track).backgroundColor : '',
        headBorder: head ? parseFloat(getComputedStyle(head).borderBottomWidth) : -1,
        rowHoverRule: row ? getComputedStyle(row).backgroundColor : ''
      }
    })()`)
    check(
      `${name}: 设置页区块有强调色竖条、面板改用白卡（不再画边框）`,
      settingsLook.barW === 3 && settingsLook.barBg === 'rgb(27, 108, 128)' &&
        settingsLook.panelBorder === 0,
      JSON.stringify(settingsLook)
    )
    check(
      `${name}: 班序卡更松、24 格条有浅灰轨道，成员表头有分隔线`,
      JSON.stringify(settingsLook.chipPad) === JSON.stringify([8, 8]) &&
        settingsLook.chipRadius === '8px' &&
        settingsLook.trackH === 14 && settingsLook.trackBg === 'rgb(244, 246, 248)' &&
        settingsLook.headBorder === 1,
      JSON.stringify(settingsLook)
    )

    // 页头固定：分隔线以上不滚，只有 .canvas-flow 滚
    const pinnedState = `(() => {
      const canvas = document.querySelector('.canvas')
      const flow = document.querySelector('.canvas-flow')
      const head = document.querySelector('.canvas-head')
      const cs = flow ? getComputedStyle(flow) : null
      const headTop = head ? Math.round(head.getBoundingClientRect().top) : -1
      if (flow) flow.scrollTop = 200
      const headTopAfter = head ? Math.round(head.getBoundingClientRect().top) : -1
      const scrolled = flow?.scrollTop ?? -1
      if (flow) flow.scrollTop = 0
      return {
        canvasOverflow: canvas ? getComputedStyle(canvas).overflowY : '',
        flowOverflow: cs?.overflowY ?? '',
        borderTop: cs ? cs.borderTopWidth + ' ' + cs.borderTopStyle : '',
        borderColor: cs?.borderTopColor ?? '',
        headTop,
        headTopAfter,
        scrolled,
        scrollH: flow?.scrollHeight ?? -1,
        clientH: flow?.clientHeight ?? -1
      }
    })()`
    const pinnedRoster = await client.evaluate(pinnedState)
    check(
      `${name}: 人员配置页页头钉住（分隔线下滚，页头不动）`,
      pinnedRoster.canvasOverflow === 'hidden' &&
        pinnedRoster.flowOverflow === 'auto' &&
        pinnedRoster.borderTop === '1px solid' &&
        pinnedRoster.borderColor === 'rgb(232, 235, 238)' &&
        pinnedRoster.scrolled > 0 &&
        pinnedRoster.headTop === pinnedRoster.headTopAfter,
      JSON.stringify(pinnedRoster)
    )

    const selfRow = await client.evaluate(`(() => {
      const row = document.querySelector('.member-row.is-self')
      const locked = row?.querySelector('.member-locked')
      const lockedCs = locked ? getComputedStyle(locked) : null
      return {
        selfBadges: document.querySelectorAll('.member-row .badge-self').length,
        selfInputs: document.querySelectorAll('.member-row.is-self input, .member-row.is-self select, .member-row.is-self .select-trigger').length,
        selfDeleteDisabled: Boolean(document.querySelector('.member-row.is-self [data-slot="button"][disabled]')),
        lockedBg: lockedCs?.backgroundColor ?? '',
        lockedShadow: lockedCs?.boxShadow ?? ''
      }
    })()`)
    check(
      `${name}: 成员表里的本人行只读且删除禁用`,
      selfRow.selfBadges === 1 && selfRow.selfInputs === 0 && selfRow.selfDeleteDisabled === true,
      JSON.stringify(selfRow)
    )
    check(
      `${name}: 本人行的只读格子有独立浅灰描边，和面板背景分开`,
      selfRow.lockedBg === 'rgb(255, 255, 255)' &&
        selfRow.lockedShadow.includes('inset'),
      JSON.stringify(selfRow)
    )

    // 个人信息已并入人员配置页（排在最前）：三段同页共存
    await waitFor(client, 'Boolean(document.querySelector(".profile-section"))', '个人信息区块')
    const mergedPage = await client.evaluate(`(() => ({
      patterns: document.querySelectorAll('.pattern-block').length,
      members: document.querySelectorAll('.member-editor').length,
      profile: document.querySelectorAll('.profile-section').length,
      order: [...document.querySelectorAll('.canvas-flow .settings-group')]
        .map(node => node.querySelector('h2')?.textContent?.trim() ?? '')
        .slice(0, 3)
    }))()`)
    check(
      `${name}: 个人信息 / 班序 / 成员同页共存，个人信息排最前`,
      mergedPage.patterns === 1 && mergedPage.members === 1 && mergedPage.profile === 1 &&
        JSON.stringify(mergedPage.order) === JSON.stringify(['个人信息', '班序', '成员']),
      JSON.stringify(mergedPage)
    )

    const profileMeta = await client.evaluate(
      `document.querySelector('.profile-section .settings-meta')?.textContent.trim() ?? ''`
    )
    check(`${name}: 人员配置页标出本人`, profileMeta.includes('张三'), profileMeta)

    // 个人资料页与人员配置页同一套：页头钉住 + 分隔线
    // 内容高度随数据与文案变化：能滚时要求真的滚起来，装得下时只校验页头不动
    const pinnedProfile = await client.evaluate(pinnedState)
    check(
      `${name}: 人员配置页页头同样钉住（分隔线下滚，页头不动）`,
      pinnedProfile.canvasOverflow === 'hidden' &&
        pinnedProfile.flowOverflow === 'auto' &&
        pinnedProfile.borderTop === '1px solid' &&
        (pinnedProfile.scrollH <= pinnedProfile.clientH || pinnedProfile.scrolled > 0) &&
        pinnedProfile.headTop === pinnedProfile.headTopAfter,
      JSON.stringify(pinnedProfile)
    )

    // 本人岗位：在个人信息里填，应落到本人那条 member 上（只改岗位不触发换人清空）
    check(`${name}: 填本人岗位`, await client.evaluate(setInputBySelector('input[aria-label="本人岗位"]', '班长')))
    await sleep(150)
    check(
      `${name}: 保存本人信息（只改岗位）`,
      await client.evaluate(clickByText('.profile-section [data-slot="button"]', '保存本人信息'))
    )
    await sleep(300)
    const selfPosition = await client.evaluate(`(() => {
      const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
      const parsed = raw ? JSON.parse(raw) : null
      const self = parsed?.members?.find(member => member.id === parsed?.profile?.memberId)
      return self?.position ?? null
    })()`)
    check(`${name}: 本人岗位写进 member`, selfPosition === '班长', JSON.stringify(selfPosition))

    // 备份说明在浏览器 / 静态版不再展示存储位置文案（只有桌面壳里才提示）

    check(`${name}: 填基本工资`, await client.evaluate(setInputBySelector('.salary-grid input', '8000')))
    await sleep(150)
    check(`${name}: 保存薪资`, await client.evaluate(clickByText('.profile-section [data-slot="button"]', '保存薪资')))
    await sleep(300)

    const salaryStored = await client.evaluate(`(() => {
      const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
      const parsed = raw ? JSON.parse(raw) : null
      return {
        base: parsed?.profile?.salary?.baseSalary ?? null,
        hasMemberId: Boolean(parsed?.profile?.memberId)
      }
    })()`)
    check(
      `${name}: 薪资写进 profile 并落盘`,
      salaryStored.base === '8000' && salaryStored.hasMemberId,
      JSON.stringify(salaryStored)
    )

    // 系统设置页：三张组卡 + 行式设置项（行高 48/56、控件右对齐、危险区独立配色）
    await switchSettingsTab(client, '系统设置')
    await waitFor(client, 'document.querySelectorAll(".settings-group").length === 3', '系统设置三组')
    const systemLook = await client.evaluate(`(() => {
      const groups = [...document.querySelectorAll('.settings-group')]
      const rows = [...document.querySelectorAll('.settings-row')]
      const first = rows[0]
      const cs = first ? getComputedStyle(first) : null
      const control = first?.querySelector('.settings-row-control')
      const card = document.querySelector('.settings-card')
      const dangerCard = document.querySelector('.settings-group.is-danger .settings-card')
      const dangerTitle = document.querySelector('.settings-group.is-danger .settings-label h2')
      return {
        groups: groups.length,
        dangerGroups: document.querySelectorAll('.settings-group.is-danger').length,
        rows: rows.length,
        rowH: first ? Math.round(first.getBoundingClientRect().height) : -1,
        rowPadY: cs ? parseFloat(cs.paddingTop) : -1,
        controlRightAligned: control
          ? Math.abs(control.getBoundingClientRect().right - first.getBoundingClientRect().right) <= 17
          : false,
        cardRadius: card ? getComputedStyle(card).borderRadius : '',
        dangerBorder: dangerCard ? getComputedStyle(dangerCard).borderTopColor : '',
        dangerTitleColor: dangerTitle ? getComputedStyle(dangerTitle).color : '',
        segH: (() => {
          const item = document.querySelector('.settings-row .segmented-item')
          const wrap = document.querySelector('.settings-row .segmented')
          if (!item || !wrap) return -1
          return Math.round(wrap.getBoundingClientRect().height)
        })()
      }
    })()`)
    check(
      `${name}: 系统设置三组卡、行式设置项、危险区独立配色`,
      systemLook.groups === 3 &&
        systemLook.dangerGroups === 1 &&
        systemLook.rows >= 4 &&
        systemLook.rows <= 6 &&
        systemLook.rowPadY === 12 &&
        systemLook.rowH >= 48 &&
        systemLook.controlRightAligned &&
        systemLook.cardRadius === '12px' &&
        systemLook.dangerBorder === 'rgb(227, 181, 176)' &&
        systemLook.dangerTitleColor === 'rgb(180, 35, 24)' &&
        systemLook.segH === 32,
      JSON.stringify(systemLook)
    )

    await client.evaluate(clickByText('[data-view="matrix"]', '全员矩阵'))
    await waitFor(client, 'Boolean(document.querySelector(".matrix"))', '回到矩阵')

    // 本人行只读：点本人的格子不弹层，改成提示去日历里改
    await client.evaluate(`(() => { document.querySelector('.matrix-row.is-self .matrix-cell')?.click(); return true })()`)
    await sleep(150)
    const selfDialog = await client.evaluate('Boolean(document.querySelector(".dialog"))')
    check(`${name}: 矩阵里点本人的格子不弹层（本人班次只在日历里改）`, selfDialog === false)

    // --- 3. 改班 ---
    const before = await client.evaluate(`document.querySelector(${JSON.stringify(firstCell)}).textContent.trim()`)
    const targetShift = ['白特', '夜特', '事假', '休息', '白班', '夜班'].find(shift => SHORT_LABEL[shift] !== before) ?? '白特'

    await client.evaluate(`document.querySelector(${JSON.stringify(firstCell)}).click(); true`)
    await waitFor(client, 'Boolean(document.querySelector(".dialog"))', '改班弹层')
    check(`${name}: 点击格子打开改班弹层`, true)
    // 矩阵弹层只能改班次：不该出现加班/法定两段
    const matrixDialog = await client.evaluate(`(() => ({
      day: document.querySelectorAll('.dialog-day').length,
      overtime: document.querySelectorAll('.ot-presets, .ot-input').length
    }))()`)
    check(
      `${name}: 矩阵弹层不含加班录入`,
      matrixDialog.day === 0 && matrixDialog.overtime === 0,
      JSON.stringify(matrixDialog)
    )

    const picked = await client.evaluate(`(() => {
      const option = Array.from(document.querySelectorAll('.dialog-options .option'))
        .find(item => item.textContent.trim() === ${JSON.stringify(targetShift)})
      if (!option) return false
      option.click()
      return true
    })()`)
    check(`${name}: 选中「${targetShift}」`, picked)
    await sleep(200)

    check(`${name}: 点击保存`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
    await waitFor(client, '!document.querySelector(".dialog")', '弹层关闭')

    let stored = null
    const saveDeadline = Date.now() + 3000
    while (Date.now() < saveDeadline) {
      stored = await client.evaluate(`window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})`)
      if (stored && stored.includes('overrides')) break
      await sleep(150)
    }

    let parsed = null
    try {
      parsed = JSON.parse(stored || 'null')
    } catch {
      parsed = null
    }
    check(
      `${name}: 改动写入 roster v2`,
      Boolean(parsed?.overrides?.length === 1 && parsed.overrides[0].shift === targetShift),
      JSON.stringify(parsed?.overrides ?? null)
    )

    // --- 4. 刷新后仍在 ---
    await client.send('Page.reload', { ignoreCache: true })
    await waitFor(client, 'document.readyState === "complete"', '页面重新加载')
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 3', '矩阵重新渲染')

    const afterReload = await client.evaluate(`(() => {
      const cell = document.querySelector(${JSON.stringify(firstCell)})
      if (!cell) return null
      return { text: cell.textContent.trim(), marked: cell.classList.contains('is-edited') }
    })()`)
    check(
      `${name}: 刷新后改动仍在且矩阵不带标记`,
      Boolean(afterReload && afterReload.text === SHORT_LABEL[targetShift] && afterReload.marked === false),
      JSON.stringify(afterReload)
    )

    // --- 5. 恢复默认 ---
    await client.evaluate(`document.querySelector(${JSON.stringify(firstCell)}).click(); true`)
    await waitFor(client, 'Boolean(document.querySelector(".dialog"))', '改班弹层')
    check(`${name}: 点击恢复默认`, await client.evaluate(clickByText('.dialog-foot button', '恢复默认')))
    await waitFor(client, '!document.querySelector(".dialog")', '弹层关闭')

    await sleep(300)
    const afterReset = await client.evaluate(`window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})`)
    let resetParsed = null
    try {
      resetParsed = JSON.parse(afterReset || 'null')
    } catch {
      resetParsed = null
    }
    check(`${name}: 恢复默认后记录被删除`, resetParsed?.overrides?.length === 0, JSON.stringify(resetParsed?.overrides ?? null))

    // --- 5b. 月度概览（日历）：加班 + 法定 ---
    await goOverview(client)
    await waitFor(client, 'document.querySelectorAll(".cal-cell").length > 0', '月度概览日历')

    // 周期外的日期补齐网格：信息与周期内一致（农历 + 班次），只靠样式与是否可点区分
    const gridFill = await client.evaluate(`(() => {
      const cells = Array.from(document.querySelectorAll('.cal-cell'))
      const outside = cells.filter(cell => cell.classList.contains('is-outside'))
      const inside = cells.filter(cell => !cell.classList.contains('is-outside'))
      const bg = node => getComputedStyle(node).backgroundColor
      return {
        total: cells.length,
        outside: outside.length,
        inside: inside.length,
        // 每格都要有日号、农历、班次 —— 周期外不能只剩一个日号
        outsideDay: outside.filter(cell => /^\\d{1,2}$/.test(cell.querySelector('.cal-day')?.textContent.trim() ?? '')).length,
        outsideMeta: outside.filter(cell => (cell.querySelector('.cal-meta')?.textContent ?? '').trim().length > 0).length,
        outsideShift: outside.filter(cell => (cell.querySelector('.cal-shift')?.textContent ?? '').trim().length > 0).length,
        outsideTag: outside[0]?.tagName ?? '',
        insideTag: inside[0]?.tagName ?? '',
        // 样式区别：周期外「无边框 + 灰底」，文字保持原对比度，只有班次块退一档
        outsideBg: outside[0] ? bg(outside[0]) : '',
        insideBg: inside[0] ? bg(inside[0]) : '',
        outsideBorder: outside[0] ? getComputedStyle(outside[0]).borderTopColor : '',
        insideBorder: inside[0] ? getComputedStyle(inside[0]).borderTopColor : '',
        outsideShiftOpacity: outside[0]
          ? getComputedStyle(outside[0].querySelector('.cal-shift')).opacity
          : '',
        outsideTitles: outside.slice(0, 2).map(cell => cell.title)
      }
    })()`)
    check(
      `${name}: 日历补齐到整 7 列（无空白格）`,
      gridFill.total % 7 === 0 && gridFill.outside > 0 && gridFill.outside + gridFill.inside === gridFill.total,
      JSON.stringify(gridFill)
    )
    check(
      `${name}: 周期外也有日号、农历与班次（信息与周期内一致）`,
      gridFill.outsideDay === gridFill.outside &&
        gridFill.outsideMeta === gridFill.outside &&
        gridFill.outsideShift === gridFill.outside,
      JSON.stringify(gridFill)
    )
    check(
      `${name}: 周期外只靠样式区分（无边框 + 灰底 + 色块退一档）且不可点`,
      gridFill.outsideBg !== gridFill.insideBg &&
        gridFill.outsideBorder === 'rgba(0, 0, 0, 0)' &&
        gridFill.insideBorder !== gridFill.outsideBorder &&
        Number(gridFill.outsideShiftOpacity) < 1 &&
        gridFill.outsideTag === 'DIV' &&
        gridFill.insideTag === 'BUTTON',
      JSON.stringify(gridFill)
    )

    // 待办短横是画在日期数字上的（多 4px 高度），不能因此把整行格子撑高
    const rowHeights = await client.evaluate(`(() => {
      const cells = Array.from(document.querySelectorAll('.cal-cell'))
      const heights = [...new Set(cells.map(node => Math.round(node.getBoundingClientRect().height)))]
      return { rows: Math.round(cells.length / 7), heights }
    })()`)
    check(
      `${name}: 日历所有格子等高（待办短横不撑高行）`,
      rowHeights.heights.length === 1 && rowHeights.heights[0] > 0,
      JSON.stringify(rowHeights)
    )

    // 今天：1px 强调色内描边（不是 2px 纯黑的马克笔圈）
    const todayRing = await client.evaluate(`(() => {
      const cell = document.querySelector('.cal-cell.is-today')
      const cs = cell ? getComputedStyle(cell) : null
      return {
        shadow: cs?.boxShadow ?? '',
        // 黑框会把今天变成全屏最重的元素，明确禁止
        isBlack: /rgb\\(0, 0, 0\\)|rgb\\(19, 20, 22\\)/.test(cs?.boxShadow ?? '')
      }
    })()`)
    check(
      `${name}: 当日标记是 1px 强调色细框，不是黑色粗框`,
      todayRing.shadow.includes('1px') && todayRing.shadow.includes('rgb(27, 108, 128)') &&
        todayRing.isBlack === false,
      JSON.stringify(todayRing)
    )

    // 找一个白班/夜班的格子（休息/事假不记加班）
    const workCell = await client.evaluate(`(() => {
      const cells = Array.from(document.querySelectorAll('.cal-cell'))
      for (let index = 0; index < cells.length; index += 1) {
        // 周期外的格子是不可点的 <div>，记不了加班，得跳过
        if (cells[index].classList.contains('is-outside')) continue
        const block = cells[index].querySelector('.cal-shift')
        const text = block ? block.textContent.trim() : ''
        if (text === '白班' || text === '夜班') return { index, shift: text, date: cells[index].title }
      }
      return null
    })()`)
    check(`${name}: 日历里找到可记加班的日子`, Boolean(workCell), JSON.stringify(workCell))

    if (workCell) {
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')

      // 焦点必须进弹层：留在背景格子上时，用户一按 ESC（键盘交互），
      // Chrome 会给那个格子补上 :focus-visible 焦点环 —— 弹层关了，框线还留着
      check(
        `${name}: 弹层打开时焦点在弹层内`,
        await client.evaluate(`Boolean(document.activeElement?.closest('.dialog'))`)
      )

      // 三段加两个按钮全堆起来仍要放得进 900 高的办公屏
      const dialogSize = await client.evaluate(`(() => {
        const dialog = document.querySelector('.dialog-day')
        if (!dialog) return null
        const rect = dialog.getBoundingClientRect()
        return {
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          // 原始高度：切 tab 前后要严格相等，差 1px 就会让文字重栅格化
          hExact: Math.round(rect.height * 100) / 100,
          viewH: window.innerHeight
        }
      })()`)
      check(
        `${name}: 日历弹层放得进视口`,
        Boolean(dialogSize && dialogSize.h <= dialogSize.viewH && dialogSize.w <= 520),
        JSON.stringify(dialogSize)
      )

      const presets = await client.evaluate(
        `Array.from(document.querySelectorAll('.ot-presets .chip-mini')).map(node => node.textContent.trim())`
      )
      check(
        `${name}: 日历弹层有加班预设且不含「恢复默认」误置灰`,
        JSON.stringify(presets) === JSON.stringify(['2h', '3h', '3.5h']),
        JSON.stringify(presets)
      )
      check(
        `${name}: 日历弹层有法定选项`,
        await client.evaluate('document.querySelectorAll(".dialog-day .segmented-sm .segmented-item").length === 2')
      )

      // ── 待办页：弹层分两页，待办改动立即生效 ──
      const todoTabs = await client.evaluate(`(() => {
        const tabs = Array.from(document.querySelectorAll('.dialog-tab'))
        return {
          labels: tabs.map(node => node.textContent.trim()),
          // 默认停在「班次」页
          active: tabs.find(node => node.classList.contains('is-on'))?.textContent.trim() ?? ''
        }
      })()`)
      check(
        `${name}: 弹层分「班次 / 待办」两页，默认停在班次页`,
        todoTabs.labels.length === 2 &&
          todoTabs.labels[0] === '班次' &&
          todoTabs.labels[1].startsWith('待办') &&
          todoTabs.active === '班次',
        JSON.stringify(todoTabs)
      )

      check(
        `${name}: 切到待办页`,
        await client.evaluate(clickByText('.dialog-tab', '待办'))
      )
      await sleep(200)
      const todoPage = await client.evaluate(`(() => ({
        hasInput: Boolean(document.querySelector('.dialog-page input[aria-label="新增待办"]')),
        hasAdd: Boolean(Array.from(document.querySelectorAll('.dialog-page button'))
          .find(node => node.textContent.trim() === '添加')),
        emptyText: document.querySelector('.dialog-page .stat-empty')?.textContent.trim() ?? '',
        // 待办页底栏只有「完成」，没有「保存 / 恢复默认」
        footButtons: Array.from(document.querySelectorAll('.dialog-foot button'))
          .map(node => node.textContent.trim()),
        // 班次页的内容不该露出来
        shiftOptions: document.querySelectorAll('.dialog-day .option').length,
        // 切到待办页后的总高：必须与班次页完全相等
        dialogH: Math.round((document.querySelector('.dialog-day')?.getBoundingClientRect().height ?? -1) * 100) / 100
      }))()`)
      check(
        `${name}: 待办页有输入框与添加按钮，空态给提示`,
        todoPage.hasInput && todoPage.hasAdd &&
          todoPage.emptyText.includes('还没有待办') &&
          todoPage.shiftOptions === 0,
        JSON.stringify(todoPage)
      )
      check(
        `${name}: 待办页底栏只有「完成」（改动立即生效，不走保存）`,
        JSON.stringify(todoPage.footButtons) === JSON.stringify(['完成']),
        JSON.stringify(todoPage.footButtons)
      )
      // 弹层垂直居中：总高一变，footer 就亚像素位移，按钮内文字会重新栅格化
      check(
        `${name}: 班次 / 待办两页弹层总高一致（切 tab 不位移）`,
        Boolean(dialogSize) && Math.abs(dialogSize.hExact - todoPage.dialogH) < 1,
        JSON.stringify({ shift: dialogSize.hExact, todo: todoPage.dialogH })
      )

      // 添加一条待办
      check(
        `${name}: 输入待办并添加`,
        await client.evaluate(setInputBySelector('.dialog-page input[aria-label="新增待办"]', '交班记录表'))
      )
      await sleep(120)
      check(
        `${name}: 点「添加」`,
        await client.evaluate(clickByText('.dialog-page button', '添加'))
      )
      await sleep(250)

      const todoAdded = await client.evaluate(`(() => {
        const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
        let parsed = null
        try { parsed = JSON.parse(raw || 'null') } catch { parsed = null }
        const items = Array.from(document.querySelectorAll('.dialog-page .todo-list-item'))
        const box = items[0]?.querySelector('.todo-check')?.getBoundingClientRect()
        const text = items[0]?.querySelector('.todo-text')?.getBoundingClientRect()
        return {
          count: parsed?.todos?.length ?? -1,
          text: parsed?.todos?.[0]?.text ?? '',
          date: parsed?.todos?.[0]?.date ?? '',
          done: parsed?.todos?.[0]?.done ?? null,
          listItems: items.length,
          listText: items.map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          // 弹层里勾选框也得跟文字垂直居中
          alignDelta: box && text
            ? Math.round(Math.abs(box.top + box.height / 2 - (text.top + text.height / 2)) * 10) / 10
            : -1
        }
      })()`)
      check(
        `${name}: 待办立即写入存储（不走保存按钮）`,
        todoAdded.count === 1 &&
          todoAdded.text === '交班记录表' &&
          todoAdded.done === false &&
          todoAdded.listItems === 1,
        JSON.stringify(todoAdded)
      )
      check(
        `${name}: 弹层里勾选框与文字也垂直居中`,
        todoAdded.alignDelta >= 0 && todoAdded.alignDelta <= 0.5,
        JSON.stringify(todoAdded)
      )

      // 勾选完成 → 立即生效
      check(
        `${name}: 点勾选框标记完成`,
        await client.evaluate(`(() => {
          const box = document.querySelector('.dialog-page .todo-list-item .todo-check')
          if (!box) return false
          box.click()
          return true
        })()`)
      )
      await sleep(250)
      const todoDone = await client.evaluate(`(() => {
        const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
        let parsed = null
        try { parsed = JSON.parse(raw || 'null') } catch { parsed = null }
        const item = document.querySelector('.dialog-page .todo-list-item.is-done')
        const text = item?.querySelector('.todo-text')
        const box = item?.querySelector('.todo-check')
        const boxCs = box ? getComputedStyle(box) : null
        return {
          done: parsed?.todos?.[0]?.done ?? null,
          // 界面上要真的划线（不是只有 is-done 这个类名）
          struck: Boolean(item),
          textDecoration: text ? getComputedStyle(text).textDecorationLine : '',
          // 勾选框要填成强调色
          boxBg: boxCs?.backgroundColor ?? '',
          // 标签上的条数胶囊
          tabCount: document.querySelector('.dialog-tab-count')?.textContent.trim() ?? ''
        }
      })()`)
      check(
        `${name}: 勾选立即生效且界面划线（文字真的加了删除线、勾选框填实）`,
        todoDone.done === true && todoDone.struck === true &&
          todoDone.textDecoration.includes('line-through') &&
          todoDone.boxBg === 'rgb(27, 108, 128)' &&
          todoDone.tabCount === '1',
        JSON.stringify(todoDone)
      )

      // 关闭弹层 → 待办卡上应出现这条待办，日历格子上应有小圆点
      check(`${name}: 关掉待办页弹层`, await client.evaluate(clickByText('.dialog-foot button', '完成')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(300)

      const todoCard = await client.evaluate(`(() => {
        const card = document.querySelector('.todo-card')
        const marks = Array.from(document.querySelectorAll('.cal-day.is-todo'))
        const day = marks[0]
        const cs = day ? getComputedStyle(day) : null
        const dayRect = day?.getBoundingClientRect()
        const cell = day?.closest('.cal-cell')
        const cellRect = cell?.getBoundingClientRect()
        return {
          items: Array.from(card?.querySelectorAll('.todo-item') ?? [])
            .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          // 已完成的那条要划线
          doneItems: card?.querySelectorAll('.todo-item.is-done').length ?? -1,
          stat: card?.querySelector('.todo-card-stat')?.textContent.trim() ?? '',
          marks: marks.length,
          // 下划线：2px、橙色系、宽度只跟数字走（不能横贯整格）
          borderBottom: cs ? cs.borderBottomWidth + ' ' + cs.borderBottomStyle : '',
          borderColor: cs?.borderBottomColor ?? '',
          dayW: dayRect ? Math.round(dayRect.width) : -1,
          cellW: cellRect ? Math.round(cellRect.width) : -1,
          // 没有残留的小圆点
          dots: document.querySelectorAll('.cal-todo, .cal-dayline').length,
          // 标记必须紧贴日期数字（下划线就画在数字自己身上，left/top 应基本一致）
          onDayNumber: Boolean(day && dayRect && cellRect &&
            Math.abs(dayRect.left - cellRect.left) < 12 && dayRect.top - cellRect.top < 14),
          // 抬头：只有发丝线（强调竖条只留在首卡）
          headBorder: card
            ? getComputedStyle(card.querySelector('.todo-card-head')).borderBottomWidth
            : '',
          headBar: (() => {
            const title = card?.querySelector('.todo-card-title')
            if (!title) return []
            const bar = getComputedStyle(title, '::before')
            return bar.content && bar.content !== 'none' && bar.content !== 'normal'
              ? [parseFloat(bar.width), bar.backgroundColor]
              : []
          })(),
          // 日期行拆成「日期 + 星期」两级
          groupParts: Array.from(card?.querySelectorAll('.todo-group-date > span') ?? [])
            .map(node => node.className),
          // 勾选框与第一行文字的垂直中心差（>1px 就会看出「没对齐」）
          alignItems: (() => {
            const item = card?.querySelector('.todo-item')
            const box = item?.querySelector('.todo-check')?.getBoundingClientRect()
            const text = item?.querySelector('.todo-text')?.getBoundingClientRect()
            if (!box || !text) return null
            return {
              boxCy: Math.round((box.top + box.height / 2) * 10) / 10,
              textCy: Math.round((text.top + text.height / 2) * 10) / 10,
              delta: Math.round(Math.abs(box.top + box.height / 2 - (text.top + text.height / 2)) * 10) / 10,
              textH: Math.round(text.height * 10) / 10,
              boxH: Math.round(box.height * 10) / 10
            }
          })()
        }
      })()`)
      check(
        `${name}: 待办卡上出现这条待办（已完成划线）`,
        todoCard.items.length === 1 &&
          todoCard.items[0].includes('交班记录表') &&
          todoCard.doneItems === 1,
        JSON.stringify(todoCard)
      )
      check(
        `${name}: 日历格子上标出当天有待办（日期数字下压一道橙短横）`,
        todoCard.marks === 1 && todoCard.dots === 0 && todoCard.onDayNumber &&
          todoCard.borderBottom === '2px solid' &&
          todoCard.borderColor !== 'rgba(0, 0, 0, 0)',
        JSON.stringify(todoCard)
      )
      check(
        `${name}: 待办短横只跟数字一样宽（不横贯整格）`,
        todoCard.dayW > 0 && todoCard.dayW < 30 &&
          todoCard.cellW - todoCard.dayW > 20,
        JSON.stringify(todoCard)
      )
      check(
        `${name}: 待办卡抬头也带强调竖条（与统计卡同一个锚点），日期分两级`,
        todoCard.headBorder === '1px' &&
          Array.isArray(todoCard.headBar) &&
          todoCard.headBar[0] === 3 && todoCard.headBar[1] === 'rgb(27, 108, 128)' &&
          JSON.stringify(todoCard.groupParts) ===
            JSON.stringify(['todo-group-day', 'todo-group-week']),
        JSON.stringify(todoCard)
      )
      check(
        `${name}: 勾选框与文字垂直居中（中心差 ≤ 0.5px）`,
        Boolean(todoCard.alignItems) && todoCard.alignItems.delta <= 0.5,
        JSON.stringify(todoCard.alignItems)
      )

      // 重新打开弹层，接着走加班流程（待办页把弹层关掉了）
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      await sleep(200)

      check(`${name}: 点选加班预设 3h`, await client.evaluate(clickByText('.ot-presets .chip-mini', '3h')))
      await sleep(120)
      check(`${name}: 保存整天记录`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')

      let dayStored = null
      const dayDeadline = Date.now() + 3000
      while (Date.now() < dayDeadline) {
        const raw = await client.evaluate(`window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})`)
        try {
          dayStored = JSON.parse(raw || 'null')
        } catch {
          dayStored = null
        }
        if (dayStored?.overrides?.length === 1 && dayStored.overrides[0].overtimeHours === 3) break
        await sleep(150)
      }
      check(
        `${name}: 加班写进记录（班次不变、只加 3h）`,
        Boolean(dayStored?.overrides?.length === 1 && dayStored.overrides[0].overtimeHours === 3),
        JSON.stringify(dayStored?.overrides ?? null)
      )

      const otLabel = await client.evaluate(`(() => {
        const cell = document.querySelectorAll('.cal-cell')[${workCell.index}]
        if (!cell) return null
        const tag = cell.querySelector('.cal-ot')
        return {
          text: tag ? tag.textContent.trim() : null,
          // 必须在右上角（.cal-corner 里），不能塞进班次色块
          inCorner: Boolean(tag && tag.closest('.cal-corner')),
          inShiftBlock: Boolean(tag && tag.closest('.cal-shift'))
        }
      })()`)
      check(
        `${name}: 加班数显示在格子右上角`,
        otLabel?.text === '+3h' && otLabel.inCorner === true && otLabel.inShiftBlock === false,
        JSON.stringify(otLabel)
      )

      // 统计跟着记录走：加班分布、每日明细、薪资三块都要立刻更新
      const statsWithOvertime = await client.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        const ot = card('加班分布')
        const salaryCard = card('薪资计算')
        const detail = card('每日明细')
        return {
          otValues: Array.from(ot?.querySelectorAll('.ot-col-value') ?? [])
            .map(node => node.textContent.trim()),
          moneyRows: salaryCard?.querySelectorAll('.money-row').length ?? 0,
          // 组标题（基本项 / 加班工资 / 扣款项）各自带一个右侧小计
          moneyGroups: Array.from(salaryCard?.querySelectorAll('.money-group') ?? [])
            .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          // 组内明细：三个基本项 + 三类加班工资 + 社保
          moneySubs: Array.from(salaryCard?.querySelectorAll('.money-row.is-sub') ?? [])
            .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          net: salaryCard?.querySelector('.money-summary-item.is-total .money-summary-value')?.textContent.trim() ?? '',
          detailRows: detail?.querySelectorAll('tbody tr').length ?? 0,
          detailPay: detail?.querySelector('tbody tr td.is-num:last-child')?.textContent.trim() ?? ''
        }
      })()`)
      check(
        `${name}: 加班分布与每日明细立刻跟上`,
        statsWithOvertime.otValues.includes('3h') && statsWithOvertime.detailRows === 1,
        JSON.stringify(statsWithOvertime)
      )

      // 加班分布改成柱形图：五根柱（白班/夜班/白特/夜特/法定），横轴分类 + 柱顶数值
      const otChart = await client.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        const ot = card('加班分布')
        const cols = Array.from(ot?.querySelectorAll('.ot-col') ?? [])
        const labels = Array.from(ot?.querySelectorAll('.ot-axis-row .ot-col-label') ?? [])
        const plot = ot?.querySelector('.ot-plot-row')
        const axis = ot?.querySelector('.ot-axis-row')
        return {
          colCount: cols.length,
          labels: labels.map(node => node.textContent.trim()),
          values: cols.map(col => col.querySelector('.ot-col-value')?.textContent.trim() ?? ''),
          barHeights: cols.map(col => Math.round(col.querySelector('.ot-bar')?.getBoundingClientRect().height ?? 0)),
          barWidths: cols.map(col => Math.round(col.querySelector('.ot-bar')?.getBoundingClientRect().width ?? 0)),
          // 柱顶到自己数值的底边间距（数值应紧贴柱顶）
          valueGaps: cols.map(col => {
            const bar = col.querySelector('.ot-bar')
            const val = col.querySelector('.ot-col-value')
            if (!bar || !val) return -1
            return Math.round(bar.getBoundingClientRect().top - val.getBoundingClientRect().bottom)
          }),
          tones: cols.map(col => col.querySelector('.ot-bar')?.className ?? ''),
          // 柱子的底色必须与日历里同名班次色块一致
          barBg: cols.map(col => {
            const bar = col.querySelector('.ot-bar')
            return bar ? getComputedStyle(bar).backgroundColor : ''
          }),
          // 柱子不画描边
          barShadow: cols.map(col => {
            const bar = col.querySelector('.ot-bar')
            return bar ? getComputedStyle(bar).boxShadow : ''
          }),
          // 横轴线在类目名上方；柱底贴着横轴线
          plotBottom: plot ? Math.round(plot.getBoundingClientRect().bottom) : -1,
          axisTop: axis ? Math.round(axis.getBoundingClientRect().top) : -1,
          barBottom: cols[0]?.querySelector('.ot-bar')
            ? Math.round(cols[0].querySelector('.ot-bar').getBoundingClientRect().bottom)
            : -1,
          // 不再有「合计」行
          hasFoot: Boolean(ot?.querySelector('.stat-foot'))
        }
      })()`)
      check(
        `${name}: 加班分布是四根柱的柱形图（无法定工时不显示法定柱）`,
        otChart.colCount === 4 &&
          JSON.stringify(otChart.labels) ===
            JSON.stringify(['白班加班', '夜班加班', '白特加班', '夜特加班']),
        JSON.stringify(otChart)
      )
      check(
        `${name}: 柱顶标出加班小时数`,
        // 本场景只记了一天 3h 加班（白班或夜班），那根柱是唯一非零的
        otChart.values.filter(text => text === '3h').length === 1 &&
          otChart.values.filter(text => text === '0h').length === 3,
        JSON.stringify(otChart.values)
      )
      check(
        `${name}: 柱高按数值排布（非零那根最高，其余贴地）`,
        // 有值那根的高度显著大于零值那几根（零值只留 2px 基线）
        Math.max(...otChart.barHeights) > 40 &&
          otChart.barHeights.filter(h => h <= 3).length === 3,
        JSON.stringify(otChart.barHeights)
      )
      check(
        `${name}: 每根柱按班次取语义色`,
        otChart.tones.every(cls => /is-(day|night|dayx|nightx|legal)\b/.test(cls)),
        JSON.stringify(otChart.tones)
      )
      check(
        `${name}: 柱色与日历班次色块一致`,
        // 白班 #dff3ff / 夜班 #1e3a5f（反相深蓝）/ 白特 #fff0c2 / 夜特 #fde7c7
        JSON.stringify(otChart.barBg) ===
          JSON.stringify([
            'rgb(223, 243, 255)',
            'rgb(30, 58, 95)',
            'rgb(255, 240, 194)',
            'rgb(253, 231, 199)'
          ]),
        JSON.stringify(otChart.barBg)
      )
      check(
        `${name}: 柱子不画描边`,
        otChart.barShadow.every(shadow => shadow === 'none'),
        JSON.stringify(otChart.barShadow)
      )
      check(
        `${name}: 横轴线在类目名上方、柱底贴着轴线`,
        otChart.plotBottom === otChart.axisTop && Math.abs(otChart.barBottom - otChart.plotBottom) <= 2,
        JSON.stringify({
          plotBottom: otChart.plotBottom,
          axisTop: otChart.axisTop,
          barBottom: otChart.barBottom
        })
      )
      check(
        `${name}: 加班分布不再显示合计行`,
        otChart.hasFoot === false,
        JSON.stringify({ hasFoot: otChart.hasFoot })
      )
      check(
        `${name}: 数值紧贴各自柱顶（不是水平排成一行）`,
        // 每根柱顶到自己数值的底边间距都在 1~3px；
        // 若数值被改成排在绘图区顶部，各柱间距会各不相同且远大于 3
        otChart.valueGaps.length === 4 &&
          otChart.valueGaps.every(gap => gap >= 1 && gap <= 3),
        JSON.stringify(otChart.valueGaps)
      )

      // 加班分布卡的高度必须由「本月概览」决定，不能反过来把它撑高
      const cardHeights = await client.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        const overview = card('本月概览')
        const ot = card('加班分布')
        const h = el => (el ? Math.round(el.getBoundingClientRect().height) : -1)
        // 本月概览里最后一个元素（脚注）的底边 → 卡片内实际用到的高度
        const foot = overview?.querySelector('.stat-foot')
        return {
          overviewH: h(overview),
          otH: h(ot),
          // 概览内容底边离卡片底边还剩多少：被拉伸时会出现一大段空白
          overviewSlack: foot && overview
            ? Math.round(overview.getBoundingClientRect().bottom - foot.getBoundingClientRect().bottom)
            : -1
        }
      })()`)
      check(
        `${name}: 加班分布与本月概览等高`,
        cardHeights.overviewH > 0 && Math.abs(cardHeights.overviewH - cardHeights.otH) <= 2,
        JSON.stringify(cardHeights)
      )
      check(
        `${name}: 本月概览没被撑高（底部不留大片空白）`,
        // 脚注有 margin-top:auto 会贴着卡片底，所以留白应只有 padding 量级
        cardHeights.overviewSlack >= 0 && cardHeights.overviewSlack <= 24,
        JSON.stringify(cardHeights)
      )
      check(
        `${name}: 每日明细算出了当天加班费`,
        // 基本工资 8000 → 时薪 45.977；平日 3h × 1.5 = 206.90
        statsWithOvertime.detailPay === '206.90',
        JSON.stringify(statsWithOvertime)
      )
      check(
        `${name}: 薪资块算到实发（8000 + 加班费 + 夜班津贴）`,
        // 8000 + 平日加班 206.90 + 夜班津贴 8 天 × 15 = 120 → 8326.90
        statsWithOvertime.net === '8,326.90',
        JSON.stringify(statsWithOvertime)
      )
      const totalRow = await client.evaluate(`(() => {
        const gross = document.querySelector('.money-summary-item:not(.is-total)')
        const total = document.querySelector('.money-summary-item.is-total')
        const grossValue = gross?.querySelector('.money-summary-value')
        const totalValue = total?.querySelector('.money-summary-value')
        const grossCs = grossValue ? getComputedStyle(grossValue) : null
        const totalCs = totalValue ? getComputedStyle(totalValue) : null
        return {
          bg: total ? getComputedStyle(total).backgroundColor : '',
          color: totalCs?.color ?? '',
          totalSize: totalCs?.fontSize ?? '',
          grossSize: grossCs?.fontSize ?? '',
          totalWeight: totalCs?.fontWeight ?? '',
          grossWeight: grossCs?.fontWeight ?? ''
        }
      })()`)
      check(
        `${name}: 应发/实发是同字号的结算贴片，实发只靠浅青底色区分`,
        totalRow.bg === 'rgb(234, 242, 244)' &&
          totalRow.color === 'rgb(19, 20, 22)' &&
          totalRow.totalSize === totalRow.grossSize &&
          totalRow.totalWeight === totalRow.grossWeight,
        JSON.stringify(totalRow)
      )
      check(
        `${name}: 薪资卡分三组，组标题右侧带小计`,
        statsWithOvertime.moneyGroups.length === 3 &&
          statsWithOvertime.moneyGroups[0].startsWith('基本项') &&
          statsWithOvertime.moneyGroups[0].includes('8,000.00') &&
          statsWithOvertime.moneyGroups[1].startsWith('加班工资') &&
          // 加班工资小计含夜班津贴：206.90 + 120 = 326.90
          statsWithOvertime.moneyGroups[1].includes('326.90') &&
          statsWithOvertime.moneyGroups[2].startsWith('扣款项'),
        JSON.stringify(statsWithOvertime.moneyGroups)
      )
      check(
        `${name}: 基本项列三个细项、三类加班工资逐项列出、夜班津贴挂在其下`,
        statsWithOvertime.moneySubs.length === 8 &&
          ['基本工资', '绩效津贴', '岗位津贴', '平日加班', '特勤加班', '法定加班', '夜班津贴', '社保公积金']
            .every((label, index) => statsWithOvertime.moneySubs[index].startsWith(label)) &&
          statsWithOvertime.moneySubs[3].includes('206.90') &&
          // 夜班津贴行带天数与金额
          statsWithOvertime.moneySubs[6].includes('8 天') &&
          statsWithOvertime.moneySubs[6].includes('120.00'),
        JSON.stringify(statsWithOvertime.moneySubs)
      )

      // 本月概览的六张卡片：加了班的那个班次要带上小时数（不带 + 号）
      const shiftCardOt = await client.evaluate(`(() => {
        const counts = Array.from(document.querySelectorAll('.stat-card .day-count'))
        const target = counts.find(node =>
          node.querySelector('.day-count-label')?.textContent.trim() === ${JSON.stringify(workCell.shift)}
        )
        const extra = target?.querySelector('.day-count-extra')
        return {
          text: extra?.textContent.trim() ?? '',
          isLeave: extra ? extra.classList.contains('is-leave') : null,
          allBadges: document.querySelectorAll('.stat-card .day-count-extra').length
        }
      })()`)
      check(
        `${name}: 班次卡片写出该班次的加班小时`,
        shiftCardOt.text === '3h' && shiftCardOt.isLeave === false && shiftCardOt.allBadges === 1,
        JSON.stringify(shiftCardOt)
      )

      // 薪资 / 每日明细两张卡：明细不自定高度，跟随薪资卡；内容在卡片里滚
      const tallCards = await client.evaluate(`(() => {
        const salary = document.querySelector('.stat-card[aria-label="薪资计算"]')
        const detail = document.querySelector('.stat-card-detail')
        const fill = detail?.querySelector('.stat-card-fill')
        const scroll = detail?.querySelector('.detail-scroll')
        const foot = detail?.querySelector('.stat-foot')
        const th = detail?.querySelector('.detail-table thead th')
        const h = node => (node ? Math.round(node.getBoundingClientRect().height) : -1)
        return {
          salaryH: h(salary),
          detailH: h(detail),
          fillH: h(fill),
          // 明细外壳必须没有写死高度，否则「跟随薪资卡」就不成立了
          detailInlineHeight: detail ? detail.style.height || '' : 'missing',
          scrollH: h(scroll),
          scrollOverflow: scroll ? getComputedStyle(scroll).overflowY : '',
          thPosition: th ? getComputedStyle(th).position : '',
          // 合计行必须在滚动区之外，否则它会跟着内容一起滚走
          footInsideScroll: foot ? Boolean(foot.closest('.detail-scroll')) : null
        }
      })()`)
      check(
        `${name}: 每日明细高度跟随薪资卡（两卡等高）`,
        tallCards.salaryH > 200 &&
          Math.abs(tallCards.salaryH - tallCards.detailH) <= 1 &&
          tallCards.detailInlineHeight === '',
        JSON.stringify(tallCards)
      )
      check(
        `${name}: 明细内层铺满、表格区可滚、表头冻结、合计行在滚动区外`,
        Math.abs(tallCards.fillH - tallCards.detailH) <= 2 &&
          tallCards.scrollOverflow === 'auto' &&
          tallCards.thPosition === 'sticky' &&
          tallCards.footInsideScroll === false &&
          tallCards.scrollH > 0 &&
          tallCards.scrollH < tallCards.detailH,
        JSON.stringify(tallCards)
      )

      // 每日明细：四列都居中，日期压最左、加班费压最右（table-layout: fixed 铺满）
      const detailLook = await client.evaluate(`(() => {
        const table = document.querySelector('.detail-table')
        const ths = Array.from(table?.querySelectorAll('thead th') ?? [])
        const pill = table?.querySelector('tbody .pay-pill')
        const cells = Array.from(table?.querySelector('tbody tr')?.querySelectorAll('td') ?? [])
        const tRect = table?.getBoundingClientRect()
        const firstRect = cells[0]?.getBoundingClientRect()
        const lastRect = cells[cells.length - 1]?.getBoundingClientRect()
        const pillRect = pill?.getBoundingClientRect()
        const cellRect = pill?.closest('td')?.getBoundingClientRect()
        // 三档底色：临时挂三个胶囊读计算样式（真实数据未必一次凑齐三档）
        const host = document.createElement('div')
        host.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden'
        document.body.appendChild(host)
        const tierBgs = [1, 2, 3].map(tier => {
          const node = document.createElement('span')
          node.className = 'pay-pill is-t' + tier
          host.appendChild(node)
          return getComputedStyle(node).backgroundColor
        })
        // 「法」标不能参与宽度：临时挂一组「班次块 + 法」，量它是不是绝对定位、贴没贴右侧
        const probe = document.createElement('span')
        probe.className = 'detail-shift-wrap'
        probe.innerHTML = '<span class="detail-shift">夜班</span><span class="detail-legal">法</span>'
        host.appendChild(probe)
        const legalNode = probe.querySelector('.detail-legal')
        const shiftNode = probe.querySelector('.detail-shift')
        const legalPos = legalNode ? getComputedStyle(legalNode).position : ''
        const legalGap = legalNode && shiftNode
          ? Math.round(legalNode.getBoundingClientRect().left - shiftNode.getBoundingClientRect().right)
          : -1
        // 各行班次块的左边界必须一致（带法定标的那行不能把块挤偏）
        const shiftLefts = Array.from(new Set(
          Array.from(table?.querySelectorAll('tbody .detail-shift') ?? [])
            .map(node => Math.round(node.getBoundingClientRect().left))
        ))
        host.remove()
        return {
          headAlign: ths.map(th => getComputedStyle(th).textAlign),
          cellAlign: cells.map(td => getComputedStyle(td).textAlign),
          pill: Boolean(pill),
          pillAlign: pill ? getComputedStyle(pill).textAlign : '',
          pillW: pillRect ? Math.round(pillRect.width) : -1,
          // 胶囊中心与所在单元格中心的偏差
          pillCenterDelta: pillRect && cellRect
            ? Math.abs(Math.round(pillRect.left + pillRect.width / 2) -
                Math.round(cellRect.left + cellRect.width / 2))
            : -1,
          // 第一列贴表格左边、末列贴表格右边 → 整张表铺满
          leftGap: tRect && firstRect ? Math.round(firstRect.left - tRect.left) : -1,
          rightGap: tRect && lastRect ? Math.round(tRect.right - lastRect.right) : -1,
          tableLayout: table ? getComputedStyle(table).tableLayout : '',
          distinctTierBgs: new Set(tierBgs).size,
          tierBgs,
          shiftLeftCount: shiftLefts.length,
          legalPos,
          legalGap
        }
      })()`)
      check(
        `${name}: 明细四列居中、日期压左、加班费压右、胶囊三色分档`,
        detailLook.headAlign.length === 4 &&
          detailLook.headAlign.every(align => align === 'center') &&
          detailLook.cellAlign.length === 4 &&
          detailLook.cellAlign.every(align => align === 'center') &&
          detailLook.pill && detailLook.pillAlign === 'center' &&
          detailLook.pillW >= 55 && detailLook.pillW <= 60 &&
          detailLook.pillCenterDelta <= 1 &&
          detailLook.tableLayout === 'fixed' &&
          detailLook.leftGap === 0 && detailLook.rightGap === 0 &&
          detailLook.distinctTierBgs === 3,
        JSON.stringify(detailLook)
      )
      check(
        `${name}: 班次块各行对齐，「法」标绝对定位挂在右侧（不挤动班次块）`,
        detailLook.shiftLeftCount === 1 &&
          detailLook.legalPos === 'absolute' &&
          detailLook.legalGap >= 0 && detailLook.legalGap <= 6,
        JSON.stringify({ lefts: detailLook.shiftLeftCount, pos: detailLook.legalPos, gap: detailLook.legalGap })
      )

      // P1/P2 观感：明细表头有浅底、卡片内边距与网格间距；薪资列表疏朗化
      const polish = await client.evaluate(`(() => {
        const th = document.querySelector('.detail-table thead th')
        const card = document.querySelector('.stat-card')
        const grid = document.querySelector('.stats-grid')
        const row = document.querySelector('.money-row.is-sub')
        const groups = Array.from(document.querySelectorAll('.money-group'))
        const second = groups[1]
        const rate = document.querySelector('.money-rate')
        const summary = document.querySelector('.money-summary')
        return {
          thBg: th ? getComputedStyle(th).backgroundColor : '',
          cardPad: card
            ? [
                parseFloat(getComputedStyle(card).paddingTop),
                parseFloat(getComputedStyle(card).paddingLeft)
              ]
            : [],
          gap: grid ? parseFloat(getComputedStyle(grid).columnGap) : -1,
          rowPad: row ? parseFloat(getComputedStyle(row).paddingTop) : -1,
          subIndent: row ? parseFloat(getComputedStyle(row).paddingLeft) : -1,
          firstGroupBorder: groups[0] ? parseFloat(getComputedStyle(groups[0]).borderTopWidth) : -1,
          secondGroupBorder: second ? parseFloat(getComputedStyle(second).borderTopWidth) : -1,
          rateBg: rate ? getComputedStyle(rate).backgroundColor : '',
          summaryBorder: summary ? getComputedStyle(summary).borderTopColor : ''
        }
      })()`)
      check(
        `${name}: 明细表头有浅底、卡片内边距 16、网格间距 16`,
        polish.thBg === 'rgb(251, 252, 253)' &&
          JSON.stringify(polish.cardPad) === JSON.stringify([16, 16]) &&
          polish.gap === 16,
        JSON.stringify(polish)
      )
      check(
        `${name}: 薪资列表更疏朗（行距 5、缩进 16、分组有分隔线、倍率是小胶囊）`,
        polish.rowPad === 5 && polish.subIndent === 16 &&
          polish.firstGroupBorder === 0 && polish.secondGroupBorder === 1 &&
          polish.rateBg === 'rgb(244, 246, 248)' &&
          polish.summaryBorder === 'rgb(194, 201, 206)',
        JSON.stringify(polish)
      )
      // 组标题的小竖条按文字行盒居中（inline-block + vertical-align 会按基线落点，偏低 2px）
      const groupBars = await client.evaluate(`(() => {
        const titles = Array.from(document.querySelectorAll('.money-group > span:first-child'))
        const one = prop => [...new Set(titles.map(node => prop(node)))][0]
        return {
          count: titles.length,
          display: one(node => getComputedStyle(node).display),
          align: one(node => getComputedStyle(node).alignItems),
          barW: one(node => getComputedStyle(node, '::before').width),
          barH: one(node => getComputedStyle(node, '::before').height)
        }
      })()`)
      check(
        `${name}: 组标题竖条与文字垂直居中（flex 居中，不按基线落点）`,
        groupBars.count >= 2 && groupBars.display === 'flex' && groupBars.align === 'center' &&
          groupBars.barW === '2px' && groupBars.barH === '10px',
        JSON.stringify(groupBars)
      )

      // 每日明细的滚动条要彻底隐藏（卡片内部就几行，滑块反而抢眼）
      const detailBar = await client.evaluate(`(() => {
        const el = document.querySelector('.detail-scroll')
        if (!el) return null
        return {
          // offsetWidth - clientWidth 就是滚动条 + 边框占掉的宽度
          barWidth: el.offsetWidth - el.clientWidth,
          borderWidth: el.offsetWidth - el.clientWidth -
            (parseFloat(getComputedStyle(el).borderLeftWidth) + parseFloat(getComputedStyle(el).borderRightWidth))
        }
      })()`)
      check(
        `${name}: 每日明细的滚动条彻底隐藏`,
        detailBar !== null && detailBar.barWidth === 0,
        JSON.stringify(detailBar)
      )

      // 描边只表示「班次与默认不同」。刚才只记了加班、班次没动，所以不该有描边。
      const ringOnOvertimeOnly = await client.evaluate(`(() => {
        const cell = document.querySelectorAll('.cal-cell')[${workCell.index}]
        const block = cell ? cell.querySelector('.cal-shift') : null
        return { hasRing: Boolean(block && block.classList.contains('is-changed')) }
      })()`)
      check(
        `${name}: 只记加班、班次未动 → 班次块不加描边`,
        ringOnOvertimeOnly?.hasRing === false,
        JSON.stringify(ringOnOvertimeOnly)
      )

      // 真改班次后描边必须出现，否则上面那条是空断言
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 日历弹层里把班次改成休息`, await client.evaluate(clickByText('.dialog-day .option', '休息')))
      await sleep(120)
      check(`${name}: 保存改班`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(250)
      const ringAfterShiftChange = await client.evaluate(`(() => {
        const cell = document.querySelectorAll('.cal-cell')[${workCell.index}]
        const block = cell ? cell.querySelector('.cal-shift') : null
        return {
          hasRing: Boolean(block && block.classList.contains('is-changed')),
          text: block ? block.textContent.trim() : null
        }
      })()`)
      check(
        `${name}: 班次与默认不同 → 班次块出现描边`,
        ringAfterShiftChange?.hasRing === true && ringAfterShiftChange.text === '休息',
        JSON.stringify(ringAfterShiftChange)
      )

      // 换人必须先问：有记录时改本人姓名 → 弹影响清单，取消则什么都不动
      await client.evaluate(clickByText('[data-view="settings"]', '设置'))
      await waitFor(client, 'Boolean(document.querySelector(".canvas-tools [data-slot=\\"tabs-trigger\\"]"))', '设置页 tab')
      await switchSettingsTab(client, '人员配置')
      await waitFor(client, 'Boolean(document.querySelector(".profile-section"))', '个人信息区块')
      await client.evaluate(setInputBySelector('.profile-form input', '张三丰'))
      await sleep(150)
      check(
        `${name}: 改本人姓名触发保存`,
        await client.evaluate(clickByText('.profile-section [data-slot="button"]', '保存本人信息'))
      )
      await waitFor(client, 'Boolean(document.querySelector(".impact-list"))', '换人确认弹层')
      const impactText = await client.evaluate('document.querySelector(".impact-list").textContent.trim()')
      check(
        `${name}: 确认弹层列出将清掉的条数`,
        impactText.includes('改班记录') && impactText.includes('薪资'),
        impactText
      )
      check(`${name}: 取消换人`, await client.evaluate(clickByText('.dialog-foot button', '取消')))
      await waitFor(client, '!document.querySelector(".impact-list")', '弹层关闭')
      await sleep(200)

      const keptAfterCancel = await client.evaluate(`(() => {
        const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
        const parsed = raw ? JSON.parse(raw) : null
        const self = parsed?.members?.find(member => member.id === parsed?.profile?.memberId)
        return { name: self?.name ?? null, overrides: parsed?.overrides?.length ?? -1 }
      })()`)
      check(
        `${name}: 取消后本人与记录都没动`,
        keptAfterCancel.name === '张三' && keptAfterCancel.overrides === 1,
        JSON.stringify(keptAfterCancel)
      )

      // 新增成员不能与本人同名（回到人员配置页）
      await switchSettingsTab(client, '人员配置')
      await waitFor(client, 'Boolean(document.querySelector(".member-editor"))', '成员表')
      check(`${name}: 成员表加一行`, await client.evaluate(clickByText('.btn-add', '添加成员')))
      await sleep(150)
      // 每行现在有「姓名 + 岗位」两个 input，不能再用全局索引定位姓名框，直接取末行
      await client.evaluate(`(() => {
        const rows = Array.from(document.querySelectorAll('.member-row'))
        const input = rows[rows.length - 1]?.querySelector('input[aria-label$="姓名"]')
        if (!input) return false
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, '张三')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      await sleep(200)
      // 错误改成逐行标注：取所有行内错误文案拼起来，断言口径不变
      const sameNameError = await client.evaluate(
        `[...document.querySelectorAll('.member-row-error')].map(node => node.textContent.trim()).join(' ')`
      )
      check(
        `${name}: 与本人同名被拦下`,
        sameNameError.includes('与本人同名'),
        sameNameError
      )
      // 错误只描姓名框（不整行套红框把文案一起框住），提示缩进到输入框正文
      const errorLook = await client.evaluate(`(() => {
        const row = document.querySelector('.member-row.is-invalid')
        const input = row?.querySelector('.member-field-name')
        const error = row?.parentElement?.querySelector('.member-row-error')
        if (!row || !input || !error) return null
        const textLeft = input.getBoundingClientRect().left + 9
        return {
          rowShadow: getComputedStyle(row).boxShadow,
          inputBorder: getComputedStyle(input).borderTopColor,
          errorLeftGap: Math.round(
            error.getBoundingClientRect().left +
            parseFloat(getComputedStyle(error).paddingLeft) - textLeft
          )
        }
      })()`)
      check(
        `${name}: 成员行错误只描姓名框，提示与输入框正文左对齐`,
        errorLook !== null && errorLook.rowShadow === 'none' &&
          errorLook.inputBorder === 'rgb(227, 181, 176)' &&
          Math.abs(errorLook.errorLeftGap) <= 1,
        JSON.stringify(errorLook)
      )
      // 保存条上「有未保存的修改」与保存按钮要垂直居中（不是贴到文字格的上沿）
      const saveBarAlign = await client.evaluate(`(() => {
        const actions = document.querySelector('.settings-actions.is-sticky')
        const hint = actions?.querySelector('.save-hint')
        const btn = actions?.querySelector('[data-slot="button"][data-variant="default"]')
        if (!actions || !hint || !btn) return null
        const h = hint.getBoundingClientRect()
        const b = btn.getBoundingClientRect()
        return {
          alignItems: getComputedStyle(actions).alignItems,
          delta: +(((h.top + h.bottom) - (b.top + b.bottom)) / 2).toFixed(2)
        }
      })()`)
      check(
        `${name}: 保存条的提示文字与按钮垂直居中`,
        saveBarAlign !== null && saveBarAlign.alignItems === 'center' &&
          Math.abs(saveBarAlign.delta) <= 1,
        JSON.stringify(saveBarAlign)
      )

      await goOverview(client)

      // 恢复默认：加班一并清掉
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 日历弹层能恢复默认`, await client.evaluate(clickByText('.dialog-foot button', '恢复默认')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(250)
      const afterRestore = await client.evaluate(`window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})`)
      let restoreParsed = null
      try {
        restoreParsed = JSON.parse(afterRestore || 'null')
      } catch {
        restoreParsed = null
      }
      check(
        `${name}: 恢复默认连加班一起清掉`,
        restoreParsed?.overrides?.length === 0,
        JSON.stringify(restoreParsed?.overrides ?? null)
      )

      const statsAfterRestore = await client.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        return {
          otValues: Array.from(card('加班分布')?.querySelectorAll('.ot-col-value') ?? [])
            .map(node => node.textContent.trim()),
          otEmpty: Boolean(card('加班分布')?.querySelector('.stat-empty')),
          detailRows: card('每日明细')?.querySelectorAll('tbody tr').length ?? -1,
          net: card('薪资计算')?.querySelector('.money-summary-item.is-total .money-summary-value')?.textContent.trim() ?? '',
          // 卡片上的小时标记也要跟着消失（既没有加班也没有事假）
          badges: document.querySelectorAll('.stat-card .day-count-extra').length
        }
      })()`)
      check(
        `${name}: 恢复默认后统计回到零（卡片上的小时标记也清掉）`,
        // 加班分布没有加班了 → 回到空态（柱形图整体收起）
        statsAfterRestore.otEmpty === true &&
          statsAfterRestore.detailRows === 0 &&
          statsAfterRestore.badges === 0,
        JSON.stringify(statsAfterRestore)
      )

      // --- 5c. 事假时长：4h 要真的从工资里扣 ---
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 弹层里选事假`, await client.evaluate(clickByText('.dialog-day .option', '事假')))
      await sleep(150)

      const leaveSection = await client.evaluate(`(() => ({
        durations: Array.from(document.querySelectorAll('.dialog-day .segmented-item'))
          .map(node => node.textContent.trim())
          .filter(text => text === '4h' || text === '8h'),
        note: document.querySelector('.dialog-day .section-note:last-of-type')?.textContent.trim() ?? ''
      }))()`)
      check(
        `${name}: 选事假后出现「4h / 8h」`,
        JSON.stringify(leaveSection.durations) === JSON.stringify(['4h', '8h']),
        JSON.stringify(leaveSection)
      )

      check(`${name}: 选 4h`, await client.evaluate(clickByText('.dialog-day .segmented-item', '4h')))
      await sleep(120)
      check(`${name}: 保存 4h 事假`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(300)

      const leaveStored = await client.evaluate(`(() => {
        const raw = window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)})
        const parsed = raw ? JSON.parse(raw) : null
        const record = parsed?.overrides?.[0] ?? null
        return { shift: record?.shift ?? null, duration: record?.leaveDuration ?? null, count: parsed?.overrides?.length ?? -1 }
      })()`)
      check(
        `${name}: 4h 事假落盘（只存「4h」，8h 走默认值）`,
        leaveStored.shift === '事假' && leaveStored.duration === '4h' && leaveStored.count === 1,
        JSON.stringify(leaveStored)
      )

      const leaveUi = await client.evaluate(`(() => {
        const cell = document.querySelectorAll('.cal-cell')[${workCell.index}]
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        const rows = Array.from(card('薪资计算')?.querySelectorAll('.money-row') ?? [])
          .map(row => row.textContent.replace(/\\s+/g, ' ').trim())
        const counts = Array.from(card('本月概览')?.querySelectorAll('.day-count') ?? [])
        const leaveCard = counts.find(node => node.querySelector('.day-count-label')?.textContent.trim() === '事假')
        const extra = leaveCard?.querySelector('.day-count-extra')
        return {
          corner: cell?.querySelector('.cal-leave')?.textContent.trim() ?? null,
          overviewFoot: card('本月概览')?.querySelector('.stat-foot')?.textContent.replace(/\\s+/g, '') ?? '',
          leaveCardExtra: extra?.textContent.trim() ?? '',
          leaveCardIsLeave: extra ? extra.classList.contains('is-leave') : null,
          groups: Array.from(card('薪资计算')?.querySelectorAll('.money-group') ?? [])
            .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          leaveRow: rows.find(text => text.includes('事假扣款')) ?? '',
          net: card('薪资计算')?.querySelector('.money-summary-item.is-total .money-summary-value')?.textContent.trim() ?? ''
        }
      })()`)
      check(`${name}: 日历角标标出「4h」`, leaveUi.corner === '4h', JSON.stringify(leaveUi))
      check(
        `${name}: 事假卡片写 4h，底部不再重复小时`,
        leaveUi.leaveCardExtra === '4h' && leaveUi.leaveCardIsLeave === true &&
          leaveUi.overviewFoot.includes('事假0.5天') && !leaveUi.overviewFoot.includes('4h'),
        JSON.stringify(leaveUi)
      )
      check(
        `${name}: 事假扣款按时薪×4h 扣`,
        // 8000 ÷ 21.75 ÷ 8 = 45.977；× 4 = 183.91
        // 实发 = 8000 + 夜班津贴 120 − 183.91 = 7936.09
        leaveUi.leaveRow.includes('183.91') && leaveUi.net.includes('7,936.09'),
        JSON.stringify(leaveUi)
      )
      check(
        `${name}: 扣款项小计含事假扣款（183.91）`,
        Boolean(leaveUi.groups[2]?.startsWith('扣款项')) && Boolean(leaveUi.groups[2]?.includes('183.91')),
        JSON.stringify(leaveUi.groups)
      )
      check(
        `${name}: 扣款金额不带负号`,
        !leaveUi.leaveRow.includes('−') && !leaveUi.leaveRow.includes('-'),
        leaveUi.leaveRow
      )

      // 改选 8h：8h 是默认值不落字段，但角标也要标出实际时长
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 改选 8h`, await client.evaluate(clickByText('.dialog-day .segmented-item', '8h')))
      await sleep(120)
      check(`${name}: 保存 8h 事假`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(250)
      const leave8hCorner = await client.evaluate(
        `document.querySelectorAll('.cal-cell')[${workCell.index}].querySelector('.cal-leave')?.textContent.trim() ?? null`
      )
      check(`${name}: 8h 事假也挂角标`, leave8hCorner === '8h', JSON.stringify(leave8hCorner))

      // 收尾：清掉这条事假，后续步骤从干净状态开始
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 清掉事假`, await client.evaluate(clickByText('.dialog-foot button', '恢复默认')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(250)

      // --- 5d. 法定独立成卡片：从原班次里扣掉，六格相加仍等于本期天数 ---
      const readCards = `(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card .day-count'))
        const read = label => {
          const node = cards.find(item => item.querySelector('.day-count-label')?.textContent.trim() === label)
          return node ? Number(node.querySelector('.day-count-num').textContent.trim()) : -1
        }
        const hours = label => {
          const node = cards.find(item => item.querySelector('.day-count-label')?.textContent.trim() === label)
          return node?.querySelector('.day-count-extra')?.textContent.trim() ?? ''
        }
        return {
          labels: cards.map(item => item.querySelector('.day-count-label')?.textContent.trim()),
          day: read('白班'),
          night: read('夜班'),
          special: read('特勤'),
          legal: read('法定'),
          dayHours: hours('白班'),
          nightHours: hours('夜班'),
          legalHours: hours('法定'),
          total: cards.reduce((sum, item) => sum + Number(item.querySelector('.day-count-num').textContent.trim()), 0)
        }
      })()`

      const beforeLegal = await client.evaluate(readCards)
      check(
        `${name}: 本月概览是 白/夜/休/特勤/事假/法定 六格（白特夜特已合并）`,
        JSON.stringify(beforeLegal.labels) ===
          JSON.stringify(['白班', '夜班', '休息', '特勤', '事假', '法定']),
        JSON.stringify(beforeLegal.labels)
      )
      check(`${name}: 六格天数相加等于本期天数`, beforeLegal.total === 31, String(beforeLegal.total))

      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(
        `${name}: 把这一天标为法定`,
        await client.evaluate(clickByText('.dialog-day .segmented-sm .segmented-item', '是'))
      )
      await sleep(150)
      // 法定日切到整天特勤档 [10, 11, 11.5]，不再是 [2, 3, 3.5]
      check(
        `${name}: 法定日点选加班预设 10h`,
        await client.evaluate(clickByText('.ot-presets .chip-mini', '10h'))
      )
      await sleep(120)
      check(`${name}: 保存法定标记`, await client.evaluate(clickByText('.dialog-foot button', '保存')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(300)

      const afterLegal = await client.evaluate(readCards)
      const workKey = workCell.shift === '白班' ? 'day' : 'night'
      const workHoursKey = workCell.shift === '白班' ? 'dayHours' : 'nightHours'
      check(
        `${name}: 法定从原班次剥离（白/夜 −1、法定 +1、总数不变）`,
        afterLegal.legal === 1 &&
          afterLegal[workKey] === beforeLegal[workKey] - 1 &&
          afterLegal.total === beforeLegal.total,
        JSON.stringify({ before: beforeLegal, after: afterLegal, cell: workCell.shift })
      )
      check(
        `${name}: 法定日的加班归到「法定」格，原班次格不带小时`,
        afterLegal.legalHours === '10h' && afterLegal[workHoursKey] === '',
        JSON.stringify({ legalHours: afterLegal.legalHours, workHours: afterLegal[workHoursKey] })
      )
      const otAfterLegal = await client.evaluate(`(() => {
        const cols = Array.from(document.querySelectorAll('.stat-card .ot-col'))
        return {
          count: cols.length,
          labels: Array.from(document.querySelectorAll('.stat-card .ot-axis-row .ot-col-label'))
            .map(node => node.textContent.trim())
        }
      })()`)
      check(
        `${name}: 有法定加班时恢复法定柱`,
        otAfterLegal.count === 5 && otAfterLegal.labels.includes('法定加班'),
        JSON.stringify(otAfterLegal)
      )

      // 夜班津贴的口径是「所有夜间出勤」：法定夜班在卡片上归「法定」格，津贴照发。
      // 只有当被标法定的那天原本是夜班时，天数才会 +1。
      const nightAllowanceUi = await client.evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('.stat-card'))
        const card = label => cards.find(item => item.querySelector('.stat-title')?.textContent.trim() === label)
        const rows = Array.from(card('薪资计算')?.querySelectorAll('.money-row.is-sub') ?? [])
        const num = text => Number(String(text).replace(/[^0-9.]/g, ''))
        const allowanceRow = rows.find(row => row.textContent.trim().startsWith('夜班津贴'))
        // 三类加班费之和（平日/特勤/法定）
        const overtimeSum = rows
          .filter(row => /加班/.test(row.children[0].textContent) && !row.textContent.includes('夜班津贴'))
          .reduce((sum, row) => sum + num(row.children[1].textContent), 0)
        return {
          allowanceText: allowanceRow ? allowanceRow.textContent.replace(/\\s+/g, ' ').trim() : '',
          allowanceDays: allowanceRow ? num(allowanceRow.children[0].textContent) : -1,
          allowanceAmount: allowanceRow ? num(allowanceRow.children[1].textContent) : -1,
          overtimeSum,
          groups: Array.from(card('薪资计算')?.querySelectorAll('.money-group') ?? [])
            .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          groupAmounts: Array.from(card('薪资计算')?.querySelectorAll('.money-group') ?? [])
            .map(node => num(node.children[1].textContent))
        }
      })()`)
      check(
        `${name}: 夜班津贴挂在加班工资下并进小计`,
        // 津贴行带天数与金额（15 元/天），天数 × 15 必须等于金额
        nightAllowanceUi.allowanceDays >= 0 &&
          nightAllowanceUi.allowanceDays * 15 === nightAllowanceUi.allowanceAmount &&
          // 加班工资组的小计 = 三类加班费之和 + 夜班津贴
          Boolean(nightAllowanceUi.groups[1]?.startsWith('加班工资')) &&
          Math.abs(
            nightAllowanceUi.groupAmounts[1] -
              (nightAllowanceUi.overtimeSum + nightAllowanceUi.allowanceAmount)
          ) < 0.01,
        JSON.stringify(nightAllowanceUi)
      )
      if (workCell.shift === '夜班') {
        check(
          `${name}: 法定夜班仍计夜班津贴（口径是所有夜间出勤）`,
          // 标法定前夜班 8 天，标了法定后夜班卡片减 1，但津贴天数不变
          nightAllowanceUi.allowanceDays === 8,
          `津贴 ${nightAllowanceUi.allowanceDays} 天`
        )
      }

      // 收尾：清掉法定标记，后续步骤从干净状态开始
      await client.evaluate(`document.querySelectorAll('.cal-cell')[${workCell.index}].click(); true`)
      await waitFor(client, 'Boolean(document.querySelector(".dialog-day"))', '日历弹层')
      check(`${name}: 清掉法定标记`, await client.evaluate(clickByText('.dialog-foot button', '恢复默认')))
      await waitFor(client, '!document.querySelector(".dialog-day")', '弹层关闭')
      await sleep(250)

    }

    await goMatrix(client)
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 3', '切开矩阵')

    // --- 6. 设置页 ---
    await client.evaluate(clickByText('[data-view="settings"]', '设置'))
    await waitFor(client, 'Boolean(document.querySelector(".settings-section"))', '设置页')
    const settingsRows = await client.evaluate('document.querySelectorAll(".member-row").length')
    check(`${name}: 设置页读到 3 位成员`, settingsRows === 3, String(settingsRows))

    // 重新进入设置页后内置班序回到收起态，先展开再断言
    await client.evaluate(`(() => {
      const toggle = document.querySelector('.pattern-collapsed')
      if (toggle) toggle.click()
      return true
    })()`)
    await waitFor(client, 'document.querySelectorAll(".pattern-chip").length === 20', '展开内置班序')
    const builtinCount = await client.evaluate('document.querySelectorAll(".pattern-chip").length')
    check(`${name}: 设置页列出 20 条内置班序`, builtinCount === 20, String(builtinCount))

    // 内置班序可点开只读预览
    await client.evaluate(`document.querySelectorAll('.pattern-chip')[0].click(); true`)
    await waitFor(client, 'Boolean(document.querySelector(".pattern-preview"))', '班序预览')
    const previewCells = await client.evaluate('document.querySelectorAll(".pattern-preview .shift-cell").length')
    check(`${name}: 内置班序可预览 24 格`, previewCells === 24, String(previewCells))
    await client.evaluate(`document.querySelectorAll('.pattern-chip')[0].click(); true`)

    // --- 7. 新建自建班序：24 格逐格填 ---
    check(`${name}: 点开新建班序`, await client.evaluate(clickByText('.pattern-block .btn-add', '新建班序')))
    await waitFor(client, 'Boolean(document.querySelector(".dialog-wide"))', '班序编辑器')
    const editorCells = await client.evaluate('document.querySelectorAll(".dialog-wide .shift-cell").length')
    check(`${name}: 编辑器有 24 个格子`, editorCells === 24, String(editorCells))

    const palette = await client.evaluate(
      `Array.from(document.querySelectorAll('.shift-palette .palette-option')).map(node => node.textContent.trim())`
    )
    check(
      `${name}: 班次选项只有白/夜/休三种`,
      JSON.stringify(palette) === JSON.stringify(['白班', '夜班', '休息']),
      JSON.stringify(palette)
    )

    check(
      `${name}: 填班序名称`,
      await client.evaluate(setInputBySelector('.dialog-wide input[aria-label="班序名称"]', '甲班'))
    )

    // 点第 1 格 → 连点「夜班」两次 → 再点「白班」：选完自动往后推进一格
    await client.evaluate(`document.querySelectorAll('.dialog-wide .shift-cell')[0].click(); true`)
    for (const shiftLabel of ['夜班', '夜班', '白班']) {
      const ok = await client.evaluate(clickByText('.shift-palette .palette-option', shiftLabel))
      if (!ok) check(`${name}: 点选班次「${shiftLabel}」`, false)
    }
    const filled = await client.evaluate(
      `Array.from(document.querySelectorAll('.dialog-wide .shift-cell .shift-cell-text')).slice(0, 3).map(node => node.textContent)`
    )
    check(
      `${name}: 前 3 格按顺序填成 夜/夜/白`,
      JSON.stringify(filled) === JSON.stringify(['夜', '夜', '白']),
      JSON.stringify(filled)
    )

    check(`${name}: 保存新班序`, await client.evaluate(clickByText('.dialog-wide .dialog-foot button', '创建班序')))
    await waitFor(client, 'document.querySelectorAll(".pattern-row").length === 1', '自建班序出现在列表')
    const patternName = await client.evaluate('document.querySelector(".pattern-row-name").textContent.trim()')
    check(`${name}: 自建班序出现在列表`, patternName === '甲班', patternName)

    // 详情必须展开在这张卡片自己下方，而不是共用内置班序那块预览区
    const inlinePanel = await client.evaluate(`(() => {
      const panel = document.querySelector('.pattern-item .pattern-preview')
      if (!panel) return null
      return {
        cells: panel.querySelectorAll('.shift-cell').length,
        // 详情里只放 24 格，不重复班序名与说明
        head: panel.querySelectorAll('.pattern-preview-head').length,
        text: panel.textContent.trim()
      }
    })()`)
    check(`${name}: 自建班序详情就地展开在卡片下方`, inlinePanel?.cells === 24, String(inlinePanel?.cells))
    check(`${name}: 详情里没有标题文字`, inlinePanel?.head === 0, JSON.stringify(inlinePanel?.text ?? null))

    check(`${name}: 再点「收起」能关掉详情`, await client.evaluate(clickByText('.pattern-row-actions button', '收起')))
    await sleep(150)
    const collapsed = await client.evaluate('document.querySelectorAll(".pattern-item .pattern-preview").length')
    check(`${name}: 收起后详情消失`, collapsed === 0, String(collapsed))

    // 文档层不能出现第二根滚动条：.visually-hidden 用 absolute 时会以初始包含块定位，
    // 逃出 .canvas 的 overflow 裁剪把文档撑高，表现就是「双层滚动条 + 底部空白」。
    const overflow = await client.evaluate(`(() => ({
      doc: document.documentElement.scrollHeight,
      view: window.innerHeight,
      bar: window.innerWidth - document.documentElement.clientWidth
    }))()`)
    check(
      `${name}: 设置页没有文档层滚动条`,
      overflow.doc <= overflow.view + 1 && overflow.bar === 0,
      JSON.stringify(overflow)
    )

    const customId = await client.evaluate(`(() => {
      const parsed = JSON.parse(window.localStorage.getItem(${JSON.stringify(ROSTER_KEY)}) || '{}')
      return parsed.patterns?.[0]?.id ?? null
    })()`)
    check(`${name}: 自建班序写进 roster v2`, Boolean(customId), String(customId))

    // --- 8. 把成员挂到自建班序 ---
    // 班序是自绘下拉（原生 select 的弹层改不动样式），所以这里要点开弹层再点选项
    check(
      `${name}: 成员行有班序下拉`,
      await client.evaluate(`Boolean(document.querySelector('.member-row .select-trigger'))`)
    )
    await client.evaluate(`document.querySelectorAll('.member-row .select-trigger')[0].click()`)
    await waitFor(client, `Boolean(document.querySelector('.select-popup'))`, '班序弹层')
    const dropdown = await client.evaluate(`(() => {
      const popup = document.querySelector('.select-popup')
      const option = document.querySelector('.select-popup .select-option')
      const trigger = document.querySelector('.member-row .select-trigger')
      const input = document.querySelector('.member-row input')
      const cs = popup ? getComputedStyle(popup) : null
      return {
        options: document.querySelectorAll('.select-popup .select-option').length,
        groups: Array.from(document.querySelectorAll('.select-popup .select-group')).map(node => node.textContent.trim()),
        radius: cs ? parseFloat(cs.borderTopLeftRadius) : -1,
        bg: cs?.backgroundColor ?? '',
        optionH: option ? Math.round(option.getBoundingClientRect().height) : -1,
        triggerH: trigger ? Math.round(trigger.getBoundingClientRect().height) : -1,
        inputH: input ? Math.round(input.getBoundingClientRect().height) : -1,
        triggerRadius: trigger ? parseFloat(getComputedStyle(trigger).borderTopLeftRadius) : -1
      }
    })()`)
    check(
      `${name}: 自绘下拉（触发按钮与输入框同款、弹层分内置/自定义）`,
      dropdown.options >= 14 &&
        dropdown.groups.join('|') === '内置|自定义' &&
        dropdown.radius === 6 &&
        dropdown.bg === 'rgb(255, 255, 255)' &&
        dropdown.triggerH === dropdown.inputH &&
        dropdown.triggerRadius === 6,
      JSON.stringify(dropdown)
    )
    check(
      `${name}: 下拉里列出「甲班」`,
      await client.evaluate(
        `Array.from(document.querySelectorAll('.select-popup .select-option')).some(node => node.textContent.trim() === '甲班')`
      )
    )
    await client.evaluate(clickByText('.select-popup .select-option', '甲班'))
    await waitFor(client, `!document.querySelector('.select-popup')`, '班序弹层关闭')
    const attached = await client.evaluate(`(() => {
      const trigger = document.querySelectorAll('.member-row .select-trigger')[0]
      return trigger ? trigger.textContent.trim() === '甲班' : false
    })()`)
    check(`${name}: 成员下拉能选到自建班序`, attached)

    check(`${name}: 保存成员设置`, await client.evaluate(clickByText('.settings-actions button', '保存成员设置')))
    await sleep(350)

    // --- 9. 排班页用上了新班序 ---
    await client.evaluate(clickByText('[data-view="matrix"]', '全员矩阵'))
    await waitFor(client, 'Boolean(document.querySelector(".matrix"))', '回到排班页')
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 3', '矩阵 3 行')
    // 第一行现在是本人（4F），所以要看整列而不是只看第一行
    const rowLabels = await client.evaluate(
      `Array.from(document.querySelectorAll('.matrix-row .matrix-pattern')).map(node => node.textContent.trim())`
    )
    check(`${name}: 矩阵里显示自建班序名`, rowLabels.includes('甲班'), rowLabels.join(','))

    // --- 10. 导出备份：v5 且带上自建班序 ---
    // 顶栏不再放备份按钮，统一从「设置 → 系统设置」触发
    await client.evaluate(clickByText('[data-view="settings"]', '设置'))
    await sleep(300)
    await switchSettingsTab(client, '人员配置')
    await client.evaluate(clickByText('.settings-actions button', '导出备份'))

    let backupFile = null
    const downloadDeadline = Date.now() + 8000
    while (Date.now() < downloadDeadline && !backupFile) {
      const files = fs.readdirSync(downloadDir)
        .filter(file => file.endsWith('.json') && !file.endsWith('.crdownload'))
        .map(file => ({ file, mtime: fs.statSync(path.join(downloadDir, file)).mtimeMs }))
        .sort((left, right) => right.mtime - left.mtime)
      if (files.length > 0) backupFile = files[0].file
      else await sleep(200)
    }

    if (backupFile) {
      const backup = JSON.parse(fs.readFileSync(path.join(downloadDir, backupFile), 'utf8'))
      check(
        `${name}: 导出备份是 v5`,
        backup?.version === 5,
        `version=${backup?.version}`
      )
      check(
        `${name}: 备份带上自建班序（24 格）`,
        Array.isArray(backup?.roster?.patterns)
          && backup.roster.patterns.length === 1
          && backup.roster.patterns[0].name === '甲班'
          && backup.roster.patterns[0].shifts.length === 24,
        JSON.stringify(backup?.roster?.patterns?.map(item => ({ name: item.name, cells: item.shifts?.length })) ?? null)
      )
      check(`${name}: 备份带上 3 位成员`, backup?.roster?.members?.length === 3, String(backup?.roster?.members?.length))
    } else {
      check(`${name}: 导出备份是 v5`, false, '没有等到下载文件')
    }

    // --- 11. 删除自建班序：必须输入名字 ---
    await client.evaluate(clickByText('[data-view="settings"]', '设置'))
    await waitFor(client, 'document.querySelectorAll(".pattern-row").length === 1', '回到设置页')
    check(`${name}: 打开删除确认`, await client.evaluate(clickByText('.pattern-row-actions button', '删除')))
    await waitFor(client, 'Boolean(document.querySelector(".dialog-narrow"))', '删除确认弹层')
    check(
      `${name}: 未输入名字时删除按钮禁用`,
      await client.evaluate('document.querySelector(".dialog-narrow .btn-danger").disabled === true')
    )

    await client.evaluate(setInputBySelector('.dialog-narrow .confirm-label input', '甲'))
    await sleep(150)
    check(
      `${name}: 名字不对时仍禁用`,
      await client.evaluate('document.querySelector(".dialog-narrow .btn-danger").disabled === true')
    )

    await client.evaluate(setInputBySelector('.dialog-narrow .confirm-label input', '甲班'))
    await sleep(150)
    check(
      `${name}: 输对名字后可以删除`,
      await client.evaluate('document.querySelector(".dialog-narrow .btn-danger").disabled === false')
    )
    check(`${name}: 确认删除班序`, await client.evaluate(clickByText('.dialog-narrow .dialog-foot button', '删除班序')))
    await waitFor(client, '!document.querySelector(".dialog-narrow")', '弹层关闭')
    await sleep(350)

    const afterDelete = await client.evaluate(`(() => ({
      patterns: document.querySelectorAll('.pattern-row').length,
      members: document.querySelectorAll('.member-row').length
    }))()`)
    check(
      `${name}: 班序与其成员一并删除`,
      afterDelete.patterns === 0 && afterDelete.members === 2,
      JSON.stringify(afterDelete)
    )

    // --- 12. 翻月不崩 ---
    await client.evaluate(clickByText('[data-view="matrix"]', '全员矩阵'))
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 2', '矩阵剩 2 行')
    check(`${name}: 删除后矩阵同步更新`, true)

    await client.evaluate(clickByText('.month-track button', '回到本期'))
    const titleBefore = await client.evaluate('document.querySelector(".month-title").textContent.trim()')

    // 月份切换要像一个控件：分段胶囊 + 30px 步进按钮 + 文本两侧 1px 分隔；
    // 「回到本期」是胶囊最右一段（同框、左侧 1px 分隔、文字强调色）
    const monthLook = await client.evaluate(`(() => {
      const box = document.querySelector('.month-switch')
      const cs = box ? getComputedStyle(box) : null
      const steps = Array.from(document.querySelectorAll('.month-step'))
      const title = document.querySelector('.month-title')
      const titleCs = title ? getComputedStyle(title) : null
      const today = document.querySelector('.month-today')
      const todayCs = today ? getComputedStyle(today) : null
      return {
        grouped: steps.length === 2 && steps.every(step => step.closest('.month-switch')),
        boxBorder: cs ? parseFloat(cs.borderTopWidth) : -1,
        boxRadius: cs?.borderTopLeftRadius ?? '',
        stepW: steps[0] ? Math.round(steps[0].getBoundingClientRect().width) : -1,
        stepIcon: document.querySelectorAll('.month-step .month-icon').length,
        titleSep: titleCs ? [parseFloat(titleCs.borderLeftWidth), parseFloat(titleCs.borderRightWidth)] : [],
        todayInBox: Boolean(today && today.closest('.month-switch')),
        todaySep: todayCs ? parseFloat(todayCs.borderLeftWidth) : -1,
        todayColor: todayCs?.color ?? '',
        todayDisabledAtCurrent: today ? today.disabled : null,
        // 回到本期不再是独立的白底描边按钮（那会跟右侧备份按钮撞形）
        standaloneBtn: document.querySelectorAll('.month-track > .btn').length
      }
    })()`)
    check(
      `${name}: 月份切换与「回到本期」同在一个胶囊里`,
      monthLook.grouped === true && monthLook.boxBorder === 1 &&
        monthLook.boxRadius !== '0px' && monthLook.stepW === 30 && monthLook.stepIcon === 2 &&
        JSON.stringify(monthLook.titleSep) === JSON.stringify([1, 1]) &&
        monthLook.todayInBox === true && monthLook.todaySep === 1 &&
        monthLook.standaloneBtn === 0,
      JSON.stringify(monthLook)
    )
    check(
      `${name}: 已在本期时「回到本期」置灰禁用（没有可做的事就别勾人点）`,
      monthLook.todayDisabledAtCurrent === true && monthLook.todayColor === 'rgb(127, 151, 157)',
      JSON.stringify(monthLook)
    )

    // 月份胶囊要落在大卡片的水平中线上（顶栏三列 grid：左空 / 中 / 右操作区）
    const midAlign = await client.evaluate(`(() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect() ?? null
      const box = rect('.month-switch')
      const sheet = rect('.sheet')
      const right = rect('.topbar-right')
      return {
        boxMid: box ? Math.round(box.left + box.width / 2) : -1,
        sheetMid: sheet ? Math.round(sheet.left + sheet.width / 2) : -1,
        // 右侧操作区仍贴着右边（不能因为改 grid 被挤到中间）
        rightGap: sheet && right ? Math.round(sheet.right - right.right) : -1
      }
    })()`)
    check(
      `${name}: 月份胶囊居中于大卡片的水平中线`,
      Math.abs(midAlign.boxMid - midAlign.sheetMid) <= 6 && midAlign.rightGap >= 0,
      JSON.stringify(midAlign)
    )

    const summaryHIn = await client.evaluate(
      'Math.round(document.querySelector(".summary").getBoundingClientRect().height)'
    )
    await client.evaluate(`document.querySelectorAll('.month-step')[1].click(); true`)
    await sleep(200)
    const titleAfter = await client.evaluate('document.querySelector(".month-title").textContent.trim()')
    check(`${name}: 切换月份`, titleBefore !== titleAfter, `${titleBefore} → ${titleAfter}`)
    const summaryHOut = await client.evaluate(
      'Math.round(document.querySelector(".summary").getBoundingClientRect().height)'
    )
    check(
      `${name}: 非本期与本期概览条同高（切月不跳）`,
      summaryHOut === summaryHIn,
      JSON.stringify({ in: summaryHIn, out: summaryHOut })
    )
    // 切到下期后「回到本期」应当重新可用，且文字回到强调色
    const todayAfterShift = await client.evaluate(`(() => {
      const today = document.querySelector('.month-today')
      return {
        disabled: today ? today.disabled : null,
        color: today ? getComputedStyle(today).color : ''
      }
    })()`)
    check(
      `${name}: 切走之后「回到本期」恢复可用并变强调色`,
      todayAfterShift.disabled === false && todayAfterShift.color === 'rgb(127, 210, 226)',
      JSON.stringify(todayAfterShift)
    )
    check(`${name}: 切月后矩阵仍在`, await client.evaluate('document.querySelectorAll(".matrix-row").length === 2'))

    const scheduleOverflow = await client.evaluate(
      'document.documentElement.scrollHeight <= window.innerHeight + 1'
    )
    check(`${name}: 排班页也没有文档层滚动条`, scheduleOverflow)

    // --- 13. 导入 fixtures/班组13人.json（真实班组数据的导入链路） ---
    await client.evaluate(clickByText('[data-view="settings"]', '设置'))
    await waitFor(client, 'Boolean(document.querySelector(".canvas-tools [data-slot=\\"tabs-trigger\\"]"))', '设置页 tab')
    await switchSettingsTab(client, '人员配置')
    await waitFor(client, 'Boolean(document.querySelector(".settings-actions input[type=file]"))', '导入入口')

    // 备份的默认存放目录：静态版没有 __TAURI__，「选择…」必须是禁用态
    const backupDirRow = await client.evaluate(`(() => {
      const row = document.querySelector('.backup-dir')
      const path = row?.querySelector('.backup-dir-path')
      const pick = Array.from(row?.querySelectorAll('button') ?? [])
        .find(node => node.textContent.trim() === '选择…')
      return {
        exists: Boolean(row),
        label: row?.querySelector('.backup-dir-label')?.textContent.trim() ?? '',
        path: path?.textContent.trim() ?? '',
        isDefault: Boolean(path?.classList.contains('is-default')),
        disabled: pick ? pick.disabled : null
      }
    })()`)
    check(
      `${name}: 备份默认存放目录存在且静态版不可选`,
      backupDirRow.exists &&
        backupDirRow.label === '默认存放目录' &&
        backupDirRow.path === '系统「下载」文件夹' &&
        backupDirRow.isDefault === true &&
        backupDirRow.disabled === true,
      JSON.stringify(backupDirRow)
    )
    await client.send('DOM.enable')
    const { root } = await client.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await client.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '.settings-actions input[type=file]'
    })
    check(`${name}: 找到导入用的文件输入框`, Boolean(nodeId), String(nodeId))

    await client.send('DOM.setFileInputFiles', { files: [fixturePath], nodeId })
    await sleep(400)
    // 导入后仍停在个人资料页，成员表在另一页
    await switchSettingsTab(client, '人员配置')
    await waitFor(client, 'document.querySelectorAll(".member-row").length === 13', '成员表 13 行')
    const imported = await client.evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('.member-row'))
      const first = rows[0]
      return {
        count: rows.length,
        // 本人那一行是只读的（没有 input / select），姓名与班序读锁定的那两个 span
        firstName: first?.querySelector('.member-locked-name')?.textContent.trim() ?? '',
        firstPattern: first?.querySelector('.member-locked-pattern')?.textContent.trim() ?? '',
        selfBadges: document.querySelectorAll('.member-row .badge-self').length
      }
    })()`)
    check(
      `${name}: 导入 13 人样例备份（本人行只读且带徽章）`,
      imported.count === 13 &&
        imported.firstName === '华文达' &&
        imported.firstPattern === '4F' &&
        imported.selfBadges === 1,
      JSON.stringify(imported)
    )

    // 成员表新增「岗位」列；本人行岗位只读显示（fixture 里 13 人岗位统一为 PNP）
    const positionCol = await client.evaluate(`(() => {
      const head = document.querySelector('.member-editor-head')
      const first = document.querySelector('.member-row')
      return {
        hasCol: Array.from(head.querySelectorAll('span')).some(s => s.textContent.trim() === '岗位'),
        selfPosition: first.querySelector('.member-locked-position')?.textContent.trim() ?? ''
      }
    })()`)
    check(
      `${name}: 成员表有岗位列且本人行只读显示岗位`,
      positionCol.hasCol && positionCol.selfPosition === 'PNP',
      JSON.stringify(positionCol)
    )

    // 表头文案要与下方控件左边对齐（姓名 / 班序 / 岗位 / 排序那四栏）
    const headAlign = await client.evaluate(`(() => {
      const head = document.querySelector('.member-editor-head')
      const row = document.querySelector('.member-row')
      if (!head || !row) return null
      const labels = Array.from(head.children).map(el => ({
        text: el.textContent.trim(),
        left: Math.round(el.getBoundingClientRect().left),
        // 输入框正文从 1px 边框 + 8px 内边距 = 9px 处开始，表头文字要跟着缩进
        padLeft: Math.round(parseFloat(getComputedStyle(el).paddingLeft))
      }))
      // 班序 / 岗位包在 .member-fields 里（桌面 display: contents），这里摊平后再比列
      const fields = Array.from(row.children)
        .flatMap(el => el.classList.contains('member-fields') ? Array.from(el.children) : [el])
        .map(el => ({
          left: Math.round(el.getBoundingClientRect().left),
          width: Math.round(el.getBoundingClientRect().width)
        }))
      return { labels, fields }
    })()`)
    check(
      `${name}: 成员表表头文案与输入框文字左对齐（列边界 + 9px 缩进）`,
      // 表头没有「排序 / 删除」这一列的文字，所以逐个比 left 就够
      Boolean(headAlign) && headAlign.labels.every((label, index) =>
        !label.text || (
          Math.abs(label.left - (headAlign.fields[index]?.left ?? 0)) <= 1 &&
          label.padLeft === 9
        )
      ),
      JSON.stringify(headAlign)
    )

    // --- 13b. 滚动条出现 / 消失时内容宽度不得变 ---
    // 这里**不靠** scrollbar-gutter: stable：原生竖条宽度被收成 0
    // （`.canvas-flow::-webkit-scrollbar { width: 0 }`），滑块由 ScrollOverlay 覆盖式自绘，
    // 原生滚动条根本不占位，所以它在与不在都不影响内容宽度。
    // 验证方式：在同一个 tab 里把视口拉高（内容不再超长 → 原生滚动条消失），
    // 对比拉高前后 .settings-section 的宽度与 .canvas-flow 的 clientWidth —— 二者都不得变。
    const widthOf = `(() => {
      // 设置页把页头钉住了，真正在滚的是 .canvas-flow（画布自己不滚）
      const flow = document.querySelector('.canvas-flow')
      const section = document.querySelector('.settings-section')
      return {
        flowClient: flow?.clientWidth ?? 0,
        sectionWidth: section?.getBoundingClientRect().width ?? 0,
        scrolls: flow ? flow.scrollHeight > flow.clientHeight + 1 : false
      }
    })()`
    const scrolledState = await client.evaluate(widthOf)
    // 把视口拉高到 2200，人员配置页不再超长 → 滚动条应当消失
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 2200,
      deviceScaleFactor: 1,
      mobile: false
    })
    await sleep(250)
    const fittedState = await client.evaluate(widthOf)
    // 复原视口
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    })
    await sleep(250)
    check(
      `${name}: 滚动条出现/消失时内容宽度不变（原生竖条宽度为 0）`,
      // 短视口下超长（滚动条在），高视口下不超长（滚动条没了）
      scrolledState.scrolls === true &&
        fittedState.scrolls === false &&
        Math.abs(scrolledState.sectionWidth - fittedState.sectionWidth) < 1 &&
        scrolledState.flowClient === fittedState.flowClient,
      JSON.stringify({ scrolledState, fittedState })
    )

    // --- 13c. 覆盖式滚动条：静止隐藏，滚动淡入，停下淡出 ---
    const overlayState = `(() => {
      const root = document.querySelector('.scroll-overlay')
      const thumbs = Array.from(document.querySelectorAll('.scroll-overlay-thumb'))
      const visible = thumbs.filter(t => t.classList.contains('is-visible'))
      const thumb = visible[0] ?? thumbs[0] ?? null
      const flow = document.querySelector('.canvas-flow')
      return {
        rootExists: Boolean(root),
        exists: Boolean(root && thumb),
        visibleCount: visible.length,
        opacity: thumb ? Number(getComputedStyle(thumb).opacity) : 0,
        // 滑块必须在容器可视矩形内，且高度合理
        thumbTop: thumb ? Math.round(thumb.getBoundingClientRect().top) : -1,
        thumbHeight: thumb ? Math.round(thumb.getBoundingClientRect().height) : -1,
        flowRight: flow ? Math.round(flow.getBoundingClientRect().right) : -1
      }
    })()`
    // 初始：完全隐藏（滑块是按需创建的，静止时可能一条都还没有）
    const idleOverlay = await client.evaluate(overlayState)
    check(
      `${name}: 覆盖式滚动条初始隐藏`,
      idleOverlay.rootExists && idleOverlay.visibleCount === 0 && idleOverlay.opacity === 0,
      JSON.stringify(idleOverlay)
    )

    // 滚动设置页的滚动区（页头固定后，滚的是 .canvas-flow）→ 滑块淡入
    await client.evaluate(`(() => {
      const flow = document.querySelector('.canvas-flow')
      if (flow) flow.scrollTop = 200
      return true
    })()`)
    await sleep(300)
    const scrolledOverlay = await client.evaluate(overlayState)
    check(
      `${name}: 滚动时滑块淡入`,
      scrolledOverlay.visibleCount === 1 &&
        scrolledOverlay.opacity > 0.9 &&
        scrolledOverlay.thumbHeight > 10 &&
        scrolledOverlay.thumbTop > 0,
      JSON.stringify(scrolledOverlay)
    )

    // 停下 0.7 秒后 → 淡出
    await sleep(1400)
    const fadedOverlay = await client.evaluate(overlayState)
    check(
      `${name}: 停止滚动后滑块淡出`,
      fadedOverlay.visibleCount === 0 && fadedOverlay.opacity === 0,
      JSON.stringify(fadedOverlay)
    )

    await client.evaluate(clickByText('[data-view="matrix"]', '全员矩阵'))
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 13', '矩阵 13 行')
    check(`${name}: 导入后矩阵 13 行`, true)
    const firstPattern = await client.evaluate(
      `document.querySelector('.matrix-row .matrix-pattern')?.textContent.trim() ?? ''`
    )
    check(`${name}: 矩阵班序旁拼岗位（4F · PNP）`, firstPattern === '4F · PNP', firstPattern)

    // --- 14. 人员排序：设置里的行顺序必须映射成矩阵的行顺序 ---
    await client.evaluate(clickByText('[data-view="settings"]', '设置'))
    await waitFor(client, 'document.querySelectorAll(".member-row").length === 13', '回到成员表')

    // 拖动排序只在「排序」模式里：先点排序入口，再把第一行把手拖到第二行
    check(`${name}: 点开排序模式`, await client.evaluate(clickByText('.sort-action', '排序')))
    await waitFor(client, 'document.querySelectorAll(".sort-row").length === 13', '排序模式列表')
    const handlePos = await client.evaluate(`(() => {
      const handle = document.querySelectorAll('.sort-row .sort-handle')[0]
      if (!handle) return null
      const rect = handle.getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    })()`)
    check(`${name}: 排序模式里有拖动把手`, Boolean(handlePos), JSON.stringify(handlePos))
    if (handlePos) {
      await client.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: handlePos.x, y: handlePos.y, button: 'left', buttons: 1, clickCount: 1
      })
      await sleep(80)
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: handlePos.x, y: handlePos.y + 52, button: 'left', buttons: 1
      })
      await sleep(120)
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: handlePos.x, y: handlePos.y + 52, button: 'left', buttons: 0, clickCount: 1
      })
      await sleep(150)
    }

    // 本人那一行没有 input，所以统一按「有 input 读 value，没 input 读锁定文本」取名字
    const orderAfterMove = await client.evaluate(`(() => {
      return Array.from(document.querySelectorAll('.sort-row')).slice(0, 3).map(row => {
        return (row.querySelector('.sort-name')?.textContent ?? '').trim()
      })
    })()`)
    check(
      `${name}: 下移一位后表内顺序变化`,
      JSON.stringify(orderAfterMove) === JSON.stringify(['张舒棋', '华文达', '陈泳智']),
      JSON.stringify(orderAfterMove)
    )

    // 排序模式点「完成」即落盘
    check(`${name}: 排序模式点完成即保存`, await client.evaluate(clickByText('.settings-actions button', '完成')))
    await sleep(300)

    await client.evaluate(clickByText('[data-view="matrix"]', '全员矩阵'))
    await waitFor(client, 'document.querySelectorAll(".matrix-row").length === 13', '矩阵 13 行')
    const matrixOrder = await client.evaluate(
      `Array.from(document.querySelectorAll('.matrix-name')).slice(0, 3).map(node => node.textContent.trim())`
    )
    check(
      `${name}: 矩阵行顺序跟随设置`,
      JSON.stringify(matrixOrder) === JSON.stringify(['张舒棋', '华文达', '陈泳智']),
      JSON.stringify(matrixOrder)
    )

    // --- 15. 宽屏防拉伸：三页共用同一档版心（1228 居中）---
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 2560,
      height: 1440,
      deviceScaleFactor: 1,
      mobile: false
    })
    const wideGaps = []
    for (const route of ['#/overview', '#/matrix', '#/settings/roster']) {
      await client.send('Page.navigate', { url: `${url}${route}` })
      await waitFor(client, 'Boolean(document.querySelector(".canvas"))', `宽屏 ${route}`)
      await sleep(240)
      wideGaps.push(await client.evaluate(`(() => {
        const canvas = document.querySelector('.canvas').getBoundingClientRect()
        const sheet = document.querySelector('.sheet').getBoundingClientRect()
        return {
          w: Math.round(canvas.width),
          l: Math.round(canvas.left - sheet.left),
          r: Math.round(sheet.right - canvas.right)
        }
      })()`))
    }
    check(
      `${name}: 2560 宽屏下三页限宽 1228、左右留白对称`,
      wideGaps.length === 3 &&
        wideGaps.every(gap => gap.w >= 1226 && gap.w <= 1230 && Math.abs(gap.l - gap.r) <= 1),
      JSON.stringify(wideGaps)
    )
  } catch (error) {
    check(`${name}: 场景执行`, false, error.message)
  } finally {
    client?.close()
    chrome.kill()
    await sleep(300)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
}

/**
 * 宽屏验收：本分支不做窄屏响应式，侧栏与版式在任何窗口宽度都保持不变。
 *
 * 断言覆盖三档桌面宽度（1024 / 1280 / 1466）加 1008（回归：曾经在这里
 * 被切成底部标签栏）；另做一遍源码层检查，防止窄屏分支回流。
 * 样例班组直接写进 localStorage，省掉一遍向导流程。
 */
const WIDE_WIDTHS = [1024, 1280, 1466, 1008]

function checkWideScreenSources() {
  const name = 'wide:src'
  const walk = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name)
      return entry.isDirectory() ? walk(full) : [full]
    })
  const sourceFiles = walk(path.join(projectDir, 'src'))
    .filter(file => /\.(ts|tsx|scss|css)$/.test(file))
  const allSource = sourceFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n')

  check(
    `${name}: 窄屏钩子与移动端底部标签栏已移除`,
    !fs.existsSync(path.join(projectDir, 'src/hooks/use-compact.ts')) &&
      !fs.existsSync(path.join(projectDir, 'src/components/MobileNav.tsx')) &&
      !allSource.includes('useIsCompact') &&
      !allSource.includes('MobileNav'),
    'src 中不得出现 use-compact / MobileNav'
  )
  check(
    `${name}: 样式里没有 ≤1023 / ≤639 窄屏断点`,
    !sourceFiles.some(file =>
      /@media[^{]*(?:max-width:[ ]*(?:1023|639)px)/.test(fs.readFileSync(file, 'utf8'))
    ),
    '只保留 @container 与 1119 桌面重排'
  )
  const mobileHook = fs.readFileSync(path.join(projectDir, 'src/hooks/use-mobile.ts'), 'utf8')
  check(
    `${name}: useIsMobile 恒为 false（shadcn 不切 Sheet 抽屉）`,
    /export function useIsMobile\(\)\s*\{\s*return false\s*\}/.test(mobileHook),
    'CLI 副本不改，靠 hook 关闭抽屉分支'
  )
  const shellScss = fs.readFileSync(path.join(projectDir, 'src/styles/shell.scss'), 'utf8')
  check(
    `${name}: 折叠态只保留标题栏那一枚品牌标识`,
    shellScss.includes("[data-slot='sidebar'][data-collapsible='icon'] .brand-hero {"),
    'brand-hero 在图标条下必须收起（否则壳里会出现两枚 logo）'
  )
  const railBody =
    (shellScss.split("[data-slot='sidebar'][data-collapsible='icon'] [data-slot='sidebar-rail']")[1] ||
      '').split('}')[0] || ''
  check(
    `${name}: 折叠态抓取条收进侧栏内（不越界撑宽合成层）`,
    railBody.includes('right: 0 !important') &&
      railBody.includes('translate: none !important') &&
      !railBody.includes('display: none'),
    'Rail 仍是 -right-4 时会向侧栏外探 8px，WebView2 固定层多出一截，右缘出现白/灰接缝'
  )
}

async function runWideScreenChecks(url) {
  const name = 'wide'
  console.log('\n=== 场景：宽屏布局不随窗口收缩 ===')
  const userDataDir = path.join(os.tmpdir(), `shift-verify-wide-${Date.now()}`)
  const { child: chrome, debugPort } = launchHeadlessChrome({ userDataDir, target: url })
  let client = null

  try {
    const page = await waitForJsonEndpoint(debugPort)
    client = createCdpClient(page.webSocketDebuggerUrl)
    await client.ready
    await client.send('Runtime.enable')
    await client.send('Page.enable')

    await waitFor(
      client,
      `location.href.startsWith(${JSON.stringify(url.replace(/[^/]*$/, ''))})`,
      '标签页加载到目标地址'
    )
    const roster = JSON.parse(fs.readFileSync(fixturePath, 'utf8')).roster
    await client.evaluate(
      `localStorage.setItem(${JSON.stringify(ROSTER_KEY)}, ${JSON.stringify(JSON.stringify({ ...roster, updatedAt: Date.now() }))}); true`
    )

    for (const width of WIDE_WIDTHS) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false
      })
      await client.send('Page.reload', { ignoreCache: true })
      await waitFor(client, 'Boolean(document.querySelector("[data-slot=sidebar-container]"))', `侧栏 @${width}`)
      await sleep(300)

      const m = await client.evaluate(`(() => {
        const rect = sel => document.querySelector(sel)?.getBoundingClientRect()
        const style = sel => {
          const node = document.querySelector(sel)
          return node ? getComputedStyle(node) : null
        }
        const sidebar = document.querySelector('[data-slot="sidebar-container"]')
        const inset = rect('[data-slot="sidebar-inset"]')
        const gap = rect('[data-slot="sidebar-gap"]')
        const trigger = rect('[data-slot="sidebar-trigger"]')
        const head = style('.canvas-head')
        const box = sidebar?.getBoundingClientRect()
        return {
          vw: window.innerWidth,
          docW: document.documentElement.scrollWidth,
          sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : 'missing',
          sidebarLeft: Math.round(box?.left ?? -1),
          sidebarW: Math.round(box?.width ?? -1),
          gapW: Math.round(gap?.width ?? -1),
          insetLeft: Math.round(inset?.left ?? -1),
          triggerW: Math.round(trigger?.width ?? -1),
          headWrap: head ? head.flexWrap : 'missing',
          bottomTab: Boolean(
            document.querySelector('nav[aria-label="主导航"]') ||
            document.querySelector('.rail') ||
            document.querySelector('[data-mobile="true"]')
          ),
          sheet: Boolean(document.querySelector('[data-slot="sheet"]'))
        }
      })()`)

      const tag = `${name}@${width}`
      check(`${tag}: 侧栏常驻且展开固定 224px（不随宽度收缩）`,
        m.sidebarDisplay === 'flex' &&
          Math.abs(m.sidebarW - 224) <= 1 &&
          m.sidebarLeft === 0 &&
          Math.abs(m.gapW - 224) <= 1,
        JSON.stringify({ w: m.sidebarW, left: m.sidebarLeft, gap: m.gapW, display: m.sidebarDisplay }))
      check(`${tag}: 内容区从侧栏右缘（224px）开始`,
        Math.abs(m.insetLeft - 224) <= 1,
        JSON.stringify({ insetLeft: m.insetLeft }))
      check(`${tag}: 底部不出现移动端 tab / 侧栏抽屉`,
        !m.bottomTab && !m.sheet,
        JSON.stringify({ bottomTab: m.bottomTab, sheet: m.sheet }))
      check(`${tag}: 折叠按钮常驻`,
        m.triggerW > 0,
        JSON.stringify({ triggerW: m.triggerW }))
      check(`${tag}: 页头不换行（没有窄屏重排）`,
        m.headWrap === 'nowrap',
        JSON.stringify({ headWrap: m.headWrap }))
      check(`${tag}: 没有文档层横向溢出`,
        m.docW <= m.vw + 1,
        JSON.stringify({ docW: m.docW, vw: m.vw }))

      // 折叠态：图标条 48px，32px 的菜单按钮必须完整落在侧栏里（不被两侧裁掉）
      await client.evaluate(`document.querySelector('[data-slot="sidebar-trigger"]')?.click(); true`)
      await sleep(350)
      const collapsed = await client.evaluate(`(() => {
        const rect = sel => document.querySelector(sel)?.getBoundingClientRect()
        const bar = rect('[data-slot="sidebar-container"]')
        const gap = rect('[data-slot="sidebar-gap"]')
        const inset = rect('[data-slot="sidebar-inset"]')
        const button = rect('[data-slot="sidebar-menu-button"]')
        const rail = rect('[data-slot="sidebar-rail"]')
        return {
          w: Math.round(bar?.width ?? -1),
          gapW: Math.round(gap?.width ?? -1),
          insetLeft: Math.round(inset?.left ?? -1),
          buttonW: Math.round(button?.width ?? -1),
          buttonLeft: Math.round(button?.left ?? -1),
          buttonRight: Math.round(button?.right ?? -1),
          railLeft: Math.round(rail?.left ?? -1),
          railW: Math.round(rail?.width ?? -1),
          railRight: Math.round(rail?.right ?? -1)
        }
      })()`)
      check(`${tag}: 折叠后 48px 图标条，按钮不被裁`,
        Math.abs(collapsed.w - 48) <= 1 &&
          Math.abs(collapsed.gapW - 48) <= 1 &&
          Math.abs(collapsed.insetLeft - 48) <= 1 &&
          collapsed.buttonW === 32 &&
          collapsed.buttonLeft >= 0 &&
          collapsed.buttonRight <= 41,
        JSON.stringify(collapsed))
      // 抓取条保留，但必须完全落在 48px 侧栏内 —— 越界会撑宽 WebView2 的固定合成层
      check(`${tag}: 抓取条保留且不越出侧栏右缘`,
        collapsed.railW > 0 &&
          collapsed.railLeft >= 0 &&
          collapsed.railRight <= collapsed.w + 1,
        JSON.stringify({ railLeft: collapsed.railLeft, railW: collapsed.railW, railRight: collapsed.railRight }))
      // 展开回去，保持下一轮 / 下一次进入都是默认展开态
      await client.evaluate(`document.querySelector('[data-slot="sidebar-trigger"]')?.click(); true`)
      await sleep(350)
    }
  } catch (error) {
    check(`${name}: 场景执行`, false, error.message)
  } finally {
    client?.close()
    chrome.kill()
    await sleep(300)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
}

async function main() {
  if (!fs.existsSync(distIndex)) {
    console.error('没有找到 dist/index.html，请先运行 pnpm build')
    process.exit(1)
  }

  const browser = findBrowser()
  if (!browser) {
    console.error('没有找到 Chrome / Edge，可通过 CHROME_PATH 指定')
    process.exit(1)
  }

  console.log(`浏览器: ${browser}`)

  const downloadDir = path.join(os.tmpdir(), `shift-verify-download-${Date.now()}`)
  fs.mkdirSync(downloadDir, { recursive: true })

  const { server, port } = await startStaticServer(distDir)

  try {
    if (only !== 'file' && only !== 'wide') {
      await runScenario('http', `http://127.0.0.1:${port}/index.html`, path.join(downloadDir, 'http'))
    }
    if (only !== 'http' && only !== 'wide') {
      await runScenario('file', pathToFileURL(distIndex).href, path.join(downloadDir, 'file'))
    }
    // 宽屏不变式只跟视口有关，跑一遍就够（http 场景顺手复用同一个静态服务）
    if (only !== 'file') {
      checkWideScreenSources()
      await runWideScreenChecks(`http://127.0.0.1:${port}/index.html`)
    }
  } finally {
    server.close()
    fs.rmSync(downloadDir, { recursive: true, force: true })
  }

  const failed = results.filter(item => !item.ok)
  console.log(`\n=== 汇总：${results.length - failed.length}/${results.length} 通过 ===`)

  if (failed.length > 0) {
    failed.forEach(item => console.log(`  FAIL  ${item.name}  ${item.detail}`))
    process.exit(1)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
