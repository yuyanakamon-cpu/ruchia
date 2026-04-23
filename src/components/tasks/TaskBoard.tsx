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
import type { Task, Profile } from '@/types'

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
  assignee_id: string
  due_date: string
  priority: string
}

const emptyForm: FormState = {
  title: '', description: '', assignee_id: '', due_date: '', priority: 'medium',
}

export default function TaskBoard({
  initialTasks,
  members,
  currentUserId,
}: {
  initialTasks: Task[]
  members: Pick<Profile, 'id' | 'display_name'>[]
  currentUserId: string
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
      assignee_id: task.assignee_id ?? '',
      due_date: task.due_date ? task.due_date.slice(0, 16) : '',
      priority: task.priority,
    })
    setOpen(true)
  }

  async function saveTask() {
    if (!form.title.trim()) return
    const payload = {
      title: form.title,
      description: form.description || null,
      assignee_id: form.assignee_id || null,
      due_date: form.due_date || null,
      priority: form.priority,
    }

    if (editingId) {
      const { error } = await supabase.from('tasks').update(payload).eq('id', editingId)
      if (error) { toast.error('更新に失敗しました'); return }
      setTasks(prev => prev.map(t => t.id === editingId ? { ...t, ...payload, priority: payload.priority as Task['priority'] } : t))
      toast.success('タスクを更新しました')
    } else {
      const { data, error } = await supabase
        .from('tasks')
        .insert({ ...payload, status: 'todo', created_by: currentUserId })
        .select('*')
        .single()
      if (error) { toast.error('タスク作成に失敗しました'); return }
      setTasks(prev => [data, ...prev])
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

  const assigneeName = (task: Task) =>
    members.find(m => m.id === task.assignee_id)?.display_name ?? null

  const canEdit = (task: Task) =>
    task.created_by === currentUserId || task.assignee_id === currentUserId

  const canDelete = (task: Task) => task.created_by === currentUserId

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>担当者</Label>
                  <Select
                    value={form.assignee_id}
                    onValueChange={v => setForm(p => ({ ...p, assignee_id: v === '__none__' ? '' : (v ?? '') }))}
                  >
                    <SelectTrigger><SelectValue placeholder="未割当" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">未割当</SelectItem>
                      {members.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>優先度</Label>
                  <Select
                    value={form.priority}
                    onValueChange={v => { if (v) setForm(p => ({ ...p, priority: v })) }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">低</SelectItem>
                      <SelectItem value="medium">中</SelectItem>
                      <SelectItem value="high">高</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
          const colTasks = tasks.filter(t => t.status === col.key)
          return (
            <div key={col.key}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold text-sm text-gray-700">{col.label}</h3>
                <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
              </div>
              <div className="space-y-2">
                {colTasks.map(task => (
                  <Card key={task.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className={`text-sm font-medium leading-snug ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant={priorityColor[task.priority as keyof typeof priorityColor]} className="text-xs">
                            {priorityLabel[task.priority as keyof typeof priorityLabel]}
                          </Badge>
                        </div>
                      </div>

                      {task.description && (
                        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{task.description}</p>
                      )}

                      <div className="text-xs space-y-0.5 mb-3">
                        {assigneeName(task) && (
                          <p className="text-gray-500">👤 {assigneeName(task)}</p>
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
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          {canDelete(task) && (
                            <button
                              onClick={() => setDeleteTargetId(task.id)}
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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
                  <div className="border-2 border-dashed rounded-lg p-6 text-center text-xs text-gray-300">
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
