import { createClient } from '@/lib/supabase/server'
import { format, isToday, isPast, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Calendar, CheckSquare, Clock, MapPin, AlertCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import PendingInvitations, { type PendingInvite } from '@/components/dashboard/PendingInvitations'

const priorityStyles = {
  high: { background: 'rgba(204,102,102,0.2)', color: '#cc6666', border: '1px solid rgba(204,102,102,0.3)' },
  medium: { background: 'rgba(184,115,51,0.2)', color: '#b87333', border: '1px solid rgba(184,115,51,0.3)' },
  low: { background: '#2a2a2a', color: '#555', border: '1px solid #3a3a3a' },
}
const priorityLabel = { low: '低', medium: '中', high: '高' }
const statusStyles = {
  todo: { background: '#2a2a2a', color: '#888' },
  in_progress: { background: 'rgba(184,115,51,0.2)', color: '#b87333' },
  done: { background: 'rgba(100,180,100,0.15)', color: '#6ab04c' },
}
const statusLabel = { todo: '未着手', in_progress: '進行中', done: '完了' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const tomorrowStr = format(new Date(today.getTime() + 86400000), 'yyyy-MM-dd')

  const [{ data: todayEvents }, { data: myTasks }, { data: allTasks }, { data: profile }, { data: rawInvites }] = await Promise.all([
    supabase.from('events').select('*').gte('start_at', `${todayStr}T00:00:00`).lt('start_at', `${tomorrowStr}T00:00:00`).order('start_at'),
    supabase.from('tasks').select('*').eq('assignee_id', user!.id).neq('status', 'done').order('due_date', { nullsFirst: false }),
    supabase.from('tasks').select('status').eq('assignee_id', user!.id),
    supabase.from('profiles').select('display_name').eq('id', user!.id).single(),
    supabase.from('event_attendees').select('id, events(id, title, start_at, end_at, location, created_by, group_id)').eq('user_id', user!.id).eq('status', 'pending').order('created_at', { ascending: false }),
  ])

  // 参加依頼: 作成者名・グループ名を補完
  const creatorIds = [...new Set((rawInvites ?? []).map(r => (r.events as any)?.created_by).filter(Boolean) as string[])]
  const groupIds = [...new Set((rawInvites ?? []).map(r => (r.events as any)?.group_id).filter(Boolean) as string[])]
  const [{ data: inviteCreators }, { data: inviteGroups }] = await Promise.all([
    creatorIds.length > 0 ? supabase.from('profiles').select('id, display_name').in('id', creatorIds) : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    groupIds.length > 0   ? supabase.from('groups').select('id, name').in('id', groupIds)            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const pendingInvites: PendingInvite[] = (rawInvites ?? []).map(r => {
    const ev = r.events as any
    if (!ev) return null
    return {
      attendeeId:  r.id,
      eventId:     ev.id,
      title:       ev.title,
      start_at:    ev.start_at,
      end_at:      ev.end_at,
      location:    ev.location ?? null,
      creatorName: inviteCreators?.find(c => c.id === ev.created_by)?.display_name ?? '不明',
      groupName:   ev.group_id ? (inviteGroups?.find(g => g.id === ev.group_id)?.name ?? null) : null,
    }
  }).filter(Boolean) as PendingInvite[]

  const totalTasks = allTasks?.length ?? 0
  const doneTasks = allTasks?.filter(t => t.status === 'done').length ?? 0
  const urgentTasks = myTasks?.filter(t => t.due_date && (isToday(parseISO(t.due_date)) || isPast(parseISO(t.due_date)))).length ?? 0
  const hour = today.getHours()
  const greeting = hour >= 5 && hour < 11 ? 'おはようございます' : hour >= 11 && hour < 18 ? 'こんにちは' : 'こんばんは'

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="mb-8">
        <p className="text-sm mb-1" style={{ color: '#555' }}>{format(today, 'yyyy年M月d日（E）', { locale: ja })}</p>
        <h1 className="text-3xl" style={{ color: '#f0f0f0' }}>
          {greeting}{profile?.display_name ? <>、<span style={{ color: '#b87333' }}>{profile.display_name}</span> さん</> : ''}
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="rounded-2xl p-5" style={{ background: '#232323', border: '1px solid #2a2a2a' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(184,115,51,0.15)' }}>
              <Calendar size={18} style={{ color: '#b87333' }} />
            </div>
            <span className="text-2xl font-bold" style={{ color: '#f0f0f0' }}>{todayEvents?.length ?? 0}</span>
          </div>
          <p className="text-sm font-medium" style={{ color: '#888' }}>今日の予定</p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: '#232323', border: '1px solid #2a2a2a' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(184,115,51,0.15)' }}>
              <CheckSquare size={18} style={{ color: '#b87333' }} />
            </div>
            <span className="text-2xl font-bold" style={{ color: '#f0f0f0' }}>{myTasks?.length ?? 0}</span>
          </div>
          <p className="text-sm font-medium" style={{ color: '#888' }}>未完了タスク</p>
          {totalTasks > 0 && (
            <div className="mt-2">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#2a2a2a' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((doneTasks / totalTasks) * 100)}%`, background: '#b87333' }} />
              </div>
              <p className="text-xs mt-1" style={{ color: '#555' }}>{doneTasks}/{totalTasks} 完了</p>
            </div>
          )}
        </div>
        <div className="rounded-2xl p-5" style={urgentTasks > 0
          ? { background: 'rgba(204,102,102,0.1)', border: '1px solid rgba(204,102,102,0.25)' }
          : { background: '#232323', border: '1px solid #2a2a2a' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: urgentTasks > 0 ? 'rgba(204,102,102,0.2)' : '#2a2a2a' }}>
              <AlertCircle size={18} style={{ color: urgentTasks > 0 ? '#cc6666' : '#555' }} />
            </div>
            <span className="text-2xl font-bold" style={{ color: urgentTasks > 0 ? '#cc6666' : '#f0f0f0' }}>{urgentTasks}</span>
          </div>
          <p className="text-sm font-medium" style={{ color: urgentTasks > 0 ? '#cc6666' : '#888' }}>期限切れ・今日まで</p>
        </div>
      </div>

      <PendingInvitations initialInvites={pendingInvites} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="rounded-2xl overflow-hidden" style={{ background: '#232323', border: '1px solid #2a2a2a' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #2a2a2a' }}>
            <div className="flex items-center gap-2">
              <Calendar size={16} style={{ color: '#b87333' }} />
              <h2 className="font-semibold text-sm" style={{ color: '#b8b8b8' }}>今日の予定</h2>
            </div>
            <Link href="/calendar" className="flex items-center gap-1 text-xs transition-colors" style={{ color: '#b87333' }}>
              すべて見る <ArrowRight size={12} />
            </Link>
          </div>
          <div>
            {(!todayEvents || todayEvents.length === 0) && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm" style={{ color: '#555' }}>今日の予定はありません</p>
              </div>
            )}
            {todayEvents?.map((event) => (
              <Link key={event.id} href="/calendar">
                <div className="px-5 py-3.5 transition-colors group" style={{ borderBottom: '1px solid #2a2a2a' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: '#f0f0f0' }}>{event.title}</p>
                      <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#555' }}>
                        <Clock size={11} />
                        {format(parseISO(event.start_at), 'HH:mm')} – {format(parseISO(event.end_at), 'HH:mm')}
                      </p>
                      {event.location && (
                        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#555' }}>
                          <MapPin size={11} /> {event.location}
                        </p>
                      )}
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: '#b87333' }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: '#232323', border: '1px solid #2a2a2a' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #2a2a2a' }}>
            <div className="flex items-center gap-2">
              <CheckSquare size={16} style={{ color: '#b87333' }} />
              <h2 className="font-semibold text-sm" style={{ color: '#b8b8b8' }}>自分のタスク</h2>
            </div>
            <Link href="/tasks" className="flex items-center gap-1 text-xs transition-colors" style={{ color: '#b87333' }}>
              すべて見る <ArrowRight size={12} />
            </Link>
          </div>
          <div>
            {(!myTasks || myTasks.length === 0) && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm" style={{ color: '#555' }}>未完了のタスクはありません</p>
              </div>
            )}
            {myTasks?.slice(0, 5).map((task) => {
              const overdue = task.due_date && isPast(parseISO(task.due_date))
              return (
                <Link key={task.id} href="/tasks">
                  <div className="px-5 py-3.5 transition-colors group" style={{ borderBottom: '1px solid #2a2a2a' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" style={{ color: '#f0f0f0' }}>{task.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={statusStyles[task.status as keyof typeof statusStyles]}>
                            {statusLabel[task.status as keyof typeof statusLabel]}
                          </span>
                          {task.due_date && (
                            <span className="text-[11px]" style={{ color: overdue ? '#cc6666' : '#555', fontWeight: overdue ? 600 : 400 }}>
                              {overdue ? '⚠ ' : ''}{format(parseISO(task.due_date), 'M/d')}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] px-2 py-1 rounded-lg font-medium shrink-0" style={priorityStyles[task.priority as keyof typeof priorityStyles]}>
                        {priorityLabel[task.priority as keyof typeof priorityLabel]}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
