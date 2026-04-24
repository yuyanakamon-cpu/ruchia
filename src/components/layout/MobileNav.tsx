'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, Calendar, CheckSquare, LayoutDashboard, Settings, LogOut, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { Profile } from '@/types'

const navItems = [
  { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/calendar', label: 'カレンダー', icon: Calendar },
  { href: '/tasks', label: 'タスク', icon: CheckSquare },
  { href: '/groups', label: 'グループ', icon: Users },
  { href: '/settings', label: '設定', icon: Settings },
]

export default function MobileNav({
  profile,
  userEmail,
}: {
  profile: Profile | null
  userEmail: string
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    toast.success('ログアウトしました')
    setOpen(false)
    router.push('/auth/login')
    router.refresh()
  }

  const initials = profile?.display_name
    ? profile.display_name.slice(0, 2).toUpperCase()
    : (userEmail ? userEmail[0].toUpperCase() : '?')

  return (
    <div className="md:hidden flex items-center px-3 h-14 shrink-0 gap-3" style={{ borderBottom: '1px solid #2a2a2a', background: '#1a1a1a' }}>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-11 h-11 rounded-xl transition-colors"
        style={{ color: '#888' }}
        aria-label="メニューを開く"
      >
        <Menu size={22} />
      </button>
      <span style={{ fontWeight: 200, letterSpacing: '0.25em', fontSize: '0.9rem', textTransform: 'uppercase', color: '#f0f0f0' }}>
        RUCHIA
      </span>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0 flex flex-col" style={{ background: 'var(--sidebar)' }}>
          <div className="px-6 py-6">
            <span style={{ fontWeight: 200, letterSpacing: '0.25em', fontSize: '1rem', textTransform: 'uppercase', color: '#f0f0f0' }}>
              RUCHIA
            </span>
          </div>

          <nav className="flex-1 px-3 space-y-0.5">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all min-h-[44px]',
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
            <div className="flex items-center gap-2 px-2">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 flex-1 min-w-0 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors min-h-[44px]"
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
                className="flex items-center justify-center w-11 h-11 rounded-xl transition-colors shrink-0 hover:bg-white/5"
                style={{ color: '#555' }}
                title="ログアウト"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
