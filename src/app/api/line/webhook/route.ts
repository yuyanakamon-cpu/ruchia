import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

async function reply(token: string, replyToken: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  }).catch(() => {})
}

// LINE Messaging API webhook.
// 1) セットアップ時: グループIDを返信（LINE_GROUP_ID 未設定のとき）
// 2) 連携: グループで「連携 <表示名>」と送ると、その送信者の LINE userId を
//    該当プロフィールの telegram_chat_id（LINE userId 置き場に再利用）へ保存。
//    以降その担当者は@メンションで個別通知される。
export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''
  const secret = process.env.LINE_CHANNEL_SECRET ?? ''
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''

  if (!secret) {
    console.error('[LINE webhook] LINE_CHANNEL_SECRET not set')
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64')
  if (expected !== signature) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let data: { events?: Array<Record<string, unknown>> }
  try {
    data = JSON.parse(body)
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  for (const ev of data.events ?? []) {
    const src = (ev.source ?? {}) as { type?: string; groupId?: string; userId?: string }
    const replyToken = ev.replyToken as string | undefined

    if (src.type !== 'group' || !src.groupId) continue

    // (1) グループID未設定なら返信して設定を促す
    if (replyToken && token && !process.env.LINE_GROUP_ID) {
      await reply(token, replyToken, `✅ このグループを通知先に設定できます。\nグループID:\n${src.groupId}`)
      continue
    }

    // (2) 連携コマンド
    const msg = (ev.message ?? {}) as { type?: string; text?: string }
    if (ev.type === 'message' && msg.type === 'text' && src.userId && replyToken && token) {
      const m = (msg.text ?? '').trim().match(/^連携[\s　]+(.+)$/)
      if (m) {
        const name = m[1].trim()
        try {
          const admin = createAdminClient()
          const { data: prof } = await admin
            .from('profiles')
            .select('id, display_name')
            .eq('display_name', name)
            .maybeSingle()
          if (!prof) {
            await reply(token, replyToken, `⚠️ 「${name}」という名前の担当者が見つかりません。表示名を正確に入力してください。`)
          } else {
            await admin.from('profiles').update({ telegram_chat_id: src.userId }).eq('id', prof.id)
            await reply(token, replyToken, `✅ ${prof.display_name} さんを通知の宛先に連携しました。今後この人宛のタスクは@メンションで届きます。`)
          }
        } catch (e) {
          console.error('[LINE webhook] link error:', e)
          await reply(token, replyToken, '⚠️ 連携に失敗しました。少し待って再度お試しください。')
        }
      }
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
