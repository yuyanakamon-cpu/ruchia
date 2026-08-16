import { createClient } from '@/lib/supabase/server'

// 現在のユーザーが所属するグループの同僚プロフィールのみを返す（担当者候補用）。
// 全プロフィールを出すと退会者や別チームのユーザーまで担当者候補に並んでしまうため、
// 「自分と同じグループに居る人」だけに絞る。
export async function getTeamMemberProfiles(): Promise<{ id: string; display_name: string }[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: myGroups } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id)
  const groupIds = (myGroups ?? []).map((g) => g.group_id)

  // どのグループにも居ない場合は自分だけ
  if (groupIds.length === 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', user.id)
    return data ?? []
  }

  const { data: coMembers } = await supabase
    .from('group_members')
    .select('user_id')
    .in('group_id', groupIds)
  const ids = Array.from(new Set([user.id, ...(coMembers ?? []).map((m) => m.user_id)]))

  const { data } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids)
    .order('display_name')
  return data ?? []
}
