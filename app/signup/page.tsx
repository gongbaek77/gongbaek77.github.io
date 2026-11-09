'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    setMsg('')
    const name = username.trim()
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return setMsg('아이디는 영문, 숫자, 밑줄(_)로 3~20자로 입력해 주세요.')
    if (pw.length < 8) return setMsg('비밀번호는 8자 이상으로 입력해 주세요.')
    if (pw !== pw2) return setMsg('비밀번호가 서로 달라요.')
    setBusy(true)
    const { data, error } = await getSupabaseClient().auth.signUp({ email: email.trim(), password: pw, options: { data: { username: name } } })
    setBusy(false)
    if (error) return setMsg(`가입하지 못했어요: ${error.message} (이미 사용 중인 아이디나 이메일일 수 있어요)`)
    if (data.session) { router.replace('/'); return }
    setDone(true)
  }

  const field = 'h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-950 placeholder:text-neutral-400 outline-none focus:border-neutral-900'
  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4 py-12 text-neutral-950">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <p className="text-2xl font-semibold tracking-[0.3em] text-neutral-950">ANANTHEO</p>
          <h1 className="mt-3 text-sm text-neutral-500">나는 다시 피어난다. 새 계정을 만들어요</h1>
        </header>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {done ? (
            <div className="space-y-4 text-center text-sm">
              <p className="font-medium">가입 신청이 완료됐어요.</p>
              <p className="text-neutral-500">이메일로 확인 메일이 갔다면 메일의 링크를 누른 뒤, 아이디로 로그인해 주세요.</p>
              <a href="/login/" className="inline-block rounded-full bg-neutral-950 px-6 py-2.5 text-white">로그인하러 가기</a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <input className={field} placeholder="아이디 (영문·숫자·_ 3~20자)" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" required />
              <input className={field} type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              <input className={field} type="password" placeholder="비밀번호 (8자 이상)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
              <input className={field} type="password" placeholder="비밀번호 확인" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
              {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}
              <button disabled={busy} className="h-11 w-full rounded-full bg-neutral-950 text-sm font-medium text-white disabled:opacity-50">가입하기</button>
              <p className="pt-2 text-center text-xs text-neutral-500">이미 계정이 있나요? <a href="/login/" className="underline">로그인</a></p>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
