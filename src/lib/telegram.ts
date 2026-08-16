// Notifications migrated from Telegram to a LINE group.
// The exported names are kept so existing call sites don't need to change;
// every message is delivered once to the configured LINE group.
// See src/lib/line.ts for the transport.
import { pushLineGroup, type NotificationType, type SendResult } from '@/lib/line'

export type { NotificationType, SendResult }

/** Delivered to the LINE group. userId/type are ignored (group is shared). */
export async function notifyUser(
  _userId: string,
  text: string,
  _type: NotificationType,
): Promise<SendResult> {
  return pushLineGroup(text)
}

/** One message to the LINE group for the whole recipient set. */
export async function notifyUsers(
  _userIds: string[],
  text: string,
  _type: NotificationType,
  _options?: { excludeUserIds?: string[] },
): Promise<void> {
  await pushLineGroup(text)
}

/**
 * Back-compat wrapper for direct callers (cron reminders / test route).
 * The first argument (previously a Telegram chat id) is ignored — the
 * message goes to the LINE group.
 */
export async function sendTelegramMessage(
  _target: string,
  text: string,
): Promise<SendResult> {
  return pushLineGroup(text)
}
