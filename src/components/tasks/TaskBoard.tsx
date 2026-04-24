'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CheckSquare, Plus, Check, Pencil, Trash2 } from 'lucide-react'
import ViewToggle, { type ViewMode } from '@/components/shared/ViewToggle'
import type { Task, Profile, TaskAssignee } from '@/types'
import type { Group, GroupMember } from '@/types/group'
import { createTask, updateTask } from '@/lib/actions/tasks'

function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const COLUMNS = [
  { key: 'todo', label: '未着手' },
  { key: 'in_progress', label: '進行中' },
  { key: 'done', label: '完了' },
] as const

const priorityColor = { low: 'secondary', medium: 'outline', high: 'destructive' } as const
const priorityLabel = { low: '低', medium: '中', high: '高' }

type FormState = {
  title: string
  description: string
  assignee_ids: string[]
  group_id: string
  due_date: string
  priority: string
}

const emptyForm: FormState = {
  title: '', description: '', assignee_ids: [], group_id: '', due_date: '', priority: 'medium',
}

export default function TaskBoard({
  initialTasks,
  members,
  currentUserId,
  groups = [],
  currentView = 'all' as ViewMode,
  currentGroupId,
}: {
  initialTasks: Task[]
  members: Pick<Profile, 'id' | 'display_name'>[]
  currentUserId: string
  groups?: (Group & { members: GroupMember[] })[]
  currentView?: ViewMode
  currentGroupId?: string
}) {
  const [tasks, setTasks] = useState(initialTasks)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const supabase = createClient()

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(task: Task) {
    setEditingId(task.id)
    setForm({
      title: task.title,
      description: task.description ?? '',
      assignee_ids: getEffectiveTaskAssignees(task).map(a => a.user_id),
      group_id: task.group_id ?? '',
      due_date: task.due_date ? toLocalDatetimeInput(new Date(task.due_date)) : '',
      priority: task.priority,
    })
    setOpen(true)
  }

  function toggleAssignee(userId: string) {
    setForm(p => ({
      ...p,
      assignee_ids: p.assignee_ids.includes(userId)
        ? p.assignee_ids.filter(id => id !== userId)
        : [...p.assignee_ids, userId],
    }))
  }

  async function saveTask() {
    if (!form.title.trim()) return
    const input = {
      title: form.title,
      description: form.description || null,
      assignee_id: null,
      assignee_ids: form.assignee_ids,
      group_id: form.group_id || null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      priority: form.priority,
    }

    if (editingId) {
      const result = await updateTask(editingId, input)
      if ('error' in result) { toast.error('更新に失敗しました'); return }
      setTasks(prev => prev.map(t => t.id === editingId ? {
        ...t,
        ...result.task,
        priority: result.task.priority as Task['priority'],
        approval_status: result.task.approval_status as Task['approval_status'],
        assignees: result.task.assignees,
      } : t))
      toast.success('タスクを更新しました')
    } else {
      const result = await createTask(input)
      if ('error' in result) { toast.error('タスク作成に失敗しました'); return }
      setTasks(prev => [result.task, ...prev])
      toast.success('タスクを作成しました')
    }

    setOpen(false)
    setForm(emptyForm)
    setEditingId(null)
  }

  async function updateStatus(taskId: string, status: Task['status']) {
    const updates: Partial<Task> = { status }
    if (status === 'done') updates.completed_at = new Date().toISOString()
    const { error } = await supabase.from('tasks').update(updates).eq('id', taskId)
    if (error) { toast.error('更新に失敗しました'); return }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t))
    if (status === 'done') toast.success('タスクを完了しました！')
  }

  async function deleteTask(taskId: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) { toast.error('削除に失敗しました'); return }
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setDeleteTargetId(null)
    toast.success('タスクを削除しました')
  }

  function dueDateColor(task: Task) {
    if (!task.due_date || task.status === 'done') return 'text-gray-400'
    const d = parseISO(task.due_date)
    if (isPast(d)) return 'text-red-500 font-medium'
    if (isToday(d)) return 'text-amber-500 font-medium'
    return 'text-gray-400'
  }

  // 互換: task_assignees が空なら legacy assigned_to から生成
  function getEffectiveTaskAssignees(task: Task): TaskAssignee[] {
    if (task.assignees && task.assignees.length > 0) return task.assignees
    if (task.assigned_to && task.approval_status && task.approval_status !== 'none') {
      return [{
        id: '', task_id: task.id, user_id: task.assigned_to,
        approval_status: task.approval_status as 'pending' | 'accepted' | 'rejected',
        approval_updated_at: task.approval_updated_at,
      }]
    }
    return []
  }

  function formatTaskAssigneeNames(task: Task): string {
    const assignees = getEffectiveTaskAssignees(task)
    if (assignees.length === 0) return ''
    const names = assignees.map(a => {
      const name = members.find(m => m.id === a.user_id)?.display_name ?? '名前未設定'
      return a.user_id === currentUserId ? `${name}（自分）` : name
    })
    if (names.length <= 3) return names.join(', ')
    return `${names.slice(0, 2).join(', ')} 他${names.length - 2}名`
  }

  const canEdit = (task: Task) => task.created_by === currentUserId

  const canDelete = (task: Task) => task.created_by === currentUserId

  // Filter tasks by view
  const visibleTasks = tasks.filter(task => {
    if (currentView === 'personal') return !task.group_id
    if (currentView === 'group') return currentGroupId ? task.group_id === currentGroupId : !!task.group_id
    return true
  })

  return (
    <div className="p-4 sm:p-8">
      <ViewToggle groups={groups} currentView={currentView} currentGroupId={currentGroupId} />

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl flex items-center gap-2" style={{ color: '#f0f0f0' }}>
          <CheckSquare size={24} /> タスク
        </h2>
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditingId(null); setForm(emptyForm) } }}>
          <DialogTrigger render={
            <Button className="gap-2" onClick={openCreate}><Plus size={16} /> 新規タスク</Button>
          } />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'タスクを編集' : 'タスクを作成'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>タイトル *</Label>
                <Input
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="タスクのタイトル"
                />
              </div>
              <div className="space-y-1.5">
                <Label>詳細</Label>
                <Textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="詳細メモ..."
                  rows={3}
                />
              </div>
              {groups.length > 0 && (
                <div className="space-y-1.5">
                  <Label>グループ</Label>
                  <Select
                    value={form.group_id}
                    onValueChange={v => setForm(p => ({ ...p, group_id: v === '__none__' ? '' : (v ?? '') }))}
                    items={[
                      { value: '__none__', label: '個人タスク' },
                      ...groups.map(g => ({ value: g.id, label: g.name })),
                    ]}
                  >
                    <SelectTrigger><SelectValue placeholder="個人タスク" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">個人タスク</SelectItem>
                      {groups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>優先度</Label>
                <Select
                  value={form.priority}
                  onValueChange={v => { if (v) setForm(p => ({ ...p, priority: v })) }}
                  items={[
                    { value: 'low', label: '低' },
                    { value: 'medium', label: '中' },
                    { value: 'high', label: '高' },
                  ]}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="medium">中</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(() => {
                const candidateMembers = form.group_id
                  ? (groups.find(g => g.id === form.group_id)?.members ?? []).map(m => ({
                      id: m.user_id,
                      display_name:
                        m.profile?.display_name
                        ?? members.find(p => p.id === m.user_id)?.display_name
                        ?? '名前未設定',
                    }))
                  : members.map(m => ({ id: m.id, display_name: m.display_name ?? '名前未設定' }))
                return candidateMembers.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label>担当者（複数選択可）</Label>
                    <div className="rounded-lg p-1.5 space-y-0.5" style={{ background: '#2a2a2a', border: '1px solid #333' }}>
                      {candidateMembers.map(m => {
                        const checked = form.assignee_ids.includes(m.id)
                        return (
                          <label key={m.id} className="flex items-center gap-2.5 cursor-pointer px-2.5 py-2 rounded transition-colors hover:bg-[#333]">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAssignee(m.id)}
                              className="rounded"
                            />
                            <span className="text-sm flex-1" style={{ color: '#f0f0f0' }}>
                              {m.display_name}{m.id === currentUserId ? ' （自分）' : ''}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {form.assignee_ids.some(id => id !== currentUserId) && (
                      <p className="text-xs" style={{ color: '#888' }}>担当者に選ばれた人に通知が届きます</p>
                    )}
                  </div>
                ) : null
              })()}
              <div className="space-y-1.5">
                <Label>期限</Label>
                <Input
                  type="datetime-local"
                  value={form.due_date}
                  onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                />
              </div>
              <Button onClick={saveTask} className="w-full" disabled={!form.title.trim()}>
                {editingId ? '更新する' : '作成する'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {COLUMNS.map(col => {
          const colTasks = visibleTasks.filter(t => t.status === col.key)
          return (
            <div key={col.key}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold text-sm" style={{ color: '#b8b8b8' }}>{col.label}</h3>
                <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
              </div>
              <div className="space-y-2">
                {colTasks.map(task => (
                  <Card key={task.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-sm font-medium leading-snug" style={{ color: task.status === 'done' ? '#555' : '#f0f0f0', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant={priorityColor[task.priority as keyof typeof priorityColor]} className="text-xs">
                            {priorityLabel[task.priority as keyof typeof priorityLabel]}
                          </Badge>
                        </div>
                      </div>

                      {task.description && (
                        <p className="text-xs mb-2 line-clamp-2" style={{ color: '#888' }}>{task.description}</p>
                      )}

                      <div className="text-xs space-y-0.5 mb-3">
                        {formatTaskAssigneeNames(task) && (
                          <p style={{ color: '#888' }}>👤 {formatTaskAssigneeNames(task)}</p>
                        )}
                        {task.due_date && (
                          <p className={dueDateColor(task)}>
                            期限: {format(parseISO(task.due_date), 'M/d HH:mm', { locale: ja })}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          {canEdit(task) && (
                            <button
                              onClick={() => openEdit(task)}
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded transition-colors"
                              style={{ color: '#555' }}
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          {canDelete(task) && (
                            <button
                              onClick={() => setDeleteTargetId(task.id)}
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded transition-colors"
                              style={{ color: '#555' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        {task.status !== 'done' && (
                          <Button
                            size="sm"
                            variant={task.status === 'todo' ? 'outline' : 'default'}
                            className="text-xs h-7 px-2 gap-1"
                            onClick={() => updateStatus(task.id, task.status === 'todo' ? 'in_progress' : 'done')}
                          >
                            <Check size={12} />
                            {task.status === 'todo' ? '開始' : '完了'}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {colTasks.length === 0 && (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center text-xs" style={{ borderColor: '#3a3a3a', color: '#3a3a3a' }}>
                    タスクなし
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <AlertDialog open={!!deleteTargetId} onOpenChange={v => { if (!v) setDeleteTargetId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>タスクを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>この操作は取り消せません。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTargetId && deleteTask(deleteTargetId)}
              className="bg-red-600 hover:bg-red-700"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
