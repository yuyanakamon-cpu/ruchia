export type UserRole = 'admin' | 'member'
export type AttendeeStatus = 'pending' | 'accepted' | 'declined'
export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface NotificationPreferences {
  task_assigned: boolean
  event_assigned: boolean
  group_update: boolean
  approval_response: boolean
  event_reminder: boolean
  task_reminder: boolean
}

export interface Profile {
  id: string
  display_name: string
  signal_number: string | null
  signal_notifications_enabled: boolean
  telegram_chat_id: string | null
  notify_events_enabled: boolean
  notify_tasks_enabled: boolean
  notify_minutes_before: number
  notification_preferences: NotificationPreferences | null
  role: UserRole
  created_at: string
}

export interface EventAssignee {
  id: string
  event_id: string
  user_id: string
  approval_status: 'pending' | 'accepted' | 'rejected'
  approval_updated_at: string | null
  created_at?: string
}

export interface TaskAssignee {
  id: string
  task_id: string
  user_id: string
  approval_status: 'pending' | 'accepted' | 'rejected'
  approval_updated_at: string | null
  created_at?: string
}

// events.all_day は Migration 003 で追加されるが型上は optional で扱う
export interface EventWithAllDay extends Event {
  all_day: boolean
}

export interface Event {
  id: string
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string
  created_by: string | null
  created_at: string
  updated_at: string
  group_id: string | null
  /** @deprecated 互換用。新規は assignees を使用 */
  assigned_to: string | null
  /** @deprecated 互換用。新規は assignees[].approval_status を使用 */
  approval_status: 'none' | 'pending' | 'accepted' | 'rejected'
  approval_updated_at: string | null
  creator?: Profile
  attendees?: EventAttendee[]
  assignees?: EventAssignee[]
}

export interface EventAttendee {
  id: string
  event_id: string
  user_id: string
  status: AttendeeStatus
  responded_at: string | null
  profile?: Profile
}

export interface Task {
  id: string
  title: string
  description: string | null
  assignee_id: string | null
  created_by: string | null
  due_date: string | null
  priority: TaskPriority
  status: TaskStatus
  completed_at: string | null
  created_at: string
  updated_at: string
  group_id: string | null
  /** @deprecated 互換用。新規は assignees を使用 */
  assigned_to: string | null
  /** @deprecated 互換用。新規は assignees[].approval_status を使用 */
  approval_status: 'none' | 'pending' | 'accepted' | 'rejected'
  approval_updated_at: string | null
  assignee?: Profile
  creator?: Profile
  assignees?: TaskAssignee[]
}
