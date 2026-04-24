'use client'

import type { GroupMember } from '@/types/group'
import RoleBadge from './RoleBadge'

export default function MemberList({
  members,
  profileMap,
  currentUserId,
  isAdmin,
  onRemove,
}: {
  members: GroupMember[]
  profileMap: Record<string, string>
  currentUserId: string
  isAdmin?: boolean
  onRemove?: (userId: string) => void
}) {
  return (
    <div className="space-y-1">
      {members.map(member => {
        const name = profileMap[member.user_id] ?? '不明'
        const isMe = member.user_id === currentUserId
        return (
          <div
            key={member.id}
            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                style={{ background: '#3a3a3a', color: '#b87333' }}
              >
                {name[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#f0f0f0' }}>
                  {name}
                  {isMe && <span className="text-xs ml-1.5" style={{ color: '#666' }}>（自分）</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <RoleBadge role={member.role} />
              {isAdmin && !isMe && onRemove && (
                <button
                  onClick={() => onRemove(member.user_id)}
                  className="text-xs px-2 py-1 rounded transition-colors min-h-[32px]"
                  style={{ color: '#666', border: '1px solid #3a3a3a' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#cc6666'
                    e.currentTarget.style.borderColor = '#cc6666'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = '#666'
                    e.currentTarget.style.borderColor = '#3a3a3a'
                  }}
                >
                  削除
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
