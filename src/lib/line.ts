// LINE Messaging API — group push notifications.
// Migrated from Telegram. All app notifications are delivered to a single
// configured LINE group (LINE_GROUP_ID) via the Messaging API push endpoint.

export type NotificationType =
  | 'task_assigned'
  | 'event_assigned'
  | 'group_update'
  | 'approval_response'
  | 'event_reminder'
  | 'task_reminder'

export interface SendResult {
  ok: boolean
  error?: string
}

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push'

/** Push a plain-text message to the configured LINE group. */
export async function pushLineGroup(text: string): Promise<SendResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const groupId = process.env.LINE_GROUP_ID
  if (!token) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN not set' }
  if (!groupId) return { ok: false, error: 'LINE_GROUP_ID not set' }

  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to: groupId, messages: [{ type: 'text', text }] }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) return { ok: true }
    const body = await res.text()
    return { ok: false, error: `LINE ${res.status}: ${body.slice(0, 200)}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
