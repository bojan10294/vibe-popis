import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getCount,
  getLatestFinishedCount,
  listArticles,
  listCategories,
  listCounts,
  listLagerDates,
  listLagerStock,
  listLinesForCount,
  listOrdersForCount,
  listSuppliers,
  updateOrderLine,
  deleteOrderLine,
  setOrderPayment,
} from '../../data/repository'
import type { Article, Category, Count, OrderLine, Payment, Supplier } from '../../data/types'
import { compareStock, type CompareRow } from '../../lib/compare'
import { bookUnitLabel } from '../../lib/lager'
import { autoPayment, lagerDateFor, paymentOf, rowFor } from '../../lib/payment'
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
  const [copied, setCopied] = useState<string | null>(null)
  // Accountant comparison for keš/račun: which Lager lista, and its rows by code.
  const [lagerDate, setLagerDate] = useState<string | null>(null)
  const [rowByCode, setRowByCode] = useState<Map<string, CompareRow>>(new Map())

  useEffect(() => {
    ;(async () => {
      const c = countId ? await getCount(countId) : await getLatestFinishedCount()
      setCount(c ?? null)
      if (c) setOrders(await listOrdersForCount(c.id))
      const [cats, arts, sups] = await Promise.all([listCategories(), listArticles(), listSuppliers()])
      setCategories(cats)
      setArticles(arts)
      setSuppliers(sups)
      if (c) {
        try {
          const [dates, counts, lines] = await Promise.all([listLagerDates(), listCounts(), listLinesForCount(c.id)])
          const date = lagerDateFor(dates, counts, c)
          if (date) {
            const rows = compareStock(await listLagerStock(date), arts, lines)
            setLagerDate(date)
            setRowByCode(new Map(rows.map((r) => [r.code, r])))
          }
        } catch {
          // No comparison: everything stays "na račun", the list still works.
        }
      }
      setLoading(false)
    })()
  }, [countId])

  const artById = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles])
  const rowOf = (o: OrderLine) => rowFor(o, artById, rowByCode)
  const pay = (o: OrderLine): Payment => paymentOf(o, rowOf(o))

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

  const removeLine = async (line: OrderLine) => {
    if (!confirm(`Ukloniti "${line.article_name}" sa liste nabavke?`)) return
    setOrders((prev) => prev.filter((o) => o.id !== line.id))
    try {
      await deleteOrderLine(line.id)
    } catch {
      setOrders((prev) => [...prev, line])
      alert('Brisanje nije uspelo.')
    }
  }

  /** Keš ↔ račun. Choosing what the automatic rule would pick clears the manual choice. */
  const togglePayment = async (line: OrderLine) => {
    const next: Payment = pay(line) === 'cash' ? 'invoice' : 'cash'
    const stored = next === autoPayment(line, rowOf(line)) ? null : next
    setOrders((prev) => prev.map((o) => (o.id === line.id ? { ...o, payment: stored } : o)))
    try {
      await setOrderPayment(line.id, stored)
    } catch (e) {
      setOrders((prev) => prev.map((o) => (o.id === line.id ? line : o)))
      alert(`Nije sačuvano: ${e instanceof Error ? e.message : e}`)
    }
  }

  const PAYMENTS: [Payment, string][] = [
    ['invoice', 'Na račun'],
    ['cash', 'Za keš'],
  ]

  const groupText = (g: (typeof groups)[number]) =>
    `${g.name}\n` +
    PAYMENTS.map(([p, label]) => {
      const list = g.list.filter((o) => pay(o) === p)
      return list.length ? `${label}:\n` + list.map((o) => `- ${o.article_name}: ${qtyText(o)}`).join('\n') : ''
    })
      .filter(Boolean)
      .join('\n\n')

  const asText = () => groups.map(groupText).join('\n\n')

  // No alert on success: the button itself shows "✓ Kopirano" for a moment.
  // If the clipboard isn't available, the text is shown so it can be copied by hand.
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500)
    } catch {
      alert(text)
    }
  }

  const exportCsv = () => {
    const header = 'Dobavljac,Artikal,Stanje,Minimum,Poruciti,Jedinica,Placanje,Fali\n'
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
            pay(o) === 'cash' ? 'kes' : 'racun',
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

  const cashCount = orders.filter((o) => pay(o) === 'cash').length
  const weekend = isWeekendOrderDay(new Date(count.datetime))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Lista nabavke</h1>
          <p className="text-sm text-slate-500">
            Popis <Link to={`/admin/counts/${count.id}`} className="text-brand-700 hover:underline">{fmtDateTime(count.datetime)}</Link>{' '}
            · {count.user_name} · {orders.length} artikala · {cashCount} za keš
          </p>
          <p className="text-xs text-slate-400">
            {lagerDate
              ? `Keš/račun prema lager listi od ${fmtDate(lagerDate)}: ono u manjku ide za keš.`
              : 'Nema lager liste za ovaj popis — sve ide na račun dok se ne učita.'}
          </p>
          {weekend && (
            <p className="mt-1 inline-block rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Popis od četvrtka — poručuje se za vikend (do ciljnog stanja)
            </p>
          )}
        </div>
        {orders.length > 0 && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => copy(asText(), '__all')} className="text-sm">
              {copied === '__all' ? '✓ Kopirano' : 'Kopiraj sve'}
            </Button>
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
                onClick={() => copy(groupText(g), g.key || 'none')}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
              >
                {copied === (g.key || 'none') ? '✓ Kopirano' : 'Kopiraj'}
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-surface">
              {PAYMENTS.map(([p, label]) => {
                const list = g.list.filter((o) => pay(o) === p)
                if (!list.length) return null
                return (
                  <div key={p} className="border-t border-slate-100 first:border-t-0">
                    <p
                      className={`px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        p === 'cash' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'
                      }`}
                    >
                      {p === 'cash' ? '💵' : '🧾'} {label} ({list.length})
                    </p>
                    <div className="divide-y divide-slate-100">
              {list.map((o) => (
                <div key={o.id} className="flex items-center gap-2 px-3 py-2 sm:gap-3">
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
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                      <BookInfo row={rowOf(o)} />
                      <button
                        onClick={() => togglePayment(o)}
                        className="-mx-1.5 rounded-md px-1.5 py-0.5 font-medium text-brand-700 hover:bg-brand-50"
                      >
                        {pay(o) === 'cash' ? 'prebaci na račun' : 'prebaci na keš'}
                      </button>
                    </div>
                  </div>
                  <div className={`flex shrink-0 items-center gap-1 ${noteOnly(o) ? 'hidden' : ''}`}>
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
                    onClick={() => removeLine(o)}
                    aria-label={`Ukloni ${o.article_name} sa liste`}
                    title="Ukloni sa liste"
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

/** "knj. 92,84 l · manjak 72,84 l" — the accountant's book stock vs. this Popis. */
function BookInfo({ row: r }: { row: CompareRow | undefined }) {
  if (!r) return <span className="text-slate-400">nije povezano sa knjigovodstvom</span>
  const u = bookUnitLabel(r.unit)
  const group = r.members.length > 1 ? ` (${r.name})` : ''
  if (r.counted == null) return <span className="text-slate-400">knj. {formatNum(r.book)} {u}{group}</span>
  const short = (r.diff ?? 0) < 0
  const tone = r.ok ? 'text-slate-500' : short ? 'text-red-600' : 'text-green-600'
  return (
    <span className={tone}>
      knj. {formatNum(r.book)} {u}
      {group} ·{' '}
      {r.ok ? 'slaže se' : `${short ? 'manjak' : 'višak'} ${formatNum(Math.abs(r.diff!))} ${u}`}
      {r.untracked && ' (knjigovođa vodi na 0)'}
    </span>
  )
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}.`
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
