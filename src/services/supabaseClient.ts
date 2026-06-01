import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.TARO_APP_SUPABASE_URL || ''
const supabaseAnonKey = process.env.TARO_APP_SUPABASE_ANON_KEY || ''

let client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  }

  return client
}
