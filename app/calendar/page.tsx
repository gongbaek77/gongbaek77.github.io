'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AppShell, type ShellUser } from '@/components/layout/app-shell'
import { getSupabaseClient } from '@/lib/supabase/client'
import { fmtMin, monthFirst, monthLast, studyNow, todayStr, ymd } from '@/lib/dates'

type Entry = { study_date: string; minutes: number; status: string; memo: string | null }
type Act = { activity_date: string; activity_type: string; activity_label: string }
type Day = { approved: number; pending: number; proof: boolean; quote: boolean }

const STATUS: Record<string, string> = { pending: '승인 대기', approved: '승인', rejected: '반려' }
const short = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`)

export default function CalendarPage() {
  return <AppShell>{(user) => <CalendarContent user={user} />}</AppShell>
}

function CalendarContent({ user }: { user: ShellUser }) {
  const [cursor, setCursor] = useState(monthFirst(studyNow()))
  const [entries, setEntries] = useState<Entry[]>([])
  const [acts, setActs] = useState<Act[]>([])
  const [sel, setSel] = useState(todayStr())
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseClient()
    const start = ymd(monthFirst(cursor))
    const end = ymd(monthLast(cursor))
    setError('')
    Promise.all([
      supabase.from('study_entries').select('study_date, minutes, status, memo').eq('user_id', user.id).gte('study_date', start).lte('study_date', end),
      supabase.from('participant_calendar_activities').select('activity_date, activity_type, activity_label').eq('user_id', user.id).gte('activity_date', start).lte('activity_date', end),
    ]).then(([e, a]) => {
      if (cancelled) return
      if (e.error || a.error) setError('달력 데이터를 불러오지 못했어요.')
      setEntries((e.data ?? []) as Entry[])
      setActs((a.data ?? []) as Act[])
    })
    return () => { cancelled = true }
  }, [cursor, user.id])

  const days = useMemo(() => {
    const map: Record<string, Day> = {}
    const get = (k: string) => (map[k] ??= { approved: 0, pending: 0, proof: false, quote: false })
    for (const e of entries) {
      const d = get(e.study_date)
      if (e.status === 'approved') d.approved += e.minutes
      else if (e.status === 'pending') d.pending += e.minutes
    }
    for (const a of acts) {
      const d = get(a.activity_date)
      if (a.activity_type === 'study_proof') d.proof = true
      if (a.activity_type === 'daily_quote') d.quote = true
    }
    return map
  }, [entries, acts])

  const lead = monthFirst(cursor).getDay()
  const total = monthLast(cursor).getDate()
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
  const keyOf = (d: number) => ymd(new Date(cursor.getFullYear(), cursor.getMonth(), d))
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))
  const monthTotal = Object.values(days).reduce((s, d) => s + d.approved, 0)

  const selEntries = entries.filter((e) => e.study_date === sel)
  const selActs = acts.filter((a) => a.activity_date === sel)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-neutral-400">CALENDAR</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">학습 달력</h1>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => move(-1)} aria-label="이전 달" className="rounded-full p-2 hover:bg-neutral-100"><ChevronLeft size={18} /></button>
          <div className="text-center">
            <p className="font-semibold">{cursor.getFullYear()}년 {cursor.getMonth() + 1}월</p>
            <p className="text-xs text-neutral-400">승인된 학습 {fmtMin(monthTotal)}</p>
          </div>
          <button onClick={() => move(1)} aria-label="다음 달" className="rounded-full p-2 hover:bg-neutral-100"><ChevronRight size={18} /></button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-400">
          {['일', '월', '화', '수', '목', '금', '토'].map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={`b${i}`} />
            const k = keyOf(d)
            const info = days[k]
            const isToday = k === todayStr()
            return (
              <button key={k} onClick={() => setSel(k)}
                className={`flex aspect-square flex-col items-center justify-between rounded-xl border p-1 text-xs ${sel === k ? 'border-neutral-950' : 'border-transparent hover:bg-neutral-50'} ${isToday ? 'bg-neutral-100' : ''}`}>
                <span className={isToday ? 'font-semibold' : ''}>{d}</span>
                <span className="h-4 text-[10px] tabular-nums text-neutral-600">{info?.approved ? short(info.approved) : ''}</span>
                <span className="flex h-2 gap-0.5">
                  {info?.pending ? <i className="size-1.5 rounded-full bg-neutral-300" /> : null}
                  {info?.proof ? <i className="size-1.5 rounded-full bg-yellow-400" /> : null}
                  {info?.quote ? <i className="size-1.5 rounded-full bg-purple-500" /> : null}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-neutral-300" /> 승인 대기</span>
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-yellow-400" /> 공부 인증</span>
          <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-purple-500" /> 오늘의 문장</span>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="font-semibold">{sel}</h2>
        {selEntries.length === 0 && selActs.length === 0 && <p className="mt-3 text-sm text-neutral-500">이 날의 기록이 없어요.</p>}
        <div className="mt-3 space-y-3">
          {selEntries.map((e, i) => (
            <div key={i} className="flex items-start justify-between gap-4 text-sm">
              <div>
                <p className="font-medium">{fmtMin(e.minutes)}</p>
                {e.memo && <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-500">{e.memo}</p>}
              </div>
              <span className="text-xs text-neutral-500">{STATUS[e.status] ?? e.status}</span>
            </div>
          ))}
          {selActs.map((a, i) => <p key={i} className="text-sm text-neutral-600">• {a.activity_label}</p>)}
        </div>
      </div>
    </div>
  )
}

