'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppShell, type ShellUser } from '@/components/layout/app-shell'
import { getSupabaseClient } from '@/lib/supabase/client'
import { fetchAll } from '@/lib/fetch-all'

type Title = { id: string; title_name: string; description: string | null; icon: string | null }
type Award = { id: string; user_id: string; title_id: string; awarded_at: string; note: string | null }
type Member = { id: string; name: string }

export default function TitlesPage() {
  return <AppShell>{(user) => <TitlesContent user={user} />}</AppShell>
}

function TitlesContent({ user }: { user: ShellUser }) {
  const isAdmin = user.role === 'admin'
  const [titles, setTitles] = useState<Title[]>([])
  const [awards, setAwards] = useState<Award[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [nf, setNf] = useState({ name: '', desc: '', icon: '' })
  const [af, setAf] = useState({ title: '', user: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const supabase = getSupabaseClient()
    const [t, a] = await Promise.all([
      supabase.from('special_titles').select('id, title_name, description, icon').order('created_at', { ascending: true }),
      fetchAll((x, y) => supabase.from('user_title_awards').select('id, user_id, title_id, awarded_at, note').order('id').range(x, y)),
    ])
    if (t.error) throw new Error(t.error.message)
    setTitles((t.data ?? []) as Title[])
    setAwards(a as Award[])
    const ids = [...new Set((a as Award[]).map((r) => r.user_id))]
    const list: Member[] = []
    if (isAdmin) {
      const { data } = await supabase.from('profiles').select('id, username, display_name').order('username').limit(500)
      ;(data ?? []).forEach((u: any) => list.push({ id: u.id, name: u.display_name || u.username }))
    } else {
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('profiles').select('id, username, display_name').in('id', ids.slice(i, i + 100))
        ;(data ?? []).forEach((u: any) => list.push({ id: u.id, name: u.display_name || u.username }))
      }
    }
    setMembers(list)
  }, [isAdmin])

  useEffect(() => { load().catch((e) => setMsg(e instanceof Error ? e.message : '불러오지 못했어요.')) }, [load])

  async function run(job: () => PromiseLike<{ error: { message: string } | null }>, ok = '') {
    setBusy(true); setMsg('')
    const { error } = await job()
    if (error) setMsg(`처리하지 못했어요: ${error.message}`)
    else { setMsg(ok); await load().catch(() => {}) }
    setBusy(false)
    return !error
  }
  const supabase = getSupabaseClient()
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '알 수 없음'
  const titleOf = (id: string) => titles.find((t) => t.id === id)

  async function createTitle() {
    if (!nf.name.trim()) return setMsg('칭호 이름을 입력해 주세요.')
    const ok = await run(() => supabase.from('special_titles').insert({ title_name: nf.name.trim(), description: nf.desc.trim() || null, icon: nf.icon.trim() || null }), '칭호를 만들었어요.')
    if (ok) setNf({ name: '', desc: '', icon: '' })
  }
  async function award() {
    if (!af.title || !af.user) return setMsg('칭호와 회원을 선택해 주세요.')
    if (awards.some((a) => a.title_id === af.title && a.user_id === af.user)) return setMsg('이미 부여된 칭호예요.')
    const ok = await run(() => supabase.from('user_title_awards').insert({ user_id: af.user, title_id: af.title, awarded_by: user.id, note: af.note.trim() || null }), '칭호를 부여했어요.')
    if (ok) setAf({ ...af, note: '' })
  }
  const removeTitle = (t: Title) => {
    const n = awards.filter((a) => a.title_id === t.id).length
    const ask = n ? `'${t.title_name}' 칭호는 ${n}명에게 부여되어 있어요. 삭제하면 부여 내역도 함께 삭제돼요. 계속할까요?` : `'${t.title_name}' 칭호를 삭제할까요?`
    if (!confirm(ask)) return
    return run(async () => {
      if (n) {
        const r = await supabase.from('user_title_awards').delete().eq('title_id', t.id)
        if (r.error) return r
      }
      return supabase.from('special_titles').delete().eq('id', t.id)
    }, '칭호를 삭제했어요.')
  }
  const revoke = (a: Award) => confirm('이 칭호를 회수할까요?') && run(() => supabase.from('user_title_awards').delete().eq('id', a.id), '칭호를 회수했어요.')

  const mine = awards.filter((a) => a.user_id === user.id)
  const field = 'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900'

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-neutral-400">TITLES</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">칭호</h1>
      </div>
      {msg && <p role="status" className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">{msg}</p>}

      <section>
        <h2 className="mb-3 font-semibold">내 칭호</h2>
        {mine.length === 0 ? <p className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">아직 받은 칭호가 없어요.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((a) => { const t = titleOf(a.title_id); return (
              <div key={a.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
                <p className="text-2xl">{t?.icon ?? '🏅'}</p>
                <p className="mt-2 font-semibold">{t?.title_name ?? '칭호'}</p>
                {t?.description && <p className="mt-1 text-sm text-neutral-500">{t.description}</p>}
                <p className="mt-2 text-xs text-neutral-400">{new Date(a.awarded_at).toLocaleDateString('ko-KR')} 획득{a.note ? ` · ${a.note}` : ''}</p>
              </div>
            ) })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">전체 칭호</h2>
        <div className="divide-y rounded-2xl border border-neutral-200 bg-white">
          {titles.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">등록된 칭호가 없어요.</p>}
          {titles.map((t) => (
            <div key={t.id} className="flex items-center gap-4 px-5 py-4">
              <span className="text-2xl">{t.icon ?? '🏅'}</span>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{t.title_name}</p>{t.description && <p className="text-xs text-neutral-500">{t.description}</p>}</div>
              <span className="text-xs text-neutral-400">{awards.filter((a) => a.title_id === t.id).length}명</span>
              {isAdmin && <button disabled={busy} onClick={() => removeTitle(t)} className="text-xs text-neutral-500 hover:text-neutral-950">삭제</button>}
            </div>
          ))}
        </div>
      </section>

      {isAdmin && (
        <>
          <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="font-semibold">칭호 만들기</h2>
            <input className={field} placeholder="칭호 이름" maxLength={30} value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
            <input className={field} placeholder="아이콘 (이모지 1개, 예: 🌱)" maxLength={8} value={nf.icon} onChange={(e) => setNf({ ...nf, icon: e.target.value })} />
            <input className={field} placeholder="설명 (선택)" maxLength={100} value={nf.desc} onChange={(e) => setNf({ ...nf, desc: e.target.value })} />
            <button disabled={busy} onClick={createTitle} className="h-10 rounded-full bg-neutral-950 px-6 text-sm text-white disabled:opacity-50">만들기</button>
          </section>

          <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="font-semibold">칭호 부여</h2>
            <select className={field} value={af.title} onChange={(e) => setAf({ ...af, title: e.target.value })}>
              <option value="">칭호 선택</option>
              {titles.map((t) => <option key={t.id} value={t.id}>{t.icon ?? ''} {t.title_name}</option>)}
            </select>
            <select className={field} value={af.user} onChange={(e) => setAf({ ...af, user: e.target.value })}>
              <option value="">회원 선택</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input className={field} placeholder="메모 (선택)" maxLength={100} value={af.note} onChange={(e) => setAf({ ...af, note: e.target.value })} />
            <button disabled={busy} onClick={award} className="h-10 rounded-full bg-neutral-950 px-6 text-sm text-white disabled:opacity-50">부여하기</button>
          </section>

          <section>
            <h2 className="mb-3 font-semibold">부여 내역</h2>
            <div className="divide-y rounded-2xl border border-neutral-200 bg-white">
              {awards.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">부여 내역이 없어요.</p>}
              {[...awards].sort((a, b) => b.awarded_at.localeCompare(a.awarded_at)).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span>{titleOf(a.title_id)?.icon} {titleOf(a.title_id)?.title_name} → {nameOf(a.user_id)} <span className="text-xs text-neutral-400">{new Date(a.awarded_at).toLocaleDateString('ko-KR')}</span></span>
                  <button disabled={busy} onClick={() => revoke(a)} className="text-xs text-neutral-500 hover:text-neutral-950">회수</button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

