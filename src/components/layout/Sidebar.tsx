'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Calendar, CheckSquare, LayoutDashboard, Settings, LogOut, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Profile } from '@/types'

const navItems = [
  { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/calendar', label: 'カレンダー', icon: Calendar },
  { href: '/tasks', label: 'タスク', icon: CheckSquare },
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
      {/* ロゴ */}
      <div className="px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">ルシア</span>
        </div>
      </div>

      {/* ナビゲーション */}
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
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              )}
            >
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* ユーザー */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Link
            href="/settings"
            className="flex items-center gap-3 flex-1 min-w-0 rounded-xl hover:bg-white/5 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-indigo-300">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{profile?.display_name ?? userEmail}</p>
              <p className="text-xs text-slate-400 truncate capitalize">{profile?.role ?? 'member'}</p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1.5 rounded-lg hover:bg-white/5 shrink-0"
            title="ログアウト"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
