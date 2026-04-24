export type GroupRole = 'admin' | 'member'
export type ApprovalStatus = 'none' | 'pending' | 'accepted' | 'rejected'

export interface Group {
  id: string
  name: string
  description: string | null
  created_by: string
  invite_code: string
  created_at: string
  updated_at: string
  members?: GroupMember[]
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  role: GroupRole
  joined_at: string
  profile?: { id: string; display_name: string | null }
}
