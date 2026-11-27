import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  confirmDelivery,
  deleteDeliveryLine,
  getDelivery,
  listArticles,
  listDeliveryLines,
  listSuppliers,
  saveDeliveryLine,
  setDeliverySupplier,
  createArticleRequest,
  deleteArticleRequest,
  listRequestsForDelivery,
} from '../data/repository'
import type { Article, ArticleRequest, Delivery, DeliveryCheckSnapshot, DeliveryDirection, DeliveryLine, Supplier } from '../data/types'
import { UNITS, ORDER_UNITS } from '../data/types'
import { checkDelivery } from '../data/orders'
import { useAuth } from '../auth/AuthContext'
import { matchesQuery } from '../lib/format'
import { formatNum, unitLabel } from '../lib/measure'
import { parseQty, toBase, unitOptions } from '../lib/delivery'
import { Button, Card, Spinner } from '../components/ui'

const MAX_RESULTS = 30

const lineKey = (articleId: string, direction: DeliveryDirection) => `${articleId}:${direction}`

/** Which article is being entered, and whether it arrived or goes back. */
interface Picked {
  article: Article
  direction: DeliveryDirection
}

export function DeliverySession() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [lines, setLines] = useState<DeliveryLine[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Picked | null>(null)
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  /** "Nema ga na spisku" requests made on this faktura. */
  const [requests, setRequests] = useState<ArticleRequest[]>([])
  const [requesting, setRequesting] = useState(false)
  const { user } = useAuth()
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const [d, arts, sups, ls] = await Promise.all([
        getDelivery(id),
        listArticles({ activeOnly: true }),
        listSuppliers(),
        listDeliveryLines(id),
      ])
      setDelivery(d ?? null)
      setNote(d?.note ?? '')
      setArticles(arts)
      setSuppliers(sups)
      setLines(ls)
      setLoading(false)
      // Before migration 017 there are no requests.
      listRequestsForDelivery(id).then(setRequests, () => setRequests([]))
    })()
  }, [id])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [reviewing])

  const lineByKey = useMemo(
    () => new Map(lines.map((l) => [lineKey(l.article_id, l.direction ?? 'in'), l])),
    [lines],
  )
  const arrived = lines.filter((l) => (l.direction ?? 'in') === 'in')
  const returned = lines.filter((l) => l.direction === 'return')

  const results = useMemo(() => {
    if (query.trim()) return articles.filter((a) => matchesQuery(a.name, query)).slice(0, MAX_RESULTS)
    if (delivery?.supplier_id) return articles.filter((a) => a.supplier_id === delivery.supplier_id)
    return []
  }, [articles, query, delivery?.supplier_id])

  if (loading) return <Spinner />
  if (!delivery || !id) return <p className="text-slate-500">Faktura nije pronađena.</p>
  if (delivery.status === 'confirmed') {
    return (
      <div className="space-y-3">
        <p className="text-slate-600">Ova faktura je već potvrđena.</p>
        <Button onClick={() => navigate('/count')}>Nazad</Button>
      </div>
    )
  }

  const chooseSupplier = async (s: Supplier | null) => {
    setDelivery({ ...delivery, supplier_id: s?.id ?? null, supplier_name: s?.name ?? null })
    await setDeliverySupplier(id, s)
  }

  const onSaved = (line: DeliveryLine) => {
    setLines((prev) => [...prev.filter((l) => l.id !== line.id), line])
    setPicked(null)
    setQuery('')
    if (!reviewing) searchRef.current?.focus()
  }

  const removeLine = async (line: DeliveryLine) => {
    setLines((prev) => prev.filter((l) => l.id !== line.id))
    await deleteDeliveryLine(line.id)
  }

  const editLine = (line: DeliveryLine) => {
    const a = articles.find((x) => x.id === line.article_id)
    if (a) setPicked({ article: a, direction: line.direction ?? 'in' })
  }

  const confirm = async () => {
    setConfirming(true)
    // Naručeno vs stiglo for the notification; never blocks confirming.
    let check: DeliveryCheckSnapshot | null = null
    try {
      check = await checkDelivery(delivery)
    } catch {
      check = null
    }
    await confirmDelivery(id, note.trim(), check)
    navigate('/count', { state: { deliveryConfirmed: true } })
  }

  const removeRequest = async (r: ArticleRequest) => {
    setRequests((prev) => prev.filter((x) => x.id !== r.id))
    await deleteArticleRequest(r.id).catch(() => setRequests((prev) => [...prev, r]))
  }

  const requestSheet = requesting && user && (
    <NewArticleSheet
      initialName={query.trim()}
      onCancel={() => setRequesting(false)}
      onSave={async (name, qty, unit) => {
        const req = await createArticleRequest(user, {
          name,
          unit,
          qty,
          delivery_id: id,
          supplier_id: delivery.supplier_id,
        })
        setRequests((prev) => [...prev, req])
        setRequesting(false)
        setQuery('')
      }}
    />
  )

  const hasItems = lines.length > 0 || requests.length > 0

  const amountSheet = picked && (
    <AmountSheet
      key={picked.article.id}
      article={picked.article}
      initialDirection={picked.direction}
      deliveryId={id}
      lineFor={(dir) => lineByKey.get(lineKey(picked.article.id, dir))}
      onSaved={onSaved}
      onCancel={() => setPicked(null)}
    />
  )

  const lineSections = (
    <>
      {arrived.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Stiglo ({arrived.length})</h2>
          <LineList lines={arrived} onEdit={editLine} onRemove={removeLine} />
        </section>
      )}
      {returned.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-red-500">↩ Vraćamo ({returned.length})</h2>
          <LineList lines={returned} onEdit={editLine} onRemove={removeLine} />
        </section>
      )}
      {requests.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
            🆕 Novi artikli, čekaju potvrdu ({requests.length})
          </h2>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-2.5 pl-3 pr-1">
                <span className="min-w-0 flex-1 truncate text-slate-800">{r.name}</span>
                <span className="shrink-0 text-sm font-semibold text-slate-700">
                  {r.qty ? `${formatNum(r.qty)} ${r.unit}` : r.unit}
                </span>
                {r.status === 'pending' && (
                  <button
                    onClick={() => removeRequest(r)}
                    aria-label={`Ukloni ${r.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )

  // --- Review before confirming --------------------------------------------
  if (reviewing) {
    return (
      <div className="space-y-4 pb-28">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Proveri fakturu</h1>
          <p className="text-sm text-slate-500">
            {delivery.supplier_name ? `${delivery.supplier_name} · ` : ''}
            Uporedi sa papirom. Dodirni stavku da je ispraviš.
          </p>
        </div>
        {lineSections}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-600">Napomena (nije obavezno)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="npr. fali jedna gajba, polomljena flaša..."
            className="w-full rounded-xl border border-slate-200 bg-surface px-3.5 py-2.5 text-base text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          />
        </label>
        <BottomBar>
          <Button variant="ghost" onClick={() => setReviewing(false)}>
            Nazad
          </Button>
          <Button
            onClick={confirm}
            disabled={confirming || !hasItems}
            className="flex-1 bg-green-600 hover:brightness-110"
          >
            {confirming ? 'Šaljem...' : '✓ Sve u redu, potvrdi'}
          </Button>
        </BottomBar>
        {amountSheet}
      </div>
    )
  }

  // --- Adding items ------------------------------------------------------------
  return (
    <div className="space-y-4 pb-28">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Unos fakture</h1>
        <p className="text-sm text-slate-500">Nađi artikal, upiši koliko je stiglo ili koliko vraćamo.</p>
      </div>

      <div className="space-y-1.5">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Dobavljač</p>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {suppliers.map((s) => {
            const on = delivery.supplier_id === s.id
            return (
              <button
                key={s.id}
                onClick={() => chooseSupplier(on ? null : s)}
                className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  on
                    ? 'border-transparent bg-slate-900 text-white dark:bg-brand-600'
                    : 'border-slate-200 bg-surface text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s.name}
              </button>
            )
          })}
        </div>
      </div>

      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Traži artikal (npr. cola, malfy, moretti)"
        autoFocus
        className="w-full rounded-xl border border-slate-200 bg-surface px-3.5 py-3 text-base text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
      />

      {results.length > 0 ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
          {results.map((a) => {
            const inLine = lineByKey.get(lineKey(a.id, 'in'))
            const backLine = lineByKey.get(lineKey(a.id, 'return'))
            return (
              <button
                key={a.id}
                onClick={() => setPicked({ article: a, direction: 'in' })}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-slate-50"
              >
                <span className="min-w-0 truncate text-slate-800">{a.name}</span>
                {inLine || backLine ? (
                  <span className="shrink-0 text-right text-sm font-semibold">
                    {inLine && (
                      <span className="block text-green-700">
                        ✓ {formatNum(inLine.qty)} {inLine.unit}
                      </span>
                    )}
                    {backLine && (
                      <span className="block text-red-600">
                        ↩ {formatNum(backLine.qty)} {backLine.unit}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="shrink-0 text-lg font-bold text-brand-600">+</span>
                )}
              </button>
            )
          })}
        </div>
      ) : query.trim() ? (
        <p className="px-1 text-sm text-slate-500">Nema artikla „{query.trim()}”. Probaj drugu reč.</p>
      ) : !delivery.supplier_id ? (
        <p className="px-1 text-sm text-slate-500">Izaberi dobavljača da vidiš njegove artikle, ili samo kucaj.</p>
      ) : null}

      <button
        onClick={() => setRequesting(true)}
        className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-left text-sm font-medium text-brand-700 hover:bg-slate-50"
      >
        ＋ Nema ga na spisku? Dodaj novi artikal
      </button>

      {lineSections}

      <BottomBar>
        <Button variant="ghost" onClick={() => navigate('/count')}>
          Kasnije
        </Button>
        <Button onClick={() => setReviewing(true)} disabled={!hasItems} className="flex-1">
          Proveri i potvrdi →
        </Button>
      </BottomBar>
      {amountSheet}
      {requestSheet}
    </div>
  )
}

const REQUEST_UNITS = Array.from(new Set<string>([...UNITS, ...ORDER_UNITS]))

/** "Nema ga na spisku": name + how much arrived; the admin gets a push to confirm it. */
function NewArticleSheet({
  initialName,
  onSave,
  onCancel,
}: {
  initialName: string
  onSave: (name: string, qty: number | null, unit: string) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [text, setText] = useState('')
  const [unit, setUnit] = useState('kom')
  const [saving, setSaving] = useState(false)
  const qty = parseQty(text)
  const control =
    'w-full rounded-xl border border-slate-200 bg-surface px-3.5 py-3 text-base text-slate-800 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15'

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await onSave(name.trim(), qty, unit)
    } catch {
      setSaving(false)
      alert('Nije sačuvano. Proveri internet i probaj ponovo.')
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/40" onClick={onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        className="w-full max-w-5xl space-y-3 rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Novi artikal</p>
          <p className="text-sm text-slate-500">Admin dobija obaveštenje i potvrđuje ga. Do tada stoji kao „čeka potvrdu”.</p>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Naziv, npr. Aperol 0,7"
          autoFocus
          aria-label="Naziv artikla"
          className={control}
        />
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="decimal"
            placeholder="Koliko je stiglo"
            aria-label="Količina"
            className={`${control} min-w-0 flex-1`}
          />
          <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Jedinica" className={`${control} w-32 shrink-0`}>
            {REQUEST_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Otkaži
          </Button>
          <Button type="submit" disabled={!name.trim() || saving} className="flex-1">
            {saving ? 'Šaljem...' : 'Dodaj i pošalji adminu'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200/70 bg-surface/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl gap-3">{children}</div>
    </div>
  )
}

function LineList({
  lines,
  onEdit,
  onRemove,
}: {
  lines: DeliveryLine[]
  onEdit: (l: DeliveryLine) => void
  onRemove: (l: DeliveryLine) => void
}) {
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
      {lines.map((l) => (
        <div key={l.id} className="flex items-center gap-2 pr-1">
          <button onClick={() => onEdit(l)} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
            <span className="min-w-0 truncate text-slate-800">{l.article_name}</span>
            <span
              className={`shrink-0 text-right text-sm font-semibold ${l.direction === 'return' ? 'text-red-600' : 'text-slate-700'}`}
            >
              {l.direction === 'return' ? '↩ ' : ''}
              {formatNum(l.qty)} {l.unit}
              {l.unit !== l.base_unit && (
                <span className="block text-xs font-normal text-slate-400">
                  = {formatNum(l.base_qty)} {l.base_unit}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => onRemove(l)}
            aria-label={`Ukloni ${l.article_name}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

/** Bottom sheet: how much of one article arrived, or how much goes back. */
function AmountSheet({
  article,
  initialDirection,
  deliveryId,
  lineFor,
  onSaved,
  onCancel,
}: {
  article: Article
  initialDirection: DeliveryDirection
  deliveryId: string
  lineFor: (direction: DeliveryDirection) => DeliveryLine | undefined
  onSaved: (line: DeliveryLine) => void
  onCancel: () => void
}) {
  const options = unitOptions(article)
  const baseUnit = unitLabel(article)
  const [direction, setDirection] = useState<DeliveryDirection>(initialDirection)
  const existing = lineFor(direction)

  const unitIndexOf = (line: DeliveryLine | undefined) => {
    const i = line ? options.findIndex((o) => o.unit === line.unit) : -1
    return i === -1 ? 0 : i
  }
  const textOf = (line: DeliveryLine | undefined) => (line ? String(line.qty).replace('.', ',') : '')

  const [unitIndex, setUnitIndex] = useState(() => unitIndexOf(existing))
  const [text, setText] = useState(() => textOf(existing))
  const [saving, setSaving] = useState(false)
  const qty = parseQty(text)
  const option = options[unitIndex]
  const isReturn = direction === 'return'

  const switchDirection = (d: DeliveryDirection) => {
    if (d === direction) return
    // Show what is already entered for that direction, if anything.
    const line = lineFor(d)
    setDirection(d)
    setText(textOf(line))
    setUnitIndex(unitIndexOf(line))
  }

  const save = async () => {
    if (qty == null || saving) return
    setSaving(true)
    try {
      const line = await saveDeliveryLine({
        delivery_id: deliveryId,
        article_id: article.id,
        article_name: article.name,
        qty,
        unit: option.unit,
        base_qty: toBase(qty, option),
        base_unit: baseUnit,
        direction,
      })
      onSaved(line)
    } catch {
      setSaving(false)
      alert('Nije sačuvano. Proveri internet i probaj ponovo.')
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/40" onClick={onCancel}>
      <div
        className="w-full max-w-5xl rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="space-y-4 border-0 p-0 shadow-none">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide ${isReturn ? 'text-red-500' : 'text-slate-400'}`}>
              {isReturn ? 'Koliko vraćamo?' : 'Koliko je stiglo?'}
            </p>
            <p className="text-lg font-bold text-slate-900">{article.name}</p>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchDirection('in')}
              className={`rounded-lg py-2 text-sm font-semibold ${
                !isReturn ? 'bg-surface text-green-700 shadow-sm' : 'text-slate-500'
              }`}
            >
              ✓ Stiglo
            </button>
            <button
              type="button"
              onClick={() => switchDirection('return')}
              className={`rounded-lg py-2 text-sm font-semibold ${
                isReturn ? 'bg-surface text-red-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              ↩ Vraćamo
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
            className="space-y-3"
          >
            <div className="flex gap-2">
              <input
                key={direction}
                value={text}
                onChange={(e) => setText(e.target.value)}
                inputMode="decimal"
                autoFocus
                placeholder="0"
                aria-label="Količina"
                className="w-full min-w-0 flex-1 rounded-xl border border-slate-200 bg-surface px-3.5 py-3 text-2xl font-bold text-slate-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
              />
              {options.length > 1 ? (
                <div className="flex shrink-0 overflow-hidden rounded-xl border border-slate-200">
                  {options.map((o, i) => (
                    <button
                      key={o.unit}
                      type="button"
                      onClick={() => setUnitIndex(i)}
                      className={`px-3.5 text-base font-semibold ${
                        i === unitIndex ? 'bg-slate-900 text-white dark:bg-brand-600' : 'bg-surface text-slate-600'
                      }`}
                    >
                      {o.unit}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="flex shrink-0 items-center px-2 text-lg font-semibold text-slate-500">{option.unit}</span>
              )}
            </div>
            {qty != null && option.factor !== 1 && (
              <p className="text-sm text-slate-500">
                = {formatNum(toBase(qty, option))} {baseUnit}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={onCancel}>
                Otkaži
              </Button>
              <Button
                type="submit"
                disabled={qty == null || saving}
                className={`flex-1 ${isReturn ? 'bg-red-600 shadow-red-600/30' : ''}`}
              >
                {saving ? 'Čuvam...' : existing ? 'Sačuvaj' : isReturn ? 'Dodaj u povrat' : 'Dodaj'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
