'use client'

import { useCallback, useEffect, useState } from 'react'
import { Heart, MessageCircle } from 'lucide-react'
import { AppShell, type ShellUser } from '@/components/layout/app-shell'
import { getSupabaseClient } from '@/lib/supabase/client'

type Post = { id: string; user_id: string; body: string; is_hidden: boolean; created_at: string; updated_at: string | null }
type Comment = { id: string; post_id: string; user_id: string; body: string; is_hidden: boolean; created_at: string }
type Reaction = { post_id: string; user_id: string }

const PAGE = 20
const when = (s: string) =>
  new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function CommunityPage() {
  return <AppShell>{(user) => <CommunityContent user={user} />}</AppShell>
}

function CommunityContent({ user }: { user: ShellUser }) {
  const isAdmin = user.role === 'admin'
  const [limit, setLimit] = useState(PAGE)
  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [text, setText] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const supabase = getSupabaseClient()
    const { data: p, error } = await supabase
      .from('community_posts')
      .select('id, user_id, body, is_hidden, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    const list = (p ?? []) as Post[]
    const ids = list.map((x) => x.id)
    let cs: Comment[] = []
    let rs: Reaction[] = []
    if (ids.length) {
      const [c, r] = await Promise.all([
        supabase.from('community_comments').select('id, post_id, user_id, body, is_hidden, created_at').in('post_id', ids).order('created_at', { ascending: true }),
        supabase.from('community_reactions').select('post_id, user_id').in('post_id', ids),
      ])
      cs = (c.data ?? []) as Comment[]
      rs = (r.data ?? []) as Reaction[]
    }
    const userIds = [...new Set([...list.map((x) => x.user_id), ...cs.map((x) => x.user_id)])]
    const map = new Map<string, string>()
    for (let i = 0; i < userIds.length; i += 100) {
      const { data } = await supabase.from('profiles').select('id, username, display_name').in('id', userIds.slice(i, i + 100))
      ;(data ?? []).forEach((u: any) => map.set(u.id, u.display_name || u.username))
    }
    setPosts(list); setComments(cs); setReactions(rs); setNames(map)
  }, [limit])

  useEffect(() => { load().catch((e) => setMsg(e instanceof Error ? e.message : '불러오지 못했어요.')) }, [load])

  async function run(job: () => PromiseLike<{ error: { message: string } | null }>, okMsg = '') {
    setBusy(true); setMsg('')
    const { error } = await job()
    if (error) setMsg(`처리하지 못했어요: ${error.message}`)
    else { if (okMsg) setMsg(okMsg); await load().catch(() => {}) }
    setBusy(false)
    return !error
  }

  const supabase = getSupabaseClient()
  const nameOf = (id: string) => names.get(id) ?? '알 수 없음'

  async function addPost() {
    const body = text.trim()
    if (!body) return setMsg('내용을 입력해 주세요.')
    if (await run(() => supabase.from('community_posts').insert({ user_id: user.id, body, is_hidden: false }))) setText('')
  }
  const toggleLike = (postId: string, liked: boolean) =>
    run(() => liked
      ? supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', user.id)
      : supabase.from('community_reactions').insert({ post_id: postId, user_id: user.id }))
  const removePost = (id: string) => confirm('이 글을 삭제할까요?') && run(() => supabase.from('community_posts').delete().eq('id', id))
  const hidePost = (p: Post) => run(() => supabase.from('community_posts').update({ is_hidden: !p.is_hidden }).eq('id', p.id))
  const saveEdit = async () => {
    if (!editing || !editing.body.trim()) return setMsg('내용을 입력해 주세요.')
    if (await run(() => supabase.from('community_posts').update({ body: editing.body.trim(), updated_at: new Date().toISOString() }).eq('id', editing.id))) setEditing(null)
  }
  const addComment = (postId: string, body: string) =>
    run(() => supabase.from('community_comments').insert({ post_id: postId, user_id: user.id, body: body.trim(), is_hidden: false }))
  const removeComment = (id: string) => confirm('이 댓글을 삭제할까요?') && run(() => supabase.from('community_comments').delete().eq('id', id))
  const hideComment = (c: Comment) => run(() => supabase.from('community_comments').update({ is_hidden: !c.is_hidden }).eq('id', c.id))

  const small = 'text-xs text-neutral-500 hover:text-neutral-950'
  const shownPosts = isAdmin ? posts : posts.filter((p) => names.has(p.user_id))

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-neutral-400">COMMUNITY</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">커뮤니티</h1>
        <p className="mt-2 text-sm text-neutral-500">공부 이야기를 나누고 서로 응원해요.</p>
      </div>
      {msg && <p role="status" className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">{msg}</p>}

      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="오늘의 공부 이야기를 남겨보세요"
          className="w-full rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-neutral-900" />
        <button disabled={busy} onClick={addPost} className="h-10 rounded-full bg-neutral-950 px-6 text-sm text-white disabled:opacity-50">글 올리기</button>
      </div>

      {shownPosts.length === 0 && <p className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">아직 글이 없어요. 첫 글을 남겨보세요.</p>}

      {shownPosts.map((p) => {
        const likes = reactions.filter((r) => r.post_id === p.id)
        const liked = likes.some((r) => r.user_id === user.id)
        const cs = comments.filter((c) => c.post_id === p.id && (isAdmin || names.has(c.user_id)))
        const mine = p.user_id === user.id
        return (
          <article key={p.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{nameOf(p.user_id)}{mine ? ' (나)' : ''}{p.is_hidden && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-normal text-red-700">숨김</span>}</p>
              <p className="text-xs text-neutral-400">{when(p.created_at)}</p>
            </div>
            {editing?.id === p.id ? (
              <div className="mt-3 space-y-2">
                <textarea value={editing.body} onChange={(e) => setEditing({ id: p.id, body: e.target.value })} rows={3} maxLength={1000}
                  className="w-full rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-neutral-900" />
                <div className="flex gap-3"><button onClick={saveEdit} className="text-sm font-medium">저장</button><button onClick={() => setEditing(null)} className={small}>취소</button></div>
              </div>
            ) : <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{p.body}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button disabled={busy} onClick={() => toggleLike(p.id, liked)} className={`inline-flex items-center gap-1.5 text-sm ${liked ? 'font-semibold text-neutral-950' : 'text-neutral-500'}`}>
                <Heart size={16} fill={liked ? 'currentColor' : 'none'} /> {likes.length}
              </button>
              <button onClick={() => setOpen(open === p.id ? null : p.id)} className="inline-flex items-center gap-1.5 text-sm text-neutral-500"><MessageCircle size={16} /> {cs.length}</button>
              {mine && <button onClick={() => setEditing({ id: p.id, body: p.body })} className={small}>수정</button>}
              {(mine || isAdmin) && <button onClick={() => removePost(p.id)} className={small}>삭제</button>}
              {isAdmin && <button onClick={() => hidePost(p)} className={small}>{p.is_hidden ? '숨김 해제' : '숨김'}</button>}
            </div>

            {open === p.id && (
              <div className="mt-4 space-y-3 border-t pt-4">
                {cs.map((c) => (
                  <div key={c.id} className="text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{nameOf(c.user_id)}{c.is_hidden && <span className="ml-2 text-xs text-red-700">숨김</span>}</span>
                      <span className="text-xs text-neutral-400">{when(c.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-neutral-600">{c.body}</p>
                    <div className="mt-1 flex gap-3">
                      {(c.user_id === user.id || isAdmin) && <button onClick={() => removeComment(c.id)} className={small}>삭제</button>}
                      {isAdmin && <button onClick={() => hideComment(c)} className={small}>{c.is_hidden ? '숨김 해제' : '숨김'}</button>}
                    </div>
                  </div>
                ))}
                {!p.is_hidden && <CommentBox busy={busy} onSubmit={(b) => addComment(p.id, b)} />}
              </div>
            )}
          </article>
        )
      })}

      {posts.length >= limit && <button onClick={() => setLimit(limit + PAGE)} className="mx-auto block rounded-full border border-neutral-200 bg-white px-6 py-2.5 text-sm">더 보기</button>}
    </div>
  )
}

function CommentBox({ busy, onSubmit }: { busy: boolean; onSubmit: (body: string) => Promise<unknown> | boolean }) {
  const [v, setV] = useState('')
  return (
    <div className="flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} maxLength={500} placeholder="댓글을 남겨보세요"
        className="h-10 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-neutral-900" />
      <button disabled={busy || !v.trim()} onClick={async () => { await onSubmit(v); setV('') }} className="h-10 rounded-full bg-neutral-950 px-4 text-sm text-white disabled:opacity-50">등록</button>
    </div>
  )
}

