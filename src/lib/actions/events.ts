'use server'

import { createClient } from '@/lib/supabase/server'
import { notifyUser, notifyUsers } from '@/lib/telegram'
import { notificationMessages } from '@/lib/notification-messages'
import type { Event, EventAssignee } from '@/types'

type EventInput = {
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string
  all_day: boolean
  group_id: string | null
  assignee_ids: string[]
  attendee_ids: string[]
}

type EventResult = { event: Event & { assignees: EventAssignee[] } } | { error: string }

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

export async function createEvent(input: EventInput): Promise<EventResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証が必要です' }

  const otherAssignees = input.assignee_ids.filter(id => id !== user.id)
  const { data: event, error } = await supabase
    .from('events')
    .insert({
      title: input.title,
      description: input.description,
      location: input.location,
      start_at: input.start_at,
      end_at: input.end_at,
      all_day: input.all_day,
      created_by: user.id,
      group_id: input.group_id,
      assigned_to: input.assignee_ids[0] ?? null,
      approval_status: otherAssignees.length > 0 ? 'pending' : 'none',
      approval_updated_at: otherAssignees.length > 0 ? new Date().toISOString() : null,
    })
    .select('*')
    .single()
  if (error) return { error: error.message }

  if (input.assignee_ids.length > 0) {
    await supabase.from('event_assignees').insert(
      input.assignee_ids.map(uid => ({
        event_id: event.id,
        user_id: uid,
        approval_status: uid === user.id ? 'accepted' : 'pending',
      }))
    )
  }
  if (input.attendee_ids.length > 0) {
    await supabase.from('event_attendees').insert(
      input.attendee_ids.map(uid => ({ event_id: event.id, user_id: uid, status: 'pending' }))
    )
  }

  const assignees: EventAssignee[] = input.assignee_ids.map(uid => ({
    id: '',
    event_id: event.id,
    user_id: uid,
    approval_status: (uid === user.id ? 'accepted' : 'pending') as EventAssignee['approval_status'],
    approval_updated_at: null,
  }))

  // Assignees (not self) → event_assigned
  if (otherAssignees.length > 0) {
    const creatorName = await getDisplayName(supabase, user.id)
    for (const uid of otherAssignees) {
      await notifyUser(
        uid,
        notificationMessages.eventAssigned(event.title, creatorName, event.start_at),
        'event_assigned',
      )
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
        notificationMessages.groupNewEvent(group?.name ?? '', event.title, creatorName, event.start_at),
        'group_update',
      )
    }
  }

  return { event: { ...event, attendees: [], assignees } }
}

export async function updateEvent(eventId: string, input: EventInput): Promise<EventResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証が必要です' }

  // Fetch existing assignees for diff
  const { data: existing } = await supabase
    .from('event_assignees')
    .select('user_id')
    .eq('event_id', eventId)
  const existingIds = (existing ?? []).map((a: { user_id: string }) => a.user_id)
  const newAssigneeIds = input.assignee_ids.filter(
    id => !existingIds.includes(id) && id !== user.id
  )

  const otherAssignees = input.assignee_ids.filter(id => id !== user.id)
  const { data: event, error } = await supabase
    .from('events')
    .update({
      title: input.title,
      description: input.description,
      location: input.location,
      start_at: input.start_at,
      end_at: input.end_at,
      all_day: input.all_day,
      group_id: input.group_id,
      assigned_to: input.assignee_ids[0] ?? null,
      approval_status: otherAssignees.length > 0 ? 'pending' : 'none',
      approval_updated_at: otherAssignees.length > 0 ? new Date().toISOString() : null,
    })
    .eq('id', eventId)
    .select('*')
    .single()
  if (error) return { error: error.message }

  await supabase.from('event_assignees').delete().eq('event_id', eventId)
  if (input.assignee_ids.length > 0) {
    await supabase.from('event_assignees').insert(
      input.assignee_ids.map(uid => ({
        event_id: eventId,
        user_id: uid,
        approval_status: uid === user.id ? 'accepted' : 'pending',
      }))
    )
  }

  const assignees: EventAssignee[] = input.assignee_ids.map(uid => ({
    id: '',
    event_id: eventId,
    user_id: uid,
    approval_status: (uid === user.id ? 'accepted' : 'pending') as EventAssignee['approval_status'],
    approval_updated_at: null,
  }))

  // Only notify newly added assignees
  if (newAssigneeIds.length > 0) {
    const creatorName = await getDisplayName(supabase, user.id)
    for (const uid of newAssigneeIds) {
      await notifyUser(
        uid,
        notificationMessages.eventAssigned(event.title, creatorName, event.start_at),
        'event_assigned',
      )
    }
  }

  return { event: { ...event, assignees } }
}

export async function respondToEventApproval(
  eventId: string,
  status: 'accepted' | 'rejected',
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証が必要です' }

  const { error } = await supabase
    .from('event_assignees')
    .update({ approval_status: status, approval_updated_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  const { data: event } = await supabase
    .from('events')
    .select('title, created_by, start_at')
    .eq('id', eventId)
    .single()

  if (event?.created_by && event.created_by !== user.id) {
    const responderName = await getDisplayName(supabase, user.id)
    const msg = status === 'accepted'
      ? notificationMessages.eventApproved(event.title, responderName)
      : notificationMessages.eventRejected(event.title, responderName)
    await notifyUser(event.created_by, msg, 'approval_response')
  }

  return {}
}
