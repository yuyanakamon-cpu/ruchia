import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pushLineGroup } from '@/lib/line'

// 任意テキストを LINE グループへ送信
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const body = await req.json() as { text?: string }
  if (!body.text) {
    return NextResponse.json({ error: 'text は必須です' }, { status: 400 })
  }

  const result = await pushLineGroup(body.text)

  if (!result.ok) {
    return NextResponse.json({ error: 'LINE への送信に失敗しました', detail: result.error }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
