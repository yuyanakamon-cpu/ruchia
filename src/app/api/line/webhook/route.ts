import { NextResponse } from 'next/server'
import crypto from 'crypto'

export const runtime = 'nodejs'

// LINE Messaging API webhook.
// Verifies the signature and, during setup, captures the LINE group id:
// when the bot is added to a group and someone posts, we reply with the
// groupId so it can be copied into the LINE_GROUP_ID env var.
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
    const src = (ev.source ?? {}) as { type?: string; groupId?: string }
    const replyToken = ev.replyToken as string | undefined
    if (src.type === 'group' && src.groupId) {
      console.log(`[LINE webhook] groupId=${src.groupId}`)
      // Setup helper: echo the groupId into the group until one is configured.
      if (replyToken && token && !process.env.LINE_GROUP_ID) {
        await fetch('https://api.line.me/v2/bot/message/reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            replyToken,
            messages: [
              {
                type: 'text',
                text: `✅ このグループを通知先に設定できます。\nグループID:\n${src.groupId}`,
              },
            ],
          }),
        }).catch(() => {})
      }
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
