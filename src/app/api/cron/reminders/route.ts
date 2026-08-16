import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pushLineGroup } from '@/lib/line'

// Vercel Cron または pg_cron (pg_net) から呼び出される
// 認証: Authorization: Bearer $CRON_SECRET
// 通知は LINE グループへ「対象ごとに1回だけ」送る（メンバー人数によらず重複なし）。

type AdminClient = ReturnType<typeof createAdminClient>

type ReminderStats = {
  sent: number
  already_sent: number
  no_recipients: number
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
  const stats: ReminderStats = { sent: 0, already_sent: 0, no_recipients: 0, errors: 0 }

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
    const marker = markerUserId(collectEventUserIds(event))
    const msg = `🗓️ 明日の予定: ${event.title}\n開始: ${formatJaDatetime(event.start_at)}`
    await sendGroupReminderOnce(admin, event.id, 'event', '1day_before', msg, marker, stats)
  }

  // ② 1時間前（60分前 ±5分の窓）
  const oneHourFrom = new Date(now.getTime() + 60 * 60 * 1000)
  const { data: events1h } = await admin
    .from('events')
    .select('id, title, start_at, created_by, assignees:event_assignees(user_id)')
    .gte('start_at', new Date(oneHourFrom.getTime() - 5 * 60 * 1000).toISOString())
    .lte('start_at', new Date(oneHourFrom.getTime() + 5 * 60 * 1000).toISOString())

  for (const event of events1h ?? []) {
    const marker = markerUserId(collectEventUserIds(event))
    const msg = `⏰ 1時間後に予定があります\n${event.title}`
    await sendGroupReminderOnce(admin, event.id, 'event', '1hour_before', msg, marker, stats)
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
    const marker = markerUserId(collectTaskUserIds(task))
    const msg = `⏰ 1時間後期限: ${task.title}`
    await sendGroupReminderOnce(admin, task.id, 'task', '1hour_before_task', msg, marker, stats)
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
      const marker = markerUserId(collectTaskUserIds(task))
      const msg = `${icon} ${label}: ${task.title}`
      await sendGroupReminderOnce(admin, task.id, 'task', reminderType, msg, marker, stats)
    }
  }
}

// ─────────────────────────────────────────────
// 重複防止つきグループ通知（対象ごとに1回）
// ─────────────────────────────────────────────

async function sendGroupReminderOnce(
  admin: AdminClient,
  targetId: string,
  targetType: 'event' | 'task',
  reminderType: string,
  message: string,
  marker: string | null,
  stats: ReminderStats,
): Promise<void> {
  // 対象に関係者が誰もいなければスキップ（notifications_sent の user_id 用マーカーが無い）
  if (!marker) {
    stats.no_recipients++
    return
  }

  // 送信済み確認（対象単位＝メンバーによらず1回）
  const { data: existing } = await admin
    .from('notifications_sent')
    .select('id')
    .eq('target_id', targetId)
    .eq('target_type', targetType)
    .eq('reminder_type', reminderType)
    .maybeSingle()

  if (existing) {
    stats.already_sent++
    return
  }

  const result = await pushLineGroup(message)

  if (result.ok) {
    await admin.from('notifications_sent').insert({
      user_id: marker,
      target_id: targetId,
      target_type: targetType,
      reminder_type: reminderType,
    })
    stats.sent++
  } else {
    console.error(`[Reminder] group send failed for ${targetType}:${targetId}: ${result.error}`)
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

/** notifications_sent の user_id 用マーカー（対象の関係者を1名）。いなければ null。 */
function markerUserId(userIds: string[]): string | null {
  return userIds.length > 0 ? userIds[0] : null
}

function formatJaDatetime(isoString: string): string {
  const d = new Date(isoString)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
