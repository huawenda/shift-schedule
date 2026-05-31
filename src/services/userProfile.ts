import Taro from '@tarojs/taro'
import { ApiError, apiRequest, clearWebAuthToken, setWebAuthToken } from './apiClient'
import { isH5Runtime } from './runtime'

const collectionName = 'user_profiles'
const h5ProfileStorageKey = 'shift-scheduler:h5-user-profile:v1'
export const adminOpenids = ['oK0h23Zc4Z5ZIebbU0GiaLDPIpQA']
const adminOpenidSet = new Set(adminOpenids.map(openid => openid.trim().toLowerCase()))

export interface UserProfile {
  _id?: string
  _openid?: string
  personName: string
  boundAt: number
  boundAtText?: string
  updatedAt: number
  updatedAtText?: string
}

export interface CurrentUserProfile {
  openid: string | null
  isAdmin: boolean
  profile: UserProfile | null
}

interface CloudCollection {
  get: () => Promise<{ data: unknown[] }>
  add: (options: { data: Record<string, unknown> }) => Promise<unknown>
  doc: (id: string) => {
    update: (options: { data: Record<string, unknown> }) => Promise<unknown>
  }
  limit: (limit: number) => CloudCollection
}

interface CloudGetResponse {
  data: unknown[]
}

interface UserProfileFunctionResult {
  ok?: boolean
  code?: string
  message?: string
  openid?: unknown
  isAdmin?: unknown
  profile?: unknown
}

interface WebLoginResult extends UserProfileFunctionResult {
  token?: unknown
}

interface WebAccountLoginInput {
  username: string
  password: string
}

interface WebAccountRegisterInput extends WebAccountLoginInput {
  personName: string
  inviteCode: string
}

export class UserProfileError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'UserProfileError'
    this.code = code
  }
}

function getCollection(): CloudCollection {
  return Taro.cloud.database().collection(collectionName) as unknown as CloudCollection
}

function isUserProfile(value: unknown): value is UserProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false

  const record = value as Record<string, unknown>
  return typeof record.personName === 'string'
}

export async function getCurrentOpenid(): Promise<string | null> {
  if (isH5Runtime) return 'h5-admin'

  try {
    const response = await Taro.cloud.callFunction({ name: 'getOpenid' })
    const result = response.result as { openid?: unknown } | undefined
    return typeof result?.openid === 'string' ? result.openid : null
  } catch {
    return null
  }
}

function normalizeCurrentUserProfile(result: UserProfileFunctionResult | null | undefined): CurrentUserProfile | null {
  if (!result) return null

  const openid = typeof result.openid === 'string' ? result.openid : null
  const profile = isUserProfile(result.profile) ? result.profile : null
  const resolvedOpenid = openid ?? profile?._openid ?? null
  return {
    openid: resolvedOpenid,
    isAdmin: typeof result.isAdmin === 'boolean'
      ? result.isAdmin
      : (resolvedOpenid ? adminOpenidSet.has(resolvedOpenid.trim().toLowerCase()) : false),
    profile
  }
}

async function callUserProfileFunction(
  action: 'load' | 'bind',
  personName?: string
): Promise<UserProfileFunctionResult | null> {
  try {
    const response = await Taro.cloud.callFunction({
      name: 'userProfile',
      data: {
        action,
        ...(personName ? { personName } : {})
      }
    })
    return response.result as UserProfileFunctionResult | undefined ?? null
  } catch (error) {
    console.warn('云函数 userProfile 调用失败', error)
    return null
  }
}

export async function loadCurrentUserProfile(): Promise<CurrentUserProfile> {
  if (isH5Runtime) {
    try {
      const result = await apiRequest<UserProfileFunctionResult>('/profile')
      return normalizeCurrentUserProfile(result) ?? {
        openid: null,
        isAdmin: false,
        profile: null
      }
    } catch {
      clearWebAuthToken()
      return {
        openid: null,
        isAdmin: false,
        profile: null
      }
    }
  }

  const functionProfile = normalizeCurrentUserProfile(await callUserProfileFunction('load'))
  if (functionProfile) return functionProfile

  const [openid, profileResponse] = await Promise.all([
    getCurrentOpenid(),
    getCollection().limit(1).get().catch<CloudGetResponse>(() => ({ data: [] }))
  ])
  const profile = profileResponse.data.find(isUserProfile) ?? null
  const resolvedOpenid = openid ?? profile?._openid ?? null

  return {
    openid: resolvedOpenid,
    isAdmin: resolvedOpenid ? adminOpenidSet.has(resolvedOpenid.trim().toLowerCase()) : false,
    profile
  }
}

function persistWebLoginResult(result: WebLoginResult): CurrentUserProfile {
  if (typeof result.token === 'string') setWebAuthToken(result.token)
  const currentProfile = normalizeCurrentUserProfile(result)
  if (!currentProfile?.profile) {
    throw new UserProfileError('INVALID_PROFILE_RESPONSE', '登录失败，请稍后重试')
  }
  writeH5UserProfile(currentProfile.profile)
  return currentProfile
}

export async function loginWebAccount(input: WebAccountLoginInput): Promise<CurrentUserProfile> {
  if (!isH5Runtime) {
    throw new UserProfileError('WEB_LOGIN_UNAVAILABLE', '账号登录仅用于 Web 端')
  }

  const result = await apiRequest<WebLoginResult>('/auth/login', {
    method: 'POST',
    auth: false,
    body: input
  }).catch(error => {
    if (error instanceof ApiError) {
      throw new UserProfileError('WEB_LOGIN_FAILED', error.message)
    }
    throw error
  })

  return persistWebLoginResult(result)
}

export async function registerWebAccount(input: WebAccountRegisterInput): Promise<CurrentUserProfile> {
  if (!isH5Runtime) {
    throw new UserProfileError('WEB_REGISTER_UNAVAILABLE', '账号注册仅用于 Web 端')
  }

  const result = await apiRequest<WebLoginResult>('/auth/register', {
    method: 'POST',
    auth: false,
    body: input
  }).catch(error => {
    if (error instanceof ApiError) {
      throw new UserProfileError('WEB_REGISTER_FAILED', error.message)
    }
    throw error
  })

  return persistWebLoginResult(result)
}

export async function bindCurrentUserProfile(personName: string, accessCode?: string): Promise<UserProfile> {
  if (isH5Runtime) {
    throw new UserProfileError('WEB_ACCOUNT_REQUIRED', '请使用账号登录')
  }

  const result = await callUserProfileFunction('bind', personName)
  if (!result) {
    throw new UserProfileError('USER_PROFILE_FUNCTION_UNAVAILABLE', '绑定服务暂不可用，请稍后重试')
  }

  if (result.ok === false) {
    throw new UserProfileError(result.code ?? 'BIND_PROFILE_FAILED', result.message ?? '绑定失败，请稍后重试')
  }

  if (!isUserProfile(result.profile)) {
    throw new UserProfileError('INVALID_PROFILE_RESPONSE', '绑定失败，请稍后重试')
  }

  return result.profile
}

function readH5UserProfile(): UserProfile {
  try {
    const storedValue = Taro.getStorageSync(h5ProfileStorageKey)
    if (isUserProfile(storedValue)) return storedValue
  } catch {
    // H5 profile is a local mock and can fall back to the default administrator.
  }

  const now = Date.now()
  return {
    _id: 'h5-profile',
    _openid: 'h5-admin',
    personName: '华文达',
    boundAt: now,
    updatedAt: now
  }
}

function writeH5UserProfile(profile: UserProfile) {
  try {
    Taro.setStorageSync(h5ProfileStorageKey, profile)
  } catch {
    // Local mock profile should not block the Web preview.
  }
}
