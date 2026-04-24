import type { GroupRole } from '@/types/group'

export default function RoleBadge({ role }: { role: GroupRole }) {
  if (role === 'admin') {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded tracking-widest shrink-0"
        style={{ background: 'rgba(184,115,51,0.15)', color: '#b87333' }}>
        ADMIN
      </span>
    )
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded tracking-widest shrink-0"
      style={{ background: 'rgba(136,136,136,0.15)', color: '#888' }}>
      MEMBER
    </span>
  )
}
