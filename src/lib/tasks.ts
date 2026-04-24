import { createClient } from '@/lib/supabase/server'
import type { Task } from '@/types'

export type TaskView = 'personal' | 'group' | 'all'

export async function getTasksForView(
  view: TaskView,
  groupId?: string
): Promise<Task[]> {
  const supabase = await createClient()
  let query = supabase
    .from('tasks')
    .select('*, assignees:task_assignees(id, user_id, approval_status, approval_updated_at)')
    .order('created_at', { ascending: false })

  if (view === 'personal') {
    query = query.is('group_id', null)
  } else if (view === 'group' && groupId) {
    query = query.eq('group_id', groupId)
  }
  // 'all': RLS が参照可能なものをすべて返す

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Task[]
}
