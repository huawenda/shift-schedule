import Taro from '@tarojs/taro'

const collectionName = 'user_profiles'
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
  where: (condition: Record<string, unknown>) => CloudCollection
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
  const functionProfile = normalizeCurrentUserProfile(await callUserProfileFunction('load'))
  if (functionProfile) return functionProfile

  // 云函数不可用时的降级路径。
  // ⚠️ 绝不能在这里直接 `collection('user_profiles').limit(1).get()`：
  // 那是**无条件读取**，会拿到集合里任意一条记录（很可能是别人的 profile），
  // 从而把当前用户错绑到他人姓名，进而看到并改写他人的排班。
  // 云端文档自带 _openid，这里必须按 _openid 过滤，读不到就当作「未绑定」。
  const openid = await getCurrentOpenid()
  if (!openid) {
    return { openid: null, isAdmin: false, profile: null }
  }

  const profileResponse = await getCollection()
    .where({ _openid: openid } as never)
    .limit(1)
    .get()
    .catch<CloudGetResponse>(() => ({ data: [] }))
  const profile = profileResponse.data.find(isUserProfile) ?? null

  return {
    openid,
    isAdmin: adminOpenidSet.has(openid.trim().toLowerCase()),
    profile
  }
}

export async function bindCurrentUserProfile(personName: string, accessCode?: string): Promise<UserProfile> {
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
