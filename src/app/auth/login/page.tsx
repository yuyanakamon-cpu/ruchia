'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    console.log('--- ログイン試行 ---')
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 30) + '...')
    console.log('Email:', email)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      console.error('❌ ログインエラー:', {
        message: error.message,
        status: error.status,
        code: (error as any).code,
        details: JSON.stringify(error),
      })
      toast.error('ログイン失敗: ' + error.message)
      setErrorMsg(error.message)
    } else {
      console.log('✅ ログイン成功:', data.user?.email)
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#1a1a1a' }}>
      <div className="max-w-md w-full rounded-2xl p-8" style={{ background: '#232323', border: '1px solid #2a2a2a' }}>
        <div className="text-center mb-8">
          <h1 style={{ fontWeight: 200, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#f0f0f0', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            RUCHIA
          </h1>
          <p style={{ color: '#888', fontSize: '0.875rem' }}>社内スケジュール＆タスク管理</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#b8b8b8' }}>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded outline-none transition-colors"
              style={{ background: '#232323', border: '1px solid #3a3a3a', color: '#f0f0f0' }}
              onFocus={e => (e.target.style.borderColor = '#b87333')}
              onBlur={e => (e.target.style.borderColor = '#3a3a3a')}
              placeholder="name@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#b8b8b8' }}>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded outline-none transition-colors"
              style={{ background: '#232323', border: '1px solid #3a3a3a', color: '#f0f0f0' }}
              onFocus={e => (e.target.style.borderColor = '#b87333')}
              onBlur={e => (e.target.style.borderColor = '#3a3a3a')}
              placeholder="••••••••"
              required
            />
          </div>
          {errorMsg && (
            <div className="text-sm px-4 py-3 rounded" style={{ background: 'rgba(204,102,102,0.15)', border: '1px solid rgba(204,102,102,0.3)', color: '#cc6666' }}>
              ❌ {errorMsg}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-sm font-semibold uppercase tracking-[0.05em] transition-opacity disabled:opacity-50"
            style={{ background: '#b87333', color: '#1a1a1a', borderRadius: '2px' }}
          >
            {loading ? 'ログイン中...' : 'ログインする'}
          </button>
        </form>
      </div>
    </div>
  )
}
