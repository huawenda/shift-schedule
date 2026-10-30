/**
 * Chrome DevTools Protocol 的最小封装。
 *
 * 只做三件事：等调试端口、收发 CDP 消息、轮询页面条件。
 * 所有验收 / 截图 / 探针脚本共用这一份，避免每个脚本各抄一遍。
 */

/** 轮询 `/json/list` 直到页面 target 出现（浏览器刚启动时可能还没就绪） */
export async function waitForJsonEndpoint(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl)
        if (page) return page
      }
    } catch {
      // 浏览器还没起来
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  throw new Error('连接无头浏览器超时')
}

export function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  const pending = new Map()
  let nextId = 1

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve())
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')))
  })
  ready.catch(() => {})

  socket.addEventListener('message', event => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    if (!message.id || !pending.has(message.id)) return

    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(`${message.error.message || 'CDP 调用失败'}`))
    else resolve(message.result)
  })

  function send(method, params = {}) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description
      throw new Error(description || result.exceptionDetails.text || '页面内求值失败')
    }
    return result.result.value
  }

  function close() {
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close()
    } catch {
      // 忽略
    }
  }

  return { ready, send, evaluate, close }
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** 轮询页面内表达式，直到返回真值；超时抛错 */
export async function waitFor(client, expression, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await client.evaluate(expression).catch(() => false)) return true
    await sleep(120)
  }
  throw new Error(`等待超时：${label}`)
}

/** 点文字完全匹配的按钮（button 或 label），返回一段可直接 evaluate 的表达式 */
export function clickByText(selector, text) {
  return `(() => {
    const target = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .find(item => item.textContent.trim() === ${JSON.stringify(text)})
    if (!target) return false
    target.click()
    return true
  })()`
}
