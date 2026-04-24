import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/telegram'

// Vercel Cron または pg_cron (pg_net) から呼び出される
// 認証: Authorization: Bearer $CRON_SECRET

type AdminClient = ReturnType<typeof createAdminClient>

type ReminderStats = {
  sent: number
  already_sent: number
  pref_off: number
  no_chat_id: number
  errors: number
  last_error?: string
}

// ─────────────────────────────────────────────
// メインハンドラ
// ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const stats: ReminderStats = { sent: 0, already_sent: 0, pref_off: 0, no_chat_id: 0, errors: 0 }

  try {
    await processEventReminders(admin, now, stats)
    await processTaskReminders(admin, now, stats)
    return NextResponse.json({ success: true, processedAt: now.toISOString(), stats })
  } catch (error) {
    console.error('[Reminders] Fatal error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// ─────────────────────────────────────────────
// 予定リマインダー
// ─────────────────────────────────────────────

async function processEventReminders(admin: AdminClient, now: Date, stats: ReminderStats) {
  // ① 1日前（24時間前 ±5分の窓）
  const oneDayFrom = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const { data: events1d } = await admin
    .from('events')
    .select('id, title, start_at, created_by, assignees:event_assignees(user_id)')
    .gte('start_at', new Date(oneDayFrom.getTime() - 5 * 60 * 1000).toISOString())
    .lte('start_at', new Date(oneDayFrom.getTime() + 5 * 60 * 1000).toISOString())

  for (const event of events1d ?? []) {
    const userIds = collectEventUserIds(event)
    const profileMap = await fetchProfileMap(admin, userIds)
    const msg = `🗓️ 明日の予定: ${event.title}\n開始: ${formatJaDatetime(event.start_at)}`
    for (const uid of userIds) {
      await sendReminderIfNotSent(admin, uid, event.id, 'event', '1day_before', msg, 'event_reminder', profileMap, stats)
    }
  }

  // ② 1時間前（60分前 ±5分の窓）
  const oneHourFrom = new Date(now.getTime() + 60 * 60 * 1000)
  const { data: events1h } = await admin
    .from('events')
    .select('id, title, start_at, created_by, assignees:event_assignees(user_id)')
    .gte('start_at', new Date(oneHourFrom.getTime() - 5 * 60 * 1000).toISOString())
    .lte('start_at', new Date(oneHourFrom.getTime() + 5 * 60 * 1000).toISOString())

  for (const event of events1h ?? []) {
    const userIds = collectEventUserIds(event)
    const profileMap = await fetchProfileMap(admin, userIds)
    const msg = `⏰ 1時間後に予定があります\n${event.title}`
    for (const uid of userIds) {
      await sendReminderIfNotSent(admin, uid, event.id, 'event', '1hour_before', msg, 'event_reminder', profileMap, stats)
    }
  }
}

// ─────────────────────────────────────────────
// タスクリマインダー
//   ① 期限1時間前: 常時実行（5分ごとのcronで拾う）
//   ② 朝9時通知: JST 09:00〜09:04 のみ実行
// ─────────────────────────────────────────────

async function processTaskReminders(admin: AdminClient, now: Date, stats: ReminderStats) {
  // ① 期限1時間前リマインダー（常時実行）
  const oneHourFrom = new Date(now.getTime() + 60 * 60 * 1000)
  const { data: tasks1h } = await admin
    .from('tasks')
    .select('id, title, due_date, created_by, assignees:task_assignees(user_id)')
    .gte('due_date', new Date(oneHourFrom.getTime() - 5 * 60 * 1000).toISOString())
    .lte('due_date', new Date(oneHourFrom.getTime() + 5 * 60 * 1000).toISOString())
    .neq('status', 'done')

  for (const task of tasks1h ?? []) {
    const userIds = collectTaskUserIds(task)
    const profileMap = await fetchProfileMap(admin, userIds)
    const msg = `⏰ 1時間後期限: ${task.title}`
    for (const uid of userIds) {
      await sendReminderIfNotSent(admin, uid, task.id, 'task', '1hour_before_task', msg, 'task_reminder', profileMap, stats)
    }
  }

  // ② 朝9時リマインダー（JST 09:00〜09:04 のみ）
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  if (jst.getUTCHours() !== 9 || jst.getUTCMinutes() >= 5) return

  // JST の 1日の境界を UTC で計算する（JST midnight = UTC 前日 15:00）
  const jstMidnightUTC = new Date(
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 60 * 60 * 1000
  )
  const morningRanges = [
    {
      start: new Date(jstMidnightUTC.getTime() + 24 * 60 * 60 * 1000),
      end:   new Date(jstMidnightUTC.getTime() + 48 * 60 * 60 * 1000),
      reminderType: 'morning_1day' as const,
      icon: '✅', label: '明日期限',
    },
    {
      start: jstMidnightUTC,
      end:   new Date(jstMidnightUTC.getTime() + 24 * 60 * 60 * 1000),
      reminderType: 'morning_today' as const,
      icon: '🔥', label: '今日期限',
    },
  ]

  for (const { start, end, reminderType, icon, label } of morningRanges) {
    const { data: tasks } = await admin
      .from('tasks')
      .select('id, title, due_date, created_by, assignees:task_assignees(user_id)')
      .gte('due_date', start.toISOString())
      .lt('due_date', end.toISOString())
      .neq('status', 'done')

    for (const task of tasks ?? []) {
      const userIds = collectTaskUserIds(task)
      const profileMap = await fetchProfileMap(admin, userIds)
      const msg = `${icon} ${label}: ${task.title}`
      for (const uid of userIds) {
        await sendReminderIfNotSent(admin, uid, task.id, 'task', reminderType, msg, 'task_reminder', profileMap, stats)
      }
    }
  }
}

// ─────────────────────────────────────────────
// 重複防止つき通知送信
// ─────────────────────────────────────────────

type ProfileMap = Map<string, { telegram_chat_id: string; notification_preferences: Record<string, boolean> | null }>

async function sendReminderIfNotSent(
  admin: AdminClient,
  userId: string,
  targetId: string,
  targetType: 'event' | 'task',
  reminderType: string,
  message: string,
  notificationType: 'event_reminder' | 'task_reminder',
  profileMap: ProfileMap,
  stats: ReminderStats,
): Promise<void> {
  const profile = profileMap.get(userId)
  if (!profile?.telegram_chat_id) {
    stats.no_chat_id++
    return
  }

  const prefs = profile.notification_preferences ?? {}
  if (prefs[notificationType] === false) {
    stats.pref_off++
    return
  }

  // 送信済み確認
  const { data: existing } = await admin
    .from('notifications_sent')
    .select('id')
    .eq('user_id', userId)
    .eq('target_id', targetId)
    .eq('target_type', targetType)
    .eq('reminder_type', reminderType)
    .maybeSingle()

  if (existing) {
    stats.already_sent++
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Reminder] ${reminderType} → ${userId}: ${message.slice(0, 40)}...`)
  }

  const result = await sendTelegramMessage(profile.telegram_chat_id, message)

  if (result.ok) {
    await admin.from('notifications_sent').insert({
      user_id: userId,
      target_id: targetId,
      target_type: targetType,
      reminder_type: reminderType,
    })
    stats.sent++
  } else {
    console.error(`[Reminder] Send failed for ${userId}: ${result.error}`)
    stats.errors++
    stats.last_error = result.error
  }
}

// ─────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────

function collectEventUserIds(event: { created_by: string | null; assignees?: { user_id: string }[] | null }): string[] {
  const ids = new Set<string>()
  if (event.created_by) ids.add(event.created_by)
  event.assignees?.forEach(a => ids.add(a.user_id))
  return [...ids]
}

function collectTaskUserIds(task: { created_by: string | null; assignees?: { user_id: string }[] | null }): string[] {
  const ids = new Set<string>()
  if (task.created_by) ids.add(task.created_by)
  task.assignees?.forEach(a => ids.add(a.user_id))
  return [...ids]
}

async function fetchProfileMap(admin: AdminClient, userIds: string[]): Promise<ProfileMap> {
  if (userIds.length === 0) return new Map()
  const { data } = await admin
    .from('profiles')
    .select('id, telegram_chat_id, notification_preferences')
    .in('id', userIds)
    .not('telegram_chat_id', 'is', null)
  const map: ProfileMap = new Map()
  for (const p of data ?? []) {
    if (p.telegram_chat_id) {
      map.set(p.id, {
        telegram_chat_id: p.telegram_chat_id,
        notification_preferences: p.notification_preferences as Record<string, boolean> | null,
      })
    }
  }
  return map
}

function formatJaDatetime(isoString: string): string {
  const d = new Date(isoString)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
