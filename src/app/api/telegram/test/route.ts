import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', user.id)
    .single()

  if (!profile?.telegram_chat_id) {
    return NextResponse.json({ error: 'Telegram Chat ID が設定されていません' }, { status: 400 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })
  }

  const result = await sendTelegramMessage(token, profile.telegram_chat_id, '🎉 ルチアからのテスト通知です。正常に受信できました！')

  if (!result.ok) {
    return NextResponse.json({ error: 'Telegram への送信に失敗しました', detail: result.description }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  return res.json() as Promise<{ ok: boolean; description?: string }>
}
