import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  listArticles,
  listCounts,
  listDeliveries,
  listDeliveryLines,
  listDeliveryLinesFor,
  listLagerDates,
  listLagerStock,
  listLinesForCount,
  listNotOnSef,
  setNotOnSef,
} from '../../data/repository'
import type { Article, Count, CountLine, Delivery, DeliveryLine, LagerStock } from '../../data/types'
import { compareStock, compareTotals, defaultCountFor, pendingByCode, tolerance, type CompareRow } from '../../lib/compare'
import { bookUnitLabel, isRetired } from '../../lib/lager'
import { formatNum } from '../../lib/measure'
import { fmtDateTime, fold, isBefore } from '../../lib/format'
import { downloadCsv } from '../../lib/csv'
import { Card, Select, Spinner, formatMoney } from '../../components/ui'

type Filter = 'diff' | 'all' | 'notCounted' | 'unlinked'

export function Compare() {
  const [params, setParams] = useSearchParams()
  const imported = (useLocation().state as { imported?: string } | null)?.imported
  const [dates, setDates] = useState<string[]>([])
  const [counts, setCounts] = useState<Count[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [stock, setStock] = useState<LagerStock[]>([])
  const [lines, setLines] = useState<CountLine[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [pendingLines, setPendingLines] = useState<DeliveryLine[]>([])
  const [filter, setFilter] = useState<Filter>('diff')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      listLagerDates(),
      listCounts(),
      listArticles(),
      // The comparison still works before the fakture tables exist.
      listDeliveries().catch(() => [] as Delivery[]),
    ])
      .then(([d, c, a, del]) => {
        setDates(d)
        setCounts(c.filter((x) => x.status === 'finished'))
        setArticles(a)
        setDeliveries(del.filter((x) => x.status === 'confirmed'))
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const date = params.get('date') ?? dates[0] ?? ''
  const countId = params.get('count') ?? (date ? defaultCountFor(counts, date)?.id : counts[0]?.id) ?? ''
  const count = counts.find((c) => c.id === countId)
  const asking = params.get('ask') === '1'
  /** Fakture the accountant doesn't have yet, saved per PDF date (also used by the ordering list). */
  const [noSef, setNoSef] = useState<Set<string>>(new Set())
  // Only fakture entered before the Popis count: those goods were on the shelf when counted.
  const countedIds = useMemo(
    () =>
      [...noSef].filter((id) => {
        const d = deliveries.find((x) => x.id === id)
        return d && count && isBefore(d.created_at, count.datetime)
      }),
    [noSef, deliveries, count],
  )

  useEffect(() => {
    if (!date) return
    // Before migration 016 there is no table: the picker just starts empty.
    listNotOnSef(date).then((ids) => setNoSef(new Set(ids)), () => setNoSef(new Set()))
  }, [date])

  useEffect(() => {
    if (!date) return
    listLagerStock(date).then(setStock).catch((e) => setError(String(e)))
  }, [date])
  useEffect(() => {
    if (!countId) return
    listLinesForCount(countId).then(setLines).catch((e) => setError(String(e)))
  }, [countId])

  useEffect(() => {
    listDeliveryLinesFor(countedIds).then(setPendingLines).catch((e) => setError(String(e)))
  }, [countedIds])

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    // A new PDF date picks its own Popis again.
    if (k === 'date') next.delete('count')
    setParams(next, { replace: true })
  }

  const pending = useMemo(() => pendingByCode(articles, pendingLines), [articles, pendingLines])
  const rows = useMemo(() => compareStock(stock, articles, lines, pending), [stock, articles, lines, pending])

  const toggleNoSef = async (id: string) => {
    const on = !noSef.has(id)
    const next = new Set(noSef)
    if (on) next.add(id)
    else next.delete(id)
    setNoSef(next)
    try {
      await setNotOnSef(date, id, on)
    } catch (e) {
      setNoSef(noSef)
      setError(`Nije sačuvano: ${e instanceof Error ? e.message : e}`)
    }
  }
  const linkedCodes = useMemo(() => new Set(articles.map((a) => a.code).filter(Boolean)), [articles])
  const unlinked = useMemo(
    () => stock.filter((s) => !linkedCodes.has(s.code) && !isRetired(s) && s.stanje !== 0).sort((a, b) => b.stanje * b.cena - a.stanje * a.cena),
    [stock, linkedCodes],
  )

  const stats = useMemo(() => compareTotals(rows), [rows])

  const words = fold(query).split(/\s+/).filter(Boolean)
  const matches = (...texts: string[]) => {
    if (!words.length) return true
    const hay = fold(texts.join(' '))
    return words.every((w) => hay.includes(w))
  }
  const rowMatches = (r: CompareRow) => matches(r.name, r.code, ...r.members.map((m) => m.name))

  const found = words.length ? rows.filter(rowMatches) : rows
  const shown = found.filter((r) =>
    filter === 'diff' ? r.counted != null && !r.ok : filter === 'notCounted' ? r.counted == null : filter === 'all',
  )
  const unlinkedShown = unlinked.filter((s) => matches(s.name, s.code))

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-3xl font-extrabold text-slate-900">Poređenje sa knjigovodstvom</h1>
        {date && count && rows.length > 0 && (
          <button
            onClick={() =>
              downloadCsv(
                `poredjenje-${date}.csv`,
                ['Šifra', 'Artikal', 'Jedinica', 'Knjigovođa', 'Fakture van SEF-a', 'Knjigovodstveno ukupno', 'Popis', 'Razlika', 'Cena', 'Vrednost razlike', 'Status'],
                rows.map((r) => [
                  r.code,
                  r.name,
                  bookUnitLabel(r.unit),
                  r.bookPdf,
                  r.pending || null,
                  r.book,
                  r.counted,
                  r.diff,
                  r.cena,
                  r.value,
                  r.counted == null ? 'nije brojano' : r.ok ? 'slaže se' : (r.diff ?? 0) < 0 ? 'manjak' : 'višak',
                ]),
              )
            }
            className="rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ⬇ Excel
          </button>
        )}
      </div>

      {imported && <Card className="bg-green-50 text-sm text-green-800">{imported}</Card>}
      {error && <Card className="bg-red-50 text-sm text-red-700">{error}</Card>}

      {dates.length === 0 ? (
        <Card className="text-sm text-slate-600">
          Još nije učitana nijedna lager lista. <Link to="/admin/import" className="font-medium text-brand-700">Učitaj PDF →</Link>
        </Card>
      ) : (
        <Card className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Knjigovodstveno stanje na dan</span>
            <Select value={date} onChange={(e) => setParam('date', e.target.value)}>
              {dates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Popis</span>
            <Select value={countId} onChange={(e) => setParam('count', e.target.value)}>
              {counts.length === 0 && <option value="">— nema završenih popisa —</option>}
              {counts.map((c) => (
                <option key={c.id} value={c.id}>{fmtDateTime(c.datetime)} · {c.user_name}</option>
              ))}
            </Select>
          </label>
        </Card>
      )}

      {date && count && (
        <>
          <NotOnSef
            deliveries={deliveries}
            count={count}
            selected={noSef}
            asking={asking}
            onToggle={toggleNoSef}
            onDone={() => setParam('ask', '')}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={`Manjak (${stats.shortN})`} value={`${formatMoney(stats.shortage)} din`} tone="text-red-600" />
            <Stat label={`Višak (${stats.surN})`} value={`${formatMoney(stats.surplus)} din`} tone="text-green-600" />
            <Stat label="Slaže se" value={String(stats.ok)} tone="text-slate-800" />
            <Stat label="Nije brojano" value={String(stats.notCounted)} tone="text-slate-500" />
          </div>

          <div className="flex flex-wrap gap-2">
            {([
              ['diff', `Razlike (${stats.shortN + stats.surN})`],
              ['all', `Sve (${rows.length})`],
              ['notCounted', `Nije brojano (${stats.notCounted})`],
              ['unlinked', `Nepovezano (${unlinked.length})`],
            ] as const).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${filter === f ? 'bg-ink text-on-ink' : 'bg-slate-100 text-slate-600'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pretraži artikal ili šifru…"
              aria-label="Pretraga artikala"
              className="w-full rounded-xl border border-slate-300 bg-surface py-2 pl-9 pr-9 text-slate-800 outline-none focus:border-brand-500"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Obriši pretragu"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-0.5 text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </div>

          {filter === 'unlinked' ? (
            <Card className="space-y-2 text-sm">
              <p className="text-slate-500">
                Knjigovođa vodi stanje, a nijedan naš artikal nije povezan. Poveži ih u{' '}
                <Link to="/admin/articles" className="font-medium text-brand-700">Artiklima</Link>.
              </p>
              <ul className="divide-y divide-slate-100">
                {unlinkedShown.length === 0 && <li className="py-3 text-center text-slate-400">Nema rezultata.</li>}
                {unlinkedShown.map((s) => (
                  <li key={s.code} className="flex justify-between gap-3 py-1.5">
                    <span className="text-slate-700">{s.name}</span>
                    <span className="shrink-0 text-slate-500">{formatNum(s.stanje)} {bookUnitLabel(s.unit)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
              {shown.map((r) => <CompareItem key={r.code} row={r} />)}
              {shown.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  {words.length
                    ? 'Nema rezultata u ovom prikazu.'
                    : filter === 'diff'
                      ? 'Nema razlika — sve se slaže.'
                      : 'Nema artikala za prikaz.'}
                  {words.length > 0 && filter !== 'all' && found.length > 0 && (
                    <>
                      {' '}
                      <button onClick={() => setFilter('all')} className="font-medium text-brand-700 hover:underline">
                        Pronađeno u „Sve” ({found.length}) →
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-slate-400">
            Razlika = izbrojano − (knjigovodstveno + fakture kojih nema kod knjigovođe). Manje od {formatNum(tolerance('KOM'))} kom ili{' '}
            {formatNum(tolerance('KG') * 1000)} g/ml se računa kao „slaže se”. Vrednost = razlika × cena iz lager liste.
          </p>
        </>
      )}
    </div>
  )
}

function CompareItem({ row: r }: { row: CompareRow }) {
  const u = bookUnitLabel(r.unit)
  const short = r.diff != null && r.diff < 0
  const tone = r.counted == null ? 'text-slate-400' : r.ok ? 'text-slate-500' : short ? 'text-red-600' : 'text-green-600'
  const multi = r.members.length > 1 || r.members.some((m) => m.factor !== 1 || m.unit !== u)
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium leading-tight text-slate-800">{r.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            knjig. {formatNum(r.bookPdf)} {u}
            {r.pending !== 0 && (
              <span className="font-medium text-brand-700">
                {' '}
                {r.pending > 0 ? '+' : '−'} {formatNum(Math.abs(r.pending))} sa faktura = {formatNum(r.book)} {u}
              </span>
            )}{' '}
            · popis {r.counted == null ? '—' : `${formatNum(r.counted)} ${u}`}
          </p>
        </div>
        <div className={`shrink-0 text-right ${tone}`}>
          <p className="font-semibold leading-tight">
            {r.counted == null
              ? 'nije brojano'
              : r.ok
                ? 'slaže se'
                : `${short ? 'manjak' : 'višak'} ${formatNum(Math.abs(r.diff!))} ${u}`}
          </p>
          {r.counted != null && !r.ok && (
            <p className="text-xs">{r.cena ? `${formatMoney(Math.abs(r.value ?? 0))} din` : 'bez cene'}</p>
          )}
        </div>
      </div>
      {multi && (
        <p className="mt-1 text-xs text-slate-400">
          {r.members
            .map((m) => `${m.name}: ${m.counted == null ? '—' : `${formatNum(m.counted)} ${m.unit}`}${m.factor !== 1 ? ` (×${formatNum(m.factor)})` : ''}`)
            .join(' · ')}
        </p>
      )}
      {r.partial && <p className="mt-0.5 text-xs text-amber-700">⚠ Neki povezani artikli nisu brojani u ovom popisu.</p>}
      {r.untracked && (
        <p className="mt-0.5 text-xs text-amber-700">Knjigovođa ovo vodi na 0 (sve što uđe odmah izađe) — razlika nije stvarna.</p>
      )}
    </div>
  )
}

const SUGGESTED = 5

/**
 * "Koje fakture knjigovođa još nema?" — the last fakture entered before the
 * Popis; the checked ones are added to the accountant's Stanje. Fakture
 * entered after the Popis (e.g. today's delivery) were not on the shelf when
 * it was counted, so they are listed but never added.
 */
function NotOnSef({
  deliveries,
  count,
  selected,
  asking,
  onToggle,
  onDone,
}: {
  deliveries: Delivery[]
  count: Count
  selected: Set<string>
  asking: boolean
  onToggle: (id: string) => void
  onDone: () => void
}) {
  const [open, setOpen] = useState(asking)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [linesOf, setLinesOf] = useState<Record<string, DeliveryLine[]>>({})
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (asking) setOpen(true)
  }, [asking])

  const sorted = [...deliveries].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const before = sorted.filter((d) => isBefore(d.created_at, count.datetime))
  const after = sorted.filter((d) => !isBefore(d.created_at, count.datetime))
  const shown = showAll ? before : before.filter((d, i) => i < SUGGESTED || selected.has(d.id))
  const chosen = before.filter((d) => selected.has(d.id))
  const label = (d: Delivery) => d.supplier_name ?? 'Bez dobavljača'

  const expand = (id: string) => {
    setExpanded(expanded === id ? null : id)
    if (!linesOf[id]) listDeliveryLines(id).then((ls) => setLinesOf((m) => ({ ...m, [id]: ls }))).catch(() => {})
  }

  if (!open) {
    return (
      <Card className="flex items-center justify-between gap-3 text-sm">
        <p className="text-slate-600">
          Fakture kojih nema kod knjigovođe:{' '}
          <strong className="text-slate-800">
            {chosen.length === 0 ? 'nijedna' : chosen.map((d) => `${label(d)} ${fmtShort(d.created_at)}`).join(', ')}
          </strong>
        </p>
        <button onClick={() => setOpen(true)} className="shrink-0 font-semibold text-brand-700 hover:underline">
          Promeni
        </button>
      </Card>
    )
  }

  return (
    <Card className={`space-y-3 ${asking ? 'border-brand-300 ring-4 ring-brand-500/10' : ''}`}>
      <div>
        <p className="font-bold text-slate-900">Koje fakture knjigovođa još nema?</p>
        <p className="text-sm text-slate-500">
          Štikliraj one koje nisu stigle na SEF. Dodaju se na knjigovodstveno stanje (stiglo +, vraćeno −), ovde i u
          listi nabavke (keš/račun). Računaju se samo fakture unete pre popisa od {fmtDateTime(count.datetime)}.
        </p>
      </div>

      {before.length === 0 ? (
        <p className="text-sm text-slate-400">Nema unetih faktura pre ovog popisa.</p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {shown.map((d) => {
            const on = selected.has(d.id)
            const ls = linesOf[d.id]
            return (
              <div key={d.id} className={on ? 'bg-brand-50/60' : ''}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(d.id)}
                    aria-label={`Nema kod knjigovođe: ${label(d)} ${fmtShort(d.created_at)}`}
                    className="h-5 w-5 shrink-0 accent-brand-600"
                  />
                  <button onClick={() => onToggle(d.id)} className="min-w-0 flex-1 text-left">
                    <p className="font-medium text-slate-800">
                      {label(d)} · {fmtDateTime(d.created_at)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {d.user_name}
                      {d.note ? ` · ${d.note}` : ''}
                    </p>
                  </button>
                  <button
                    onClick={() => expand(d.id)}
                    className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-slate-100"
                  >
                    {expanded === d.id ? 'Sakrij' : 'Šta je na njoj'}
                  </button>
                </div>
                {expanded === d.id && (
                  <ul className="space-y-0.5 pb-2.5 pl-11 pr-3 text-sm">
                    {!ls && <li className="text-slate-400">Učitavam...</li>}
                    {ls?.length === 0 && <li className="text-slate-400">Nema stavki.</li>}
                    {ls?.map((l) => (
                      <li key={l.id} className="flex justify-between gap-3">
                        <span className="text-slate-700">{l.article_name}</span>
                        <span className={`shrink-0 font-medium ${l.direction === 'return' ? 'text-red-600' : 'text-slate-600'}`}>
                          {l.direction === 'return' ? '↩ ' : ''}
                          {formatNum(l.qty)} {l.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
      {!showAll && before.length > shown.length && (
        <button onClick={() => setShowAll(true)} className="text-sm font-medium text-brand-700 hover:underline">
          Prikaži starije ({before.length - shown.length})
        </button>
      )}

      {after.length > 0 && (
        <p className="text-xs text-slate-400">
          Ne računa se, uneto posle popisa: {after.map((d) => `${label(d)} ${fmtDateTime(d.created_at)}`).join(', ')}.
        </p>
      )}

      <button
        onClick={() => {
          setOpen(false)
          onDone()
        }}
        className="w-full rounded-xl border border-black/10 bg-brand-600 py-2.5 font-semibold text-on-brand shadow-sm hover:-translate-y-px hover:brightness-105"
      >
        {chosen.length === 0
          ? 'Sve su kod knjigovođe, uporedi'
          : `Dodaj ${chosen.length} ${chosen.length === 1 ? 'fakturu' : 'fakture'} i uporedi`}
      </button>
    </Card>
  )
}

function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString('sr-RS', { day: '2-digit', month: '2-digit' })
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-3.5 shadow-sm">
      <p className="eyebrow text-slate-500">{label}</p>
      <p className={`num mt-2 text-lg font-semibold tracking-tight ${tone}`}>{value}</p>
    </div>
  )
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}.`
}
