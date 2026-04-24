import { getMyGroups } from '@/lib/groups'
import { createClient } from '@/lib/supabase/server'
import GroupCard from '@/components/groups/GroupCard'
import Link from 'next/link'
import { Users } from 'lucide-react'

export default async function GroupsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let groups: Awaited<ReturnType<typeof getMyGroups>> = []
  try {
    groups = await getMyGroups()
  } catch { /* RLS が通らない場合は空配列 */ }

  return (
    <div className="min-h-full p-4 sm:p-8" style={{ background: '#1a1a1a' }}>
      <div className="max-w-2xl mx-auto">

        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#f0f0f0' }}>グループ</h1>
            <p className="text-sm mt-1" style={{ color: '#666' }}>チームメンバーとスケジュール・タスクを共有</p>
          </div>
          <Link
            href="/groups/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
            style={{ background: '#b87333', color: '#1a1a1a', letterSpacing: '0.05em' }}
          >
            + 新規グループ
          </Link>
        </div>

        {/* グループ一覧 */}
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: '#232323', border: '1px solid #3a3a3a' }}
            >
              <Users size={28} style={{ color: '#b87333' }} />
            </div>
            <p className="font-medium mb-1" style={{ color: '#f0f0f0' }}>まだグループがありません</p>
            <p className="text-sm mb-6" style={{ color: '#666' }}>
              グループを作成してメンバーを招待しましょう
            </p>
            <Link
              href="/groups/new"
              className="px-6 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wider"
              style={{ background: '#b87333', color: '#1a1a1a', letterSpacing: '0.05em' }}
            >
              + 新規グループを作成
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(group => {
              const myMember = group.members?.find(m => m.user_id === user!.id)
              return (
                <GroupCard
                  key={group.id}
                  group={group}
                  role={myMember?.role ?? 'member'}
                  memberCount={group.members?.length ?? 0}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
