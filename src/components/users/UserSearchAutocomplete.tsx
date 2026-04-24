'use client'

import { useState, useEffect, useRef } from 'react'
import { searchUsersByDisplayName, type UserSearchResult } from '@/lib/users'
import { Search } from 'lucide-react'

export default function UserSearchAutocomplete({
  excludeUserIds = [],
  onSelect,
  placeholder = '表示名で検索',
}: {
  excludeUserIds?: string[]
  onSelect: (user: UserSearchResult) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const excludeRef = useRef(excludeUserIds)
  excludeRef.current = excludeUserIds

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); setLoading(false); return }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const found = await searchUsersByDisplayName(query, excludeRef.current)
      setResults(found)
      setLoading(false)
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  function handleSelect(user: UserSearchResult) {
    onSelect(user)
    setQuery('')
    setResults([])
  }

  const showDropdown = query.trim().length > 0

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#555' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg pl-8 pr-3 py-2.5 text-sm outline-none"
          style={{ background: '#1a1a1a', border: '1px solid #3a3a3a', color: '#f0f0f0' }}
          onFocus={e => (e.currentTarget.style.borderColor = '#b87333')}
          onBlur={e => (e.currentTarget.style.borderColor = '#3a3a3a')}
        />
      </div>

      {showDropdown && (
        <div
          className="mt-1 rounded-xl overflow-hidden z-10 relative"
          style={{ background: '#232323', border: '1px solid #3a3a3a' }}
        >
          {loading && (
            <p className="px-3 py-2.5 text-xs" style={{ color: '#555' }}>検索中...</p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2.5 text-xs" style={{ color: '#555' }}>見つかりませんでした</p>
          )}
          {!loading && results.map((user, i) => (
            <button
              key={user.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleSelect(user)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
              style={{ borderTop: i > 0 ? '1px solid #2a2a2a' : 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ background: '#3a3a3a', color: '#b87333' }}
              >
                {user.display_name[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="text-sm" style={{ color: '#f0f0f0' }}>{user.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
