const CONFIG = {
  pending:  { bg: 'rgba(212,160,85,0.15)',   color: '#d4a055', label: '未回答' },
  accepted: { bg: 'rgba(111,176,127,0.15)',  color: '#6fb07f', label: '承認済' },
  rejected: { bg: 'rgba(198,102,102,0.15)',  color: '#c66',    label: '拒否'   },
} as const

type Status = 'none' | 'pending' | 'accepted' | 'rejected'

export default function ApprovalStatusBadge({ status }: { status: Status }) {
  if (status === 'none' || !CONFIG[status]) return null
  const { bg, color, label } = CONFIG[status]
  return (
    <span
      style={{
        background: bg,
        color,
        padding: '3px 10px',
        fontSize: '10px',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        borderRadius: '2px',
        display: 'inline-block',
        lineHeight: '1.4',
      }}
    >
      {label}
    </span>
  )
}
