import { pushLineGroup, pushLineGroupMention, type Mentionee, type SendResult } from '@/lib/line'

const TASK_URL = 'https://ruchia.vercel.app/tasks'

export type TaskNotifyInput = {
  title: string
  description: string | null
  priority: string
  due_date: string | null
}

export type AssigneeProfile = {
  display_name: string
  lineUserId: string | null // profiles.telegram_chat_id を LINE userId として再利用
}

function priorityLabel(p: string): string {
  switch (p) {
    case 'urgent': return '🔴 緊急'
    case 'high': return '🔴 高'
    case 'medium': return '🟡 中'
    case 'low': return '🟢 低'
    default: return p || '—'
  }
}

function formatDue(iso: string | null): string {
  if (!iso) return 'なし'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// タスク割り当てを LINE グループへ配信。担当者を@メンション（LINE連携済みの人）し、
// タイトル/詳細/優先度/担当者/期限/リンクを本文に含める。
export async function notifyTaskAssignedToGroup(
  task: TaskNotifyInput,
  assignees: AssigneeProfile[],
): Promise<SendResult> {
  // 先頭にメンション行を作る（先頭に置くことで index=文字数 がそのまま使える）
  let mentionLine = ''
  const mentionees: Mentionee[] = []
  for (const a of assignees) {
    if (!a.lineUserId) continue
    const token = `@${a.display_name}`
    mentionees.push({ index: mentionLine.length, length: token.length, userId: a.lineUserId })
    mentionLine += token + ' '
  }
  mentionLine = mentionLine.trimEnd()

  const assigneeNames = assignees.map(a => a.display_name).join('、') || 'なし'
  const detail = [
    '🔔 新しいタスクが割り当てられました',
    `📋 タイトル: ${task.title}`,
    `📝 詳細: ${task.description?.trim() || 'なし'}`,
    `🚩 優先度: ${priorityLabel(task.priority)}`,
    `👤 担当者: ${assigneeNames}`,
    `⏰ 期限: ${formatDue(task.due_date)}`,
    `🔗 ${TASK_URL}`,
  ].join('\n')

  const text = mentionLine ? `${mentionLine}\n${detail}` : detail

  return mentionees.length > 0
    ? pushLineGroupMention(text, mentionees)
    : pushLineGroup(text)
}
