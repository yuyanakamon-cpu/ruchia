import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGroupByIdAdmin } from '@/lib/groups'
import GroupDetailView from '@/components/groups/GroupDetailView'

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) notFound()

  // admin client で RLS をバイパスして取得（RLS の遅延・未適用でも確実に取得できる）
  const group = await getGroupByIdAdmin(id)
  if (!group) notFound()

  console.log('[GroupPage] id:', id, 'created_by:', group.created_by, 'user:', user.id, 'members:', group.members?.length)

  const members = group.members ?? []
  const myMember = members.find(m => m.user_id === user.id)

  // アプリ側の認可チェック: メンバーか作成者のみアクセス可
  if (!myMember && group.created_by !== user.id) notFound()

  // プロフィール名を取得
  const userIds = members.map(m => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds)

  const profileMap: Record<string, string> = {}
  profiles?.forEach(p => { profileMap[p.id] = p.display_name })

  return (
    <GroupDetailView
      group={group}
      members={members}
      profileMap={profileMap}
      currentUserId={user.id}
      myRole={myMember?.role ?? 'admin'}
    />
  )
}
