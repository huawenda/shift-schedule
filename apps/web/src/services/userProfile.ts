import { isSupabaseConfigured } from './env'
import { getSupabaseClient } from './supabaseClient'
import { getCurrentUserAccountFilter, webUsernameToSupabaseEmail } from './supabaseMaps'

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

export interface WebAccountLoginInput {
  username: string
  password: string
}

export interface WebAccountRegisterInput extends WebAccountLoginInput {
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

export async function loadCurrentUserProfile(): Promise<CurrentUserProfile> {
  if (!isSupabaseConfigured()) {
    return {
      openid: null,
      isAdmin: false,
      profile: null
    }
  }

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

export async function loginWebAccount(input: WebAccountLoginInput): Promise<CurrentUserProfile> {
  if (!isSupabaseConfigured()) {
    throw new UserProfileError('SUPABASE_REQUIRED', 'Web 端需要配置 Supabase 后才能登录')
  }

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

  return supabaseAccountToCurrentUserProfile(account)
}

export async function registerWebAccount(input: WebAccountRegisterInput): Promise<CurrentUserProfile> {
  if (!isSupabaseConfigured()) {
    throw new UserProfileError('SUPABASE_REQUIRED', 'Web 端需要配置 Supabase 后才能注册')
  }

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

  return supabaseAccountToCurrentUserProfile(account)
}

export async function logoutWebAccount(): Promise<void> {
  if (!isSupabaseConfigured()) return
  await getSupabaseClient().auth.signOut()
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
