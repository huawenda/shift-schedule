import { spawn } from 'node:child_process'
import fs from 'node:fs'

/** 找本机 Chrome / Edge；优先用环境变量 CHROME_PATH 指定的可执行文件 */
export function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean)

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null
}

/**
 * 起一个无头 Chrome，返回进程与调试端口。
 *
 * 只负责「把进程开起来」：连 CDP、设视口、等页面都在调用方做。
 * 调试端口在 9333–9732 之间随机，避免两套脚本同时跑时撞车。
 */
export function launchHeadlessChrome({ userDataDir, target = 'about:blank', extraArgs = [] }) {
  const browser = findBrowser()
  if (!browser) throw new Error('没有找到 Chrome / Edge（可用 CHROME_PATH 指定）')

  const debugPort = 9333 + Math.floor(Math.random() * 400)
  const child = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    ...extraArgs,
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${debugPort}`,
    target
  ], { stdio: 'ignore' })

  return { child, debugPort }
}
