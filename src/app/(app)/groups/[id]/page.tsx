import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGroupById } from '@/lib/groups'
import GroupDetailView from '@/components/groups/GroupDetailView'

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let group: Awaited<ReturnType<typeof getGroupById>>
  try {
    group = await getGroupById(id)
  } catch {
    notFound()
  }

  const members = group!.members ?? []
  const myMember = members.find(m => m.user_id === user!.id)
  if (!myMember) notFound()

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
      group={group!}
      members={members}
      profileMap={profileMap}
      currentUserId={user!.id}
      myRole={myMember.role}
    />
  )
}
