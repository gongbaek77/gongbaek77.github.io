'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppShell, type ShellUser } from '@/components/layout/app-shell'
import { getSupabaseClient } from '@/lib/supabase/client'
import { todayStr } from '@/lib/dates'

type Quote = { id: string; user_id: string; book_title: string; quote_text: string; quote_date: string }

export default function QuotesPage() {
  return <AppShell>{(user) => <QuotesContent user={user} />}</AppShell>
}

function QuotesContent({ user }: { user: ShellUser }) {
  const isAdmin = user.role === 'admin'
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [onlyMine, setOnlyMine] = useState(false)
  const [book, setBook] = useState('')
  const [text, setText] = useState('')
  const [edit, setEdit] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.from('daily_quotes').select('id, user_id, book_title, quote_text, quote_date').order('quote_date', { ascending: false }).order('created_at', { ascending: false }).limit(100)
    if (error) throw new Error(error.message)
    const list = (data ?? []) as Quote[]
    setQuotes(list)
    const ids = [...new Set(list.map((q) => q.user_id))]
    const map = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 100) {
      const { data: ps } = await supabase.from('profiles').select('id, username, display_name').in('id', ids.slice(i, i + 100))
      ;(ps ?? []).forEach((u: any) => map.set(u.id, u.display_name || u.username))
    }
    setNames(map)
  }, [])

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

  async function add() {
    if (!book.trim() || !text.trim()) return setMsg('책 제목과 문장을 모두 입력해 주세요.')
    const ok = await run(() => supabase.from('daily_quotes').insert({ user_id: user.id, book_title: book.trim(), quote_text: text.trim(), quote_date: todayStr() }), '오늘의 문장을 등록했어요.')
    if (ok) { setBook(''); setText('') }
  }
  async function saveEdit() {
    if (!edit || !edit.book_title.trim() || !edit.quote_text.trim()) return setMsg('책 제목과 문장을 모두 입력해 주세요.')
    if (await run(() => supabase.from('daily_quotes').update({ book_title: edit.book_title.trim(), quote_text: edit.quote_text.trim() }).eq('id', edit.id))) setEdit(null)
  }
  const remove = (q: Quote) => confirm('이 문장을 삭제할까요?') && run(() => supabase.from('daily_quotes').delete().eq('id', q.id))

  const base = isAdmin ? quotes : quotes.filter((q) => names.has(q.user_id))
  const shown = onlyMine ? base.filter((q) => q.user_id === user.id) : base
  const field = 'w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900'

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-neutral-400">DAILY QUOTE</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">오늘의 문장</h1>
        <p className="mt-2 text-sm text-neutral-500">오늘 읽은 책에서 마음에 남은 문장을 기록해요.</p>
      </div>
      {msg && <p role="status" className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">{msg}</p>}

      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
        <input className={`${field} h-11`} placeholder="책 제목" maxLength={100} value={book} onChange={(e) => setBook(e.target.value)} />
        <textarea className={`${field} py-3`} rows={3} placeholder="인상 깊은 문장" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={busy} onClick={add} className="h-10 rounded-full bg-neutral-950 px-6 text-sm text-white disabled:opacity-50">등록하기</button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setOnlyMine(false)} className={`rounded-full px-4 py-2 text-sm ${!onlyMine ? 'bg-neutral-950 text-white' : 'border border-neutral-200 bg-white text-neutral-500'}`}>전체</button>
        <button onClick={() => setOnlyMine(true)} className={`rounded-full px-4 py-2 text-sm ${onlyMine ? 'bg-neutral-950 text-white' : 'border border-neutral-200 bg-white text-neutral-500'}`}>내 문장</button>
      </div>

      {shown.length === 0 && <p className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">등록된 문장이 없어요.</p>}
      {shown.map((q) => (
        <article key={q.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
          {edit?.id === q.id ? (
            <div className="space-y-2">
              <input className={`${field} h-11`} value={edit.book_title} maxLength={100} onChange={(e) => setEdit({ ...edit, book_title: e.target.value })} />
              <textarea className={`${field} py-3`} rows={3} maxLength={500} value={edit.quote_text} onChange={(e) => setEdit({ ...edit, quote_text: e.target.value })} />
              <div className="flex gap-3 text-sm"><button onClick={saveEdit} className="font-medium">저장</button><button onClick={() => setEdit(null)} className="text-neutral-500">취소</button></div>
            </div>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-7">“{q.quote_text}”</p>
              <p className="mt-3 text-xs text-neutral-500">《{q.book_title}》 · {names.get(q.user_id) ?? '알 수 없음'} · {q.quote_date}</p>
              <div className="mt-2 flex gap-4 text-xs text-neutral-500">
                {q.user_id === user.id && <button onClick={() => setEdit(q)} className="hover:text-neutral-950">수정</button>}
                {isAdmin && <button onClick={() => remove(q)} className="hover:text-neutral-950">삭제</button>}
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  )
}

