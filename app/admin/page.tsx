'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell, type ShellUser } from '@/components/layout/app-shell'
import { getSupabaseClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/fetch-all'
import { fmtMin } from '@/lib/dates'

type Tab = 'overview' | 'entries' | 'proofs' | 'members'
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: '현황' },
  { key: 'entries', label: '학습 승인' },
  { key: 'proofs', label: '인증 승인' },
  { key: 'members', label: '회원 관리' },
]
const PROOFS = 'ananteo-study-proofs'
const when = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-')
const card = 'rounded-2xl border border-neutral-200 bg-white p-5'
const field = 'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900'
const pill = (on: boolean) => `rounded-full px-4 py-2 text-sm ${on ? 'bg-neutral-950 text-white' : 'border border-neutral-200 bg-white text-neutral-500'}`

async function loadNames(ids: (string | null)[]) {
  const supabase = getSupabaseClient()
  const uniq = [...new Set(ids.filter(Boolean) as string[])]
  const map = new Map<string, string>()
  for (let i = 0; i < uniq.length; i += 100) {
    const { data } = await supabase.from('profiles').select('id, username, display_name').in('id', uniq.slice(i, i + 100))
    ;(data ?? []).forEach((u: any) => map.set(u.id, u.display_name || u.username))
  }
  return map
}

type Job = () => PromiseLike<{ error: { message: string } | null }>

export default function AdminPage() {
  return <AppShell>{(user) => (user.role === 'admin' ? <AdminContent user={user} /> : <p className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">관리자만 이용할 수 있는 페이지예요.</p>)}</AppShell>
}

function AdminContent({ user }: { user: ShellUser }) {
  const [tab, setTab] = useState<Tab>('overview')
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-neutral-400">ADMINISTRATION</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">관리자</h1>
      </div>
      <div className="flex flex-wrap gap-2">{TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={pill(tab === t.key)}>{t.label}</button>)}</div>
      {tab === 'overview' && <Overview />}
      {tab === 'entries' && <Entries user={user} />}
      {tab === 'proofs' && <Proofs user={user} />}
      {tab === 'members' && <Members user={user} />}
    </div>
  )
}

function Err({ text }: { text: string }) {
  return text ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{text}</p> : null
}

function Overview() {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const s = getSupabaseClient()
    ;(async () => {
      const [profiles, entries, proofs, points, warns, posts, recent] = await Promise.all([
        fetchAll((a, b) => s.from('profiles').select('id, role, is_suspended').order('id').range(a, b)),
        fetchAll((a, b) => s.from('study_entries').select('id, status, minutes').order('id').range(a, b)),
        fetchAll((a, b) => s.from('study_proofs').select('id, status').order('id').range(a, b)),
        fetchAll((a, b) => s.from('participant_point_balances').select('user_id, total_points').order('user_id').range(a, b)),
        fetchAll((a, b) => s.from('participant_warning_balances').select('user_id, warning_count').order('user_id').range(a, b)),
        s.from('community_posts').select('id, user_id, body, created_at').order('created_at', { ascending: false }).limit(5),
        s.from('study_entries').select('id, user_id, study_date, minutes, status, created_at').order('created_at', { ascending: false }).limit(5),
      ])
      const names = await loadNames([...(posts.data ?? []).map((x: any) => x.user_id), ...(recent.data ?? []).map((x: any) => x.user_id)])
      const members = profiles.filter((p) => p.role !== 'admin')
      setD({
        members: members.length,
        suspended: members.filter((p) => p.is_suspended).length,
        entries: entries.length,
        pending: entries.filter((e) => e.status === 'pending').length,
        minutes: entries.filter((e) => e.status === 'approved').reduce((a, e) => a + (e.minutes ?? 0), 0),
        proofPending: proofs.filter((p) => p.status === 'pending').length,
        points: points.reduce((a, p) => a + Number(p.total_points ?? 0), 0),
        warnUsers: warns.filter((w) => w.warning_count > 0).length,
        warnTotal: warns.reduce((a, w) => a + (w.warning_count ?? 0), 0),
        posts: posts.data ?? [], recent: recent.data ?? [], names,
      })
    })().catch((e) => setErr(e instanceof Error ? e.message : '불러오지 못했어요.'))
  }, [])
  if (err) return <Err text={err} />
  if (!d) return <p className="text-sm text-neutral-500">불러오는 중이에요.</p>
  const cards = [
    ['전체 회원', `${d.members}명`], ['활성 회원', `${d.members - d.suspended}명`], ['정지 회원', `${d.suspended}명`],
    ['전체 학습 기록', `${d.entries}건`], ['승인 대기 기록', `${d.pending}건`], ['승인된 학습 시간', fmtMin(d.minutes)],
    ['인증 검토 대기', `${d.proofPending}건`], ['포인트 합계', `${d.points.toLocaleString()}P`], ['경고 현황', `${d.warnUsers}명 · ${d.warnTotal}회`],
  ]
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{cards.map(([k, v]) => <div key={k} className={card}><p className="text-xs text-neutral-400">{k}</p><p className="mt-2 text-xl font-semibold tabular-nums">{v}</p></div>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}><h2 className="mb-3 font-semibold">최신 게시글</h2>
          {d.posts.length === 0 ? <p className="text-sm text-neutral-500">게시글이 없어요.</p> : d.posts.map((p: any) => <p key={p.id} className="border-t py-2 text-sm first:border-t-0"><span className="font-medium">{d.names.get(p.user_id) ?? '알 수 없음'}</span> <span className="text-neutral-500">{String(p.body).slice(0, 40)}</span><span className="ml-2 text-xs text-neutral-400">{when(p.created_at)}</span></p>)}
        </div>
        <div className={card}><h2 className="mb-3 font-semibold">최근 학습 제출</h2>
          {d.recent.length === 0 ? <p className="text-sm text-neutral-500">기록이 없어요.</p> : d.recent.map((e: any) => <p key={e.id} className="border-t py-2 text-sm first:border-t-0"><span className="font-medium">{d.names.get(e.user_id) ?? '알 수 없음'}</span> <span className="text-neutral-500">{e.study_date} · {e.minutes}분 · {e.status}</span></p>)}
        </div>
      </div>
    </div>
  )
}

const STATUS = { pending: '승인 대기', approved: '승인', rejected: '반려' } as const
type St = keyof typeof STATUS

function Entries({ user }: { user: ShellUser }) {
  const [st, setSt] = useState<St>('pending')
  const [rows, setRows] = useState<any[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    const q = getSupabaseClient().from('study_entries').select('id, user_id, study_date, minutes, memo, reviewed_by, reviewed_at, created_at').eq('status', st)
    const { data, error } = await (st === 'pending' ? q.order('created_at', { ascending: true }) : q.order('reviewed_at', { ascending: false })).limit(100)
    if (error) throw new Error(error.message)
    setRows(data ?? [])
    setNames(await loadNames((data ?? []).flatMap((r: any) => [r.user_id, r.reviewed_by])))
  }, [st])
  useEffect(() => { load().catch((e) => setMsg(e.message)) }, [load])
  async function review(id: string, status: 'approved' | 'rejected') {
    setBusy(id); setMsg('')
    const { error } = await getSupabaseClient().from('study_entries').update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending')
    setBusy('')
    if (error) return setMsg(`처리하지 못했어요: ${error.message}`)
    load().catch(() => {})
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-2">{(Object.keys(STATUS) as St[]).map((k) => <button key={k} onClick={() => setSt(k)} className={pill(st === k)}>{STATUS[k]}</button>)}</div>
      <Err text={msg} />
      {rows.length === 0 && <p className={`${card} text-center text-sm text-neutral-500`}>해당하는 기록이 없어요.</p>}
      {rows.map((r) => (
        <article key={r.id} className={card}>
          <p className="font-semibold">{names.get(r.user_id) ?? '알 수 없음'}</p>
          <p className="mt-1 text-xs text-neutral-400">{r.study_date} · {fmtMin(r.minutes)} · 제출 {when(r.created_at)}</p>
          {r.memo && <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-600">{r.memo}</p>}
          {st === 'pending' ? (
            <div className="mt-4 flex gap-2">
              <button disabled={busy === r.id} onClick={() => review(r.id, 'approved')} className="h-10 rounded-full bg-neutral-950 px-5 text-sm text-white disabled:opacity-50">승인</button>
              <button disabled={busy === r.id} onClick={() => review(r.id, 'rejected')} className="h-10 rounded-full border border-neutral-200 px-5 text-sm disabled:opacity-50">반려</button>
            </div>
          ) : <p className="mt-3 text-xs text-neutral-400">검토자 {names.get(r.reviewed_by) ?? '-'} · {when(r.reviewed_at)}</p>}
        </article>
      ))}
    </div>
  )
}

function Proofs({ user }: { user: ShellUser }) {
  const [st, setSt] = useState<St>('pending')
  const [rows, setRows] = useState<any[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    const s = getSupabaseClient()
    const q = s.from('study_proofs').select('id, user_id, study_date, storage_path, caption, reviewed_by, reviewed_at, created_at').eq('status', st)
    const { data, error } = await (st === 'pending' ? q.order('created_at', { ascending: true }) : q.order('reviewed_at', { ascending: false })).limit(50)
    if (error) throw new Error(error.message)
    const list = data ?? []
    setRows(list)
    setNames(await loadNames(list.flatMap((r: any) => [r.user_id, r.reviewed_by])))
    if (list.length) {
      const { data: signed } = await s.storage.from(PROOFS).createSignedUrls(list.map((r: any) => r.storage_path), 3600)
      const m: Record<string, string> = {}
      ;(signed ?? []).forEach((x: any) => { if (x.path && x.signedUrl) m[x.path] = x.signedUrl })
      setUrls(m)
    }
  }, [st])
  useEffect(() => { load().catch((e) => setMsg(e.message)) }, [load])
  async function review(id: string, status: 'approved' | 'rejected') {
    setBusy(id); setMsg('')
    const { error } = await getSupabaseClient().from('study_proofs').update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending')
    setBusy('')
    if (error) return setMsg(`처리하지 못했어요: ${error.message}`)
    load().catch(() => {})
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-2">{(Object.keys(STATUS) as St[]).map((k) => <button key={k} onClick={() => setSt(k)} className={pill(st === k)}>{STATUS[k]}</button>)}</div>
      <Err text={msg} />
      {rows.length === 0 && <p className={`${card} text-center text-sm text-neutral-500`}>해당하는 인증이 없어요.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <article key={r.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {urls[r.storage_path] ? <a href={urls[r.storage_path]} target="_blank" rel="noreferrer"><img src={urls[r.storage_path]} alt="" className="aspect-[4/3] w-full object-cover" /></a> : <div className="aspect-[4/3] bg-neutral-100" />}
            <div className="p-4">
              <p className="font-semibold">{names.get(r.user_id) ?? '알 수 없음'}</p>
              <p className="mt-1 text-xs text-neutral-400">{r.study_date} · 제출 {when(r.created_at)}</p>
              {r.caption && <p className="mt-2 text-sm text-neutral-600">{r.caption}</p>}
              {st === 'pending' ? (
                <div className="mt-3 flex gap-2">
                  <button disabled={busy === r.id} onClick={() => review(r.id, 'approved')} className="h-10 rounded-full bg-neutral-950 px-5 text-sm text-white disabled:opacity-50">승인</button>
                  <button disabled={busy === r.id} onClick={() => review(r.id, 'rejected')} className="h-10 rounded-full border border-neutral-200 px-5 text-sm disabled:opacity-50">반려</button>
                </div>
              ) : <p className="mt-3 text-xs text-neutral-400">검토자 {names.get(r.reviewed_by) ?? '-'} · {when(r.reviewed_at)}</p>}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

type Member = { id: string; username: string; display_name: string | null; role: string; is_suspended: boolean; is_hidden: boolean; suspension_reason: string | null; suspended_at: string | null; created_at: string }

function Members({ user }: { user: ShellUser }) {
  const [list, setList] = useState<Member[]>([])
  const [pts, setPts] = useState<Map<string, number>>(new Map())
  const [warns, setWarns] = useState<Map<string, number>>(new Map())
  const [mins, setMins] = useState<Map<string, number>>(new Map())
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    const s = getSupabaseClient()
    const [p, pt, w, e] = await Promise.all([
      fetchAll((a, b) => s.from('profiles').select('id, username, display_name, role, is_suspended, is_hidden, suspension_reason, suspended_at, created_at').order('created_at', { ascending: false }).order('id').range(a, b)),
      fetchAll((a, b) => s.from('participant_point_balances').select('user_id, total_points').order('user_id').range(a, b)),
      fetchAll((a, b) => s.from('participant_warning_balances').select('user_id, warning_count').order('user_id').range(a, b)),
      fetchAll((a, b) => s.from('study_entries').select('id, user_id, minutes').eq('status', 'approved').order('id').range(a, b)),
    ])
    setList(p as Member[])
    setPts(new Map(pt.map((x) => [x.user_id, Number(x.total_points ?? 0)])))
    setWarns(new Map(w.map((x) => [x.user_id, Number(x.warning_count ?? 0)])))
    const m = new Map<string, number>()
    e.forEach((x) => m.set(x.user_id, (m.get(x.user_id) ?? 0) + (x.minutes ?? 0)))
    setMins(m)
  }, [])
  useEffect(() => { load().catch((e) => setMsg(e.message)) }, [load])
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return list.filter((m) => !k || m.username.toLowerCase().includes(k) || (m.display_name ?? '').toLowerCase().includes(k))
  }, [list, q])
  const picked = list.find((m) => m.id === sel) ?? null
  return (
    <div className="space-y-4">
      <Err text={msg} />
      <input className={field} placeholder="이름 또는 아이디로 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="divide-y rounded-2xl border border-neutral-200 bg-white">
        {shown.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">회원이 없어요.</p>}
        {shown.map((m) => (
          <button key={m.id} onClick={() => setSel(sel === m.id ? null : m.id)} className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left ${sel === m.id ? 'bg-neutral-50' : ''}`}>
            <span><span className="text-sm font-medium">{m.display_name || m.username}</span><span className="ml-2 text-xs text-neutral-400">@{m.username}</span></span>
            <span className="flex items-center gap-2 text-xs">
              {m.role === 'admin' && <span className="rounded-full border px-2 py-0.5">관리자</span>}
              {m.is_suspended && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">정지</span>}
              {m.is_hidden && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">숨김</span>}
              <span className="text-neutral-400">{(pts.get(m.id) ?? 0).toLocaleString()}P</span>
            </span>
          </button>
        ))}
      </div>
      {picked && <MemberDetail key={picked.id} m={picked} me={user} minutes={mins.get(picked.id) ?? 0} points={pts.get(picked.id) ?? 0} warn={warns.get(picked.id) ?? 0} onChanged={() => load().catch(() => {})} />}
    </div>
  )
}

function MemberDetail({ m, me, minutes, points, warn, onChanged }: { m: Member; me: ShellUser; minutes: number; points: number; warn: number; onChanged: () => void }) {
  const [hist, setHist] = useState<{ adj: any[]; war: any[]; ent: any[]; titles: number }>({ adj: [], war: [], ent: [], titles: 0 })
  const [reason, setReason] = useState('')
  const [delta, setDelta] = useState('')
  const [pReason, setPReason] = useState('')
  const [wReason, setWReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const s = getSupabaseClient()
  const loadHist = useCallback(async () => {
    const [adj, war, ent, ti] = await Promise.all([
      s.from('point_adjustments').select('points, reason, created_at').eq('user_id', m.id).order('created_at', { ascending: false }).limit(10),
      s.from('warning_events').select('delta, reason, created_at').eq('user_id', m.id).order('created_at', { ascending: false }).limit(10),
      s.from('study_entries').select('study_date, minutes, status').eq('user_id', m.id).order('study_date', { ascending: false }).limit(10),
      s.from('user_title_awards').select('id').eq('user_id', m.id),
    ])
    setHist({ adj: adj.data ?? [], war: war.data ?? [], ent: ent.data ?? [], titles: (ti.data ?? []).length })
  }, [m.id])
  useEffect(() => { loadHist().catch(() => {}) }, [loadHist])
  async function run(job: Job, ok: string) {
    setBusy(true); setMsg('')
    const { error } = await job()
    setBusy(false)
    if (error) { setMsg(`처리하지 못했어요: ${error.message}`); return false }
    setMsg(ok); onChanged(); loadHist().catch(() => {})
    return true
  }
  const self = m.id === me.id
  return (
    <div className={`${card} space-y-5`}>
      <div>
        <h2 className="text-lg font-semibold">{m.display_name || m.username} <span className="text-sm font-normal text-neutral-400">@{m.username}</span></h2>
        <p className="mt-1 text-xs text-neutral-400">가입 {when(m.created_at)} · 누적 {fmtMin(minutes)} · {points.toLocaleString()}P · 경고 {warn}/5 · 칭호 {hist.titles}개</p>
        {m.is_suspended && <p className="mt-2 text-sm text-red-700">정지됨{m.suspension_reason ? ` — ${m.suspension_reason}` : ''}</p>}
        {m.is_hidden && <p className="mt-2 text-sm text-neutral-600">다른 회원에게 숨겨진 계정이에요.</p>}
      </div>
      <Err text={msg.startsWith('처리하지') ? msg : ''} />
      {msg && !msg.startsWith('처리하지') && <p className="rounded-xl border border-neutral-200 px-4 py-3 text-sm">{msg}</p>}

      {!self && m.role !== 'admin' && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">계정 상태</h3>
          {m.is_suspended ? (
            <button disabled={busy} onClick={() => run(() => s.rpc('admin_set_participant_suspension', { target_user_id: m.id, should_suspend: false }), '정지를 해제했어요.')} className="h-10 rounded-full bg-neutral-950 px-5 text-sm text-white disabled:opacity-50">정지 해제</button>
          ) : (
            <div className="flex gap-2">
              <input className={field} placeholder="정지 사유" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button disabled={busy || !reason.trim()} onClick={() => confirm('이 회원을 정지할까요?') && run(() => s.rpc('admin_set_participant_suspension', { target_user_id: m.id, should_suspend: true, reason: reason.trim() }), '회원을 정지했어요.')} className="h-11 shrink-0 rounded-full border border-neutral-200 px-5 text-sm disabled:opacity-50">정지</button>
            </div>
          )}
        </div>
      )}

      {!self && m.role !== 'admin' && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">다른 회원에게 보이기</h3>
          <p className="text-xs text-neutral-500">숨기면 랭킹, 커뮤니티, 회원 목록에서 이 계정과 작성 글이 보이지 않아요. 계정 이용은 막지 않아요. 정지된 계정도 같은 방식으로 가려져요.</p>
          <button disabled={busy} onClick={() => run(() => s.rpc('admin_set_participant_hidden', { target_user_id: m.id, should_hide: !m.is_hidden }), m.is_hidden ? '숨김을 해제했어요.' : '계정을 숨겼어요.')} className="h-10 rounded-full border border-neutral-200 px-5 text-sm disabled:opacity-50">{m.is_hidden ? '숨김 해제' : '숨김'}</button>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">포인트 조정</h3>
        <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
          <input className={field} type="number" inputMode="numeric" placeholder="+50 / -50" value={delta} onChange={(e) => setDelta(e.target.value)} />
          <input className={field} placeholder="조정 사유 (필수)" value={pReason} onChange={(e) => setPReason(e.target.value)} />
          <button disabled={busy} onClick={async () => {
            const n = Number(delta)
            if (!Number.isInteger(n) || n === 0) return setMsg('처리하지 못했어요: 0이 아닌 정수를 입력해 주세요.')
            if (!pReason.trim()) return setMsg('처리하지 못했어요: 사유를 입력해 주세요.')
            if (await run(() => s.rpc('admin_adjust_points', { target_user_id: m.id, points_delta: n, adjustment_reason: pReason.trim() }), '포인트를 조정했어요.')) { setDelta(''); setPReason('') }
          }} className="h-11 rounded-full bg-neutral-950 px-5 text-sm text-white disabled:opacity-50">적용</button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">경고</h3>
        <input className={field} placeholder="사유 (필수)" value={wReason} onChange={(e) => setWReason(e.target.value)} />
        <div className="flex gap-2">
          {[1, -1].map((d) => (
            <button key={d} disabled={busy || !wReason.trim()} onClick={async () => {
              if (await run(() => s.from('warning_events').insert({ user_id: m.id, delta: d, reason: wReason.trim(), created_by: me.id }), d > 0 ? '경고를 부여했어요.' : '경고를 차감했어요.')) setWReason('')
            }} className={`h-10 rounded-full px-5 text-sm disabled:opacity-50 ${d > 0 ? 'bg-neutral-950 text-white' : 'border border-neutral-200'}`}>{d > 0 ? '경고 +1' : '경고 -1'}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 text-sm">
        <div><h3 className="mb-2 font-semibold">포인트 내역</h3>{hist.adj.length === 0 ? <p className="text-neutral-500">없음</p> : hist.adj.map((a, i) => <p key={i} className="border-t py-1.5 first:border-t-0">{a.points > 0 ? '+' : ''}{a.points}P <span className="text-xs text-neutral-400">{a.reason} · {when(a.created_at)}</span></p>)}</div>
        <div><h3 className="mb-2 font-semibold">경고 내역</h3>{hist.war.length === 0 ? <p className="text-neutral-500">없음</p> : hist.war.map((a, i) => <p key={i} className="border-t py-1.5 first:border-t-0">{a.delta > 0 ? '+' : ''}{a.delta} <span className="text-xs text-neutral-400">{a.reason} · {when(a.created_at)}</span></p>)}</div>
        <div><h3 className="mb-2 font-semibold">최근 학습 기록</h3>{hist.ent.length === 0 ? <p className="text-neutral-500">없음</p> : hist.ent.map((a, i) => <p key={i} className="border-t py-1.5 first:border-t-0">{a.study_date} · {a.minutes}분 <span className="text-xs text-neutral-400">{STATUS[a.status as St] ?? a.status}</span></p>)}</div>
      </div>
    </div>
  )
}

