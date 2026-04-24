import { createClient } from '@/lib/supabase/server'

export type NotificationType =
  | 'task_assigned'
  | 'event_assigned'
  | 'group_update'
  | 'approval_response'
  | 'event_reminder'
  | 'task_reminder'

interface SendResult {
  ok: boolean
  error?: string
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(10_000),
      },
    )
    const json = (await res.json()) as { ok: boolean; description?: string }
    return json.ok ? { ok: true } : { ok: false, error: json.description }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function notifyUser(
  userId: string,
  text: string,
  type: NotificationType,
): Promise<SendResult> {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('telegram_chat_id, notification_preferences')
    .eq('id', userId)
    .single()

  if (!profile?.telegram_chat_id) return { ok: false, error: 'no chat_id' }

  const prefs = (profile.notification_preferences ?? {}) as Record<string, boolean>
  if (prefs[type] === false) return { ok: false, error: 'disabled by user' }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Notification] type=${type} to=${userId} msg="${text.slice(0, 40)}..."`)
  }

  return sendTelegramMessage(profile.telegram_chat_id, text)
}

export async function notifyUsers(
  userIds: string[],
  text: string,
  type: NotificationType,
  options?: { excludeUserIds?: string[] },
): Promise<void> {
  const ids = options?.excludeUserIds
    ? userIds.filter(id => !options.excludeUserIds!.includes(id))
    : userIds
  await Promise.allSettled(ids.map(id => notifyUser(id, text, type)))
}
