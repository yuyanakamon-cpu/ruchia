'use client'

import { useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Clock, MapPin, Users } from 'lucide-react'
import { toast } from 'sonner'
import { respondToEventAttendance } from '@/lib/actions/events'

export type PendingInvite = {
  attendeeId: string
  eventId: string
  title: string
  start_at: string
  end_at: string
  location: string | null
  creatorName: string
  groupName: string | null
}

export default function PendingInvitations({ initialInvites }: { initialInvites: PendingInvite[] }) {
  const [invites, setInvites] = useState(initialInvites)
  const [responding, setResponding] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (invites.length === 0) return null

  function respond(attendeeId: string, eventId: string, status: 'accepted' | 'declined') {
    setResponding(attendeeId)
    startTransition(async () => {
      const result = await respondToEventAttendance(eventId, attendeeId, status)
      setResponding(null)
      if (result.error) {
        toast.error('更新に失敗しました')
        return
      }
      setInvites(prev => prev.filter(i => i.attendeeId !== attendeeId))
      toast.success(status === 'accepted' ? '参加を回答しました' : '不参加を回答しました')
    })
  }

  return (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#232323', border: '1px solid rgba(184,115,51,0.4)' }}>
      <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: '1px solid #2a2a2a', background: 'rgba(184,115,51,0.06)' }}>
        <span className="text-base">📨</span>
        <h2 className="font-semibold text-sm" style={{ color: '#b87333' }}>
          参加依頼 <span className="font-bold text-base">{invites.length}</span> 件
        </h2>
      </div>
      <div>
        {invites.map(invite => {
          const isLoading = responding === invite.attendeeId
          return (
            <div key={invite.attendeeId} className="px-5 py-4" style={{ borderBottom: '1px solid #2a2a2a' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm" style={{ color: '#f0f0f0' }}>{invite.title}</p>
                  <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#888' }}>
                    <Clock size={11} />
                    {format(parseISO(invite.start_at), 'M月d日（E） HH:mm', { locale: ja })}
                    {' – '}
                    {format(parseISO(invite.end_at), 'HH:mm')}
                  </p>
                  {invite.location && (
                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#555' }}>
                      <MapPin size={11} /> {invite.location}
                    </p>
                  )}
                  {invite.groupName && (
                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#555' }}>
                      <Users size={11} /> {invite.groupName}
                    </p>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: '#555' }}>作成者: {invite.creatorName}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    disabled={isLoading || !!responding}
                    onClick={() => respond(invite.attendeeId, invite.eventId, 'accepted')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ background: '#b87333', color: '#1a1a1a' }}
                  >
                    {isLoading ? '...' : '参加する'}
                  </button>
                  <button
                    disabled={isLoading || !!responding}
                    onClick={() => respond(invite.attendeeId, invite.eventId, 'declined')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ border: '1px solid #444', color: '#888', background: 'transparent' }}
                  >
                    {isLoading ? '...' : '参加しない'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
