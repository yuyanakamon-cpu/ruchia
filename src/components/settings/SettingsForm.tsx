'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Profile, NotificationPreferences } from '@/types'

const MINUTES_OPTIONS = [
  { value: '5', label: '5分前' },
  { value: '10', label: '10分前' },
  { value: '15', label: '15分前' },
  { value: '30', label: '30分前' },
  { value: '60', label: '1時間前' },
]

const DEFAULT_PREFS: NotificationPreferences = {
  task_assigned: true,
  event_assigned: true,
  group_update: true,
  approval_response: true,
  event_reminder: true,
  task_reminder: true,
}

const PREF_LABELS: Record<keyof NotificationPreferences, string> = {
  task_assigned:     'タスクをアサインされたとき',
  event_assigned:    '予定にアサインされたとき',
  group_update:      'グループに変更があったとき',
  approval_response: '承認リクエストへの返答があったとき',
  event_reminder:    '予定のリマインダー',
  task_reminder:     'タスク期限のリマインダー',
}

export default function SettingsForm({
  profile,
  userId,
}: {
  profile: Profile | null
  userId: string
}) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [telegramChatId, setTelegramChatId] = useState(profile?.telegram_chat_id ?? '')
  const [minutesBefore, setMinutesBefore] = useState(String(profile?.notify_minutes_before ?? 15))
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    profile?.notification_preferences ?? DEFAULT_PREFS
  )
  const [helpOpen, setHelpOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const supabase = createClient()

  function togglePref(key: keyof NotificationPreferences) {
    setPrefs(p => ({ ...p, [key]: !p[key] }))
  }

  async function save() {
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        display_name: displayName,
        telegram_chat_id: telegramChatId || null,
        notify_events_enabled: prefs.event_reminder,
        notify_tasks_enabled: prefs.task_reminder,
        notify_minutes_before: Number(minutesBefore),
        notification_preferences: prefs,
      })
    if (error) {
      console.error('[SettingsForm] save error:', error)
      toast.error('保存に失敗しました')
    } else {
      toast.success('設定を保存しました')
    }
    setSaving(false)
  }

  async function sendTestNotification() {
    if (!telegramChatId) return
    setTesting(true)
    try {
      const res = await fetch('/api/telegram/test', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) toast.error(json.error ?? 'テスト通知の送信に失敗しました')
      else toast.success('テスト通知を送信しました。Telegramを確認してください。')
    } catch {
      toast.error('通信エラーが発生しました')
    }
    setTesting(false)
  }

  return (
    <div className="space-y-6">
      {/* プロフィール */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">プロフィール</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>表示名</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Telegram通知 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Telegram通知</CardTitle>
          <CardDescription>
            TelegramでRuchiaからの通知を受け取れます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Chat ID */}
          <div className="space-y-1.5">
            <Label>Telegram Chat ID</Label>
            <div className="flex gap-2">
              <Input
                value={telegramChatId}
                onChange={e => setTelegramChatId(e.target.value)}
                placeholder="例: 123456789"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={sendTestNotification}
                disabled={testing || !telegramChatId}
                className="shrink-0"
              >
                {testing ? '送信中...' : 'テスト通知'}
              </Button>
            </div>

            {/* 取得方法アコーディオン */}
            <button
              type="button"
              onClick={() => setHelpOpen(p => !p)}
              className="flex items-center gap-1 text-xs mt-1"
              style={{ color: '#b87333' }}
            >
              <span>{helpOpen ? '▲' : '▽'}</span>
              <span>Chat IDの取得方法</span>
            </button>
            {helpOpen && (
              <div className="rounded-md p-3 text-xs space-y-1.5" style={{ background: '#1e1e1e', color: '#aaa' }}>
                <p className="font-medium" style={{ color: '#ccc' }}>取得手順</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>TelegramアプリでBot「<span style={{ color: '#b87333' }}>@userinfobot</span>」を検索して開く</li>
                  <li>「/start」を送信する</li>
                  <li>返信メッセージ内の <code style={{ background: '#2a2a2a', padding: '0 3px', borderRadius: 3 }}>Id:</code> の数字をコピー</li>
                  <li>上のフィールドに貼り付けて「設定を保存」</li>
                </ol>
              </div>
            )}
          </div>

          {/* 通知種別トグル */}
          <div className="space-y-1">
            <Label className="text-sm">通知の種類</Label>
            <div className="space-y-3 pt-2">
              {(Object.keys(PREF_LABELS) as (keyof NotificationPreferences)[]).map(key => (
                <Toggle
                  key={key}
                  label={PREF_LABELS[key]}
                  enabled={prefs[key]}
                  onToggle={() => togglePref(key)}
                />
              ))}
            </div>
          </div>

          {/* 何分前 */}
          <div className="space-y-1.5">
            <Label>リマインダーのタイミング</Label>
            <Select value={minutesBefore} onValueChange={v => { if (v) setMinutesBefore(v) }} items={MINUTES_OPTIONS}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MINUTES_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={save}
        disabled={saving}
        className="w-full"
      >
        {saving ? '保存中...' : '設定を保存'}
      </Button>
    </div>
  )
}

function Toggle({
  label,
  enabled,
  onToggle,
}: {
  label: string
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm">{label}</p>
      <button
        type="button"
        onClick={onToggle}
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
        style={{ background: enabled ? '#b87333' : '#2a2a2a' }}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </div>
  )
}
