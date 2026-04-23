import { createClient } from '@/lib/supabase/server'
import CalendarView from '@/components/calendar/CalendarView'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: events }, { data: members }, { data: tasks }] = await Promise.all([
    supabase
      .from('events')
      .select('*, attendees:event_attendees(id, user_id, status)')
      .order('start_at'),
    supabase.from('profiles').select('id, display_name').order('display_name'),
    supabase.from('tasks').select('*').not('due_date', 'is', null).order('due_date'),
  ])

  return (
    <CalendarView
      initialEvents={events ?? []}
      initialTasks={tasks ?? []}
      members={members ?? []}
      currentUserId={user!.id}
    />
  )
}
