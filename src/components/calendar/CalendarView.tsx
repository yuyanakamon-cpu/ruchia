'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  format, parseISO, isSameDay,
  startOfMonth, endOfMonth, getDay, addDays, addMonths, subMonths,
  isPast, isToday as dateFnsIsToday,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ChevronLeft, ChevronRight, Clock, MapPin, Plus, Pencil, Trash2,
  Users, CheckSquare, ExternalLink,
} from 'lucide-react'
import type { Event, Task, Profile } from '@/types'

// ─── Color palette ────────────────────────────────────────────────────────────
const PILL_COLORS = [
  'bg-indigo-500 text-white',
  'bg-emerald-500 text-white',
  'bg-amber-500 text-white',
  'bg-rose-500 text-white',
  'bg-violet-500 text-white',
  'bg-sky-500 text-white',
] as const

function getColorClass(userId: string | null | undefined): string {
  if (!userId) return PILL_COLORS[0]
  const hash = userId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return PILL_COLORS[hash % PILL_COLORS.length]
}

function getDotColor(userId: string | null | undefined): string {
  return getColorClass(userId).split(' ')[0]
}

// ─── Task helpers ─────────────────────────────────────────────────────────────
const taskPriorityLabel = { low: '低', medium: '中', high: '高' }
const taskPriorityColor = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-600',
}
const taskStatusLabel = { todo: '未着手', in_progress: '進行中', done: '完了' }
const taskStatusColor = {
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type FormState = {
  title: string
  description: string
  location: string
  start_at: string
  end_at: string
  all_day: boolean
  attendee_ids: string[]
}

const emptyForm = (): FormState => ({
  title: '', description: '', location: '',
  start_at: '', end_at: '', all_day: false, attendee_ids: [],
})

function dateToLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function dateToLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const statusColor = { pending: 'secondary', accepted: 'default', declined: 'destructive' } as const
const statusLabel = { pending: '未回答', accepted: '参加', declined: '不参加' }
const DAY_HEADERS = ['月', '火', '水', '木', '金', '土', '日']
const MAX_VISIBLE = 5

// ─── Component ────────────────────────────────────────────────────────────────
export default function CalendarView({
  initialEvents,
  initialTasks,
  members,
  currentUserId,
}: {
  initialEvents: Event[]
  initialTasks: Task[]
  members: Pick<Profile, 'id' | 'display_name'>[]
  currentUserId: string
}) {
  const [events, setEvents] = useState(initialEvents)
  const [tasks] = useState(initialTasks)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [detailEvent, setDetailEvent] = useState<Event | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Event | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const [showCompleted, setShowCompleted] = useState(true)
  const supabase = createClient()

  // ── フィルタ済みタスク ────────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    let ts = tasks
    if (myTasksOnly) ts = ts.filter(t => t.created_by === currentUserId || t.assignee_id === currentUserId)
    if (!showCompleted) ts = ts.filter(t => t.status !== 'done')
    return ts
  }, [tasks, myTasksOnly, showCompleted, currentUserId])

  // ── グリッド用日付配列（月曜スタート）──────────────────────────────────────
  const calendarDays = useMemo(() => {
    const firstDay = startOfMonth(currentMonth)
    const lastDay = endOfMonth(currentMonth)
    const startOffset = (getDay(firstDay) + 6) % 7
    const days: Array<Date | null> = Array(startOffset).fill(null)
    let d = new Date(firstDay)
    while (d <= lastDay) {
      days.push(new Date(d))
      d = addDays(d, 1)
    }
    while (days.length % 7 !== 0) days.push(null)
    return days
  }, [currentMonth])

  // ── 日付→イベントマップ ──────────────────────────────────────────────────
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>()
    events.forEach(e => {
      const key = format(parseISO(e.start_at), 'yyyy-MM-dd')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    })
    return map
  }, [events])

  // ── 日付→タスクマップ ────────────────────────────────────────────────────
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    filteredTasks.forEach(t => {
      if (!t.due_date) return
      const key = t.due_date.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    })
    return map
  }, [filteredTasks])

  const selectedDayEvents = useMemo(
    () => eventsByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? [],
    [eventsByDay, selectedDate]
  )
  const selectedDayTasks = useMemo(
    () => tasksByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? [],
    [tasksByDay, selectedDate]
  )

  // ── 月ナビゲーション ──────────────────────────────────────────────────────
  const prevMonth = () => setCurrentMonth(m => subMonths(m, 1))
  const nextMonth = () => setCurrentMonth(m => addMonths(m, 1))
  const goToday = () => {
    const t = new Date()
    setCurrentMonth(t)
    setSelectedDate(t)
  }

  // ── モーダル helpers ──────────────────────────────────────────────────────
  function openCreate(date?: Date) {
    const base = date ?? selectedDate
    const dateStr = dateToLocalDate(base)
    setEditingId(null)
    setForm({ ...emptyForm(), start_at: `${dateStr}T09:00`, end_at: `${dateStr}T10:00` })
    setOpen(true)
  }

  function openEdit(event: Event) {
    setEditingId(event.id)
    setForm({
      title: event.title,
      description: event.description ?? '',
      location: event.location ?? '',
      start_at: dateToLocalDatetime(new Date(event.start_at)),
      end_at: dateToLocalDatetime(new Date(event.end_at)),
      all_day: (event as any).all_day ?? false,
      attendee_ids: event.attendees?.map(a => a.user_id) ?? [],
    })
    setDetailEvent(null)
    setOpen(true)
  }

  function toggleAttendee(v: string | null) {
    if (!v) return
    setForm(p => ({
      ...p,
      attendee_ids: p.attendee_ids.includes(v)
        ? p.attendee_ids.filter(i => i !== v)
        : [...p.attendee_ids, v],
    }))
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function toSupabaseDatetime(localStr: string, allDay: boolean, isEnd: boolean): string {
    if (allDay) {
      const date = localStr.split('T')[0]
      return isEnd ? `${date}T23:59:59` : `${date}T00:00:00`
    }
    return new Date(localStr).toISOString()
  }

  async function saveEvent() {
    if (!form.title.trim() || !form.start_at || !form.end_at) return

    const payload = {
      title: form.title,
      description: form.description || null,
      location: form.location || null,
      start_at: toSupabaseDatetime(form.start_at, form.all_day, false),
      end_at: toSupabaseDatetime(form.end_at, form.all_day, true),
      all_day: form.all_day,
      created_by: currentUserId,
    }

    if (editingId) {
      const { data, error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', editingId)
        .select('*')
        .single()
      if (error) { toast.error('更新に失敗しました'); return }
      setEvents(prev => prev.map(e => e.id === editingId ? { ...e, ...data } : e))
      toast.success('予定を更新しました')
    } else {
      const { data: event, error } = await supabase
        .from('events')
        .insert(payload)
        .select('*')
        .single()
      if (error) { toast.error('予定作成に失敗しました'); return }
      if (form.attendee_ids.length > 0) {
        await supabase.from('event_attendees').insert(
          form.attendee_ids.map(uid => ({ event_id: event.id, user_id: uid, status: 'pending' }))
        )
      }
      setEvents(prev => [...prev, { ...event, attendees: [] }])
      toast.success('予定を作成しました')
    }

    setOpen(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  async function deleteEvent() {
    if (!deleteTarget) return
    const { error } = await supabase.from('events').delete().eq('id', deleteTarget.id)
    if (error) { toast.error('削除に失敗しました'); return }
    setEvents(prev => prev.filter(e => e.id !== deleteTarget.id))
    setDetailEvent(null)
    setDeleteTarget(null)
    toast.success('予定を削除しました')
  }

  async function respondToEvent(
    eventId: string,
    attendeeId: string,
    status: 'accepted' | 'declined'
  ) {
    const { error } = await supabase
      .from('event_attendees')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('id', attendeeId)
    if (error) { toast.error('回答に失敗しました'); return }
    const applyUpdate = (e: Event) =>
      e.id !== eventId ? e : {
        ...e,
        attendees: e.attendees?.map(a => a.id === attendeeId ? { ...a, status } : a),
      }
    setEvents(prev => prev.map(applyUpdate))
    setDetailEvent(prev => prev ? applyUpdate(prev) : null)
    toast.success(status === 'accepted' ? '参加を回答しました' : '不参加を回答しました')
  }

  function taskDueDateColor(task: Task) {
    if (!task.due_date || task.status === 'done') return ''
    const d = parseISO(task.due_date)
    if (isPast(d) && !dateFnsIsToday(d)) return 'text-red-500 font-medium'
    if (dateFnsIsToday(d)) return 'text-amber-500 font-medium'
    return 'text-slate-500'
  }

  // ─────────────────────────────────────────────────────────────────────────
  const today = new Date()

  return (
    <div className="flex flex-col h-full p-3 sm:p-6 gap-3 sm:gap-4 overflow-hidden">

      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-base sm:text-lg font-bold text-slate-800 w-28 sm:w-32 text-center select-none">
            {format(currentMonth, 'yyyy年M月', { locale: ja })}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={goToday}
            className="ml-1 px-3 py-1 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors min-h-[36px]"
          >
            今日
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* タスクフィルター */}
          <button
            onClick={() => setMyTasksOnly(p => !p)}
            className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors min-h-[32px] ${
              myTasksOnly
                ? 'bg-amber-100 border-amber-300 text-amber-700'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            自分のタスク
          </button>
          <button
            onClick={() => setShowCompleted(p => !p)}
            className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors min-h-[32px] ${
              !showCompleted
                ? 'bg-slate-200 border-slate-300 text-slate-700'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            完了{showCompleted ? 'を非表示' : 'を表示'}
          </button>

          {/* デスクトップ: 予定を追加ボタン */}
          <Button size="sm" className="hidden md:flex gap-1.5" onClick={() => openCreate()}>
            <Plus size={15} /> 予定を追加
          </Button>
        </div>
      </div>

      {/* ── 月グリッド ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              className={`py-2 text-center text-[10px] sm:text-xs font-semibold tracking-wide ${
                i === 5 ? 'text-sky-600' : i === 6 ? 'text-rose-500' : 'text-slate-500'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            if (!day) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[60px] sm:min-h-[80px] border-r border-b border-slate-100 bg-slate-50/50"
                />
              )
            }

            const dateKey = format(day, 'yyyy-MM-dd')
            const cellEvents = eventsByDay.get(dateKey) ?? []
            const cellTasks = tasksByDay.get(dateKey) ?? []
            const totalItems = cellEvents.length + cellTasks.length

            // MAX_VISIBLE=5 を超えたら省略
            let remaining = MAX_VISIBLE
            const visibleEvents = cellEvents.slice(0, remaining)
            remaining = Math.max(0, remaining - visibleEvents.length)
            const visibleTasks = cellTasks.slice(0, remaining)
            const overflow = totalItems - (visibleEvents.length + visibleTasks.length)

            const isThisToday = isSameDay(day, today)
            const isSelected = isSameDay(day, selectedDate)
            const dowRaw = getDay(day)
            const isSat = dowRaw === 6
            const isSun = dowRaw === 0
            const colIdx = (dowRaw + 6) % 7

            return (
              <div
                key={dateKey}
                className={`min-h-[60px] sm:min-h-[80px] border-r border-b border-slate-100 p-1 cursor-pointer transition-colors hover:bg-indigo-50/50 ${
                  isSelected && !isThisToday ? 'bg-indigo-50' : ''
                } ${colIdx === 6 ? 'border-r-0' : ''}`}
                onClick={() => { setSelectedDate(day) }}
              >
                <div className="flex justify-end mb-0.5 px-0.5">
                  <span className={`text-[10px] sm:text-[11px] w-5 h-5 flex items-center justify-center rounded-full font-semibold leading-none ${
                    isThisToday
                      ? 'bg-indigo-600 text-white'
                      : isSun
                        ? 'text-rose-500'
                        : isSat
                          ? 'text-sky-600'
                          : 'text-slate-700'
                  }`}>
                    {format(day, 'd')}
                  </span>
                </div>

                <div className="space-y-0.5">
                  {/* 予定ピル */}
                  {visibleEvents.map(event => (
                    <div
                      key={event.id}
                      title={event.title}
                      className={`text-[10px] sm:text-[11px] leading-[15px] px-1.5 py-[1px] rounded truncate font-medium cursor-pointer ${getColorClass(event.created_by)}`}
                      onClick={e => { e.stopPropagation(); setDetailEvent(event) }}
                    >
                      {(event as any).all_day ? '終 ' : ''}{event.title}
                    </div>
                  ))}
                  {/* タスクピル */}
                  {visibleTasks.map(task => (
                    <div
                      key={task.id}
                      title={task.title}
                      className={`text-[10px] sm:text-[11px] leading-[15px] px-1.5 py-[1px] rounded truncate font-medium cursor-pointer flex items-center gap-0.5 ${
                        task.status === 'done'
                          ? 'bg-slate-100 text-slate-400 line-through'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                      onClick={e => { e.stopPropagation(); setDetailTask(task) }}
                    >
                      <CheckSquare size={8} className="shrink-0" />
                      {task.title}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div className="text-[10px] text-slate-400 px-1.5 leading-[14px]">
                      +{overflow}件
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 選択日の詳細パネル ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
          <h3 className="font-semibold text-slate-700 text-sm">
            {format(selectedDate, 'M月d日（E）', { locale: ja })}の予定
          </h3>
          {(selectedDayEvents.length + selectedDayTasks.length) > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedDayEvents.length + selectedDayTasks.length}件
            </Badge>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {selectedDayEvents.length === 0 && selectedDayTasks.length === 0 && (
            <button
              onClick={() => openCreate(selectedDate)}
              className="w-full p-5 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
            >
              + この日に予定を追加
            </button>
          )}

          {/* イベント一覧 */}
          {selectedDayEvents.map(event => {
            const myAttendee = event.attendees?.find(a => a.user_id === currentUserId)
            const isOwner = event.created_by === currentUserId
            return (
              <div
                key={event.id}
                className="bg-white rounded-xl border border-slate-200 p-3.5 hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => setDetailEvent(event)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className={`w-2 h-2 rounded-full mt-[5px] shrink-0 ${getDotColor(event.created_by)}`} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-800 truncate">{event.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <Clock size={10} />
                        {(event as any).all_day
                          ? '終日'
                          : `${format(parseISO(event.start_at), 'HH:mm')} 〜 ${format(parseISO(event.end_at), 'HH:mm')}`
                        }
                      </p>
                      {event.location && (
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin size={9} /> {event.location}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {myAttendee && (
                      <Badge variant={statusColor[myAttendee.status as keyof typeof statusColor]} className="text-xs">
                        {statusLabel[myAttendee.status as keyof typeof statusLabel]}
                      </Badge>
                    )}
                    {isOwner && (
                      <>
                        <button
                          className="p-1 rounded text-slate-400 hover:text-indigo-500 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                          onClick={e => { e.stopPropagation(); openEdit(event) }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                          onClick={e => { e.stopPropagation(); setDeleteTarget(event) }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {myAttendee && myAttendee.status === 'pending' && (
                  <div className="flex gap-2 mt-2.5">
                    <Button
                      size="sm" className="flex-1 h-8 text-xs"
                      onClick={e => { e.stopPropagation(); respondToEvent(event.id, myAttendee.id, 'accepted') }}
                    >
                      参加する
                    </Button>
                    <Button
                      size="sm" variant="outline" className="flex-1 h-8 text-xs"
                      onClick={e => { e.stopPropagation(); respondToEvent(event.id, myAttendee.id, 'declined') }}
                    >
                      不参加
                    </Button>
                  </div>
                )}
              </div>
            )
          })}

          {/* タスク一覧 */}
          {selectedDayTasks.length > 0 && (
            <>
              {selectedDayEvents.length > 0 && (
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-1 pt-1">タスク</p>
              )}
              {selectedDayTasks.map(task => (
                <div
                  key={task.id}
                  className="bg-amber-50/50 rounded-xl border border-amber-100 p-3.5 hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => setDetailTask(task)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <CheckSquare size={14} className="text-amber-500 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className={`font-medium text-sm truncate ${task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {task.title}
                        </p>
                        {task.due_date && (
                          <p className={`text-xs mt-0.5 flex items-center gap-1 ${taskDueDateColor(task)}`}>
                            <Clock size={10} />
                            {format(parseISO(task.due_date), 'HH:mm', { locale: ja })}まで
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${taskStatusColor[task.status as keyof typeof taskStatusColor]}`}>
                        {taskStatusLabel[task.status as keyof typeof taskStatusLabel]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── モバイル: フローティング追加ボタン ── */}
      <button
        onClick={() => openCreate()}
        className="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-xl flex items-center justify-center hover:bg-indigo-700 transition-colors"
        aria-label="予定を追加"
      >
        <Plus size={24} />
      </button>

      {/* ── 作成 / 編集モーダル ── */}
      <Dialog
        open={open}
        onOpenChange={o => { setOpen(o); if (!o) { setEditingId(null); setForm(emptyForm()) } }}
      >
        <DialogContent className="max-w-md mx-3 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '予定を編集' : '予定を作成'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>タイトル *</Label>
              <Input
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="予定のタイトル"
                autoFocus
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.all_day}
                onChange={e => setForm(p => ({ ...p, all_day: e.target.checked }))}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-slate-700">終日</span>
            </label>

            {form.all_day ? (
              <div className="space-y-1.5">
                <Label>日付 *</Label>
                <Input
                  type="date"
                  value={form.start_at.split('T')[0]}
                  onChange={e => setForm(p => ({
                    ...p,
                    start_at: `${e.target.value}T00:00`,
                    end_at:   `${e.target.value}T23:59`,
                  }))}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>開始 *</Label>
                  <Input
                    type="datetime-local"
                    value={form.start_at}
                    onChange={e => setForm(p => ({ ...p, start_at: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>終了 *</Label>
                  <Input
                    type="datetime-local"
                    value={form.end_at}
                    onChange={e => setForm(p => ({ ...p, end_at: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>場所</Label>
              <Input
                value={form.location}
                onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                placeholder="場所（任意）"
              />
            </div>

            {!editingId && (
              <div className="space-y-1.5">
                <Label>参加依頼メンバー</Label>
                <Select onValueChange={toggleAttendee}>
                  <SelectTrigger>
                    <SelectValue placeholder="メンバーを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {members
                      .filter(m => m.id !== currentUserId)
                      .map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {form.attendee_ids.includes(m.id) ? '✓ ' : ''}{m.display_name}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
                {form.attendee_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {form.attendee_ids.map(id => {
                      const m = members.find(x => x.id === id)
                      return (
                        <Badge key={id} variant="secondary" className="text-xs">
                          {m?.display_name}
                        </Badge>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>詳細</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2}
              />
            </div>

            <Button
              onClick={saveEvent}
              className="w-full"
              disabled={!form.title.trim() || !form.start_at || !form.end_at}
            >
              {editingId ? '更新する' : '作成する'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 予定詳細ダイアログ ── */}
      <Dialog open={!!detailEvent} onOpenChange={o => !o && setDetailEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-start justify-between gap-2 pr-6">
              <DialogTitle className="text-lg">{detailEvent?.title}</DialogTitle>
              {detailEvent?.created_by === currentUserId && (
                <div className="flex gap-1.5 shrink-0">
                  <button
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                    onClick={() => detailEvent && openEdit(detailEvent)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    onClick={() => { setDeleteTarget(detailEvent); setDetailEvent(null) }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          </DialogHeader>
          {detailEvent && (
            <div className="space-y-3 mt-2">
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <Clock size={14} />
                {(detailEvent as any).all_day
                  ? `${format(parseISO(detailEvent.start_at), 'M月d日')} 終日`
                  : `${format(parseISO(detailEvent.start_at), 'M/d HH:mm')} 〜 ${format(parseISO(detailEvent.end_at), 'HH:mm')}`
                }
              </p>
              {detailEvent.location && (
                <p className="text-sm flex items-center gap-1.5 text-slate-600">
                  <MapPin size={14} /> {detailEvent.location}
                </p>
              )}
              {detailEvent.description && (
                <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl">{detailEvent.description}</p>
              )}
              {detailEvent.attendees && detailEvent.attendees.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <Users size={14} /> 参加者
                  </p>
                  <div className="space-y-1.5">
                    {detailEvent.attendees.map(a => (
                      <div key={a.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">
                          {members.find(m => m.id === a.user_id)?.display_name ?? '不明'}
                        </span>
                        <Badge variant={statusColor[a.status as keyof typeof statusColor]} className="text-xs">
                          {statusLabel[a.status as keyof typeof statusLabel]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                const myAttendee = detailEvent.attendees?.find(a => a.user_id === currentUserId)
                return myAttendee && myAttendee.status === 'pending' ? (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="flex-1" onClick={() => respondToEvent(detailEvent.id, myAttendee.id, 'accepted')}>
                      参加する
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => respondToEvent(detailEvent.id, myAttendee.id, 'declined')}>
                      不参加
                    </Button>
                  </div>
                ) : null
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── タスク詳細ダイアログ ── */}
      <Dialog open={!!detailTask} onOpenChange={o => !o && setDetailTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <CheckSquare size={18} className="text-amber-500 shrink-0" />
              {detailTask?.title}
            </DialogTitle>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-3 mt-2">
              <div className="flex flex-wrap gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${taskStatusColor[detailTask.status as keyof typeof taskStatusColor]}`}>
                  {taskStatusLabel[detailTask.status as keyof typeof taskStatusLabel]}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${taskPriorityColor[detailTask.priority as keyof typeof taskPriorityColor]}`}>
                  優先度: {taskPriorityLabel[detailTask.priority as keyof typeof taskPriorityLabel]}
                </span>
              </div>
              {detailTask.assignee_id && (
                <p className="text-sm text-slate-600">
                  👤 担当: {members.find(m => m.id === detailTask.assignee_id)?.display_name ?? '不明'}
                </p>
              )}
              {detailTask.due_date && (
                <p className={`text-sm flex items-center gap-1.5 ${taskDueDateColor(detailTask) || 'text-slate-600'}`}>
                  <Clock size={14} />
                  期限: {format(parseISO(detailTask.due_date), 'M月d日 HH:mm', { locale: ja })}
                </p>
              )}
              {detailTask.description && (
                <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl">{detailTask.description}</p>
              )}
              <Link href="/tasks" onClick={() => setDetailTask(null)}>
                <Button variant="outline" size="sm" className="gap-1.5 mt-1">
                  <ExternalLink size={13} /> タスクページで開く
                </Button>
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 削除確認ダイアログ ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>予定を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.title}」を削除します。参加者への招待も全て削除されます。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteEvent}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
