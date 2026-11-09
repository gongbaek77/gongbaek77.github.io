'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppShell, type ShellUser } from '@/components/layout/app-shell'
import { getSupabaseClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/fetch-all'
import { compressImage } from '@/lib/compress-image'
import { fmtMin } from '@/lib/dates'

type Me = { id: string; username: string; display_name: string | null; avatar_path: string | null; created_at: string }
type Warn = { delta: number; reason: string | null; created_at: string }
type Adj = { points: number; reason: string | null; created_at: string }
type TitleRow = { icon: string | null; name: string; at: string }

const AVATARS = 'ananteo-avatars'
const day = (s: string) => new Date(s).toLocaleDateString('ko-KR')

async function myAllTimeRank(uid: string): Promise<{ rank: number | null; minutes: number }> {
  const supabase = getSupabaseClient()
  const rows = await fetchAll((a, b) => supabase.from('study_entries').select('id, user_id, minutes').eq('status', 'approved').order('id').range(a, b))
  const totals = new Map<string, number>()
  rows.forEach((r) => totals.set(r.user_id, (totals.get(r.user_id) ?? 0) + (r.minutes ?? 0)))
  const ids = [...totals.keys()]
  const visible = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase.from('profiles').select('id').in('id', ids.slice(i, i + 100))
    ;(data ?? []).forEach((p: any) => visible.add(p.id))
  }
  const mine = totals.get(uid) ?? 0
  if (!mine) return { rank: null, minutes: 0 }
  let ahead = 0
  totals.forEach((m, id) => { if (visible.has(id) && m > mine) ahead++ })
  return { rank: ahead + 1, minutes: mine }
}

export default function ProfilePage() {
  return <AppShell>{(user) => <ProfileContent user={user} />}</AppShell>
}

function ProfileContent({ user }: { user: ShellUser }) {
  const [me, setMe] = useState<Me | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [points, setPoints] = useState(0)
  const [warn, setWarn] = useState({ count: 0, limit: 5 })
  const [rank, setRank] = useState<number | null>(null)
  const [minutes, setMinutes] = useState(0)
  const [warns, setWarns] = useState<Warn[]>([])
  const [adjs, setAdjs] = useState<Adj[]>([])
  const [titles, setTitles] = useState<TitleRow[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const supabase = getSupabaseClient()
    const [p, pt, w, wh, ah, aw, rk] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name, avatar_path, created_at').eq('id', user.id).single(),
      supabase.from('participant_point_balances').select('total_points').eq('user_id', user.id).maybeSingle(),
      supabase.from('participant_warning_balances').select('warning_count, warning_limit').eq('user_id', user.id).maybeSingle(),
      supabase.from('warning_events').select('delta, reason, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('point_adjustments').select('points, reason, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('user_title_awards').select('title_id, awarded_at').eq('user_id', user.id),
      myAllTimeRank(user.id),
    ])
    if (p.error) throw new Error(p.error.message)
    const prof = p.data as Me
    setMe(prof); setName(prof.display_name ?? '')
    setPoints(Number((pt.data as any)?.total_points ?? 0))
    setWarn({ count: Number((w.data as any)?.warning_count ?? 0), limit: Number((w.data as any)?.warning_limit ?? 5) })
    setWarns((wh.data ?? []) as Warn[]); setAdjs((ah.data ?? []) as Adj[])
    setRank(rk.rank); setMinutes(rk.minutes)
    const awards = (aw.data ?? []) as { title_id: string; awarded_at: string }[]
    if (awards.length) {
      const { data: ts } = await supabase.from('special_titles').select('id, title_name, icon').in('id', awards.map((a) => a.title_id))
      setTitles(awards.map((a) => { const t = (ts ?? []).find((x: any) => x.id === a.title_id) as any; return { icon: t?.icon ?? null, name: t?.title_name ?? '칭호', at: a.awarded_at } }))
    } else setTitles([])
    if (prof.avatar_path) {
      const { data: s } = await supabase.storage.from(AVATARS).createSignedUrl(prof.avatar_path, 3600)
      setAvatarUrl(s?.signedUrl ?? null)
    } else setAvatarUrl(null)
  }, [user.id])

  useEffect(() => { load().catch((e) => setMsg(e instanceof Error ? e.message : '불러오지 못했어요.')) }, [load])

  const supabase = getSupabaseClient()
  async function saveName() {
    const v = name.trim()
    if (v.length > 20) return setMsg('표시 이름은 20자 이하로 입력해 주세요.')
    setBusy(true); setMsg('')
    const { error } = await supabase.from('profiles').update({ display_name: v || null }).eq('id', user.id)
    setBusy(false)
    if (error) return setMsg(`저장하지 못했어요: ${error.message}`)
    setMsg('표시 이름을 저장했어요.'); load().catch(() => {})
  }
  async function uploadAvatar(file: File | undefined) {
    if (!file || !me) return
    if (!file.type.startsWith('image/')) return setMsg('이미지 파일만 올릴 수 있어요.')
    if (file.size > 30 * 1024 * 1024) return setMsg('사진은 30MB 이하만 올릴 수 있어요.')
    setBusy(true); setMsg('')
    let photo: File = file
    try { photo = await compressImage(file, 512, 0.85) } catch { photo = file }
    const ext = (photo.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const up = await supabase.storage.from(AVATARS).upload(path, photo, { contentType: photo.type })
    if (up.error) { setBusy(false); return setMsg(`사진을 올리지 못했어요: ${up.error.message}`) }
    const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id)
    if (error) { await supabase.storage.from(AVATARS).remove([path]); setBusy(false); return setMsg(`저장하지 못했어요: ${error.message}`) }
    if (me.avatar_path) await supabase.storage.from(AVATARS).remove([me.avatar_path])
    setBusy(false); setMsg('프로필 사진을 바꿨어요.'); load().catch(() => {})
  }
  async function redeem() {
    if (!confirm('2,000포인트를 사용해 경고 1회를 차감할까요?')) return
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('redeem_warning_for_points')
    setBusy(false)
    if (error) return setMsg(`교환하지 못했어요: ${error.message}`)
    setMsg('경고 1회를 차감했어요.'); load().catch(() => {})
  }

  const canRedeem = points >= 2000 && warn.count > 0
  const card = 'rounded-2xl border border-neutral-200 bg-white p-5'

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-neutral-400">PROFILE</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">내 프로필</h1>
      </div>
      {msg && <p role="status" className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">{msg}</p>}

      {me && (
        <div className={`${card} flex flex-wrap items-center gap-5`}>
          {avatarUrl ? <img src={avatarUrl} alt="" className="size-20 rounded-full object-cover" /> : <div className="flex size-20 items-center justify-center rounded-full bg-neutral-100 text-2xl text-neutral-500">{(me.display_name || me.username).slice(0, 1)}</div>}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-lg font-semibold">{me.display_name || me.username}</p>
            <p className="text-sm text-neutral-500">로그인 아이디 @{me.username} · 가입 {day(me.created_at)}</p>
            <label className="inline-block cursor-pointer text-xs text-neutral-500 underline">
              사진 변경<input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => uploadAvatar(e.target.files?.[0])} />
            </label>
          </div>
        </div>
      )}

      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">표시 이름</h2>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="랭킹과 커뮤니티에 보이는 이름" className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-neutral-900" />
          <button disabled={busy} onClick={saveName} className="h-11 rounded-full bg-neutral-950 px-5 text-sm text-white disabled:opacity-50">저장</button>
        </div>
        <p className="text-xs text-neutral-400">로그인 아이디는 안전을 위해 여기서 바꿀 수 없어요.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['누적 학습', fmtMin(minutes)],
          ['전체 랭킹', rank ? `${rank}위` : '-'],
          ['보유 포인트', `${points.toLocaleString()}P`],
          ['경고', `${warn.count} / ${warn.limit}`],
        ].map(([k, v]) => <div key={k} className={card}><p className="text-xs text-neutral-400">{k}</p><p className="mt-2 text-xl font-semibold tabular-nums">{v}</p></div>)}
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold">경고 차감</h2>
        <p className="text-sm text-neutral-500">2,000포인트를 사용해 경고 1회를 줄일 수 있어요.</p>
        <button disabled={busy || !canRedeem} onClick={redeem} className="h-10 rounded-full bg-neutral-950 px-6 text-sm text-white disabled:opacity-40">2,000P로 경고 1회 차감</button>
        {!canRedeem && <p className="text-xs text-neutral-400">{warn.count === 0 ? '차감할 경고가 없어요.' : '포인트가 2,000P 이상일 때 사용할 수 있어요.'}</p>}
      </div>

      <div className={card}>
        <h2 className="mb-3 font-semibold">내 칭호</h2>
        {titles.length === 0 ? <p className="text-sm text-neutral-500">아직 받은 칭호가 없어요.</p> : (
          <div className="flex flex-wrap gap-2">{titles.map((t, i) => <span key={i} className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm">{t.icon ?? '🏅'} {t.name}</span>)}</div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-3 font-semibold">포인트 조정 내역</h2>
          {adjs.length === 0 ? <p className="text-sm text-neutral-500">내역이 없어요.</p> : adjs.map((a, i) => (
            <div key={i} className="flex justify-between gap-3 border-t py-2 text-sm first:border-t-0"><span className="text-neutral-600">{a.reason ?? '-'}<span className="ml-2 text-xs text-neutral-400">{day(a.created_at)}</span></span><span className="tabular-nums">{a.points > 0 ? '+' : ''}{a.points}P</span></div>
          ))}
          <p className="mt-3 text-xs text-neutral-400">학습 시간으로 쌓인 포인트(10분당 5P)는 승인된 기록에서 자동 계산돼요.</p>
        </div>
        <div className={card}>
          <h2 className="mb-3 font-semibold">경고 내역</h2>
          {warns.length === 0 ? <p className="text-sm text-neutral-500">내역이 없어요.</p> : warns.map((w, i) => (
            <div key={i} className="flex justify-between gap-3 border-t py-2 text-sm first:border-t-0"><span className="text-neutral-600">{w.reason ?? '-'}<span className="ml-2 text-xs text-neutral-400">{day(w.created_at)}</span></span><span className="tabular-nums">{w.delta > 0 ? '+' : ''}{w.delta}</span></div>
          ))}
        </div>
      </div>
    </div>
  )
}

