'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Profile } from '@/types'

const MINUTES_OPTIONS = [
  { value: '5', label: '5分前' },
  { value: '10', label: '10分前' },
  { value: '15', label: '15分前' },
  { value: '30', label: '30分前' },
  { value: '60', label: '1時間前' },
]

export default function SettingsForm({ profile }: { profile: Profile | null }) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [telegramChatId, setTelegramChatId] = useState(profile?.telegram_chat_id ?? '')
  const [notifyEvents, setNotifyEvents] = useState(profile?.notify_events_enabled ?? true)
  const [notifyTasks, setNotifyTasks] = useState(profile?.notify_tasks_enabled ?? true)
  const [minutesBefore, setMinutesBefore] = useState(String(profile?.notify_minutes_before ?? 15))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const supabase = createClient()

  async function save() {
    if (!profile) {
      toast.error('プロフィール情報を読み込めませんでした。ページをリロードしてください。')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        telegram_chat_id: telegramChatId || null,
        notify_events_enabled: notifyEvents,
        notify_tasks_enabled: notifyTasks,
        notify_minutes_before: Number(minutesBefore),
      })
      .eq('id', profile.id)
    if (error) toast.error('保存に失敗しました')
    else toast.success('設定を保存しました')
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
            Telegramでタスクや予定のリマインダー通知を受け取れます。
            BotからChat IDを取得して入力してください。
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
            <p className="text-xs text-gray-400">
              取得方法: @userinfobot に「/start」を送信してIDを確認
            </p>
          </div>

          {/* 通知タイプ */}
          <div className="space-y-3">
            <Toggle
              label="予定のリマインダーを受け取る"
              enabled={notifyEvents}
              onToggle={() => setNotifyEvents(p => !p)}
            />
            <Toggle
              label="タスクの期限リマインダーを受け取る"
              enabled={notifyTasks}
              onToggle={() => setNotifyTasks(p => !p)}
            />
          </div>

          {/* 何分前 */}
          <div className="space-y-1.5">
            <Label>通知タイミング</Label>
            <Select value={minutesBefore} onValueChange={v => { if (v) setMinutesBefore(v) }}>
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
      <p className="text-sm font-medium">{label}</p>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? 'bg-black' : 'bg-gray-200'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </div>
  )
}
