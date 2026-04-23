import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const body = await req.json() as { chat_id: string; text: string }
  if (!body.chat_id || !body.text) {
    return NextResponse.json({ error: 'chat_id と text は必須です' }, { status: 400 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })
  }

  const result = await sendTelegramMessage(token, body.chat_id, body.text)

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
