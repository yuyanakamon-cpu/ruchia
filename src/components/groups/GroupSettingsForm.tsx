'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Group, GroupMember } from '@/types/group'
import MemberList from './MemberList'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function GroupSettingsForm({
  group,
  members,
  profileMap,
  currentUserId,
  isCreator,
}: {
  group: Group
  members: GroupMember[]
  profileMap: Record<string, string>
  currentUserId: string
  isCreator: boolean
}) {
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [localMembers, setLocalMembers] = useState(members)
  const router = useRouter()
  const supabase = createClient()

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('groups')
      .update({ name: name.trim(), description: description.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', group.id)
    if (error) toast.error('更新に失敗しました')
    else { toast.success('設定を保存しました'); router.refresh() }
    setSaving(false)
  }

  async function removeMember(userId: string) {
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', userId)
    if (error) { toast.error('削除に失敗しました'); return }
    setLocalMembers(prev => prev.filter(m => m.user_id !== userId))
    toast.success('メンバーを削除しました')
  }

  async function deleteGroup() {
    setDeleting(true)
    const { error } = await supabase.from('groups').delete().eq('id', group.id)
    if (error) {
      toast.error('削除に失敗しました')
      setDeleting(false)
      return
    }
    toast.success('グループを削除しました')
    router.push('/groups')
    router.refresh()
  }

  return (
    <div className="min-h-full p-4 sm:p-8" style={{ background: '#1a1a1a', color: '#f0f0f0' }}>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ヘッダー */}
        <div>
          <Link
            href={`/groups/${group.id}`}
            className="flex items-center gap-1.5 text-xs uppercase tracking-wide mb-4 w-fit transition-colors"
            style={{ color: '#666' }}
          >
            <ArrowLeft size={12} /> グループ詳細に戻る
          </Link>
          <h1 className="text-xl font-bold" style={{ color: '#f0f0f0' }}>グループ設定</h1>
        </div>

        {/* 基本情報編集 */}
        <div className="rounded-xl p-5 space-y-4" style={{ background: '#232323', border: '1px solid #3a3a3a' }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#888' }}>基本情報</h2>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#aaa' }}>グループ名 *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value.slice(0, 50))}
              maxLength={50}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
              style={{ background: '#1a1a1a', border: '1px solid #3a3a3a', color: '#f0f0f0' }}
            />
            <p className="text-xs text-right" style={{ color: '#555' }}>{name.length}/50</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: '#aaa' }}>説明</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 200))}
              maxLength={200}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none transition-colors"
              style={{ background: '#1a1a1a', border: '1px solid #3a3a3a', color: '#f0f0f0' }}
            />
            <p className="text-xs text-right" style={{ color: '#555' }}>{description.length}/200</p>
          </div>

          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="w-full py-2 rounded-lg text-sm font-semibold tracking-wider uppercase transition-opacity disabled:opacity-40"
            style={{ background: '#b87333', color: '#1a1a1a', letterSpacing: '0.05em' }}
          >
            {saving ? '保存中...' : '変更を保存'}
          </button>
        </div>

        {/* メンバー管理 */}
        <div className="rounded-xl p-5" style={{ background: '#232323', border: '1px solid #3a3a3a' }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: '#888' }}>
            メンバー管理 ({localMembers.length}人)
          </h2>
          <MemberList
            members={localMembers}
            profileMap={profileMap}
            currentUserId={currentUserId}
            isAdmin={true}
            onRemove={removeMember}
          />
        </div>

        {/* 危険ゾーン */}
        {isCreator && (
          <div className="rounded-xl p-5" style={{ background: '#232323', border: '1px solid #3a3a3a' }}>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: '#cc6666' }}>
              危険な操作
            </h2>
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px]"
              style={{ border: '1px solid #cc6666', color: '#cc6666', background: 'transparent' }}
            >
              グループを削除する
            </button>
            <p className="text-xs mt-2" style={{ color: '#666' }}>
              削除すると元に戻せません。全メンバーのアクセスも失われます。
            </p>
          </div>
        )}
      </div>

      {/* 削除確認 */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>グループを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{group.name}」を完全に削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteGroup}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
