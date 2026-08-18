import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// iPhoneウィジェット(Scriptable)用の読み取り専用API。
// 認証: ?token=WIDGET_TOKEN（env）。未完了タスクを期限順で返す。
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  if (!process.env.WIDGET_TOKEN || token !== process.env.WIDGET_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()

  const { data: tasks } = await admin
    .from('tasks')
    .select('id, title, priority, due_date, status, assignees:task_assignees(user_id)')
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(15)

  const ids = [...new Set((tasks ?? []).flatMap(t => (t.assignees ?? []).map((a: { user_id: string }) => a.user_id)))]
  const { data: profs } = ids.length
    ? await admin.from('profiles').select('id, display_name').in('id', ids)
    : { data: [] as { id: string; display_name: string }[] }
  const nameMap = Object.fromEntries((profs ?? []).map(p => [p.id, p.display_name]))

  const out = (tasks ?? []).map(t => ({
    title: t.title,
    priority: t.priority,
    due: t.due_date,
    overdue: t.due_date ? new Date(t.due_date) < now : false,
    assignees: (t.assignees ?? []).map((a: { user_id: string }) => nameMap[a.user_id] ?? '?'),
  }))

  return NextResponse.json(
    { generated: now.toISOString(), count: out.length, tasks: out },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
