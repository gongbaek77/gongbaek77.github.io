'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AppShell, type ShellUser } from '@/components/layout/app-shell'
import { getSupabaseClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress-image'
import { todayStr } from '@/lib/dates'

type Entry = { id: string; study_date: string; minutes: number; memo: string | null; status: string }
type Proof = { id: string; study_date: string; storage_path: string; caption: string | null; status: string; url?: string }

const BUCKET = 'ananteo-study-proofs'
const STATUS: Record<string, string> = { pending: '승인 대기', approved: '승인', rejected: '반려' }
const today = todayStr
const badge = (s: string) =>
  `rounded-full px-2.5 py-1 text-xs ${s === 'approved' ? 'bg-neutral-950 text-white' : s === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`

export default function StudyPage() {
  return <AppShell>{(user) => <StudyContent user={user} />}</AppShell>
}

function StudyContent({ user }: { user: ShellUser }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [proofs, setProofs] = useState<Proof[]>([])
  const [date, setDate] = useState(today())
  const [minutes, setMinutes] = useState('')
  const [memo, setMemo] = useState('')
  const [pDate, setPDate] = useState(today())
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const supabase = getSupabaseClient()
    const [e, p] = await Promise.all([
      supabase.from('study_entries').select('id, study_date, minutes, memo, status').eq('user_id', user.id).order('study_date', { ascending: false }).order('created_at', { ascending: false }).limit(50),
      supabase.from('study_proofs').select('id, study_date, storage_path, caption, status').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    ])
    setEntries((e.data ?? []) as Entry[])
    const list = (p.data ?? []) as Proof[]
    if (list.length) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(list.map((x) => x.storage_path), 3600)
      list.forEach((x) => { x.url = signed?.find((s) => s.path === x.storage_path)?.signedUrl ?? undefined })
    }
    setProofs(list)
  }, [user.id])

  useEffect(() => { load().catch(() => setMsg('기록을 불러오지 못했어요. 새로고침해 주세요.')) }, [load])

  async function submitEntry(ev: FormEvent) {
    ev.preventDefault()
    const m = Number(minutes)
    if (!Number.isInteger(m) || m < 1 || m > 1440) return setMsg('학습 시간은 1~1440분 사이의 숫자로 입력해 주세요.')
    if (date > today()) return setMsg('미래 날짜는 기록할 수 없어요.')
    setBusy(true); setMsg('')
    const { error } = await getSupabaseClient().from('study_entries').insert({
      user_id: user.id, study_date: date, minutes: m, memo: memo.trim() || null, status: 'pending',
    })
    setBusy(false)
    if (error) return setMsg(`제출하지 못했어요: ${error.message}`)
    setMinutes(''); setMemo('')
    setMsg('제출했어요. 관리자 승인 후 포인트에 반영돼요.')
    load()
  }

  async function submitProof(ev: FormEvent) {
    ev.preventDefault()
    if (!file) return setMsg('인증 사진을 선택해 주세요.')
    if (!file.type.startsWith('image/')) return setMsg('이미지 파일만 올릴 수 있어요.')
    if (file.size > 30 * 1024 * 1024) return setMsg('사진은 30MB 이하만 올릴 수 있어요.')
    setBusy(true); setMsg('')
    const supabase = getSupabaseClient()
    let photo: File = file
    try { photo = await compressImage(file) } catch { photo = file }
    const ext = (photo.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const up = await supabase.storage.from(BUCKET).upload(path, photo, { contentType: photo.type })
    if (up.error) { setBusy(false); return setMsg(`사진을 올리지 못했어요: ${up.error.message}`) }
    const { error } = await supabase.from('study_proofs').insert({
      user_id: user.id, study_date: pDate, storage_path: path, caption: caption.trim() || null, status: 'pending',
    })
    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      setBusy(false)
      return setMsg(`인증을 제출하지 못했어요: ${error.message}`)
    }
    setBusy(false); setFile(null); setCaption('')
    setMsg('인증 사진을 제출했어요. 관리자 검토를 기다려 주세요.')
    load()
  }

  const input = 'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900'
  const btn = 'h-11 rounded-full bg-neutral-950 px-6 text-sm font-medium text-white disabled:opacity-50'

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-[0.2em] text-neutral-400">STUDY LOG</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">학습 기록</h1>
        <p className="mt-2 text-sm text-neutral-500">승인된 시간만 포인트(10분당 5P)에 반영돼요.</p>
        <p className="mt-1 text-xs text-neutral-400">학습 날짜는 새벽 5시에 바뀌어요. 지금 기록하면 {today()} 학습으로 들어가요.</p>
      </div>
      {msg && <p role="status" className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">{msg}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={submitEntry} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="font-semibold">공부 시간 기록</h2>
          <input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} className={input} required />
          <input type="number" inputMode="numeric" min={1} max={1440} placeholder="학습 시간 (분)" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={input} required />
          <textarea placeholder="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} maxLength={500} className={`${input} h-auto py-3`} />
          <button disabled={busy} className={btn}>제출하기</button>
        </form>

        <form onSubmit={submitProof} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="font-semibold">공부 인증 사진</h2>
          <input type="date" max={today()} value={pDate} onChange={(e) => setPDate(e.target.value)} className={input} required />
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          <input placeholder="설명 (선택)" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} className={input} />
          <button disabled={busy} className={btn}>인증 제출</button>
        </form>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">내 학습 기록</h2>
        <div className="divide-y rounded-2xl border border-neutral-200 bg-white">
          {entries.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">아직 제출한 기록이 없어요.</p>}
          {entries.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-sm font-medium">{e.study_date} · {e.minutes}분</p>
                {e.memo && <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-500">{e.memo}</p>}
              </div>
              <span className={badge(e.status)}>{STATUS[e.status] ?? e.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">내 인증 사진</h2>
        {proofs.length === 0 ? (
          <p className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">아직 제출한 인증이 없어요.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {proofs.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                {p.url ? <img src={p.url} alt={p.caption ?? '공부 인증'} className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-neutral-100" />}
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="text-xs text-neutral-500">{p.study_date}</span>
                  <span className={badge(p.status)}>{STATUS[p.status] ?? p.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

