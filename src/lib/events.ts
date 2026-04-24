import { createClient } from '@/lib/supabase/server'
import type { Event } from '@/types'

export type EventView = 'personal' | 'group' | 'all'

export async function getEventsForView(
  view: EventView,
  groupId?: string
): Promise<Event[]> {
  const supabase = await createClient()
  let query = supabase
    .from('events')
    .select('*, attendees:event_attendees(id, user_id, status), assignees:event_assignees(id, user_id, approval_status, approval_updated_at)')
    .order('start_at')

  if (view === 'personal') {
    query = query.is('group_id', null)
  } else if (view === 'group' && groupId) {
    query = query.eq('group_id', groupId)
  }
  // 'all': RLS が参照可能なものをすべて返す

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Event[]
}
