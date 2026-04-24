'use client'

import { useRouter, usePathname } from 'next/navigation'
import type { Group } from '@/types/group'

export type ViewMode = 'personal' | 'group' | 'all'

export default function ViewToggle({
  groups,
  currentView,
  currentGroupId,
}: {
  groups: Group[]
  currentView: ViewMode
  currentGroupId?: string
}) {
  const router = useRouter()
  const pathname = usePathname()

  function go(view: ViewMode, groupId?: string) {
    const p = new URLSearchParams()
    p.set('view', view)
    if (groupId) p.set('groupId', groupId)
    router.push(`${pathname}?${p.toString()}`)
  }

  const tab = (active: boolean) => ({
    borderBottom: `2px solid ${active ? '#b87333' : 'transparent'}`,
    color: active ? '#b87333' : '#666',
    padding: '8px 14px',
    fontSize: '0.8125rem',
    background: 'transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'color 0.15s',
  })

  const activeGroupName = groups.find(g => g.id === currentGroupId)?.name ?? groups[0]?.name ?? 'グループ'

  return (
    <div className="flex items-end shrink-0" style={{ borderBottom: '1px solid #2a2a2a' }}>
      <button style={tab(currentView === 'personal')} onClick={() => go('personal')}>
        個人
      </button>

      {groups.length > 0 && (
        <div className="flex items-end">
          {groups.length === 1 ? (
            <button
              style={tab(currentView === 'group')}
              onClick={() => go('group', groups[0].id)}
            >
              {groups[0].name}
            </button>
          ) : (
            <>
              <button
                style={tab(currentView === 'group')}
                onClick={() => go('group', currentGroupId ?? groups[0].id)}
              >
                {currentView === 'group' ? activeGroupName : 'グループ'}
              </button>
              <div className="relative pb-2 -ml-2 mr-1">
                <span style={{ color: currentView === 'group' ? '#b87333' : '#444', fontSize: '10px' }}>▼</span>
                <select
                  value={currentGroupId ?? groups[0].id}
                  onChange={e => go('group', e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                >
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      )}

      <button style={tab(currentView === 'all')} onClick={() => go('all')}>
        全体
      </button>
    </div>
  )
}
