import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recipient_phone, message, trigger_type, trigger_id } = await req.json()
  if (!recipient_phone || !message) {
    return NextResponse.json({ error: 'recipient_phone and message are required' }, { status: 400 })
  }

  const signalApiUrl = process.env.SIGNAL_CLI_API_URL
  const senderPhone = process.env.SIGNAL_SENDER_PHONE

  if (!signalApiUrl || !senderPhone) {
    await supabase.from('signal_notifications').insert({
      recipient_phone, message, trigger_type, trigger_id,
      status: 'failed', error_message: 'Signal API not configured',
    })
    return NextResponse.json({ error: 'Signal API not configured' }, { status: 503 })
  }

  try {
    const res = await fetch(`${signalApiUrl}/v2/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: senderPhone, recipients: [recipient_phone], message }),
    })

    if (!res.ok) throw new Error(`Signal API error: ${res.status}`)

    await supabase.from('signal_notifications').insert({
      recipient_phone, message, trigger_type, trigger_id,
      status: 'sent', sent_at: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    await supabase.from('signal_notifications').insert({
      recipient_phone, message, trigger_type, trigger_id,
      status: 'failed', error_message: err.message,
    })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
