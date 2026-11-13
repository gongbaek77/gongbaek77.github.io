'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'

type Mode = 'checking' | 'request' | 'sent' | 'reset' | 'done'

export default function ResetPasswordPage() {
  const [mode, setMode] = useState<Mode>('checking')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // 메일의 링크로 들어왔는지(비밀번호 변경 화면) 확인합니다.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    if (hash.get('error_code') || query.get('error_code')) {
      setMsg('링크가 만료됐거나 이미 사용됐어요. 아래에서 다시 요청해 주세요.')
      setMode('request')
      return
    }
    const access = hash.get('access_token')
    const refresh = hash.get('refresh_token')
    if (access && refresh && hash.get('type') === 'recovery') {
      getSupabaseClient()
        .auth.setSession({ access_token: access, refresh_token: refresh })
        .then(({ error }) => {
          window.history.replaceState(null, '', window.location.pathname)
          if (error) {
            setMsg('링크를 확인하지 못했어요. 아래에서 다시 요청해 주세요.')
            setMode('request')
          } else {
            setMode('reset')
          }
        })
      return
    }
    setMode('request')
  }, [])

  async function requestReset(ev: FormEvent) {
    ev.preventDefault()
    setMsg('')
    if (!email.trim()) return setMsg('가입할 때 쓴 이메일을 입력해 주세요.')
    setBusy(true)
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password/`,
    })
    setBusy(false)
    if (error) return setMsg(`메일을 보내지 못했어요: ${error.message}`)
    setMode('sent')
  }

  async function saveNewPassword(ev: FormEvent) {
    ev.preventDefault()
    setMsg('')
    if (pw.length < 8) return setMsg('비밀번호는 8자 이상으로 입력해 주세요.')
    if (pw !== pw2) return setMsg('비밀번호가 서로 달라요.')
    setBusy(true)
    const supabase = getSupabaseClient()
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) {
      setBusy(false)
      return setMsg(`비밀번호를 바꾸지 못했어요: ${error.message}`)
    }
    await supabase.auth.signOut()
    setBusy(false)
    setMode('done')
  }

  const field = 'h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-950 placeholder:text-neutral-400 outline-none focus:border-neutral-900'
  const btn = 'h-11 w-full rounded-full bg-neutral-950 text-sm font-medium text-white disabled:opacity-50'

  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4 py-12 text-neutral-950">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <p className="text-2xl font-semibold tracking-[0.3em] text-neutral-950">ANANTHEO</p>
          <h1 className="mt-3 text-sm text-neutral-500">비밀번호 찾기</h1>
        </header>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          {mode === 'checking' && <p className="text-center text-sm text-neutral-500">확인하는 중이에요.</p>}

          {mode === 'request' && (
            <form onSubmit={requestReset} className="space-y-3">
              <p className="text-sm text-neutral-600">가입할 때 쓴 이메일을 입력하면 비밀번호를 바꿀 수 있는 링크를 보내드려요.</p>
              <input className={field} type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}
              <button disabled={busy} className={btn}>링크 보내기</button>
              <p className="pt-2 text-center text-xs text-neutral-500"><a href="/login/" className="underline">로그인으로 돌아가기</a></p>
            </form>
          )}

          {mode === 'sent' && (
            <div className="space-y-4 text-center text-sm">
              <p className="font-medium">메일을 보냈어요.</p>
              <p className="text-neutral-500">가입된 이메일이라면 곧 링크가 도착해요. 메일함과 스팸함을 확인하고, 링크를 눌러 새 비밀번호를 정해 주세요.</p>
              <a href="/login/" className="inline-block rounded-full bg-neutral-950 px-6 py-2.5 text-white">로그인으로 돌아가기</a>
            </div>
          )}

          {mode === 'reset' && (
            <form onSubmit={saveNewPassword} className="space-y-3">
              <p className="text-sm text-neutral-600">새 비밀번호를 정해 주세요.</p>
              <input className={field} type="password" placeholder="새 비밀번호 (8자 이상)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
              <input className={field} type="password" placeholder="새 비밀번호 확인" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
              {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}
              <button disabled={busy} className={btn}>비밀번호 바꾸기</button>
            </form>
          )}

          {mode === 'done' && (
            <div className="space-y-4 text-center text-sm">
              <p className="font-medium">비밀번호를 바꿨어요.</p>
              <p className="text-neutral-500">새 비밀번호로 아이디 로그인을 해 주세요.</p>
              <a href="/login/" className="inline-block rounded-full bg-neutral-950 px-6 py-2.5 text-white">로그인하러 가기</a>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

