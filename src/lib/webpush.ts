import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

let configured = false
function ensure() {
  if (configured) return true
  const pub = process.env.VAPID_PUBLIC
  const priv = process.env.VAPID_PRIVATE
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@ruchia.app', pub, priv)
  configured = true
  return true
}

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } }
type Payload = { title: string; body?: string; url?: string; tag?: string }

// 指定ユーザー全員の登録デバイスへ Web Push を送る。
// 購読情報は profiles.notification_preferences.push（配列）に保存している。
export async function sendPushToUsers(userIds: string[], payload: Payload): Promise<void> {
  if (!ensure() || userIds.length === 0) return
  const admin = createAdminClient()
  const { data: profs } = await admin
    .from('profiles')
    .select('id, notification_preferences')
    .in('id', userIds)

  const body = JSON.stringify(payload)
  for (const p of profs ?? []) {
    const prefs = (p.notification_preferences ?? {}) as { push?: Sub[] }
    const subs = prefs.push ?? []
    if (!subs.length) continue
    const alive: Sub[] = []
    for (const s of subs) {
      try {
        await webpush.sendNotification(s as webpush.PushSubscription, body)
        alive.push(s)
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) continue // 失効した購読は破棄
        alive.push(s) // 一時的な失敗は残す
      }
    }
    if (alive.length !== subs.length) {
      await admin.from('profiles')
        .update({ notification_preferences: { ...prefs, push: alive } })
        .eq('id', p.id)
    }
  }
}
