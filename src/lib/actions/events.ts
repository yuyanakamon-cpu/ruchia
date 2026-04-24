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
      approval_status: 'none',
    })
    .select('*')
    .single()
  if (error) return { error: error.message }

  // 参加依頼メンバーを追加
  if (input.attendee_ids.length > 0) {
    await supabase.from('event_attendees').insert(
      input.attendee_ids.map(uid => ({ event_id: event.id, user_id: uid, status: 'pending' }))
    )
  }

  const creatorName = await getDisplayName(supabase, user.id)

  // グループメンバー全員（自分以外）に通知
  if (input.group_id) {
    const [{ data: members }, { data: group }] = await Promise.all([
      supabase.from('group_members').select('user_id').eq('group_id', input.group_id),
      supabase.from('groups').select('name').eq('id', input.group_id).single(),
    ])
    const groupMemberIds = (members ?? [])
      .map((m: { user_id: string }) => m.user_id)
      .filter((id: string) => id !== user.id)

    if (groupMemberIds.length > 0) {
      await notifyUsers(
        groupMemberIds,
        notificationMessages.groupNewEvent(group?.name ?? '', event.title, creatorName, event.start_at),
        'group_update',
      )
    }
  }

  // 参加依頼メンバー（自分以外）に通知
  const otherAttendees = input.attendee_ids.filter(id => id !== user.id)
  if (otherAttendees.length > 0) {
    for (const uid of otherAttendees) {
      await notifyUser(
        uid,
        notificationMessages.attendeeInvite(event.title, creatorName, event.start_at),
        'event_assigned',
      )
    }
  }

  return { event: { ...event, attendees: [], assignees: [] } }
}

export async function updateEvent(eventId: string, input: EventInput): Promise<EventResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証が必要です' }

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
      approval_status: 'none',
    })
    .eq('id', eventId)
    .select('*')
    .single()
  if (error) return { error: error.message }

  return { event: { ...event, assignees: [] } }
}

export async function respondToEventAttendance(
  eventId: string,
  attendeeId: string,
  status: 'accepted' | 'declined',
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証が必要です' }

  const { error } = await supabase
    .from('event_attendees')
    .update({ status })
    .eq('id', attendeeId)
  if (error) return { error: error.message }

  const { data: event } = await supabase
    .from('events')
    .select('title, created_by, start_at')
    .eq('id', eventId)
    .single()

  if (event?.created_by && event.created_by !== user.id) {
    const responderName = await getDisplayName(supabase, user.id)
    const msg = status === 'accepted'
      ? notificationMessages.attendeeAccepted(event.title, responderName)
      : notificationMessages.attendeeDeclined(event.title, responderName)
    await notifyUser(event.created_by, msg, 'approval_response')
  }

  return {}
}
