import { createClient } from '@/lib/supabase/server'
import type { Group, GroupMember } from '@/types/group'
import { notifyUser } from '@/lib/telegram'
import { notificationMessages } from '@/lib/notification-messages'

export async function createGroup(name: string, description?: string): Promise<Group> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: group, error } = await supabase
    .from('groups')
    .insert({ name, description: description || null, created_by: user.id })
    .select('*')
    .single()
  if (error) throw error
  // group_membersへの追加はDBトリガー(trg_add_group_creator)が自動実行

  return group
}

export async function getMyGroups(): Promise<(Group & { members: GroupMember[] })[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('groups')
    .select('*, members:group_members(id, group_id, user_id, role, joined_at, profile:profiles(id, display_name))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as (Group & { members: GroupMember[] })[]
}

export async function getGroupById(id: string): Promise<Group & { members: GroupMember[] }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('groups')
    .select('*, members:group_members(id, group_id, user_id, role, joined_at, profile:profiles(id, display_name))')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Group & { members: GroupMember[] }
}

export async function addMembers(groupId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return
  const supabase = await createClient()
  const { error } = await supabase
    .from('group_members')
    .insert(userIds.map(uid => ({ group_id: groupId, user_id: uid, role: 'member' })))
  if (error) throw error

  const { data: group } = await supabase
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .single()
  if (group?.name) {
    await Promise.allSettled(
      userIds.map(uid => notifyUser(uid, notificationMessages.groupInvite(group.name), 'group_update'))
    )
  }
}

export async function getGroupByInviteCode(code: string): Promise<Group | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('groups')
    .select('*')
    .eq('invite_code', code)
    .single()
  return data
}
