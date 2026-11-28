import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getCount,
  getLatestFinishedCount,
  listArticles,
  listCategories,
  listSuppliers,
  updateOrderLine,
  deleteOrderLine,
  setOrderPayment,
} from '../../data/repository'
import type { Article, Category, Count, OrderLine, Payment, Supplier } from '../../data/types'
import { type CompareRow } from '../../lib/compare'
import { bookUnitLabel } from '../../lib/lager'
import { autoPayment, paymentOf, rowFor } from '../../lib/payment'
import { arrivedSince, loadOrderView } from '../../data/orders'
import { compareArrivals, type ArrivalLine } from '../../lib/arrivals'
import { intlPhone, smsUrl, viberUrl, whatsappUrl } from '../../lib/share'
import { downloadCsv, fileDate } from '../../lib/csv'
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

  /** Per article: what arrived on fakture after this Popis (counting unit). */
  const [arrived, setArrived] = useState<Map<string, number> | null>(null)

  useEffect(() => {
    ;(async () => {
      const c = countId ? await getCount(countId) : await getLatestFinishedCount()
      setCount(c ?? null)
      const [cats, arts, sups] = await Promise.all([listCategories(), listArticles(), listSuppliers()])
      setCategories(cats)
      setArticles(arts)
      setSuppliers(sups)
      if (c) {
        // Keš/račun with the same numbers as Poređenje (see data/orders.ts).
        const view = await loadOrderView(c, arts)
        setOrders(view.orders)
        setLagerDate(view.lagerDate)
        setRowByCode(view.rowByCode)
        // Before the fakture tables exist there is simply nothing arrived.
        arrivedSince(c).then(setArrived, () => setArrived(null))
      }
      setLoading(false)
    })()
  }, [countId])

  const artById = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles])
  const rowOf = (o: OrderLine) => rowFor(o, artById, rowByCode)
  const pay = (o: OrderLine): Payment => paymentOf(o, rowOf(o))
  /** Naručeno vs stiglo for one line; only na račun lines come with a faktura. */
  const arrivalOf = (o: OrderLine): ArrivalLine | undefined =>
    arrived && pay(o) === 'invoice' ? compareArrivals([o], articles, arrived)[0] : undefined

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
    if (!count) return
    downloadCsv(
      `lista-nabavke-${fileDate(count.datetime)}.csv`,
      ['Dobavljač', 'Artikal', 'Stanje', 'Jedinica', 'Minimum', 'Poručiti', 'Jedinica nabavke', 'Plaćanje', 'Stiglo', 'Fali'],
      groups.flatMap((g) =>
        g.list.map((o) => {
          const a = arrivalOf(o)
          return [
            g.name,
            o.article_name,
            o.kind === 'yes_no' ? 'nema' : o.counted,
            o.kind === 'yes_no' ? '' : o.unit,
            o.kind === 'yes_no' || noteOnly(o) ? null : o.minimum,
            noteOnly(o) ? null : o.suggested_order_qty,
            noteOnly(o) ? '' : o.order_unit,
            pay(o) === 'cash' ? 'keš' : 'račun',
            a ? (a.status === 'ok' ? 'da' : a.status === 'short' ? `${formatNum(a.arrivedBase)} od ${formatNum(a.orderedBase)} ${a.baseUnit}` : 'ne') : '',
            o.note ?? '',
          ]
        }),
      ),
    )
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
          <h1 className="text-3xl font-extrabold text-slate-900">Lista nabavke</h1>
          <p className="text-sm text-slate-500">
            Popis <Link to={`/admin/counts/${count.id}`} className="text-brand-700 hover:underline">{fmtDateTime(count.datetime)}</Link>{' '}
            · {count.user_name} · {orders.length} artikala · {cashCount} za keš
          </p>
          <p className="text-xs text-slate-400">
            {lagerDate
              ? `Keš/račun prema lager listi od ${fmtDate(lagerDate)} i fakturama kojih knjigovođa još nema (kao na Poređenju): ono u manjku ide za keš.`
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
            <Button variant="secondary" onClick={exportCsv} className="text-sm">⬇ Excel</Button>
          </div>
        )}
      </div>

      {orders.length === 0 ? (
        <Card className="text-center text-slate-500">Sve je iznad minimuma — nema šta da se poruči.</Card>
      ) : (
        groups.map((g) => (
          <section key={g.key || 'none'} className="space-y-1.5">
            <div className="flex items-end justify-between gap-2 px-1 pt-2">
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-tight tracking-tight text-slate-900">
                  {g.name} <span className="num text-sm font-medium text-slate-400">{g.list.length}</span>
                </h2>
                {g.phone && <p className="num text-xs text-slate-400">{g.phone}</p>}
              </div>
              <button
                onClick={() => copy(groupText(g), g.key || 'none')}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
              >
                {copied === (g.key || 'none') ? '✓ Kopirano' : 'Kopiraj'}
              </button>
            </div>
            <SendButtons phone={g.phone} text={groupText(g)} supplierId={g.key} />
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-sm">
              {PAYMENTS.map(([p, label]) => {
                const list = g.list.filter((o) => pay(o) === p)
                if (!list.length) return null
                return (
                  <div key={p} className="border-t border-slate-100 first:border-t-0">
                    <p
                      className={`eyebrow flex items-center gap-2 px-4 py-2 ${
                        p === 'cash' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-500'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${p === 'cash' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                      {label} <span className="num tracking-normal">{list.length}</span>
                    </p>
                    <div className="divide-y divide-slate-100">
              {list.map((o) => (
                <div key={o.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight text-slate-900">{o.article_name}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 tabular-nums">
                        <span>
                          {o.kind === 'yes_no'
                            ? 'označeno: nema'
                            : noteOnly(o)
                              ? `ima ${formatNum(o.counted)} ${o.unit}`
                              : `ima ${formatNum(o.counted)} ${o.unit} · ${weekend ? 'treba' : artById.get(o.article_id)?.regular_target != null ? 'poželjno' : 'min'} ${formatNum(o.minimum)}`}
                        </span>
                        <ArrivalBadge a={arrivalOf(o)} />
                      </p>
                    </div>
                    {!noteOnly(o) && (
                      <label className="flex h-10 w-[6.5rem] shrink-0 items-center justify-end overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/20">
                        <input
                          inputMode="decimal"
                          defaultValue={String(o.suggested_order_qty)}
                          onBlur={(e) => updateQty(o, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          onFocus={(e) => e.currentTarget.select()}
                          aria-label={`Količina za ${o.article_name}`}
                          className="num h-full w-0 min-w-0 flex-1 bg-transparent pr-1 text-right text-lg font-semibold text-slate-900 outline-none"
                        />
                        <span className="w-11 shrink-0 pr-2 text-xs font-medium text-slate-500">{o.order_unit}</span>
                      </label>
                    )}
                  </div>
                  {o.note && <p className="mt-1.5 text-sm font-medium text-red-600">Fali: {o.note}</p>}
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <BookInfo row={rowOf(o)} />
                    <div className="flex shrink-0 items-center gap-1">
                      <PayToggle value={pay(o)} onToggle={() => togglePayment(o)} />
                      <button
                        onClick={() => removeLine(o)}
                        aria-label={`Ukloni ${o.article_name} sa liste`}
                        title="Ukloni sa liste"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
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

/** WhatsApp / Viber / SMS with the order text ready; the admin presses send in that app. */
function SendButtons({ phone, text, supplierId }: { phone: string | null; text: string; supplierId: string }) {
  if (!supplierId) return null
  if (!phone || !intlPhone(phone)) {
    return (
      <p className="px-1 text-xs text-slate-400">
        Za slanje porudžbine upiši telefon dobavljača u <Link to="/admin/suppliers" className="text-brand-700 hover:underline">Dobavljačima</Link>.
      </p>
    )
  }
  const btn = 'rounded-full border border-slate-200 bg-surface px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-slate-50'
  const viber = async () => {
    // Viber can't prefill text for a number: copy it, then open the chat to paste.
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // still open the chat
    }
    const url = viberUrl(phone)
    if (url) window.location.href = url
  }
  const share = async () => {
    try {
      await navigator.share({ text })
    } catch {
      // cancelled
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1">
      <span className="eyebrow mr-0.5 text-slate-400">Pošalji</span>
      <a href={whatsappUrl(phone, text) ?? undefined} target="_blank" rel="noreferrer" className={`${btn} text-green-700`}>
        WhatsApp
      </a>
      <button onClick={viber} className={`${btn} text-violet-700 dark:text-violet-300`} title="Tekst se kopira — u Viberu samo nalepi">
        Viber
      </button>
      <a href={smsUrl(phone, text) ?? undefined} className={`${btn} text-slate-700`}>
        SMS
      </a>
      {'share' in navigator && (
        <button onClick={share} className={`${btn} text-slate-700`}>
          Drugo…
        </button>
      )}
    </div>
  )
}

/** Naručeno vs stiglo on the line: what the fakture after this Popis brought. */
function ArrivalBadge({ a }: { a: ArrivalLine | undefined }) {
  if (!a) return null
  if (a.status === 'ok') return <span className="font-semibold text-green-700">✓ stiglo</span>
  if (a.status === 'short') {
    return (
      <span className="num font-semibold text-amber-700">
        stiglo {formatNum(a.arrivedBase)}/{formatNum(a.orderedBase)} {a.baseUnit}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-slate-400">
      <span className="h-1 w-1 rounded-full bg-current" />
      nije stiglo
    </span>
  )
}

/** "knj. 92,84 l · manjak 72,84 l" — the accountant's book stock vs. this Popis. */
function BookInfo({ row: r }: { row: CompareRow | undefined }) {
  if (!r) return <span className="text-xs text-slate-400">nije u knjigovodstvu</span>
  const u = bookUnitLabel(r.unit)
  const group = r.members.length > 1 ? ` (${r.name})` : ''
  const book = (
    <span className="num text-slate-500">
      knj. {formatNum(r.book)} {u}
      {group}
    </span>
  )
  if (r.counted == null) return <span className="min-w-0 text-xs">{book}</span>
  const short = (r.diff ?? 0) < 0
  const chip = r.ok
    ? 'text-slate-500'
    : short
      ? 'border border-red-200 bg-red-50 text-red-700'
      : 'border border-green-200 bg-green-50 text-green-700'
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
      {book}
      <span className={`num rounded-md px-1.5 py-0.5 font-semibold ${chip}`}>
        {r.ok ? '= slaže se' : `${short ? '−' : '+'}${formatNum(Math.abs(r.diff!))} ${u}`}
      </span>
      {r.untracked && <span className="text-slate-400">(knjigovođa vodi na 0)</span>}
    </span>
  )
}

/** Račun | Keš — shows where the line is paid, one tap moves it to the other. */
function PayToggle({ value, onToggle }: { value: Payment; onToggle: () => void }) {
  const opt = (p: Payment, label: string) => (
    <span
      className={`rounded-full px-2.5 py-1 ${
        value === p
          ? p === 'cash'
            ? 'bg-amber-500 text-white shadow-sm'
            : 'bg-ink text-on-ink shadow-sm'
          : 'text-slate-500'
      }`}
    >
      {label}
    </span>
  )
  return (
    <button
      onClick={onToggle}
      aria-label={value === 'cash' ? 'Prebaci na račun' : 'Prebaci na keš'}
      title={value === 'cash' ? 'Prebaci na račun' : 'Prebaci na keš'}
      className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-bold uppercase tracking-wider"
    >
      {opt('invoice', 'Račun')}
      {opt('cash', 'Keš')}
    </button>
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

