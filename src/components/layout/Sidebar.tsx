'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Calendar, CheckSquare, LayoutDashboard, Settings, LogOut, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Profile } from '@/types'

const navItems = [
  { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/calendar', label: 'カレンダー', icon: Calendar },
  { href: '/tasks', label: 'タスク', icon: CheckSquare },
  { href: '/groups', label: 'グループ', icon: Users },
  { href: '/settings', label: '設定', icon: Settings },
]

export default function Sidebar({
  profile,
  userEmail,
}: {
  profile: Profile | null
  userEmail: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    toast.success('ログアウトしました')
    router.push('/auth/login')
    router.refresh()
  }

  const initials = profile?.display_name
    ? profile.display_name.slice(0, 2).toUpperCase()
    : (userEmail ? userEmail[0].toUpperCase() : '?')

  return (
    <aside className="hidden md:flex w-64 flex-col" style={{ background: 'var(--sidebar)' }}>
      <div className="px-6 py-6">
        <Link
          href="/dashboard"
          aria-label="ホームへ"
          style={{ fontWeight: 200, letterSpacing: '0.25em', fontSize: '1rem', textTransform: 'uppercase', color: '#f0f0f0', cursor: 'pointer', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#b87333')}
          onMouseLeave={e => (e.currentTarget.style.color = '#f0f0f0')}
        >
          RUCHIA
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                active
                  ? 'text-white shadow-lg'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              )}
              style={active ? { background: '#b87333' } : undefined}
            >
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t" style={{ borderColor: '#2a2a2a' }}>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Link
            href="/settings"
            className="flex items-center gap-3 flex-1 min-w-0 rounded-xl hover:bg-white/5 transition-colors"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(184,115,51,0.2)', border: '1px solid rgba(184,115,51,0.4)' }}>
              <span className="text-xs font-bold" style={{ color: '#b87333' }}>{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: '#f0f0f0' }}>{profile?.display_name ?? userEmail}</p>
              <p className="text-xs truncate capitalize" style={{ color: '#888' }}>{profile?.role ?? 'member'}</p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="transition-colors p-1.5 rounded-lg hover:bg-white/5 shrink-0"
            style={{ color: '#555' }}
            title="ログアウト"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
