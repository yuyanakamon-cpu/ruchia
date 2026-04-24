import { createClient } from '@/lib/supabase/server'
import { getTasksForView, type TaskView } from '@/lib/tasks'
import TaskBoard from '@/components/tasks/TaskBoard'
import type { Group, GroupMember } from '@/types/group'

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; groupId?: string }>
}) {
  const { view: rawView = 'all', groupId } = await searchParams
  const view = (['personal', 'group', 'all'].includes(rawView) ? rawView : 'all') as TaskView

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [tasks, { data: members }, { data: groupRows }] = await Promise.all([
    getTasksForView(view, groupId),
    supabase.from('profiles').select('id, display_name').order('display_name'),
    supabase
      .from('groups')
      .select('*, members:group_members(id, group_id, user_id, role, joined_at, profile:profiles(id, display_name))')
      .order('name'),
  ])

  const groups = (groupRows ?? []) as (Group & { members: GroupMember[] })[]

  return (
    <TaskBoard
      initialTasks={tasks}
      members={members ?? []}
      currentUserId={user!.id}
      groups={groups}
      currentView={view}
      currentGroupId={groupId}
    />
  )
}
