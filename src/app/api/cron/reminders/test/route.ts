import { NextRequest, NextResponse } from 'next/server'

// 開発環境専用の手動テスト用エンドポイント
// 本番では 403 を返す

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const url = new URL(request.url)
  const baseUrl = `${url.protocol}//${url.host}`

  const res = await fetch(`${baseUrl}/api/cron/reminders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}`,
      'Content-Type': 'application/json',
    },
  })

  const json = await res.json()
  return NextResponse.json(json, { status: res.status })
}
