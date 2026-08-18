import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } }

// ログイン中ユーザーの Web Push 購読を保存（profiles.notification_preferences.push へ追記）
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const sub = (await req.json()) as Sub
  if (!sub?.endpoint) return NextResponse.json({ error: 'invalid subscription' }, { status: 400 })

  const { data: prof } = await supabase
    .from('profiles').select('notification_preferences').eq('id', user.id).single()
  const prefs = (prof?.notification_preferences ?? {}) as { push?: Sub[] }
  const list = (prefs.push ?? []).filter(s => s.endpoint !== sub.endpoint)
  list.push(sub)

  const { error } = await supabase
    .from('profiles')
    .update({ notification_preferences: { ...prefs, push: list } })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, devices: list.length })
}
