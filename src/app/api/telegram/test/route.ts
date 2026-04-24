import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegramMessage } from '@/lib/telegram'

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

  const result = await sendTelegramMessage(
    profile.telegram_chat_id,
    '🎉 Ruchiaからのテスト通知です。正常に受信できました！',
  )

  if (!result.ok) {
    return NextResponse.json({ error: 'Telegram への送信に失敗しました', detail: result.error }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
