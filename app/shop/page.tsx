'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppShell, type ShellUser } from '@/components/layout/app-shell'
import { getSupabaseClient } from '@/lib/supabase/client'

type Item = { id: string; name: string; description: string | null; price_points: number; stock: number | null; is_active: boolean }
type Purchase = { id: string; user_id: string; item_name: string; price_points: number; status: string; created_at: string; handled_at: string | null }
type Form = { id: string | null; name: string; description: string; price: string; stock: string; active: boolean }

const PSTATUS: Record<string, string> = { pending: '처리 대기', fulfilled: '처리 완료', cancelled: '취소·환불' }
const when = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-')
const card = 'rounded-2xl border border-neutral-200 bg-white p-5'
const field = 'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-neutral-900'
const pill = (on: boolean) => `rounded-full px-4 py-2 text-sm ${on ? 'bg-neutral-950 text-white' : 'border border-neutral-200 bg-white text-neutral-500'}`

export default function ShopPage() {
  return <AppShell>{(user) => <ShopContent user={user} />}</AppShell>
}

function ShopContent({ user }: { user: ShellUser }) {
  const isAdmin = user.role === 'admin'
  const [items, setItems] = useState<Item[]>([])
  const [points, setPoints] = useState(0)
  const [mine, setMine] = useState<Purchase[]>([])
  const [orders, setOrders] = useState<Purchase[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [orderTab, setOrderTab] = useState('pending')
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(async () => {
    const s = getSupabaseClient()
    const cols = 'id, user_id, item_name, price_points, status, created_at, handled_at'
    const [it, pt, my, all] = await Promise.all([
      s.from('shop_items').select('id, name, description, price_points, stock, is_active').order('created_at', { ascending: false }),
      s.from('participant_point_balances').select('total_points').eq('user_id', user.id).maybeSingle(),
      s.from('shop_purchases').select(cols).eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
      isAdmin ? s.from('shop_purchases').select(cols).order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] as any[], error: null }),
    ])
    if (it.error) throw new Error(it.error.message)
    setItems((it.data ?? []) as Item[])
    setPoints(Number((pt.data as any)?.total_points ?? 0))
    setMine((my.data ?? []) as Purchase[])
    const list = (all.data ?? []) as Purchase[]
    setOrders(list)
    const ids = [...new Set(list.map((o) => o.user_id))]
    const map = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await s.from('profiles').select('id, username, display_name').in('id', ids.slice(i, i + 100))
      ;(data ?? []).forEach((u: any) => map.set(u.id, u.display_name || u.username))
    }
    setNames(map)
  }, [user.id, isAdmin])

  useEffect(() => { load().catch((e) => setMsg(e instanceof Error ? e.message : '불러오지 못했어요.')) }, [load])

  async function run(job: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(true); setMsg(''); setOk('')
    const { error } = await job()
    setBusy(false)
    if (error) { setMsg(`처리하지 못했어요: ${error.message}`); return false }
    setOk(done)
    await load().catch(() => {})
    return true
  }
  const s = getSupabaseClient()

  const buy = (it: Item) => {
    if (!confirm(`'${it.name}'을(를) ${it.price_points.toLocaleString()}P로 구매할까요?\n포인트가 바로 차감돼요.`)) return
    return run(() => s.rpc('purchase_shop_item', { target_item_id: it.id }), '구매 신청이 완료됐어요. 관리자가 확인하면 처리 완료로 바뀌어요.')
  }

  async function saveItem() {
    if (!form) return
    const price = Number(form.price)
    const stock = form.stock.trim() === '' ? null : Number(form.stock)
    if (!form.name.trim()) return setMsg('상품 이름을 입력해 주세요.')
    if (!Number.isInteger(price) || price < 1) return setMsg('필요한 포인트는 1 이상의 숫자로 입력해 주세요.')
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return setMsg('수량은 0 이상의 숫자로 입력하거나 비워 두세요. (비우면 무제한)')
    const row = { name: form.name.trim(), description: form.description.trim() || null, price_points: price, stock, is_active: form.active, updated_at: new Date().toISOString() }
    const saved = await run(() => form.id
      ? s.from('shop_items').update(row).eq('id', form.id)
      : s.from('shop_items').insert({ ...row, created_by: user.id }), '상품을 저장했어요.')
    if (saved) setForm(null)
  }
  const toggle = (it: Item) => run(() => s.from('shop_items').update({ is_active: !it.is_active, updated_at: new Date().toISOString() }).eq('id', it.id), it.is_active ? '판매를 중지했어요.' : '판매를 시작했어요.')
  const remove = (it: Item) => confirm(`'${it.name}' 상품을 삭제할까요?\n이미 들어온 주문 기록은 남아요.`) && run(() => s.from('shop_items').delete().eq('id', it.id), '상품을 삭제했어요.')
  const setStatus = (o: Purchase, status: 'fulfilled' | 'cancelled') => {
    const text = status === 'fulfilled' ? '처리 완료로 바꿀까요?' : `취소하고 ${o.price_points.toLocaleString()}P를 환불할까요?`
    if (!confirm(`${names.get(o.user_id) ?? '회원'} · ${o.item_name}\n${text}`)) return
    return run(() => s.rpc('admin_set_purchase_status', { target_purchase_id: o.id, new_status: status, admin_note: null }), status === 'fulfilled' ? '처리 완료로 바꿨어요.' : '취소하고 포인트를 환불했어요.')
  }

  const shown = items.filter((i) => i.is_active)
  const orderList = orders.filter((o) => o.status === orderTab)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em] text-neutral-400">POINT SHOP</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">포인트 상점</h1>
          <p className="mt-2 text-sm text-neutral-500">모은 포인트로 상품을 신청해요. 내 포인트 <b className="tabular-nums text-neutral-950">{points.toLocaleString()}P</b></p>
        </div>
        {isAdmin && !form && <button onClick={() => setForm({ id: null, name: '', description: '', price: '', stock: '', active: true })} className="h-10 rounded-full bg-neutral-950 px-5 text-sm text-white">상품 추가</button>}
      </div>
      {msg && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</p>}
      {ok && <p role="status" className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">{ok}</p>}

      {isAdmin && form && (
        <div className={`${card} space-y-3`}>
          <h2 className="font-semibold">{form.id ? '상품 수정' : '새 상품'}</h2>
          <input className={field} placeholder="상품 이름" maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <textarea className={`${field} h-auto py-3`} rows={4} placeholder="세부 설명 (선택)" maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input className={field} type="number" inputMode="numeric" min={1} placeholder="필요한 포인트" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            <input className={field} type="number" inputMode="numeric" min={0} placeholder="수량 (비우면 무제한)" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> 판매 중</label>
          <div className="flex gap-3">
            <button disabled={busy} onClick={saveItem} className="h-10 rounded-full bg-neutral-950 px-6 text-sm text-white disabled:opacity-50">저장</button>
            <button onClick={() => setForm(null)} className="h-10 rounded-full border border-neutral-200 px-6 text-sm">취소</button>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-3 font-semibold">상품</h2>
        {shown.length === 0 && <p className={`${card} text-center text-sm text-neutral-500`}>판매 중인 상품이 없어요.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map((it) => {
            const soldOut = it.stock !== null && it.stock <= 0
            const short = points < it.price_points
            return (
              <article key={it.id} className={`${card} flex flex-col`}>
                <h3 className="font-semibold">{it.name}</h3>
                {it.description && <p className="mt-2 flex-1 whitespace-pre-wrap text-sm leading-6 text-neutral-600">{it.description}</p>}
                <p className="mt-4 text-lg font-semibold tabular-nums">{it.price_points.toLocaleString()}P</p>
                <p className="text-xs text-neutral-400">{it.stock === null ? '수량 제한 없음' : soldOut ? '품절' : `남은 수량 ${it.stock}개`}</p>
                <button disabled={busy || soldOut || short} onClick={() => buy(it)} className="mt-3 h-10 rounded-full bg-neutral-950 text-sm text-white disabled:opacity-40">{soldOut ? '품절' : short ? '포인트가 부족해요' : '구매하기'}</button>
              </article>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">내 구매 내역</h2>
        <div className="divide-y rounded-2xl border border-neutral-200 bg-white">
          {mine.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">구매 내역이 없어요.</p>}
          {mine.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span>{o.item_name} <span className="text-xs text-neutral-400">{o.price_points.toLocaleString()}P · {when(o.created_at)}</span></span>
              <span className="text-xs text-neutral-500">{PSTATUS[o.status] ?? o.status}</span>
            </div>
          ))}
        </div>
      </section>

      {isAdmin && (
        <>
          <section>
            <h2 className="mb-3 font-semibold">상품 관리</h2>
            <div className="divide-y rounded-2xl border border-neutral-200 bg-white">
              {items.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">등록한 상품이 없어요.</p>}
              {items.map((it) => (
                <div key={it.id} className="space-y-1 px-5 py-4">
                  <p className="text-sm font-medium">{it.name}{!it.is_active && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-normal text-amber-700">판매 중지</span>}</p>
                  <p className="text-xs text-neutral-400">{it.price_points.toLocaleString()}P · {it.stock === null ? '수량 무제한' : `남은 수량 ${it.stock}개`}</p>
                  <div className="flex gap-4 pt-1 text-xs text-neutral-500">
                    <button onClick={() => setForm({ id: it.id, name: it.name, description: it.description ?? '', price: String(it.price_points), stock: it.stock === null ? '' : String(it.stock), active: it.is_active })} className="hover:text-neutral-950">수정</button>
                    <button disabled={busy} onClick={() => toggle(it)} className="hover:text-neutral-950">{it.is_active ? '판매 중지' : '판매 시작'}</button>
                    <button disabled={busy} onClick={() => remove(it)} className="hover:text-neutral-950">삭제</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold">주문 관리</h2>
            <div className="flex gap-2">{Object.entries(PSTATUS).map(([k, v]) => <button key={k} onClick={() => setOrderTab(k)} className={pill(orderTab === k)}>{v} ({orders.filter((o) => o.status === k).length})</button>)}</div>
            <div className="divide-y rounded-2xl border border-neutral-200 bg-white">
              {orderList.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">해당하는 주문이 없어요.</p>}
              {orderList.map((o) => (
                <div key={o.id} className="space-y-2 px-5 py-4 text-sm">
                  <p><span className="font-medium">{names.get(o.user_id) ?? '알 수 없음'}</span> · {o.item_name} <span className="text-xs text-neutral-400">{o.price_points.toLocaleString()}P · 신청 {when(o.created_at)}{o.handled_at ? ` · 처리 ${when(o.handled_at)}` : ''}</span></p>
                  {o.status === 'pending' && (
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => setStatus(o, 'fulfilled')} className="h-9 rounded-full bg-neutral-950 px-4 text-xs text-white disabled:opacity-50">처리 완료</button>
                      <button disabled={busy} onClick={() => setStatus(o, 'cancelled')} className="h-9 rounded-full border border-neutral-200 px-4 text-xs disabled:opacity-50">취소·환불</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

