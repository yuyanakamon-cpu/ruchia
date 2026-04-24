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
import type { Event, Task, Profile, EventAssignee } from '@/types'
import type { Group, GroupMember } from '@/types/group'
import ViewToggle, { type ViewMode } from '@/components/shared/ViewToggle'
import ApprovalStatusBadge from '@/components/shared/ApprovalStatusBadge'
import { createEvent, updateEvent, respondToEventApproval } from '@/lib/actions/events'

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
  low: 'bg-[#2a2a2a] text-[#888]',
  medium: 'bg-[rgba(184,115,51,0.2)] text-[#b87333]',
  high: 'bg-[rgba(204,102,102,0.2)] text-[#cc6666]',
}
const taskStatusLabel = { todo: '未着手', in_progress: '進行中', done: '完了' }
const taskStatusColor = {
  todo: 'bg-[#2a2a2a] text-[#888]',
  in_progress: 'bg-[rgba(184,115,51,0.2)] text-[#b87333]',
  done: 'bg-[rgba(100,180,100,0.15)] text-[#6ab04c]',
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
  group_id: string
  assignee_ids: string[]
}

const emptyForm = (): FormState => ({
  title: '', description: '', location: '',
  start_at: '', end_at: '', all_day: false, attendee_ids: [],
  group_id: '', assignee_ids: [],
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

// 表示用: 担当者名をカンマ区切りで返す（4名以上は省略）
function formatAssigneeNames(
  assignees: EventAssignee[] | undefined,
  members: Pick<Profile, 'id' | 'display_name'>[],
  currentUserId: string
): string {
  if (!assignees || assignees.length === 0) return ''
  const names = assignees.map(a => {
    const name = members.find(m => m.id === a.user_id)?.display_name ?? '名前未設定'
    return a.user_id === currentUserId ? `${name}（自分）` : name
  })
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} 他${names.length - 2}名`
}

// 互換: event_assignees が空なら legacy assigned_to フィールドから生成
function getEffectiveAssignees(event: Event): EventAssignee[] {
  if (event.assignees && event.assignees.length > 0) return event.assignees
  if (event.assigned_to && event.approval_status && event.approval_status !== 'none') {
    return [{
      id: '',
      event_id: event.id,
      user_id: event.assigned_to,
      approval_status: event.approval_status as 'pending' | 'accepted' | 'rejected',
      approval_updated_at: event.approval_updated_at,
    }]
  }
  return []
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CalendarView({
  initialEvents,
  initialTasks,
  members,
  currentUserId,
  groups,
  currentView,
  currentGroupId,
}: {
  initialEvents: Event[]
  initialTasks: Task[]
  members: Pick<Profile, 'id' | 'display_name'>[]
  currentUserId: string
  groups: (Group & { members: GroupMember[] })[]
  currentView: ViewMode
  currentGroupId?: string
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
      group_id: event.group_id ?? '',
      assignee_ids: getEffectiveAssignees(event).map(a => a.user_id),
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

  function toggleAssignee(userId: string) {
    setForm(p => ({
      ...p,
      assignee_ids: p.assignee_ids.includes(userId)
        ? p.assignee_ids.filter(id => id !== userId)
        : [...p.assignee_ids, userId],
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

    const input = {
      title: form.title,
      description: form.description || null,
      location: form.location || null,
      start_at: toSupabaseDatetime(form.start_at, form.all_day, false),
      end_at: toSupabaseDatetime(form.end_at, form.all_day, true),
      all_day: form.all_day,
      group_id: form.group_id || null,
      assignee_ids: form.assignee_ids,
      attendee_ids: form.attendee_ids,
    }

    if (editingId) {
      const result = await updateEvent(editingId, input)
      if ('error' in result) { toast.error('更新に失敗しました'); return }
      setEvents(prev => prev.map(e =>
        e.id === editingId ? { ...e, ...result.event, assignees: result.event.assignees } : e
      ))
      toast.success('予定を更新しました')
    } else {
      const result = await createEvent(input)
      if ('error' in result) { toast.error('予定作成に失敗しました'); return }
      setEvents(prev => [...prev, result.event])
      toast.success('予定を作成しました')
    }

    setOpen(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  async function updateEventApproval(eventId: string, status: 'accepted' | 'rejected') {
    const result = await respondToEventApproval(eventId, status)
    if (result.error) { toast.error('更新に失敗しました'); return }

    const applyUpdate = (e: Event): Event => e.id !== eventId ? e : {
      ...e,
      assignees: e.assignees?.map(a =>
        a.user_id === currentUserId ? { ...a, approval_status: status } : a
      ),
      ...(e.assigned_to === currentUserId ? { approval_status: status } : {}),
    }
    setEvents(prev => prev.map(applyUpdate))
    setDetailEvent(prev => prev ? applyUpdate(prev) : null)
    toast.success(status === 'accepted' ? '承認しました' : '拒否しました')
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
    if (isPast(d) && !dateFnsIsToday(d)) return 'text-[#cc6666] font-medium'
    if (dateFnsIsToday(d)) return 'text-[#b87333] font-medium'
    return 'text-[#888]'
  }

  // ─────────────────────────────────────────────────────────────────────────
  const today = new Date()

  return (
    <div className="flex flex-col h-full p-3 sm:p-6 gap-3 sm:gap-4 overflow-hidden">

      {/* ── ビュー切り替えトグル ── */}
      <ViewToggle
        groups={groups}
        currentView={currentView}
        currentGroupId={currentGroupId}
      />

      {/* ── ヘッダー ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center" style={{ color: '#888' }}
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-base sm:text-lg w-28 sm:w-32 text-center select-none" style={{ color: '#f0f0f0' }}>
            {format(currentMonth, 'yyyy年M月', { locale: ja })}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center" style={{ color: '#888' }}
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={goToday}
            className="ml-1 px-3 py-1 text-xs font-medium rounded-lg transition-colors min-h-[36px]"
            style={{ border: '1px solid #2a2a2a', color: '#888', background: 'transparent' }}
          >
            今日
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setMyTasksOnly(p => !p)}
            className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors min-h-[32px] ${
              myTasksOnly
                ? 'bg-[rgba(184,115,51,0.2)] border-[rgba(184,115,51,0.4)] text-[#b87333]'
                : 'border-[#2a2a2a] text-[#555] hover:border-[#3a3a3a]'
            }`}
          >
            自分のタスク
          </button>
          <button
            onClick={() => setShowCompleted(p => !p)}
            className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors min-h-[32px] ${
              !showCompleted
                ? 'bg-[#2a2a2a] border-[#3a3a3a] text-[#b8b8b8]'
                : 'border-[#2a2a2a] text-[#555] hover:border-[#3a3a3a]'
            }`}
          >
            完了{showCompleted ? 'を非表示' : 'を表示'}
          </button>
          <Button size="sm" className="hidden md:flex gap-1.5" onClick={() => openCreate()}>
            <Plus size={15} /> 予定を追加
          </Button>
        </div>
      </div>

      {/* ── 月グリッド ── */}
      <div className="rounded-2xl overflow-hidden shrink-0" style={{ background: '#232323', border: '1px solid #2a2a2a' }}>
        <div className="grid grid-cols-7" style={{ background: '#1a1a1a', borderBottom: '1px solid #2a2a2a' }}>
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              className={`py-2 text-center text-[10px] sm:text-xs font-semibold tracking-wide ${
                i === 5 ? 'text-sky-400' : i === 6 ? 'text-rose-400' : 'text-[#555]'
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
                  className="min-h-[60px] sm:min-h-[80px]"
                  style={{ borderRight: '1px solid #2a2a2a', borderBottom: '1px solid #2a2a2a', background: '#1a1a1a' }}
                />
              )
            }

            const dateKey = format(day, 'yyyy-MM-dd')
            const cellEvents = eventsByDay.get(dateKey) ?? []
            const cellTasks = tasksByDay.get(dateKey) ?? []
            const totalItems = cellEvents.length + cellTasks.length

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
                className="min-h-[60px] sm:min-h-[80px] p-1 cursor-pointer transition-colors"
                style={{
                  borderRight: colIdx === 6 ? 'none' : '1px solid #2a2a2a',
                  borderBottom: '1px solid #2a2a2a',
                  background: isSelected && !isThisToday ? 'rgba(184,115,51,0.08)' : undefined,
                }}
                onClick={() => { setSelectedDate(day) }}
              >
                <div className="flex justify-end mb-0.5 px-0.5">
                  <span
                    className="text-[10px] sm:text-[11px] w-5 h-5 flex items-center justify-center rounded-full font-semibold leading-none"
                    style={isThisToday
                      ? { background: '#b87333', color: '#1a1a1a' }
                      : { color: isSun ? '#f87171' : isSat ? '#38bdf8' : '#888' }
                    }
                  >
                    {format(day, 'd')}
                  </span>
                </div>

                <div className="space-y-0.5">
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
                  {visibleTasks.map(task => (
                    <div
                      key={task.id}
                      title={task.title}
                      className={`text-[10px] sm:text-[11px] leading-[15px] px-1.5 py-[1px] rounded truncate font-medium cursor-pointer flex items-center gap-0.5 ${
                        task.status === 'done'
                          ? 'bg-[#2a2a2a] text-[#555] line-through'
                          : 'bg-[rgba(184,115,51,0.15)] text-[#b87333] border border-[rgba(184,115,51,0.3)]'
                      }`}
                      onClick={e => { e.stopPropagation(); setDetailTask(task) }}
                    >
                      <CheckSquare size={8} className="shrink-0" />
                      {task.title}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div className="text-[10px] px-1.5 leading-[14px]" style={{ color: '#555' }}>
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
      <div className="rounded-2xl flex-1 min-h-0 overflow-hidden flex flex-col" style={{ background: '#232323', border: '1px solid #2a2a2a' }}>
        <div className="px-4 py-3 flex items-center gap-2 shrink-0" style={{ borderBottom: '1px solid #2a2a2a' }}>
          <h3 className="font-semibold text-sm" style={{ color: '#b8b8b8' }}>
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
              className="w-full p-5 rounded-xl border-2 border-dashed text-sm transition-colors"
              style={{ borderColor: '#2a2a2a', color: '#555' }}
            >
              + この日に予定を追加
            </button>
          )}

          {/* イベント一覧 */}
          {selectedDayEvents.map(event => {
            const myAttendee = event.attendees?.find(a => a.user_id === currentUserId)
            const isOwner = event.created_by === currentUserId
            const effectiveAssignees = getEffectiveAssignees(event)
            const myAssignee = effectiveAssignees.find(a => a.user_id === currentUserId)
            const assigneeStr = formatAssigneeNames(effectiveAssignees, members, currentUserId)

            return (
              <div
                key={event.id}
                className="rounded-xl p-3.5 transition-shadow cursor-pointer"
                style={{ background: '#2a2a2a', border: '1px solid #333' }}
                onClick={() => setDetailEvent(event)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className={`w-2 h-2 rounded-full mt-[5px] shrink-0 ${getDotColor(event.created_by)}`} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: '#f0f0f0' }}>{event.title}</p>
                      <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#888' }}>
                        <Clock size={10} />
                        {(event as any).all_day
                          ? '終日'
                          : `${format(parseISO(event.start_at), 'HH:mm')} 〜 ${format(parseISO(event.end_at), 'HH:mm')}`
                        }
                      </p>
                      {event.location && (
                        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#555' }}>
                          <MapPin size={9} /> {event.location}
                        </p>
                      )}
                      {assigneeStr && (
                        <p className="text-xs mt-0.5" style={{ color: '#888' }}>👤 {assigneeStr}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {myAssignee && (
                      <ApprovalStatusBadge status={myAssignee.approval_status} />
                    )}
                    {myAttendee && (
                      <Badge variant={statusColor[myAttendee.status as keyof typeof statusColor]} className="text-xs">
                        {statusLabel[myAttendee.status as keyof typeof statusLabel]}
                      </Badge>
                    )}
                    {isOwner && (
                      <>
                        <button
                          className="p-1 rounded transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                          style={{ color: '#555' }}
                          onClick={e => { e.stopPropagation(); openEdit(event) }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          className="p-1 rounded transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                          style={{ color: '#555' }}
                          onClick={e => { e.stopPropagation(); setDeleteTarget(event) }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {myAssignee && myAssignee.approval_status === 'pending' && (
                  <div className="flex gap-2 mt-2.5">
                    <Button
                      size="sm" className="flex-1 h-8 text-xs"
                      onClick={e => { e.stopPropagation(); updateEventApproval(event.id, 'accepted') }}
                    >
                      受ける
                    </Button>
                    <Button
                      size="sm" variant="outline" className="flex-1 h-8 text-xs"
                      onClick={e => { e.stopPropagation(); updateEventApproval(event.id, 'rejected') }}
                    >
                      受けない
                    </Button>
                  </div>
                )}
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
                <p className="text-[11px] font-semibold uppercase tracking-wide px-1 pt-1" style={{ color: '#555' }}>タスク</p>
              )}
              {selectedDayTasks.map(task => (
                <div
                  key={task.id}
                  className="rounded-xl p-3.5 transition-shadow cursor-pointer"
                  style={{ background: 'rgba(184,115,51,0.08)', border: '1px solid rgba(184,115,51,0.2)' }}
                  onClick={() => setDetailTask(task)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <CheckSquare size={14} className="mt-0.5 shrink-0" style={{ color: '#b87333' }} />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate" style={{ color: task.status === 'done' ? '#555' : '#f0f0f0', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
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
        className="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full text-[#1a1a1a] shadow-xl flex items-center justify-center transition-colors"
        style={{ background: '#b87333' }}
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
                className="rounded"
              />
              <span className="text-sm font-medium" style={{ color: '#b8b8b8' }}>終日</span>
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

            {/* グループ選択 */}
            {groups.length > 0 && (
              <div className="space-y-1.5">
                <Label>グループ（任意）</Label>
                <Select
                  value={form.group_id}
                  onValueChange={v => setForm(p => ({ ...p, group_id: v === '__none__' ? '' : (v ?? ''), assignee_ids: [] }))}
                  items={[
                    { value: '__none__', label: '個人の予定' },
                    ...groups.map(g => ({ value: g.id, label: g.name })),
                  ]}
                >
                  <SelectTrigger><SelectValue placeholder="個人の予定" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">個人の予定</SelectItem>
                    {groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 担当者（グループ選択時のみ・複数選択可） */}
            {form.group_id && (() => {
              const groupMembers = groups.find(g => g.id === form.group_id)?.members ?? []
              return groupMembers.length > 0 ? (
                <div className="space-y-1.5">
                  <Label>担当者（複数選択可）</Label>
                  <div className="rounded-lg p-1.5 space-y-0.5" style={{ background: '#2a2a2a', border: '1px solid #333' }}>
                    {groupMembers.map(m => {
                      const name =
                        m.profile?.display_name
                        ?? members.find(p => p.id === m.user_id)?.display_name
                        ?? '名前未設定'
                      const checked = form.assignee_ids.includes(m.user_id)
                      const isOther = m.user_id !== currentUserId
                      return (
                        <label
                          key={m.user_id}
                          className="flex items-center gap-2.5 cursor-pointer px-2.5 py-2 rounded transition-colors hover:bg-[#333]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAssignee(m.user_id)}
                            className="rounded"
                          />
                          <span className="text-sm flex-1" style={{ color: '#f0f0f0' }}>
                            {name}{m.user_id === currentUserId ? ' （自分）' : ''}
                          </span>
                          {checked && isOther && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(212,160,85,0.15)', color: '#d4a055' }}>
                              承認依頼
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                  {form.assignee_ids.some(id => id !== currentUserId) && (
                    <p className="text-xs" style={{ color: '#d4a055' }}>担当者に承認依頼が送られます</p>
                  )}
                </div>
              ) : null
            })()}

            {!editingId && (
              <div className="space-y-1.5">
                <Label>参加依頼メンバー</Label>
                <Select
                  onValueChange={toggleAttendee}
                  items={members
                    .filter(m => m.id !== currentUserId)
                    .map(m => ({ value: m.id, label: m.display_name ?? '名前未設定' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="メンバーを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {members
                      .filter(m => m.id !== currentUserId)
                      .map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {form.attendee_ids.includes(m.id) ? '✓ ' : ''}{m.display_name ?? '名前未設定'}
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
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: '#555' }}
                    onClick={() => detailEvent && openEdit(detailEvent)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: '#555' }}
                    onClick={() => { setDeleteTarget(detailEvent); setDetailEvent(null) }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          </DialogHeader>
          {detailEvent && (() => {
            const effectiveAssignees = getEffectiveAssignees(detailEvent)
            const myAssignee = effectiveAssignees.find(a => a.user_id === currentUserId)
            return (
              <div className="space-y-3 mt-2">
                {/* 担当者一覧と各自の承認ステータス */}
                {effectiveAssignees.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#555' }}>
                      担当者
                    </p>
                    <div className="space-y-1.5">
                      {effectiveAssignees.map(a => (
                        <div key={a.user_id} className="flex items-center justify-between text-sm">
                          <span style={{ color: '#f0f0f0' }}>
                            {members.find(m => m.id === a.user_id)?.display_name ?? '不明'}
                            {a.user_id === currentUserId ? ' （自分）' : ''}
                          </span>
                          <ApprovalStatusBadge status={a.approval_status} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 自分が担当で pending なら承認アクション */}
                {myAssignee && myAssignee.approval_status === 'pending' && (
                  <div className="rounded-xl p-3.5 space-y-3" style={{ background: 'rgba(212,160,85,0.08)', border: '1px solid rgba(212,160,85,0.2)' }}>
                    <p className="text-sm font-medium" style={{ color: '#d4a055' }}>この予定が担当に割り当てられました</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateEventApproval(detailEvent.id, 'accepted')}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold uppercase transition-opacity hover:opacity-80"
                        style={{ background: '#b87333', color: '#1a1a1a', letterSpacing: '0.05em' }}
                      >受ける</button>
                      <button
                        onClick={() => updateEventApproval(detailEvent.id, 'rejected')}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold uppercase transition-opacity hover:opacity-80"
                        style={{ border: '1px solid #c66', color: '#c66', background: 'transparent' }}
                      >受けない</button>
                    </div>
                  </div>
                )}

                <p className="text-sm flex items-center gap-1.5" style={{ color: '#888' }}>
                  <Clock size={14} />
                  {(detailEvent as any).all_day
                    ? `${format(parseISO(detailEvent.start_at), 'M月d日')} 終日`
                    : `${format(parseISO(detailEvent.start_at), 'M/d HH:mm')} 〜 ${format(parseISO(detailEvent.end_at), 'HH:mm')}`
                  }
                </p>
                {detailEvent.location && (
                  <p className="text-sm flex items-center gap-1.5" style={{ color: '#888' }}>
                    <MapPin size={14} /> {detailEvent.location}
                  </p>
                )}
                {detailEvent.description && (
                  <p className="text-sm p-3 rounded-xl" style={{ color: '#b8b8b8', background: '#2a2a2a' }}>
                    {detailEvent.description}
                  </p>
                )}
                {detailEvent.attendees && detailEvent.attendees.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: '#555' }}>
                      <Users size={12} /> 参加者
                    </p>
                    <div className="space-y-1.5">
                      {detailEvent.attendees.map(a => (
                        <div key={a.id} className="flex items-center justify-between text-sm">
                          <span style={{ color: '#f0f0f0' }}>
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
            )
          })()}
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
                <p className="text-sm" style={{ color: '#b8b8b8' }}>
                  👤 担当: {members.find(m => m.id === detailTask.assignee_id)?.display_name ?? '不明'}
                </p>
              )}
              {detailTask.assignees && detailTask.assignees.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#555' }}>承認担当</p>
                  <div className="space-y-1.5">
                    {detailTask.assignees.map(a => (
                      <div key={a.user_id} className="flex items-center justify-between text-sm">
                        <span style={{ color: '#f0f0f0' }}>
                          {members.find(m => m.id === a.user_id)?.display_name ?? '不明'}
                        </span>
                        <ApprovalStatusBadge status={a.approval_status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detailTask.due_date && (
                <p className={`text-sm flex items-center gap-1.5 ${taskDueDateColor(detailTask) || ''}`} style={{ color: '#888' }}>
                  <Clock size={14} />
                  期限: {format(parseISO(detailTask.due_date), 'M月d日 HH:mm', { locale: ja })}
                </p>
              )}
              {detailTask.description && (
                <p className="text-sm p-3 rounded-xl" style={{ color: '#b8b8b8', background: '#2a2a2a' }}>
                  {detailTask.description}
                </p>
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
