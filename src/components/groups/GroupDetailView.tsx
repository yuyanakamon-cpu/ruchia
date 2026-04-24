'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Group, GroupMember } from '@/types/group'
import type { UserSearchResult } from '@/lib/users'
import InviteLinkBox from './InviteLinkBox'
import MemberList from './MemberList'
import RoleBadge from './RoleBadge'
import UserSearchAutocomplete from '@/components/users/UserSearchAutocomplete'
import SelectedMemberChips from '@/components/users/SelectedMemberChips'
import Link from 'next/link'
import { Settings, LogOut, UserPlus, X, Plus } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function GroupDetailView({
  group,
  members: initialMembers,
  profileMap: initialProfileMap,
  currentUserId,
  myRole,
}: {
  group: Group
  members: GroupMember[]
  profileMap: Record<string, string>
  currentUserId: string
  myRole: 'admin' | 'member'
}) {
  const [memberList, setMemberList] = useState(initialMembers)
  const [profileMap, setProfileMap] = useState(initialProfileMap)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [selectedToAdd, setSelectedToAdd] = useState<UserSearchResult[]>([])
  const [adding, setAdding] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLeave() {
    if (myRole === 'admin') {
      toast.error('管理者は退会できません。先に別のメンバーをADMINに設定してください')
      return
    }
    setLeaving(true)
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', currentUserId)
    if (error) {
      toast.error('退会に失敗しました')
    } else {
      toast.success('グループを退会しました')
      router.push('/groups')
      router.refresh()
    }
    setLeaving(false)
  }

  async function handleAddMembers() {
    if (selectedToAdd.length === 0) return
    setAdding(true)
    try {
      const { data: newRows, error } = await supabase
        .from('group_members')
        .insert(selectedToAdd.map(m => ({ group_id: group.id, user_id: m.id, role: 'member' })))
        .select('*')
      if (error) {
        if (error.code === '23505') {
          toast.error('既にメンバーのユーザーが含まれています')
        } else {
          toast.error('メンバーの追加に失敗しました')
        }
        return
      }

      // ローカル状態を更新
      setMemberList(prev => [...prev, ...(newRows ?? [])])
      setProfileMap(prev => {
        const next = { ...prev }
        selectedToAdd.forEach(m => { next[m.id] = m.display_name })
        return next
      })

      toast.success(`${selectedToAdd.length}人のメンバーを追加しました`)
      setSelectedToAdd([])
      setShowAddPanel(false)
      // TODO: Phase 5 でTelegram通知を送信
    } finally {
      setAdding(false)
    }
  }

  function handleSelectToAdd(user: UserSearchResult) {
    setSelectedToAdd(prev =>
      prev.some(m => m.id === user.id) ? prev : [...prev, user]
    )
  }

  function handleRemoveFromAdd(id: string) {
    setSelectedToAdd(prev => prev.filter(m => m.id !== id))
  }

  // 既存メンバー + 選択済みユーザーを検索から除外
  const excludeFromSearch = [
    ...memberList.map(m => m.user_id),
    ...selectedToAdd.map(m => m.id),
  ]

  return (
    <div className="min-h-full p-4 sm:p-8" style={{ background: '#1a1a1a', color: '#f0f0f0' }}>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ヘッダー */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/groups" className="text-xs uppercase tracking-wide mb-3 inline-block transition-colors" style={{ color: '#666' }}>
              ← グループ一覧
            </Link>
            <h1 className="text-2xl font-bold" style={{ color: '#f0f0f0' }}>{group.name}</h1>
            {group.description && (
              <p className="mt-1 text-sm" style={{ color: '#888' }}>{group.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-6">
            <RoleBadge role={myRole} />
            {myRole === 'admin' ? (
              <Link
                href={`/groups/${group.id}/settings`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[36px]"
                style={{ background: 'rgba(184,115,51,0.15)', color: '#b87333' }}
              >
                <Settings size={14} /> 設定
              </Link>
            ) : (
              <button
                onClick={() => setConfirmLeave(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[36px]"
                style={{ border: '1px solid #3a3a3a', color: '#888' }}
              >
                <LogOut size={14} /> 退会
              </button>
            )}
          </div>
        </div>

        {/* 招待リンク */}
        <InviteLinkBox inviteCode={group.invite_code} />

        {/* メンバー一覧 */}
        <div className="rounded-xl p-5" style={{ background: '#232323', border: '1px solid #3a3a3a' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#888' }}>
              メンバー ({memberList.length}人)
            </h2>
            {myRole === 'admin' && (
              <button
                onClick={() => { setShowAddPanel(p => !p); setSelectedToAdd([]) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[32px]"
                style={showAddPanel
                  ? { background: 'rgba(184,115,51,0.15)', color: '#b87333' }
                  : { border: '1px solid #3a3a3a', color: '#888' }
                }
              >
                {showAddPanel ? <><X size={12} /> 閉じる</> : <><UserPlus size={12} /> メンバーを追加</>}
              </button>
            )}
          </div>

          {/* メンバー追加パネル (admin のみ) */}
          {showAddPanel && (
            <div className="mb-4 p-4 rounded-xl space-y-3" style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#666' }}>メンバーを追加</p>
              <UserSearchAutocomplete
                excludeUserIds={excludeFromSearch}
                onSelect={handleSelectToAdd}
                placeholder="表示名で検索..."
              />
              {selectedToAdd.length > 0 && (
                <>
                  <SelectedMemberChips
                    members={selectedToAdd}
                    onRemove={handleRemoveFromAdd}
                  />
                  <button
                    onClick={handleAddMembers}
                    disabled={adding}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold uppercase transition-opacity disabled:opacity-40"
                    style={{ background: '#b87333', color: '#1a1a1a', letterSpacing: '0.05em' }}
                  >
                    <Plus size={14} />
                    {adding ? '追加中...' : `${selectedToAdd.length}人を追加する`}
                  </button>
                </>
              )}
            </div>
          )}

          <MemberList
            members={memberList}
            profileMap={profileMap}
            currentUserId={currentUserId}
            isAdmin={myRole === 'admin'}
          />
        </div>
      </div>

      {/* 退会確認ダイアログ */}
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>グループを退会しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{group.name}」から退会します。再参加するには招待リンクが必要です。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeave}
              disabled={leaving}
              className="bg-red-600 hover:bg-red-700"
            >
              退会する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
