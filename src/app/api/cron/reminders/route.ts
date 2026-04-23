import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { format, addMinutes } from 'date-fns'

// Vercel Cron から呼び出される想定
// vercel.json: { "crons": [{ "path": "/api/cron/reminders", "schedule": "* * * * *" }] }

export async function GET(req: Request) {
  // 本番では Vercel Cron の認証ヘッダーを検証する
  const authHeader = req.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 })

  const now = new Date()
  const results = { events: 0, tasks: 0, errors: 0 }

  // ── 予定リマインダー ───────────────────────────────────────────────────────
  // notify_minutes_before 分後に開始する予定を持つ参加者に通知
  // プロファイルごとに minutes_before が異なるため、15〜60分の窓を取得して絞る
  const windowStart = addMinutes(now, 5)
  const windowEnd = addMinutes(now, 65)

  const { data: upcomingEvents } = await supabase
    .from('events')
    .select('id, title, start_at, location, attendees:event_attendees(user_id)')
    .gte('start_at', windowStart.toISOString())
    .lte('start_at', windowEnd.toISOString())

  if (upcomingEvents) {
    for (const event of upcomingEvents) {
      const attendeeIds = (event.attendees as { user_id: string }[]).map(a => a.user_id)
      if (attendeeIds.length === 0) continue

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, telegram_chat_id, notify_events_enabled, notify_minutes_before')
        .in('id', attendeeIds)
        .eq('notify_events_enabled', true)
        .not('telegram_chat_id', 'is', null)

      if (!profiles) continue

      for (const profile of profiles) {
        const targetTime = addMinutes(now, profile.notify_minutes_before)
        const eventTime = new Date(event.start_at)
        const diff = Math.abs(eventTime.getTime() - targetTime.getTime())
        if (diff > 60 * 1000) continue // 1分以上ずれていればスキップ

        const timeStr = format(eventTime, 'HH:mm')
        const locationStr = event.location ? `\n📍 ${event.location}` : ''
        const text = `⏰ 予定リマインダー\n「${event.title}」まで${profile.notify_minutes_before}分です。\n🕐 ${timeStr}${locationStr}`

        const res = await sendTelegramMessage(token, profile.telegram_chat_id!, text)
        if (res.ok) { results.events++ } else { results.errors++ }
      }
    }
  }

  // ── タスク期限リマインダー（当日のタスクを朝に通知）────────────────────
  const todayStr = format(now, 'yyyy-MM-dd')
  // 朝8時〜8時1分の間のみ実行（1分の cron なら1回のみ通知）
  const isTaskNotifyWindow = now.getHours() === 8 && now.getMinutes() < 2

  if (isTaskNotifyWindow) {
    const { data: todayTasks } = await supabase
      .from('tasks')
      .select('id, title, due_date, assignee_id, priority')
      .gte('due_date', `${todayStr}T00:00:00`)
      .lt('due_date', `${todayStr}T23:59:59`)
      .neq('status', 'done')
      .not('assignee_id', 'is', null)

    if (todayTasks) {
      // 担当者ごとにまとめて送信
      const tasksByUser = new Map<string, typeof todayTasks>()
      for (const task of todayTasks) {
        if (!task.assignee_id) continue
        if (!tasksByUser.has(task.assignee_id)) tasksByUser.set(task.assignee_id, [])
        tasksByUser.get(task.assignee_id)!.push(task)
      }

      for (const [userId, userTasks] of tasksByUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('telegram_chat_id, notify_tasks_enabled')
          .eq('id', userId)
          .single()

        if (!profile?.telegram_chat_id || !profile.notify_tasks_enabled) continue

        const taskLines = userTasks.map(t => `• ${t.title}`).join('\n')
        const text = `📋 本日期限のタスク（${userTasks.length}件）\n${taskLines}`

        const res = await sendTelegramMessage(token, profile.telegram_chat_id, text)
        if (res.ok) { results.tasks++ } else { results.errors++ }
      }
    }
  }

  return NextResponse.json({ ok: true, ...results })
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  return res.json() as Promise<{ ok: boolean; description?: string }>
}
