import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGroupByInviteCode } from '@/lib/groups'
import JoinGroupClient from './JoinGroupClient'

export default async function JoinGroupPage({
  params,
}: {
  params: Promise<{ invite_code: string }>
}) {
  const { invite_code } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/login?redirect=/groups/join/${invite_code}`)
  }

  const group = await getGroupByInviteCode(invite_code)

  if (!group) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#1a1a1a' }}>
        <div className="text-center">
          <p className="text-lg font-semibold mb-2" style={{ color: '#f0f0f0' }}>招待リンクが無効です</p>
          <p className="text-sm mb-6" style={{ color: '#666' }}>このリンクは存在しないか、期限切れです</p>
          <a href="/groups" className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: '#b87333', color: '#1a1a1a' }}>
            グループ一覧へ
          </a>
        </div>
      </div>
    )
  }

  // 既に参加済みか確認
  const { data: existing } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    redirect(`/groups/${group.id}`)
  }

  return <JoinGroupClient group={group} userId={user.id} />
}
