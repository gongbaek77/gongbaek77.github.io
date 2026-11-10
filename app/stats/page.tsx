'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell, type ShellUser } from '@/components/layout/app-shell'
import { getSupabaseClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/fetch-all'
import { addDays, fmtMin, monthFirst, studyNow, weekStart, ymd } from '@/lib/dates'

type Entry = { study_date: string; minutes: number }
type Report = { month_start: string; approved_minutes: number; study_days: number; approved_entry_count: number; approved_proof_count: number }

export default function StatsPage() {
  return <AppShell>{(user) => <StatsContent user={user} />}</AppShell>
}

function Bars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="flex h-36 items-end gap-2">
      {items.map((i) => (
        <div key={i.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] tabular-nums text-neutral-400">{i.value ? Math.round(i.value / 6) / 10 + 'h' : ''}</span>
          <div className="w-full rounded-t-md bg-neutral-950" style={{ height: i.value ? `${Math.max(3, (i.value / max) * 100)}%` : '2px', opacity: i.value ? 1 : 0.15 }} />
          <span className="text-[10px] text-neutral-500">{i.label}</span>
        </div>
      ))}
    </div>
  )
}

function StatsContent({ user }: { user: ShellUser }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseClient()
    Promise.all([
      fetchAll((a, b) => supabase.from('study_entries').select('id, study_date, minutes').eq('user_id', user.id).eq('status', 'approved').order('id').range(a, b)),
      supabase.from('monthly_study_reports').select('month_start, approved_minutes, study_days, approved_entry_count, approved_proof_count').eq('user_id', user.id).order('month_start', { ascending: true }),
    ])
      .then(([e, r]) => {
        if (cancelled) return
        if (r.error) throw new Error(r.error.message)
        setEntries(e as Entry[])
        setReports((r.data ?? []) as Report[])
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : '통계를 불러오지 못했어요.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user.id])

  const s = useMemo(() => {
    const now = studyNow()
    const ws = ymd(weekStart(now))
    const ms = ymd(monthFirst(now))
    const byDate = new Map<string, number>()
    let total = 0, week = 0, month = 0
    for (const e of entries) {
      total += e.minutes
      if (e.study_date >= ws) week += e.minutes
      if (e.study_date >= ms) month += e.minutes
      byDate.set(e.study_date, (byDate.get(e.study_date) ?? 0) + e.minutes)
    }
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(now, i - 6)
      return { label: `${d.getMonth() + 1}/${d.getDate()}`, value: byDate.get(ymd(d)) ?? 0 }
    })
    const recent = reports.slice(-6).map((r) => ({ label: `${Number(r.month_start.slice(5, 7))}월`, value: r.approved_minutes }))
    const proofs = reports.reduce((a, r) => a + r.approved_proof_count, 0)
    return { total, week, month, days: byDate.size, count: entries.length, proofs, last7, recent }
  }, [entries, reports])

  const cards = [
    { label: '누적 학습 시간', value: fmtMin(s.total) },
    { label: '이번 달', value: fmtMin(s.month) },
    { label: '이번 주 (월~)', value: fmtMin(s.week) },
    { label: '공부한 날', value: `${s.days}일` },
    { label: '승인된 기록', value: `${s.count}건` },
    { label: '승인된 인증', value: `${s.proofs}건` },
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-neutral-400">STATISTICS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">학습 통계</h1>
        <p className="mt-2 text-sm text-neutral-500">승인된 기록만 반영돼요.</p>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="text-sm text-neutral-500">불러오는 중이에요.</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-neutral-200 bg-white p-5">
                <p className="text-xs text-neutral-400">{c.label}</p>
                <p className="mt-2 text-xl font-semibold tabular-nums">{c.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-4 font-semibold">최근 7일</h2>
            <Bars items={s.last7} />
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-4 font-semibold">월별 성장 (최근 6개월)</h2>
            {s.recent.length ? <Bars items={s.recent} /> : <p className="text-sm text-neutral-500">아직 승인된 기록이 없어요.</p>}
          </div>
        </>
      )}
    </div>
  )
}

