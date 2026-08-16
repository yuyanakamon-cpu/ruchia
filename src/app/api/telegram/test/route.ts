import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pushLineGroup } from '@/lib/line'

// 通知テスト（LINE グループへ送信）
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const result = await pushLineGroup(
    '🎉 Ruchiaからのテスト通知です。LINEグループで正常に受信できました！',
  )

  if (!result.ok) {
    return NextResponse.json({ error: 'LINE への送信に失敗しました', detail: result.error }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
