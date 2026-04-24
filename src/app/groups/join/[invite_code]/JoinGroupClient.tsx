'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Group } from '@/types/group'
import { Users } from 'lucide-react'

export default function JoinGroupClient({ group, userId }: { group: Group; userId: string }) {
  const [joining, setJoining] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleJoin() {
    setJoining(true)
    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: userId, role: 'member' })

    if (error) {
      if (error.code === '23505') {
        toast.success('既に参加済みです')
        router.push(`/groups/${group.id}`)
      } else {
        toast.error('参加に失敗しました')
        setJoining(false)
      }
      return
    }

    toast.success(`「${group.name}」に参加しました！`)
    router.push(`/groups/${group.id}`)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#1a1a1a' }}>
      <div className="w-full max-w-sm">
        <div className="rounded-2xl p-8 text-center space-y-6" style={{ background: '#232323', border: '1px solid #3a3a3a' }}>
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'rgba(184,115,51,0.15)' }}
          >
            <Users size={28} style={{ color: '#b87333' }} />
          </div>

          <div>
            <p className="text-sm uppercase tracking-wide mb-1" style={{ color: '#888' }}>グループへの招待</p>
            <h1 className="text-xl font-bold" style={{ color: '#f0f0f0' }}>{group.name}</h1>
            {group.description && (
              <p className="text-sm mt-2" style={{ color: '#888' }}>{group.description}</p>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={handleJoin}
              disabled={joining}
              className="w-full py-2.5 rounded-lg text-sm font-semibold uppercase transition-opacity disabled:opacity-50"
              style={{ background: '#b87333', color: '#1a1a1a', letterSpacing: '0.05em' }}
            >
              {joining ? '参加中...' : 'このグループに参加する'}
            </button>
            <a
              href="/groups"
              className="block w-full py-2.5 rounded-lg text-sm font-medium text-center transition-colors"
              style={{ border: '1px solid #3a3a3a', color: '#888' }}
            >
              キャンセル
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
