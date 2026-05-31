import Taro from '@tarojs/taro'

const webAuthTokenStorageKey = 'shift-scheduler:web-auth-token:v1'
const apiBaseUrl = '/api'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getWebAuthToken(): string {
  try {
    const token = Taro.getStorageSync(webAuthTokenStorageKey)
    return typeof token === 'string' ? token : ''
  } catch {
    return ''
  }
}

export function hasWebAuthToken(): boolean {
  return Boolean(getWebAuthToken())
}

export function setWebAuthToken(token: string) {
  try {
    Taro.setStorageSync(webAuthTokenStorageKey, token)
  } catch {
    // A failed token write should surface through the next authenticated request.
  }
}

export function clearWebAuthToken() {
  try {
    Taro.removeStorageSync(webAuthTokenStorageKey)
  } catch {
    // Clearing auth is best effort.
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string
    body?: unknown
    auth?: boolean
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (options.auth !== false) {
    const token = getWebAuthToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  })
  const result = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401) clearWebAuthToken()
    throw new ApiError(response.status, result?.message ?? '服务器请求失败')
  }

  return result as T
}

