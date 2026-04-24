import { createClient } from '@/lib/supabase/server'
import { getEventsForView, type EventView } from '@/lib/events'
import CalendarView from '@/components/calendar/CalendarView'
import type { Group, GroupMember } from '@/types/group'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; groupId?: string }>
}) {
  const { view: rawView = 'all', groupId } = await searchParams
  const view = (['personal', 'group', 'all'].includes(rawView) ? rawView : 'all') as EventView

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [events, { data: members }, { data: tasks }, { data: groupRows }] = await Promise.all([
    getEventsForView(view, groupId),
    supabase.from('profiles').select('id, display_name').order('display_name'),
    supabase.from('tasks').select('*, assignees:task_assignees(id, user_id, approval_status, approval_updated_at)').not('due_date', 'is', null).order('due_date'),
    supabase
      .from('groups')
      .select('*, members:group_members(id, group_id, user_id, role, joined_at, profile:profiles(id, display_name))')
      .order('name'),
  ])

  const groups = (groupRows ?? []) as (Group & { members: GroupMember[] })[]

  return (
    <CalendarView
      initialEvents={events}
      initialTasks={tasks ?? []}
      members={members ?? []}
      currentUserId={user!.id}
      groups={groups}
      currentView={view}
      currentGroupId={groupId}
    />
  )
}
