export function formatJaDate(isoString: string): string {
  const d = new Date(isoString)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const notificationMessages = {
  groupInvite: (groupName: string) =>
    `👋 「${groupName}」グループに追加されました`,

  taskAssigned: (title: string, createdByName: string) =>
    `🔔 新しいタスクが割り当てられました\n${title}\n(作成者: ${createdByName})`,

  eventAssigned: (title: string, createdByName: string, startAt: string) =>
    `🔔 新しい予定が割り当てられました\n${title}\n日時: ${formatJaDate(startAt)}\n(作成者: ${createdByName})`,

  taskApproved: (title: string, responderName: string) =>
    `✅ ${responderName}さんがタスクを受諾しました\n${title}`,

  taskRejected: (title: string, responderName: string) =>
    `❌ ${responderName}さんがタスクを拒否しました\n${title}`,

  eventApproved: (title: string, responderName: string) =>
    `✅ ${responderName}さんが予定を受諾しました\n${title}`,

  eventRejected: (title: string, responderName: string) =>
    `❌ ${responderName}さんが予定を拒否しました\n${title}`,

  groupNewTask: (groupName: string, title: string, creatorName: string) =>
    `📋 「${groupName}」に新しいタスクが追加されました\n${title}\n(作成者: ${creatorName})`,

  groupNewEvent: (groupName: string, title: string, creatorName: string, startAt: string) =>
    `📅 「${groupName}」に新しい予定が追加されました\n${title}\n日時: ${formatJaDate(startAt)}\n(作成者: ${creatorName})`,
}
