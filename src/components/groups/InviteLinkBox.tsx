'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export default function InviteLinkBox({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/groups/join/${inviteCode}`

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl p-4" style={{ background: '#1a1a1a', border: '1px solid #3a3a3a' }}>
      <p className="text-xs uppercase tracking-wide font-medium mb-2" style={{ color: '#888' }}>
        招待リンク
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-sm truncate" style={{ color: '#b87333' }}>
          {url}
        </code>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 min-h-[36px]"
          style={{
            background: copied ? 'rgba(184,115,51,0.25)' : 'rgba(184,115,51,0.15)',
            color: '#b87333',
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'コピー済' : 'コピー'}
        </button>
      </div>
    </div>
  )
}
