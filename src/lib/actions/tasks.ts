'use server'

import { createClient } from '@/lib/supabase/server'
import { notifyUser } from '@/lib/telegram'
import { notifyTaskAssignedToGroup } from '@/lib/line-task-notify'
import { sendPushToUsers } from '@/lib/webpush'
import { notificationMessages } from '@/lib/notification-messages'
import type { Task, TaskAssignee } from '@/types'

// 担当者ID配列 → 表示名＋LINE userId（telegram_chat_idに保存）に変換
async function buildAssigneeProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assigneeIds: string[],
): Promise<{ display_name: string; lineUserId: string | null }[]> {
  if (assigneeIds.length === 0) return []
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, telegram_chat_id')
    .in('id', assigneeIds)
  return assigneeIds.map((id) => {
    const p = (data ?? []).find((x) => x.id === id)
    return { display_name: p?.display_name ?? '担当者', lineUserId: p?.telegram_chat_id ?? null }
  })
}

type TaskInput = {
  title: string
  description: string | null
  assignee_id: string | null
  assignee_ids: string[]
  group_id: string | null
  due_date: string | null
  priority: string
}

type TaskResult = { task: Task & { assignees: TaskAssignee[] } } | { error: string }

async function getDisplayName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .single()
  return data?.display_name ?? '名前未設定'
}

export async function createTask(input: TaskInput): Promise<TaskResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証が必要です' }

  const otherAssignees = input.assignee_ids.filter(id => id !== user.id)
  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      title: input.title,
      description: input.description,
      assignee_id: input.assignee_id,
      assigned_to: input.assignee_ids[0] ?? null,
      group_id: input.group_id,
      due_date: input.due_date,
      priority: input.priority,
      status: 'todo',
      created_by: user.id,
      approval_status: 'none',
    })
    .select('*')
    .single()
  if (error) return { error: error.message }

  if (input.assignee_ids.length > 0) {
    await supabase.from('task_assignees').insert(
      input.assignee_ids.map(uid => ({
        task_id: task.id,
        user_id: uid,
        approval_status: 'accepted',
      }))
    )
  }

  const assignees: TaskAssignee[] = input.assignee_ids.map(uid => ({
    id: '',
    task_id: task.id,
    user_id: uid,
    approval_status: 'accepted' as TaskAssignee['approval_status'],
    approval_updated_at: null,
  }))

  // 割り当て通知（LINEグループへ1回・担当者を@メンション＋タイトル/詳細/優先度/担当者/期限/リンク）
  if (input.assignee_ids.length > 0 || input.group_id) {
    await notifyTaskAssignedToGroup(
      { title: task.title, description: task.description, priority: task.priority, due_date: task.due_date },
      await buildAssigneeProfiles(supabase, input.assignee_ids),
    )
  }
  // 担当者(自分以外)のiPhoneへプッシュ通知
  if (otherAssignees.length > 0) {
    await sendPushToUsers(otherAssignees, { title: '新しいタスク', body: task.title, url: '/tasks', tag: `task-${task.id}` })
  }

  return { task: { ...task, assignees } }
}

export async function updateTask(taskId: string, input: TaskInput): Promise<TaskResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証が必要です' }

  // Fetch existing assignees for diff
  const { data: existing } = await supabase
    .from('task_assignees')
    .select('user_id')
    .eq('task_id', taskId)
  const existingIds = (existing ?? []).map((a: { user_id: string }) => a.user_id)
  const newAssigneeIds = input.assignee_ids.filter(
    id => !existingIds.includes(id) && id !== user.id
  )

  const otherAssignees = input.assignee_ids.filter(id => id !== user.id)
  const { data: task, error } = await supabase
    .from('tasks')
    .update({
      title: input.title,
      description: input.description,
      assignee_id: input.assignee_id,
      assigned_to: input.assignee_ids[0] ?? null,
      group_id: input.group_id,
      due_date: input.due_date,
      priority: input.priority,
      approval_status: 'none',
    })
    .eq('id', taskId)
    .select('*')
    .single()
  if (error) return { error: error.message }

  await supabase.from('task_assignees').delete().eq('task_id', taskId)
  if (input.assignee_ids.length > 0) {
    await supabase.from('task_assignees').insert(
      input.assignee_ids.map(uid => ({
        task_id: taskId,
        user_id: uid,
        approval_status: 'accepted',
      }))
    )
  }

  const assignees: TaskAssignee[] = input.assignee_ids.map(uid => ({
    id: '',
    task_id: taskId,
    user_id: uid,
    approval_status: 'accepted' as TaskAssignee['approval_status'],
    approval_updated_at: null,
  }))

  // 新規追加された担当者に通知（グループへ@メンション＋詳細＋リンク）＋iPhoneプッシュ
  if (newAssigneeIds.length > 0) {
    await notifyTaskAssignedToGroup(
      { title: task.title, description: task.description, priority: task.priority, due_date: task.due_date },
      await buildAssigneeProfiles(supabase, newAssigneeIds),
    )
    await sendPushToUsers(newAssigneeIds, { title: '新しいタスク', body: task.title, url: '/tasks', tag: `task-${taskId}` })
  }

  return { task: { ...task, assignees } }
}

export async function respondToTaskApproval(
  taskId: string,
  status: 'accepted' | 'rejected',
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証が必要です' }

  const { error } = await supabase
    .from('task_assignees')
    .update({ approval_status: status, approval_updated_at: new Date().toISOString() })
    .eq('task_id', taskId)
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  const { data: task } = await supabase
    .from('tasks')
    .select('title, created_by')
    .eq('id', taskId)
    .single()

  if (task?.created_by && task.created_by !== user.id) {
    const responderName = await getDisplayName(supabase, user.id)
    const msg = status === 'accepted'
      ? notificationMessages.taskApproved(task.title, responderName)
      : notificationMessages.taskRejected(task.title, responderName)
    await notifyUser(task.created_by, msg, 'approval_response')
  }

  return {}
}
