import { CLOUD_ENV_ID, CLOUD_FUNCTION } from './config'

/**
 * 云开发只在小程序端存在；H5 预览里 `wx` 不存在，`typeof` 探测不会报错。
 *
 * 不用 `globalThis.wx`：小程序的基础库里 globalThis 不一定挂了 wx，
 * 直接引用全局 `wx` 才是可靠的。
 */
declare const wx: any

const wechat: any = typeof wx !== 'undefined' ? wx : null

export const cloudSupported = Boolean(wechat && wechat.cloud && wechat.cloud.callFunction)

let inited = false

function initCloud() {
  if (!cloudSupported || inited) return
  wechat.cloud.init({ env: CLOUD_ENV_ID, traceUser: false })
  inited = true
}

export interface ApiResponse<T> {
  ok: boolean
  code?: string
  message?: string
  data?: T
  written?: number
  errors?: string[]
}

/**
 * 调云函数：失败一律抛错，让调用方决定重试还是忽略。
 * 云函数返回 `{ ok: false }` 也按失败处理 —— 服务端已写明原因。
 */
export async function callRosterApi<T = unknown>(payload: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (!cloudSupported) throw new Error('当前环境不支持云开发')
  initCloud()

  const response = await wechat.cloud.callFunction({ name: CLOUD_FUNCTION, data: payload })
  const result = response && response.result as ApiResponse<T> | undefined
  if (!result || result.ok !== true) {
    throw new Error((result && result.message) || '云函数调用失败')
  }
  return result
}
