'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'
import UserSearchAutocomplete from '@/components/users/UserSearchAutocomplete'
import SelectedMemberChips from '@/components/users/SelectedMemberChips'
import type { UserSearchResult } from '@/lib/users'

export default function NewGroupPage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<UserSearchResult[]>([])
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('未ログイン')

      // グループ作成 (トリガーで作成者がadminとしてgroup_membersに自動追加される)
      const { data: group, error } = await supabase
        .from('groups')
        .insert({ name: name.trim(), description: description.trim() || null, created_by: user.id })
        .select('*')
        .single()
      if (error) throw error

      // 初期メンバーを一括追加（一部失敗してもグループ作成は成功とする）
      if (selectedMembers.length > 0) {
        const { error: memberError } = await supabase
          .from('group_members')
          .insert(selectedMembers.map(m => ({ group_id: group.id, user_id: m.id, role: 'member' })))
        if (memberError) {
          console.error('メンバー追加エラー:', memberError)
          toast.warning('グループは作成しましたが、一部メンバーの追加に失敗しました')
        }
      }

      toast.success('グループを作成しました')
      router.push(`/groups/${group.id}`)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'グループ作成に失敗しました')
      setSaving(false)
    }
  }

  function handleSelectMember(user: UserSearchResult) {
    setSelectedMembers(prev =>
      prev.some(m => m.id === user.id) ? prev : [...prev, user]
    )
  }

  function handleRemoveMember(id: string) {
    setSelectedMembers(prev => prev.filter(m => m.id !== id))
  }

  // 検索から除外: 既に選択済みのユーザー
  const excludeIds = selectedMembers.map(m => m.id)

  return (
    <div className="min-h-full p-4 sm:p-8" style={{ background: '#1a1a1a', color: '#f0f0f0' }}>
      <div className="max-w-lg mx-auto">

        <Link
          href="/groups"
          className="flex items-center gap-1.5 text-xs uppercase tracking-wide mb-6 w-fit"
          style={{ color: '#666' }}
        >
          <ArrowLeft size={12} /> グループ一覧
        </Link>

        <h1 className="text-xl mb-6" style={{ color: '#f0f0f0', fontWeight: 300 }}>新規グループを作成</h1>

        <div className="rounded-xl p-6 space-y-5" style={{ background: '#232323', border: '1px solid #3a3a3a' }}>

          {/* グループ名 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#aaa' }}>グループ名 *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value.slice(0, 50))}
              placeholder="例: フロントエンドチーム"
              maxLength={50}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: '#1a1a1a', border: '1px solid #3a3a3a', color: '#f0f0f0' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#b87333')}
              onBlur={e => (e.currentTarget.style.borderColor = '#3a3a3a')}
            />
            <p className="text-xs text-right" style={{ color: '#555' }}>{name.length}/50</p>
          </div>

          {/* 説明 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#aaa' }}>説明（任意）</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 200))}
              placeholder="このグループの目的や用途など..."
              maxLength={200}
              rows={3}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
              style={{ background: '#1a1a1a', border: '1px solid #3a3a3a', color: '#f0f0f0' }}
              onFocus={e => (e.currentTarget.style.borderColor = '#b87333')}
              onBlur={e => (e.currentTarget.style.borderColor = '#3a3a3a')}
            />
            <p className="text-xs text-right" style={{ color: '#555' }}>{description.length}/200</p>
          </div>

          {/* 初期メンバー */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#aaa' }}>
              <UserPlus size={14} /> 初期メンバーを追加（任意）
            </label>
            <UserSearchAutocomplete
              excludeUserIds={excludeIds}
              onSelect={handleSelectMember}
              placeholder="表示名で検索..."
            />
            {selectedMembers.length > 0 && (
              <div className="pt-1">
                <SelectedMemberChips
                  members={selectedMembers}
                  onRemove={handleRemoveMember}
                />
              </div>
            )}
            {selectedMembers.length > 0 && (
              <p className="text-xs" style={{ color: '#555' }}>
                {selectedMembers.length}人を追加予定（あなたはadminとして自動追加されます）
              </p>
            )}
          </div>

          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-semibold uppercase transition-opacity disabled:opacity-40"
            style={{ background: '#b87333', color: '#1a1a1a', letterSpacing: '0.05em' }}
          >
            {saving ? '作成中...' : 'グループを作成'}
          </button>
        </div>
      </div>
    </div>
  )
}
