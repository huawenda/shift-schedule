const env = import.meta.env

export function isSupabaseConfigured(): boolean {
  return Boolean(
    (env.VITE_SUPABASE_URL || env.VITE_TARO_APP_SUPABASE_URL) &&
    (env.VITE_SUPABASE_ANON_KEY || env.VITE_TARO_APP_SUPABASE_ANON_KEY)
  )
}
