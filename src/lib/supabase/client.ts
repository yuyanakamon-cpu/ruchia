import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (typeof window !== 'undefined') {
  console.log('[Supabase] URL:', SUPABASE_URL ?? '❌ 未設定')
  console.log('[Supabase] ANON_KEY:', SUPABASE_ANON_KEY ? `✅ ${SUPABASE_ANON_KEY.slice(0, 20)}...` : '❌ 未設定')
}

export function createClient() {
  return createBrowserClient(
    SUPABASE_URL!,
    SUPABASE_ANON_KEY!
  )
}
