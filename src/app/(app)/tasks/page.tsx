import { createClient } from '@/lib/supabase/server'
import TaskBoard from '@/components/tasks/TaskBoard'

export default async function TasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: tasks }, { data: members }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, display_name').order('display_name'),
  ])

  return <TaskBoard initialTasks={tasks ?? []} members={members ?? []} currentUserId={user!.id} />
}
