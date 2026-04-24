import { createClient } from '@/lib/supabase/client'

export type UserSearchResult = { id: string; display_name: string }

export async function searchUsersByDisplayName(
  query: string,
  excludeUserIds: string[] = []
): Promise<UserSearchResult[]> {
  if (!query.trim()) return []
  const supabase = createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name')
    .ilike('display_name', `%${query}%`)
    .limit(20)
  if (!data) return []
  const excSet = new Set(excludeUserIds)
  return data.filter(p => !excSet.has(p.id))
}
