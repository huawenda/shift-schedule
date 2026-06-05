import Taro from '@tarojs/taro'
import { isH5Runtime } from './runtime'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient'
import { getCurrentUserAccountFilter, webUsernameToSupabaseEmail } from './supabaseMaps'

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

interface WebAccountLoginInput {
  username: string
  password: string
}

interface WebAccountRegisterInput extends WebAccountLoginInput {
  personName: string
  inviteCode: string
}

interface SupabaseAccountRow {
  id: number
  auth_user_id: string
  username: string
  person_name: string
  role: string
  enabled: boolean
  created_at_ms?: number | string | null
  created_at_text?: string | null
  updated_at_ms?: number | string | null
  updated_at_text?: string | null
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
    if (isSupabaseConfigured()) {
      return loadSupabaseCurrentUserProfile()
    }

    return {
      openid: null,
      isAdmin: false,
      profile: null
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

export async function loginWebAccount(input: WebAccountLoginInput): Promise<CurrentUserProfile> {
  if (!isH5Runtime) {
    throw new UserProfileError('WEB_LOGIN_UNAVAILABLE', '账号登录仅用于 Web 端')
  }

  if (isSupabaseConfigured()) {
    return loginSupabaseAccount(input)
  }

  throw new UserProfileError('SUPABASE_REQUIRED', 'Web 端需要配置 Supabase 后才能登录')
}

export async function registerWebAccount(input: WebAccountRegisterInput): Promise<CurrentUserProfile> {
  if (!isH5Runtime) {
    throw new UserProfileError('WEB_REGISTER_UNAVAILABLE', '账号注册仅用于 Web 端')
  }

  if (isSupabaseConfigured()) {
    return registerSupabaseAccount(input)
  }

  throw new UserProfileError('SUPABASE_REQUIRED', 'Web 端需要配置 Supabase 后才能注册')
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

function writeH5UserProfile(profile: UserProfile) {
  try {
    Taro.setStorageSync(h5ProfileStorageKey, profile)
  } catch {
    // Local mock profile should not block the Web preview.
  }
}

async function loadSupabaseCurrentUserProfile(): Promise<CurrentUserProfile> {
  const supabase = getSupabaseClient()
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    return {
      openid: null,
      isAdmin: false,
      profile: null
    }
  }

  const account = await loadSupabaseAccount()
  if (!account) {
    await supabase.auth.signOut()
    return {
      openid: null,
      isAdmin: false,
      profile: null
    }
  }

  return supabaseAccountToCurrentUserProfile(account)
}

async function loginSupabaseAccount(input: WebAccountLoginInput): Promise<CurrentUserProfile> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: webUsernameToSupabaseEmail(input.username),
    password: input.password
  })
  if (error) {
    throw new UserProfileError('WEB_LOGIN_FAILED', error.message || '账号或密码错误')
  }

  const account = await loadSupabaseAccount()
  if (!account) {
    throw new UserProfileError('WEB_LOGIN_FAILED', '账号未完成绑定或已停用')
  }

  const currentProfile = supabaseAccountToCurrentUserProfile(account)
  if (currentProfile.profile) writeH5UserProfile(currentProfile.profile)
  return currentProfile
}

async function registerSupabaseAccount(input: WebAccountRegisterInput): Promise<CurrentUserProfile> {
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signUp({
    email: webUsernameToSupabaseEmail(input.username),
    password: input.password,
    options: {
      data: {
        username: input.username.trim(),
        person_name: input.personName.trim(),
        invite_code: input.inviteCode
      }
    }
  })
  if (error) {
    throw new UserProfileError('WEB_REGISTER_FAILED', normalizeSupabaseAuthError(error.message))
  }

  const account = await loadSupabaseAccount()
  if (!account) {
    throw new UserProfileError('WEB_REGISTER_FAILED', '注册成功后未自动登录，请确认 Supabase 已关闭邮箱确认后重试')
  }

  const currentProfile = supabaseAccountToCurrentUserProfile(account)
  if (currentProfile.profile) writeH5UserProfile(currentProfile.profile)
  return currentProfile
}

async function loadSupabaseAccount(): Promise<SupabaseAccountRow | null> {
  const supabase = getSupabaseClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) {
    throw new UserProfileError('WEB_LOGIN_FAILED', userError.message || '账号资料读取失败')
  }
  const authUserId = userData.user?.id ?? ''
  const accountFilter = getCurrentUserAccountFilter(authUserId)
  const { data, error } = await supabase
    .from('user_accounts')
    .select('id, auth_user_id, username, person_name, role, enabled, created_at_ms, created_at_text, updated_at_ms, updated_at_text')
    .eq(accountFilter.column, accountFilter.value)
    .maybeSingle()

  if (error) {
    throw new UserProfileError('WEB_LOGIN_FAILED', error.message || '账号资料读取失败')
  }

  if (!data || data.enabled !== true) return null
  return data as SupabaseAccountRow
}

function supabaseAccountToCurrentUserProfile(account: SupabaseAccountRow): CurrentUserProfile {
  const openid = `web-account:${account.id}`
  return {
    openid,
    isAdmin: account.role === 'admin',
    profile: {
      _id: String(account.id),
      _openid: openid,
      personName: account.person_name,
      boundAt: Number(account.created_at_ms || Date.now()),
      boundAtText: account.created_at_text || undefined,
      updatedAt: Number(account.updated_at_ms || Date.now()),
      updatedAtText: account.updated_at_text || undefined
    }
  }
}

function normalizeSupabaseAuthError(message: string): string {
  if (message.includes('User already registered')) return '账号名已存在'
  if (message.includes('duplicate key')) return '账号名或姓名已被绑定'
  if (message.includes('registration_invite')) return '邀请码错误'
  if (message.includes('Password')) return '密码至少需要6个字符'
  return message || '注册失败，请稍后重试'
}
