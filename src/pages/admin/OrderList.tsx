import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getCount,
  getLatestFinishedCount,
  listArticles,
  listCategories,
  listOrdersForCount,
  listSuppliers,
  updateOrderLine,
  setOrderStatus,
} from '../../data/repository'
import type { Article, Category, Count, OrderLine, Supplier } from '../../data/types'
import { formatNum, isWeekendOrderDay } from '../../lib/measure'
import { fmtDateTime } from '../../lib/format'
import { Button, Card, EmptyState, Spinner } from '../../components/ui'

export function OrderList() {
  const { countId } = useParams<{ countId?: string }>()
  const [count, setCount] = useState<Count | null>(null)
  const [orders, setOrders] = useState<OrderLine[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const c = countId ? await getCount(countId) : await getLatestFinishedCount()
      setCount(c ?? null)
      if (c) setOrders(await listOrdersForCount(c.id))
      const [cats, arts, sups] = await Promise.all([listCategories(), listArticles(), listSuppliers()])
      setCategories(cats)
      setArticles(arts)
      setSuppliers(sups)
      setLoading(false)
    })()
  }, [countId])

  // Grouped by supplier (in the order set under Dobavljači), then by category
  // and article order. Uses the article's current supplier, so assigning one
  // later also fixes older lists.
  const groups = useMemo(() => {
    const catOrder = new Map(categories.map((c) => [c.id, c.sort_order]))
    const artById = new Map(articles.map((a) => [a.id, a]))
    const supById = new Map(suppliers.map((x) => [x.id, x]))
    const map = new Map<string, OrderLine[]>()
    for (const o of orders) {
      const sid = artById.get(o.article_id)?.supplier_id ?? ''
      const key = supById.has(sid) ? sid : ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    }
    const rank = (o: OrderLine) => [
      catOrder.get(o.category_id ?? '') ?? 1e9,
      artById.get(o.article_id)?.sort_order ?? 1e9,
    ]
    return Array.from(map.entries())
      .sort(([a], [b]) => (supById.get(a)?.sort_order ?? 1e9) - (supById.get(b)?.sort_order ?? 1e9))
      .map(([key, list]) => ({
        key,
        name: supById.get(key)?.name ?? 'Bez dobavljača',
        phone: supById.get(key)?.phone ?? null,
        list: list.sort((a, b) => {
          const [ca, sa] = rank(a)
          const [cb, sb] = rank(b)
          return ca - cb || sa - sb || a.article_name.localeCompare(b.article_name)
        }),
      }))
  }, [orders, categories, articles, suppliers])

  const updateQty = async (line: OrderLine, raw: string) => {
    const qty = Number(raw.replace(',', '.')) || 0
    const updated = { ...line, suggested_order_qty: qty }
    setOrders((prev) => prev.map((o) => (o.id === line.id ? updated : o)))
    await updateOrderLine(updated)
  }

  const toggleStatus = async (line: OrderLine) => {
    const status = line.order_status === 'ordered' ? 'pending' : 'ordered'
    setOrders((prev) => prev.map((o) => (o.id === line.id ? { ...o, order_status: status } : o)))
    await setOrderStatus(line.id, status)
  }

  const groupText = (g: (typeof groups)[number]) =>
    `${g.name}\n` + g.list.map((o) => `- ${o.article_name}: ${qtyText(o)}`).join('\n')

  const asText = () => groups.map(groupText).join('\n\n')

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert(`${what} je kopirana.`)
    } catch {
      alert(text)
    }
  }

  const exportCsv = () => {
    const header = 'Dobavljac,Artikal,Stanje,Minimum,Poruciti,Jedinica,Status,Fali\n'
    const body = groups
      .flatMap((g) =>
        g.list.map((o) =>
          [
            csv(g.name),
            csv(o.article_name),
            o.kind === 'yes_no' ? 'nema' : formatNum(o.counted),
            o.kind === 'yes_no' || noteOnly(o) ? '' : formatNum(o.minimum),
            noteOnly(o) ? '' : formatNum(o.suggested_order_qty),
            noteOnly(o) ? '' : o.order_unit,
            o.order_status === 'ordered' ? 'poruceno' : 'za porucivanje',
            csv(o.note ?? ''),
          ].join(','),
        ),
      )
      .join('\n')
    download('lista-nabavke.csv', header + body)
  }

  if (loading) return <Spinner />
  if (!count) {
    return <EmptyState title="Još nema završenih popisa" hint="Lista nabavke se pravi kad radnik završi popis." />
  }

  const pending = orders.filter((o) => o.order_status === 'pending').length
  const artById = new Map(articles.map((a) => [a.id, a]))
  const weekend = isWeekendOrderDay(new Date(count.datetime))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Lista nabavke</h1>
          <p className="text-sm text-slate-500">
            Popis <Link to={`/admin/counts/${count.id}`} className="text-brand-700 hover:underline">{fmtDateTime(count.datetime)}</Link>{' '}
            · {count.user_name} · {orders.length} artikala · {pending} za poručiti
          </p>
          {weekend && (
            <p className="mt-1 inline-block rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Popis od četvrtka — poručuje se za vikend (do ciljnog stanja)
            </p>
          )}
        </div>
        {orders.length > 0 && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => copy(asText(), 'Cela lista')} className="text-sm">Kopiraj sve</Button>
            <Button variant="secondary" onClick={exportCsv} className="text-sm">CSV</Button>
          </div>
        )}
      </div>

      {orders.length === 0 ? (
        <Card className="text-center text-slate-500">Sve je iznad minimuma — nema šta da se poruči.</Card>
      ) : (
        groups.map((g) => (
          <section key={g.key || 'none'} className="space-y-1.5">
            <div className="flex items-end justify-between gap-2 px-1">
              <h2 className="text-sm font-bold text-slate-700">
                🚚 {g.name} <span className="font-normal text-slate-400">({g.list.length})</span>
                {g.phone && <span className="ml-2 text-xs font-normal text-slate-400">{g.phone}</span>}
              </h2>
              <button
                onClick={() => copy(groupText(g), `Lista za ${g.name}`)}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
              >
                Kopiraj
              </button>
            </div>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
              {g.list.map((o) => (
                <div key={o.id} className={`flex items-center gap-3 px-3 py-2 ${o.order_status === 'ordered' ? 'bg-green-50/60' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight text-slate-800">{o.article_name}</p>
                    <p className="text-xs text-slate-400">
                      {o.kind === 'yes_no'
                        ? 'označeno: nema'
                        : noteOnly(o)
                          ? `ima ${formatNum(o.counted)} ${o.unit}`
                          : `ima ${formatNum(o.counted)} ${o.unit} · ${weekend ? 'treba' : artById.get(o.article_id)?.regular_target != null ? 'poželjno' : 'min'} ${formatNum(o.minimum)}`}
                    </p>
                    {o.note && <p className="mt-0.5 text-sm font-medium text-red-600">Fali: {o.note}</p>}
                  </div>
                  <div className={`flex items-center gap-1 ${noteOnly(o) ? 'hidden' : ''}`}>
                    <input
                      inputMode="decimal"
                      defaultValue={String(o.suggested_order_qty)}
                      onBlur={(e) => updateQty(o, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      aria-label={`Količina za ${o.article_name}`}
                      className="w-14 rounded-lg border border-slate-300 bg-surface px-2 py-1 text-right font-semibold text-slate-800 outline-none focus:border-brand-500"
                    />
                    <span className="w-11 text-xs text-slate-500">{o.order_unit}</span>
                  </div>
                  <button
                    onClick={() => toggleStatus(o)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      o.order_status === 'ordered' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {o.order_status === 'ordered' ? '✓ poručeno' : 'za poručiti'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

/** "Samo broj + šta fali" lines: no quantity, the note says what to order. */
function noteOnly(o: OrderLine): boolean {
  return !!o.note && o.suggested_order_qty === 0
}

function qtyText(o: OrderLine): string {
  if (noteOnly(o)) return `fali: ${o.note}`
  const qty = `${formatNum(o.suggested_order_qty)} ${o.order_unit}`
  return o.note ? `${qty} (fali: ${o.note})` : qty
}

function csv(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

function download(filename: string, content: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
