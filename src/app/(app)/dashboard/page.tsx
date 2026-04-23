import { createClient } from '@/lib/supabase/server'
import { format, isToday, isPast, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Calendar, CheckSquare, Clock, MapPin, AlertCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'

const priorityStyles = {
  high: 'bg-red-50 text-red-600 border-red-200',
  medium: 'bg-amber-50 text-amber-600 border-amber-200',
  low: 'bg-slate-50 text-slate-500 border-slate-200',
}
const priorityLabel = { low: '低', medium: '中', high: '高' }
const statusStyles = {
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
}
const statusLabel = { todo: '未着手', in_progress: '進行中', done: '完了' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const tomorrowStr = format(new Date(today.getTime() + 86400000), 'yyyy-MM-dd')

  const [{ data: todayEvents }, { data: myTasks }, { data: allTasks }, { data: profile }] = await Promise.all([
    supabase.from('events').select('*').gte('start_at', `${todayStr}T00:00:00`).lt('start_at', `${tomorrowStr}T00:00:00`).order('start_at'),
    supabase.from('tasks').select('*').eq('assignee_id', user!.id).neq('status', 'done').order('due_date', { nullsFirst: false }),
    supabase.from('tasks').select('status').eq('assignee_id', user!.id),
    supabase.from('profiles').select('display_name').eq('id', user!.id).single(),
  ])

  const totalTasks = allTasks?.length ?? 0
  const doneTasks = allTasks?.filter(t => t.status === 'done').length ?? 0
  const urgentTasks = myTasks?.filter(t => t.due_date && (isToday(parseISO(t.due_date)) || isPast(parseISO(t.due_date)))).length ?? 0
  const hour = today.getHours()
  const greeting = hour >= 5 && hour < 11 ? 'おはようございます' : hour >= 11 && hour < 18 ? 'こんにちは' : 'こんばんは'

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      {/* ヘッダー */}
      <div className="mb-8">
        <p className="text-sm text-slate-400 mb-1">{format(today, 'yyyy年M月d日（E）', { locale: ja })}</p>
        <h1 className="text-3xl font-bold text-slate-800">
          {greeting}{profile?.display_name ? <>、<span className="text-indigo-600">{profile.display_name}</span> さん</> : ''}
        </h1>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Calendar size={18} className="text-blue-600" />
            </div>
            <span className="text-2xl font-bold text-slate-800">{todayEvents?.length ?? 0}</span>
          </div>
          <p className="text-sm text-slate-500 font-medium">今日の予定</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
              <CheckSquare size={18} className="text-indigo-600" />
            </div>
            <span className="text-2xl font-bold text-slate-800">{myTasks?.length ?? 0}</span>
          </div>
          <p className="text-sm text-slate-500 font-medium">未完了タスク</p>
          {totalTasks > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.round((doneTasks / totalTasks) * 100)}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{doneTasks}/{totalTasks} 完了</p>
            </div>
          )}
        </div>
        <div className={`rounded-2xl p-5 border shadow-sm ${urgentTasks > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${urgentTasks > 0 ? 'bg-red-100' : 'bg-slate-50'}`}>
              <AlertCircle size={18} className={urgentTasks > 0 ? 'text-red-500' : 'text-slate-400'} />
            </div>
            <span className={`text-2xl font-bold ${urgentTasks > 0 ? 'text-red-600' : 'text-slate-800'}`}>{urgentTasks}</span>
          </div>
          <p className={`text-sm font-medium ${urgentTasks > 0 ? 'text-red-500' : 'text-slate-500'}`}>期限切れ・今日まで</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* 今日の予定 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-blue-500" />
              <h2 className="font-semibold text-slate-700 text-sm">今日の予定</h2>
            </div>
            <Link href="/calendar" className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors">
              すべて見る <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {(!todayEvents || todayEvents.length === 0) && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-400">今日の予定はありません</p>
              </div>
            )}
            {todayEvents?.map((event) => (
              <Link key={event.id} href="/calendar">
                <div className="px-5 py-3.5 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-800 truncate group-hover:text-indigo-600 transition-colors">{event.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock size={11} />
                        {format(parseISO(event.start_at), 'HH:mm')} – {format(parseISO(event.end_at), 'HH:mm')}
                      </p>
                      {event.location && (
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin size={11} /> {event.location}
                        </p>
                      )}
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* 自分のタスク */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CheckSquare size={16} className="text-indigo-500" />
              <h2 className="font-semibold text-slate-700 text-sm">自分のタスク</h2>
            </div>
            <Link href="/tasks" className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors">
              すべて見る <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {(!myTasks || myTasks.length === 0) && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-400">未完了のタスクはありません</p>
              </div>
            )}
            {myTasks?.slice(0, 5).map((task) => {
              const overdue = task.due_date && isPast(parseISO(task.due_date))
              return (
                <Link key={task.id} href="/tasks">
                  <div className="px-5 py-3.5 hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-800 truncate group-hover:text-indigo-600 transition-colors">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusStyles[task.status as keyof typeof statusStyles]}`}>
                            {statusLabel[task.status as keyof typeof statusLabel]}
                          </span>
                          {task.due_date && (
                            <span className={`text-[11px] ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                              {overdue ? '⚠ ' : ''}{format(parseISO(task.due_date), 'M/d')}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[11px] px-2 py-1 rounded-lg border font-medium shrink-0 ${priorityStyles[task.priority as keyof typeof priorityStyles]}`}>
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
