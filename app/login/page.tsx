import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = {
  title: '로그인 | ANANTHEO',
  description: 'ANANTHEO 계정으로 로그인하세요.',
}

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <p className="text-2xl font-semibold tracking-[0.3em] text-foreground">ANANTHEO</p>
          <h1 className="mt-3 text-sm text-muted-foreground">계정에 로그인하세요</h1>
        </header>
        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          아직 계정이 없나요? <a href="/signup/" className="text-foreground underline">회원가입</a>
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          비밀번호를 잊으셨나요? <a href="/reset-password/" className="text-foreground underline">비밀번호 찾기</a>
        </p>
      </div>
    </main>
  )
}

