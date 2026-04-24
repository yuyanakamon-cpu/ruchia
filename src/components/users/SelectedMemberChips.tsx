'use client'

import type { UserSearchResult } from '@/lib/users'
import { X } from 'lucide-react'

export default function SelectedMemberChips({
  members,
  onRemove,
}: {
  members: UserSearchResult[]
  onRemove: (id: string) => void
}) {
  if (members.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {members.map(m => (
        <div
          key={m.id}
          className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-sm"
          style={{ background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: '16px' }}
        >
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: '#3a3a3a', color: '#b87333' }}
          >
            {m.display_name[0]?.toUpperCase() ?? '?'}
          </div>
          <span style={{ color: '#f0f0f0' }}>{m.display_name}</span>
          <button
            type="button"
            onClick={() => onRemove(m.id)}
            className="flex items-center justify-center w-5 h-5 rounded-full transition-colors"
            style={{ color: '#b87333' }}
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
