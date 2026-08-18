'use client'

import { useEffect, useState } from 'react'

function urlB64ToUint8Array(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function EnableNotifications() {
  const [state, setState] = useState<'idle' | 'unsupported' | 'on' | 'working' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setState('unsupported'); return }
    if (Notification.permission === 'granted') {
      navigator.serviceWorker.getRegistration().then(r => r?.pushManager.getSubscription()).then(s => { if (s) setState('on') })
    }
  }, [])

  async function enable() {
    try {
      setState('working')
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC
      if (!vapid) { setState('error'); setMsg('サーバー設定(VAPID)が未設定です'); return }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState('error'); setMsg('通知が許可されませんでした'); return }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapid),
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub),
      })
      if (!res.ok) { setState('error'); setMsg('登録に失敗しました'); return }
      setState('on')
    } catch (e) {
      setState('error'); setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  if (state === 'unsupported') {
    return <div style={{ fontSize: 12, color: '#888' }}>※ iPhoneは「ホーム画面に追加」してから開くと通知を有効化できます（iOS 16.4以降）</div>
  }
  if (state === 'on') {
    return <div style={{ fontSize: 13, color: '#25d366' }}>🔔 この端末でプッシュ通知が有効です</div>
  }
  return (
    <div>
      <button onClick={enable} disabled={state === 'working'}
        style={{ background: '#b87333', color: '#1a1a1a', border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: state === 'working' ? 0.5 : 1 }}>
        {state === 'working' ? '設定中…' : '🔔 この端末で通知を受け取る'}
      </button>
      {msg && <div style={{ fontSize: 12, color: '#cc6666', marginTop: 6 }}>{msg}</div>}
    </div>
  )
}
