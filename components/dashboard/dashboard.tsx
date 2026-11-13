'use client'

import { useEffect, useState } from 'react'
import { AppShell, type ShellUser } from '@/components/layout/app-shell'
import { getSupabaseClient } from '@/lib/supabase/client'
import { myRanks } from '@/lib/ranking'
import { fetchAll } from '@/lib/fetch-all'
import { streaks } from '@/lib/streak'
import { fmtMin, todayStr, weekStart, ymd } from '@/lib/dates'

const STATUS: Record<string, string> = { pending: '승인 대기', approved: '승인', rejected: '반려' }
const when = (s: string) => new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const card = 'rounded-2xl border border-neutral-200 bg-white p-5'
const UNIT: Record<string, string> = { approved_minutes: '분', study_days: '일', approved_proofs: '건' }

type D = {
  today: number; todayPending: number; points: number; warn: number; warnLimit: number
  ranks: { all: number | null; month: number | null; allMinutes: number; monthMinutes: number }
  challenges: any[]; titles: { icon: string | null; name: string }[]; quote: any | null; quoteBy: string
  notices: any[]; unread: Set<string>; entries: any[]; activity: { at: string; text: string }[]
  streak: { current: number; best: number; days: number }
  weekMinutes: number; goals: { daily: number | null; weekly: number | null }
}

export function Dashboard() {
  return <AppShell>{(user) => <Home user={user} />}</AppShell>
}

function Home({ user }: { user: ShellUser }) {
  const [d, setD] = useState<D | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const s = getSupabaseClient()
    ;(async () => {
      const today = todayStr()
      const [todayRows, pt, wb, ranks, prog, awards, quotes, notices, reads, entries, proofs, posts, myQuotes, myDates, myGoal] = await Promise.all([
        s.from('study_entries').select('minutes, status').eq('user_id', user.id).eq('study_date', today),
        s.from('participant_point_balances').select('total_points').eq('user_id', user.id).maybeSingle(),
        s.from('participant_warning_balances').select('warning_count, warning_limit').eq('user_id', user.id).maybeSingle(),
        myRanks(user.id),
        s.from('monthly_challenge_progress').select('challenge_id, challenge_title, metric, goal_value, start_date, end_date, current_value').eq('user_id', user.id),
        s.from('user_title_awards').select('title_id').eq('user_id', user.id),
        s.from('daily_quotes').select('user_id, book_title, quote_text, quote_date').order('quote_date', { ascending: false }).order('created_at', { ascending: false }).limit(1),
        s.from('announcements').select('id, title, published_at, created_at').eq('is_published', true).order('published_at', { ascending: false }).limit(3),
        s.from('announcement_reads').select('announcement_id').eq('user_id', user.id),
        s.from('study_entries').select('id, study_date, minutes, status, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        s.from('study_proofs').select('id, study_date, status, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        s.from('community_posts').select('id, body, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        s.from('daily_quotes').select('id, book_title, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        fetchAll((a, b) => s.from('study_entries').select('id, study_date, minutes').eq('user_id', user.id).eq('status', 'approved').order('id').range(a, b)),
        s.from('personal_goals').select('daily_minutes, weekly_minutes').eq('user_id', user.id).maybeSingle(),
      ])

      const tr = (todayRows.data ?? []) as any[]
      const titleIds = (awards.data ?? []).map((a: any) => a.title_id)
      let titles: { icon: string | null; name: string }[] = []
      if (titleIds.length) {
        const { data } = await s.from('special_titles').select('id, title_name, icon').in('id', titleIds)
        titles = (data ?? []).map((t: any) => ({ icon: t.icon, name: t.title_name }))
      }
      const q = (quotes.data ?? [])[0] ?? null
      let quoteBy = ''
      if (q) {
        const { data } = await s.from('profiles').select('username, display_name').eq('id', q.user_id).maybeSingle()
        quoteBy = (data as any)?.display_name || (data as any)?.username || ''
      }
      const activity = [
        ...(entries.data ?? []).map((e: any) => ({ at: e.created_at, text: `학습 ${e.minutes}분 제출 (${STATUS[e.status] ?? e.status})` })),
        ...(proofs.data ?? []).map((p: any) => ({ at: p.created_at, text: `공부 인증 제출 (${STATUS[p.status] ?? p.status})` })),
        ...(posts.data ?? []).map((p: any) => ({ at: p.created_at, text: `커뮤니티 글 작성: ${String(p.body).slice(0, 20)}` })),
        ...(myQuotes.data ?? []).map((x: any) => ({ at: x.created_at, text: `오늘의 문장 등록: ${x.book_title}` })),
      ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)

      setD({
        today: tr.filter((r) => r.status === 'approved').reduce((a, r) => a + r.minutes, 0),
        todayPending: tr.filter((r) => r.status === 'pending').reduce((a, r) => a + r.minutes, 0),
        points: Number((pt.data as any)?.total_points ?? 0),
        warn: Number((wb.data as any)?.warning_count ?? 0),
        warnLimit: Number((wb.data as any)?.warning_limit ?? 5),
        ranks,
        challenges: ((prog.data ?? []) as any[]).filter((c) => c.start_date <= today && today <= c.end_date).slice(0, 3),
        titles, quote: q, quoteBy,
        notices: notices.data ?? [],
        unread: new Set((notices.data ?? []).map((n: any) => n.id as string).filter((id: string) => !(reads.data ?? []).some((r: any) => r.announcement_id === id))),
        entries: entries.data ?? [], activity,
        streak: streaks((myDates as any[]).map((r) => r.study_date as string), today),
        weekMinutes: (myDates as any[]).filter((r) => r.study_date >= ymd(weekStart())).reduce((a, r) => a + (r.minutes ?? 0), 0),
        goals: { daily: (myGoal.data as any)?.daily_minutes ?? null, weekly: (myGoal.data as any)?.weekly_minutes ?? null },
      })
    })().catch((e) => setErr(e instanceof Error ? e.message : '불러오지 못했어요.'))
  }, [user.id])

  const name = user.display_name || user.username
  const stats: [string, string, string?][] = d ? [
    ['오늘의 학습', fmtMin(d.today), d.todayPending ? `승인 대기 ${fmtMin(d.todayPending)}` : undefined],
    ['이번 달 학습', fmtMin(d.ranks.monthMinutes)],
    ['누적 학습', fmtMin(d.ranks.allMinutes)],
    ['연속 공부', `${d.streak.current}일`, `최장 ${d.streak.best}일`],
    ['공부한 날', `${d.streak.days}일`],
    ['보유 포인트', `${d.points.toLocaleString()}P`],
    ['경고', `${d.warn} / ${d.warnLimit}`],
    ['랭킹', d.ranks.month ? `월간 ${d.ranks.month}위` : '월간 -', d.ranks.all ? `누적 ${d.ranks.all}위` : '누적 -'],
  ] : []

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-neutral-400">나는 다시 피어난다.</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{name}님, 안녕하세요</h1>
        <a href="/study/" className="mt-4 inline-block rounded-full bg-neutral-950 px-6 py-2.5 text-sm text-white">오늘 공부 기록하기</a>
      </div>
      {err && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
      {!d && !err && <p className="text-sm text-neutral-500">불러오는 중이에요.</p>}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {stats.map(([k, v, sub]) => (
              <div key={k} className={card}><p className="text-xs text-neutral-400">{k}</p><p className="mt-2 text-xl font-semibold tabular-nums">{v}</p>{sub && <p className="mt-1 text-xs text-neutral-400">{sub}</p>}</div>
            ))}
          </div>

          <GoalCard userId={user.id} goals={d.goals} today={d.today} pending={d.todayPending} week={d.weekMinutes} onSaved={(g) => setD({ ...d, goals: g })} />

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={card}>
              <div className="mb-3 flex justify-between"><h2 className="font-semibold">진행 중인 챌린지</h2><a href="/challenges/" className="text-xs text-neutral-500 underline">전체</a></div>
              {d.challenges.length === 0 ? <p className="text-sm text-neutral-500">진행 중인 챌린지가 없어요.</p> : d.challenges.map((c) => {
                const cur = Number(c.current_value ?? 0); const pct = Math.min(100, Math.round((cur / c.goal_value) * 100))
                return (
                  <div key={c.challenge_id} className="mb-3 last:mb-0">
                    <div className="flex justify-between text-sm"><span>{c.challenge_title}</span><span className="tabular-nums text-neutral-500">{cur.toLocaleString()}/{c.goal_value.toLocaleString()}{UNIT[c.metric] ?? ''}</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-neutral-950" style={{ width: `${pct}%` }} /></div>
                  </div>
                )
              })}
            </section>

            <section className={card}>
              <div className="mb-3 flex justify-between"><h2 className="font-semibold">획득한 칭호</h2><a href="/titles/" className="text-xs text-neutral-500 underline">전체</a></div>
              {d.titles.length === 0 ? <p className="text-sm text-neutral-500">아직 받은 칭호가 없어요.</p> : <div className="flex flex-wrap gap-2">{d.titles.map((t, i) => <span key={i} className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm">{t.icon ?? '🏅'} {t.name}</span>)}</div>}
            </section>

            <section className={card}>
              <div className="mb-3 flex justify-between"><h2 className="font-semibold">오늘의 문장</h2><a href="/quotes/" className="text-xs text-neutral-500 underline">더 보기</a></div>
              {d.quote ? <><p className="whitespace-pre-wrap text-sm leading-7">“{d.quote.quote_text}”</p><p className="mt-2 text-xs text-neutral-500">《{d.quote.book_title}》 · {d.quoteBy}</p></> : <p className="text-sm text-neutral-500">아직 등록된 문장이 없어요.</p>}
            </section>

            <section className={card}>
              <div className="mb-3 flex justify-between"><h2 className="font-semibold">최신 공지사항</h2><a href="/notices/" className="text-xs text-neutral-500 underline">전체</a></div>
              {d.notices.length === 0 ? <p className="text-sm text-neutral-500">공지가 없어요.</p> : d.notices.map((n) => (
                <a key={n.id} href="/notices/" className="flex items-center justify-between gap-3 border-t py-2 text-sm first:border-t-0">
                  <span>{n.title}{d.unread.has(n.id) && <span className="ml-2 rounded-full bg-neutral-950 px-2 py-0.5 text-[10px] text-white">NEW</span>}</span>
                  <span className="shrink-0 text-xs text-neutral-400">{new Date(n.published_at ?? n.created_at).toLocaleDateString('ko-KR')}</span>
                </a>
              ))}
            </section>

            <section className={card}>
              <div className="mb-3 flex justify-between"><h2 className="font-semibold">최근 학습 기록</h2><a href="/study/" className="text-xs text-neutral-500 underline">전체</a></div>
              {d.entries.length === 0 ? <p className="text-sm text-neutral-500">아직 기록이 없어요.</p> : d.entries.map((e) => (
                <div key={e.id} className="flex justify-between border-t py-2 text-sm first:border-t-0"><span>{e.study_date} · {e.minutes}분</span><span className="text-xs text-neutral-500">{STATUS[e.status] ?? e.status}</span></div>
              ))}
            </section>

            <section className={card}>
              <h2 className="mb-3 font-semibold">최근 활동</h2>
              {d.activity.length === 0 ? <p className="text-sm text-neutral-500">활동 내역이 없어요.</p> : d.activity.map((a, i) => (
                <div key={i} className="border-t py-2 text-sm first:border-t-0"><span>{a.text}</span><span className="ml-2 text-xs text-neutral-400">{when(a.at)}</span></div>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

type Goals = { daily: number | null; weekly: number | null }

function GoalCard({ userId, goals, today, pending, week, onSaved }: { userId: string; goals: Goals; today: number; pending: number; week: number; onSaved: (g: Goals) => void }) {
  const [edit, setEdit] = useState(false)
  const [daily, setDaily] = useState('')
  const [weekly, setWeekly] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const hours = (m: number | null) => (m === null ? '' : String(Math.round((m / 60) * 10) / 10))
  const field = 'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900'

  function open() {
    setDaily(hours(goals.daily)); setWeekly(hours(goals.weekly)); setMsg(''); setEdit(true)
  }
  const parse = (v: string, max: number): { ok: boolean; m: number | null } => {
    if (v.trim() === '') return { ok: true, m: null }
    const m = Math.round(Number(v) * 60)
    return m >= 10 && m <= max ? { ok: true, m } : { ok: false, m: null }
  }
  async function save() {
    const d = parse(daily, 1440)
    const w = parse(weekly, 10080)
    if (!d.ok || !w.ok) return setMsg('목표는 0.2시간 이상으로 입력하거나 비워 두세요. (하루 24시간, 주 168시간 이하)')
    setBusy(true); setMsg('')
    const { error } = await getSupabaseClient().from('personal_goals').upsert(
      { user_id: userId, daily_minutes: d.m, weekly_minutes: w.m, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    setBusy(false)
    if (error) return setMsg(`저장하지 못했어요: ${error.message}`)
    onSaved({ daily: d.m, weekly: w.m })
    setEdit(false)
  }

  const bar = (label: string, cur: number, goal: number | null, note?: string) => {
    if (goal === null) return <p className="text-sm text-neutral-500">{label} 목표를 정해 보세요.</p>
    const pct = Math.min(100, Math.round((cur / goal) * 100))
    return (
      <div>
        <div className="flex justify-between text-sm">
          <span>{label} {cur >= goal && <span className="ml-1 rounded-full bg-neutral-950 px-2 py-0.5 text-[10px] text-white">달성</span>}</span>
          <span className="tabular-nums text-neutral-500">{fmtMin(cur)} / {fmtMin(goal)} ({pct}%)</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-neutral-950" style={{ width: `${pct}%` }} /></div>
        {note && <p className="mt-1 text-xs text-neutral-400">{note}</p>}
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">나의 목표</h2>
        {!edit && <button onClick={open} className="text-xs text-neutral-500 underline">{goals.daily === null && goals.weekly === null ? '목표 정하기' : '목표 수정'}</button>}
      </div>
      {edit ? (
        <div className="space-y-3">
          <label className="block text-xs text-neutral-500">하루 목표 (시간)
            <input className={`${field} mt-1`} type="number" inputMode="decimal" step="0.5" min="0" placeholder="예: 4 (비우면 목표 없음)" value={daily} onChange={(e) => setDaily(e.target.value)} />
          </label>
          <label className="block text-xs text-neutral-500">주간 목표 (시간, 월요일 시작)
            <input className={`${field} mt-1`} type="number" inputMode="decimal" step="0.5" min="0" placeholder="예: 20 (비우면 목표 없음)" value={weekly} onChange={(e) => setWeekly(e.target.value)} />
          </label>
          {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}
          <div className="flex gap-3">
            <button disabled={busy} onClick={save} className="h-10 rounded-full bg-neutral-950 px-6 text-sm text-white disabled:opacity-50">저장</button>
            <button onClick={() => setEdit(false)} className="h-10 rounded-full border border-neutral-200 px-6 text-sm">취소</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {bar('오늘', today, goals.daily, pending ? `승인 대기 ${fmtMin(pending)}은 승인되면 반영돼요.` : undefined)}
          {bar('이번 주', week, goals.weekly)}
        </div>
      )}
    </section>
  )
}

