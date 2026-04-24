import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[createAdminClient] SUPABASE_SERVICE_ROLE_KEY is not set!')
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is missing')
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}
