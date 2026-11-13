'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, ShieldCheck } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/client'

export type ShellUser = { id: string; username: string; display_name: string | null; role: string }

const NAV = [
  { href: '/', label: '홈' },
  { href: '/study', label: '학습 기록' },
  { href: '/ranking', label: '랭킹' },
  { href: '/calendar', label: '달력' },
  { href: '/stats', label: '통계' },
  { href: '/community', label: '커뮤니티' },
  { href: '/notices', label: '공지' },
  { href: '/challenges', label: '챌린지' },
  { href: '/quotes', label: '문장' },
  { href: '/titles', label: '칭호' },
  { href: '/shop', label: '상점' },
  { href: '/profile', label: '프로필' },
]

export function AppShell({ children }: { children: (user: ShellUser) => ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<ShellUser | null>(null)
  const current = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  const [badges, setBadges] = useState<Record<string, number>>({})

  useEffect(() => {
    const supabase = getSupabaseClient()
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return router.replace('/login')
      const { data: p } = await supabase
        .from('profiles')
        .select('id, username, display_name, role, is_suspended')
        .eq('id', data.user.id)
        .maybeSingle()
      if (!p || p.is_suspended) {
        await supabase.auth.signOut()
        alert('이용할 수 없는 계정입니다. 관리자에게 문의해 주세요.')
        return router.replace('/login')
      }
      setUser(p as ShellUser)
    })().catch(() => router.replace('/login'))
  }, [router])

  // 메뉴 알림 배지: 읽지 않은 공지, 새 승인·반려 결과, (관리자) 처리 대기 건수
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const s = getSupabaseClient()
    ;(async () => {
      const out: Record<string, number> = {}
      const key = `anantheo_seen_study_${user.id}`
      let seen: string | null = null
      try { seen = localStorage.getItem(key) } catch {}
      if (!seen || current === '/study') {
        seen = new Date().toISOString()
        try { localStorage.setItem(key, seen) } catch {}
      }
      const [n, r, e, p] = await Promise.all([
        s.from('announcements').select('id').eq('is_published', true),
        s.from('announcement_reads').select('announcement_id').eq('user_id', user.id),
        s.from('study_entries').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['approved', 'rejected']).gt('reviewed_at', seen),
        s.from('study_proofs').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['approved', 'rejected']).gt('reviewed_at', seen),
      ])
      const read = new Set((r.data ?? []).map((x: any) => x.announcement_id as string))
      out['/notices'] = (n.data ?? []).filter((x: any) => !read.has(x.id)).length
      out['/study'] = (e.count ?? 0) + (p.count ?? 0)
      if (user.role === 'admin') {
        const [pe, pp, po] = await Promise.all([
          s.from('study_entries').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          s.from('study_proofs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          s.from('shop_purchases').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        ])
        out['/admin'] = (pe.count ?? 0) + (pp.count ?? 0) + (po.count ?? 0)
      }
      if (!cancelled) setBadges(out)
    })().catch(() => {})
    return () => { cancelled = true }
  }, [user, current])

  const dot = (href: string) =>
    (badges[href] ?? 0) > 0 ? (
      <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium leading-4 text-white">
        {badges[href] > 99 ? '99+' : badges[href]}
      </span>
    ) : null

  async function logout() {
    await getSupabaseClient().auth.signOut()
    router.replace('/login')
  }

  if (!user) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-[#fafafa] text-sm text-neutral-500">
        불러오는 중이에요.
      </main>
    )
  }

  return (
    <div className="min-h-svh bg-[#fafafa] text-neutral-950">
      <header className="sticky top-0 z-10 border-b border-neutral-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3 sm:px-8 sm:py-4">
          <Link href="/" className="text-base font-semibold tracking-[0.32em]">ANANTHEO</Link>
          <nav className="flex max-w-full items-center gap-1 overflow-x-auto text-sm whitespace-nowrap">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                className={`rounded-full px-3 py-2 ${current === n.href ? 'bg-neutral-950 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}>
                {n.label}{dot(n.href)}
              </Link>
            ))}
            {user.role === 'admin' && (
              <Link href="/admin" className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-neutral-500 hover:bg-neutral-100">
                <ShieldCheck size={14} /> 관리자{dot('/admin')}
              </Link>
            )}
            <button onClick={logout} aria-label="로그아웃" className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100">
              <LogOut size={16} />
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-9 sm:px-8">{children(user)}</main>
    </div>
  )
}

