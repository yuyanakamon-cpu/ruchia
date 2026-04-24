'use server'

import { createClient } from '@/lib/supabase/server'
import { notifyUser, notifyUsers } from '@/lib/telegram'
import { notificationMessages } from '@/lib/notification-messages'
import type { Task, TaskAssignee } from '@/types'

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
      approval_status: otherAssignees.length > 0 ? 'pending' : 'none',
    })
    .select('*')
    .single()
  if (error) return { error: error.message }

  if (input.assignee_ids.length > 0) {
    await supabase.from('task_assignees').insert(
      input.assignee_ids.map(uid => ({
        task_id: task.id,
        user_id: uid,
        approval_status: uid === user.id ? 'accepted' : 'pending',
      }))
    )
  }

  const assignees: TaskAssignee[] = input.assignee_ids.map(uid => ({
    id: '',
    task_id: task.id,
    user_id: uid,
    approval_status: (uid === user.id ? 'accepted' : 'pending') as TaskAssignee['approval_status'],
    approval_updated_at: null,
  }))

  // Assignees (not self) → task_assigned
  if (otherAssignees.length > 0) {
    const creatorName = await getDisplayName(supabase, user.id)
    for (const uid of otherAssignees) {
      await notifyUser(uid, notificationMessages.taskAssigned(task.title, creatorName), 'task_assigned')
    }
  }

  // Other group members (not self, not assignees) → group_update
  if (input.group_id) {
    const [{ data: members }, { data: group }] = await Promise.all([
      supabase.from('group_members').select('user_id').eq('group_id', input.group_id),
      supabase.from('groups').select('name').eq('id', input.group_id).single(),
    ])
    const creatorName = await getDisplayName(supabase, user.id)
    const groupOnlyIds = (members ?? [])
      .map((m: { user_id: string }) => m.user_id)
      .filter((id: string) => id !== user.id && !otherAssignees.includes(id))

    if (groupOnlyIds.length > 0) {
      await notifyUsers(
        groupOnlyIds,
        notificationMessages.groupNewTask(group?.name ?? '', task.title, creatorName),
        'group_update',
      )
    }
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
      approval_status: otherAssignees.length > 0 ? 'pending' : 'none',
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
        approval_status: uid === user.id ? 'accepted' : 'pending',
      }))
    )
  }

  const assignees: TaskAssignee[] = input.assignee_ids.map(uid => ({
    id: '',
    task_id: taskId,
    user_id: uid,
    approval_status: (uid === user.id ? 'accepted' : 'pending') as TaskAssignee['approval_status'],
    approval_updated_at: null,
  }))

  // Only notify newly added assignees
  if (newAssigneeIds.length > 0) {
    const creatorName = await getDisplayName(supabase, user.id)
    for (const uid of newAssigneeIds) {
      await notifyUser(uid, notificationMessages.taskAssigned(task.title, creatorName), 'task_assigned')
    }
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
