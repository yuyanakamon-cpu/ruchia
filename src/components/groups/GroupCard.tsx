'use client'

import Link from 'next/link'
import type { Group, GroupRole } from '@/types/group'
import RoleBadge from './RoleBadge'

export default function GroupCard({
  group,
  role,
  memberCount,
}: {
  group: Group
  role: GroupRole
  memberCount: number
}) {
  return (
    <Link href={`/groups/${group.id}`}>
      <div
        className="rounded-xl p-5 cursor-pointer transition-colors"
        style={{ background: '#232323', border: '1px solid #3a3a3a' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
        onMouseLeave={e => (e.currentTarget.style.background = '#232323')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold truncate" style={{ color: '#f0f0f0' }}>
              {group.name}
            </h3>
            {group.description && (
              <p className="text-sm mt-1 line-clamp-2" style={{ color: '#888' }}>
                {group.description}
              </p>
            )}
          </div>
          <RoleBadge role={role} />
        </div>
        <p className="text-xs mt-3" style={{ color: '#666' }}>
          {memberCount}人のメンバー
        </p>
      </div>
    </Link>
  )
}
