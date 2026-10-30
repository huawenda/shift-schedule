#!/usr/bin/env node
/**
 * 一键拉起「昼夜 · 个人倒班记录本」开发服务器。
 *
 * 为什么不直接 `vite`：
 *   1. 端口锁在 6180。vite 默认 5173，端口不锁死时容易开错窗口。
 *   2. 默认只绑 127.0.0.1。`vite --host` 会绑 0.0.0.0，既会弹 Windows 防火墙，
 *      也等于把排班表挂到公司局域网里；要给别人看时再显式加 --lan。
 *   3. 启动前先探测端口。被占用多半是上一个 dev server 没退干净，
 *      这时明确告诉你「旧实例还占着 6180」，而不是让你对着一个 6181 的地址发懵。
 *   4. 打印的地址取自 vite 的 resolvedUrls，端口顺延后也不会印错。
 *
 * 用法：
 *   pnpm dev                     # http://127.0.0.1:6180/
 *   pnpm dev -- --open           # 起来后自动打开默认浏览器
 *   pnpm dev -- --lan            # 绑 0.0.0.0，同 Wi-Fi 的手机/平板也能看
 *   pnpm dev -- --port 7000      # 换端口
 *   pnpm dev -- --port 0         # 让系统随便挑一个空闲端口
 *   pnpm dev -- --strict-port    # 端口被占用就直接报错，不自动顺延
 *
 * 注意：pnpm 会吞掉第一个 `--`，所以参数要写成 `pnpm dev -- --open`。
 *      直接 `node scripts/dev.mjs --open` 也行。
 */

import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PORT = 6180
const DEFAULT_HOST = '127.0.0.1'

/* ------------------------------ 参数解析 ------------------------------ */

const argv = process.argv.slice(2)

/** 读 `--name value` 或 `--name=value`，都没有则返回 undefined */
function readOption(name) {
  const inline = argv.find(arg => arg.startsWith(`--${name}=`))
  if (inline) return inline.slice(name.length + 3)

  const index = argv.indexOf(`--${name}`)
  if (index >= 0) {
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('-')) return next
  }
  return undefined
}

const wantsHelp = argv.includes('--help') || argv.includes('-h')

const lanFlag = argv.includes('--lan')
const host = readOption('host') ?? (lanFlag ? '0.0.0.0' : DEFAULT_HOST)

const portRaw = readOption('port')
const port = portRaw === undefined ? DEFAULT_PORT : Number(portRaw)

const shouldOpen = argv.includes('--open') || argv.includes('-o')
const strictPort = argv.includes('--strict-port')

/* ------------------------------ 终端输出 ------------------------------ */

// 只在真终端上色；重定向到文件或 NO_COLOR 时保持纯文本
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text)
const bold = text => paint('1', text)
const dim = text => paint('2', text)
const cyan = text => paint('36', text)

function printHelp() {
  console.log(`
${bold('昼夜 · 个人倒班记录本')} 开发服务器

${bold('用法')}
  pnpm dev [选项]
  node scripts/dev.mjs [选项]

${bold('选项')}
  --port <n>       监听端口，默认 ${DEFAULT_PORT}；传 0 让系统挑一个空闲端口
  --host <addr>    监听地址，默认 ${DEFAULT_HOST}
  --lan            等价于 --host 0.0.0.0，同局域网可访问
  --open, -o       启动后自动打开默认浏览器
  --strict-port    端口被占用时报错退出，不自动顺延
  --help, -h       显示这段说明

${bold('例子')}
  pnpm dev -- --open
  pnpm dev -- --lan
  pnpm dev -- --port 7000
`)
}

/* ------------------------------ 端口探测 ------------------------------ */

/**
 * 探测 host:port 是否可绑定。
 * 用和 dev server 相同的 host 试绑，避免「0.0.0.0 上有服务、但 127.0.0.1 探不到」的误判。
 */
function isPortFree(targetPort, targetHost) {
  return new Promise(resolve => {
    const probe = net.createServer()
    probe.unref()
    probe.once('error', error => resolve(error.code !== 'EADDRINUSE'))
    probe.listen({ port: targetPort, host: targetHost, exclusive: true }, () => {
      probe.close(() => resolve(true))
    })
  })
}

/* ------------------------------ 主流程 ------------------------------ */

async function main() {
  if (wantsHelp) {
    printHelp()
    return
  }

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`  端口取值不合法：${portRaw}`)
    console.error(dim('  应为 0–65535 的整数，例如 --port 7000'))
    process.exit(1)
  }

  console.log('')
  console.log(`  ${bold('昼夜 · 个人倒班记录本')}`)
  console.log('')

  // 端口被占用时先讲清楚原因，再交给 vite 顺延
  if (port !== 0 && !(await isPortFree(port, host))) {
    if (strictPort) {
      console.error(`  ${bold('端口 ' + port + ' 已被占用')}`)
      console.error(dim('  你可能还有一个 dev server 没关；关掉它，或换端口：pnpm dev -- --port 7001'))
      process.exit(1)
    }

    console.log(dim(`  端口 ${port} 已被占用 —— 多半是上一个 dev server 还没退出。`))
    console.log(dim('  若那个实例还开着，浏览器直接访问它就行，不必再起一个。'))
    console.log(dim('  本次将自动顺延到下一个空闲端口。'))
    console.log('')
  }

  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    // 不清屏：保留这条启动日志，方便回看端口顺延的经过
    clearScreen: false,
    server: {
      host,
      port,
      strictPort,
      open: shouldOpen
    }
  })

  await server.listen()

  const urls = server.resolvedUrls ?? { local: [], network: [] }
  const localUrl = urls.local[0]
  const networkUrls = urls.network.filter(url => !urls.local.includes(url))

  if (localUrl) console.log(`  ➜  ${dim('本地')}  ${cyan(localUrl)}`)
  networkUrls.forEach(url => {
    console.log(`  ➜  ${dim('网络')}  ${cyan(url)}`)
  })

  console.log('')
  console.log(dim('  零网络请求 · 数据只存在本机浏览器'))
  console.log(dim('  改 src/ 自动热更新 · Ctrl+C 停止'))
  console.log('')

  const shutdown = async () => {
    console.log(dim('\n  正在关闭…'))
    try {
      await server.close()
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  // 某些终端关闭窗口只发 SIGHUP
  process.on('SIGHUP', shutdown)
}

main().catch(error => {
  const message = error?.message ?? String(error)
  console.error('')
  console.error(`  ${bold('启动失败')}  ${message}`)
  if (message.includes('EADDRINUSE')) {
    console.error(dim(`  端口 ${port} 被占用。换一个：pnpm dev -- --port 7001`))
  }
  process.exit(1)
})
