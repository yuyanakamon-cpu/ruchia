import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import MobileNav from '@/components/layout/MobileNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex h-screen" style={{ background: '#1a1a1a' }}>
      <Sidebar profile={profile} userEmail={user.email ?? ''} />
      <div className="flex flex-col flex-1 min-w-0">
        <MobileNav profile={profile} userEmail={user.email ?? ''} />
        <main className="flex-1 overflow-auto" style={{ background: '#1a1a1a' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
