import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listArticles, listCounts, listLagerDates, listLagerStock, listLinesForCount } from '../../data/repository'
import type { Article, Count, CountLine, LagerStock } from '../../data/types'
import { compareStock, defaultCountFor, tolerance, type CompareRow } from '../../lib/compare'
import { bookUnitLabel, isRetired } from '../../lib/lager'
import { formatNum } from '../../lib/measure'
import { fmtDateTime } from '../../lib/format'
import { Card, Select, Spinner, formatMoney } from '../../components/ui'

type Filter = 'diff' | 'all' | 'notCounted' | 'unlinked'

export function Compare() {
  const [params, setParams] = useSearchParams()
  const [dates, setDates] = useState<string[]>([])
  const [counts, setCounts] = useState<Count[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [stock, setStock] = useState<LagerStock[]>([])
  const [lines, setLines] = useState<CountLine[]>([])
  const [filter, setFilter] = useState<Filter>('diff')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([listLagerDates(), listCounts(), listArticles()])
      .then(([d, c, a]) => {
        setDates(d)
        setCounts(c.filter((x) => x.status === 'finished'))
        setArticles(a)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const date = params.get('date') ?? dates[0] ?? ''
  const countId = params.get('count') ?? (date ? defaultCountFor(counts, date)?.id : counts[0]?.id) ?? ''
  const count = counts.find((c) => c.id === countId)

  useEffect(() => {
    if (!date) return
    listLagerStock(date).then(setStock).catch((e) => setError(String(e)))
  }, [date])
  useEffect(() => {
    if (!countId) return
    listLinesForCount(countId).then(setLines).catch((e) => setError(String(e)))
  }, [countId])

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    next.set(k, v)
    // A new PDF date picks its own Popis again.
    if (k === 'date') next.delete('count')
    setParams(next, { replace: true })
  }

  const rows = useMemo(() => compareStock(stock, articles, lines), [stock, articles, lines])
  const linkedCodes = useMemo(() => new Set(articles.map((a) => a.code).filter(Boolean)), [articles])
  const unlinked = useMemo(
    () => stock.filter((s) => !linkedCodes.has(s.code) && !isRetired(s) && s.stanje !== 0).sort((a, b) => b.stanje * b.cena - a.stanje * a.cena),
    [stock, linkedCodes],
  )

  const stats = useMemo(() => {
    const s = { shortage: 0, surplus: 0, shortN: 0, surN: 0, ok: 0, notCounted: 0 }
    for (const r of rows) {
      if (r.counted == null) s.notCounted++
      else if (r.ok) s.ok++
      else if (r.diff! < 0) {
        s.shortN++
        s.shortage += r.value ?? 0
      } else {
        s.surN++
        s.surplus += r.value ?? 0
      }
    }
    return s
  }, [rows])

  const shown = rows.filter((r) =>
    filter === 'diff' ? r.counted != null && !r.ok : filter === 'notCounted' ? r.counted == null : filter === 'all',
  )

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Poređenje sa knjigovodstvom</h1>

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
                className={`rounded-full px-3 py-1 text-sm font-medium ${filter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {filter === 'unlinked' ? (
            <Card className="space-y-2 text-sm">
              <p className="text-slate-500">
                Knjigovođa vodi stanje, a nijedan naš artikal nije povezan. Poveži ih u{' '}
                <Link to="/admin/articles" className="font-medium text-brand-700">Artiklima</Link>.
              </p>
              <ul className="divide-y divide-slate-100">
                {unlinked.map((s) => (
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
                  {filter === 'diff' ? 'Nema razlika — sve se slaže.' : 'Nema artikala za prikaz.'}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-slate-400">
            Razlika = izbrojano − knjigovodstveno. Manje od {formatNum(tolerance('KOM'))} kom ili{' '}
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
            knjig. {formatNum(r.book)} {u} · popis {r.counted == null ? '—' : `${formatNum(r.counted)} ${u}`}
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

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface p-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}.`
}
