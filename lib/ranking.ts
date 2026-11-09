import { getSupabaseClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/fetch-all'
import { monthFirst, ymd } from '@/lib/dates'

// 내 이번 달 / 누적 순위를 계산합니다. (승인된 학습 시간 기준, 정지·삭제 회원 제외)
export async function myRanks(uid: string) {
  const supabase = getSupabaseClient()
  const rows = await fetchAll((a, b) =>
    supabase.from('study_entries').select('id, user_id, study_date, minutes').eq('status', 'approved').order('id').range(a, b),
  )
  const prefix = ymd(monthFirst(new Date())).slice(0, 7)
  const all = new Map<string, number>()
  const month = new Map<string, number>()
  for (const r of rows) {
    all.set(r.user_id, (all.get(r.user_id) ?? 0) + (r.minutes ?? 0))
    if (String(r.study_date).startsWith(prefix)) month.set(r.user_id, (month.get(r.user_id) ?? 0) + (r.minutes ?? 0))
  }
  const ids = [...all.keys()]
  const visible = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase.from('profiles').select('id').in('id', ids.slice(i, i + 100))
    ;(data ?? []).forEach((p: any) => visible.add(p.id))
  }
  const rankIn = (m: Map<string, number>) => {
    const mine = m.get(uid) ?? 0
    if (!mine) return null
    let ahead = 0
    m.forEach((v, id) => { if (visible.has(id) && v > mine) ahead++ })
    return ahead + 1
  }
  return { all: rankIn(all), month: rankIn(month), allMinutes: all.get(uid) ?? 0, monthMinutes: month.get(uid) ?? 0 }
}

