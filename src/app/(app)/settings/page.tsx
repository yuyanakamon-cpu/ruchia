import { createClient } from '@/lib/supabase/server'
import SettingsForm from '@/components/settings/SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  return (
    <div className="p-8 max-w-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">設定</h2>
      <SettingsForm profile={profile} />
    </div>
  )
}
