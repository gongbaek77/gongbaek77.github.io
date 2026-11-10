'use client'

import { useEffect, useState } from 'react'
import { AppShell, type ShellUser } from '@/components/layout/app-shell'
import { getSupabaseClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/fetch-all'
import { addDays, fmtMin, monthFirst, monthLast, studyNow, todayStr, weekStart, ymd } from '@/lib/dates'

type Period = 'day' | 'week' | 'month' | 'all'
const TABS: { key: Period; label: string }[] = [
  { key: 'day', label: '일간' },
  { key: 'week', label: '주간' },
  { key: 'month', label: '월간' },
  { key: 'all', label: '누적' },
]
type Row = { user_id: string; name: string; minutes: number; avatar: string | null; url?: string; rank: number }

function rangeOf(p: Period): [string | null, string | null] {
  const now = studyNow()
  if (p === 'day') return [todayStr(), todayStr()]
  if (p === 'week') {
    const s = weekStart(now)
    return [ymd(s), ymd(addDays(s, 6))]
  }
  if (p === 'month') return [ymd(monthFirst(now)), ymd(monthLast(now))]
  return [null, null]
}

async function loadRanking(p: Period): Promise<Row[]> {
  const supabase = getSupabaseClient()
  const [from, to] = rangeOf(p)
  const entries = await fetchAll((a, b) => {
    let q = supabase.from('study_entries').select('id, user_id, minutes').eq('status', 'approved')
    if (from && to) q = q.gte('study_date', from).lte('study_date', to)
    return q.order('id').range(a, b)
  })
  const totals = new Map<string, number>()
  for (const e of entries) totals.set(e.user_id, (totals.get(e.user_id) ?? 0) + (e.minutes ?? 0))

  const ids = [...totals.keys()]
  const profiles: any[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_path')
      .in('id', ids.slice(i, i + 100))
    if (error) throw new Error(error.message)
    profiles.push(...(data ?? []))
  }

  const rows: Row[] = profiles
    .map((x) => ({
      user_id: x.id as string,
      name: (x.display_name || x.username) as string,
      minutes: totals.get(x.id) ?? 0,
      avatar: (x.avatar_path ?? null) as string | null,
      rank: 0,
    }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, 'ko') || a.user_id.localeCompare(b.user_id))

  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].minutes === r.minutes ? rows[i - 1].rank : i + 1
  })

  const top = rows.slice(0, 50)
  const paths = top.map((r) => r.avatar).filter(Boolean) as string[]
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('ananteo-avatars').createSignedUrls(paths, 3600)
    top.forEach((r) => {
      r.url = signed?.find((s) => s.path === r.avatar)?.signedUrl ?? undefined
    })
  }
  return rows
}

export default function RankingPage() {
  return <AppShell>{(user) => <RankingContent user={user} />}</AppShell>
}

function Avatar({ row }: { row: Row }) {
  return row.url ? (
    <img src={row.url} alt="" className="size-10 rounded-full object-cover" />
  ) : (
    <div className="flex size-10 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-500">
      {row.name.slice(0, 1)}
    </div>
  )
}

function RankingContent({ user }: { user: ShellUser }) {
  const [period, setPeriod] = useState<Period>('week')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    loadRanking(period)
      .then((r) => { if (!cancelled) setRows(r) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '랭킹을 불러오지 못했어요.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period])

  const mine = rows.find((r) => r.user_id === user.id)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-neutral-400">RANKING</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">랭킹</h1>
        <p className="mt-2 text-sm text-neutral-500">승인된 학습 시간 기준이에요. 시간이 같으면 같은 순위로 표시돼요.</p>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setPeriod(t.key)}
            className={`rounded-full px-4 py-2 text-sm ${period === t.key ? 'bg-neutral-950 text-white' : 'border border-neutral-200 bg-white text-neutral-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="text-xs text-neutral-400">내 순위</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {loading ? '…' : mine ? `${mine.rank}위 · ${fmtMin(mine.minutes)}` : '아직 기록이 없어요'}
        </p>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="divide-y rounded-2xl border border-neutral-200 bg-white">
        {!loading && rows.length === 0 && !error && (
          <p className="p-8 text-center text-sm text-neutral-500">이 기간에 승인된 학습 기록이 없어요.</p>
        )}
        {rows.slice(0, 50).map((r) => (
          <div key={r.user_id} className={`flex items-center gap-4 px-5 py-3 ${r.user_id === user.id ? 'bg-neutral-50' : ''}`}>
            <span className="w-8 text-center text-lg font-semibold tabular-nums">{r.rank}</span>
            <Avatar row={r} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}{r.user_id === user.id ? ' (나)' : ''}</span>
            <span className="text-sm tabular-nums text-neutral-600">{fmtMin(r.minutes)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

