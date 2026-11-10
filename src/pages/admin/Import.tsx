import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listArticles, listCategories, listImports, saveLagerImport, type LagerLink } from '../../data/repository'
import { Button, Card, Input, Select, Spinner } from '../../components/ui'
import type { Article, BookStockImport, Category } from '../../data/types'
import {
  SURE_SCORE,
  bookUnitLabel,
  isRetired,
  readLagerPdf,
  suggestFactor,
  suggestLager,
  totalsMatch,
  type LagerReport,
  type LagerRow,
} from '../../lib/lager'
import { formatNum, unitLabel } from '../../lib/measure'

/** linked = already saved; auto/check = suggested now; missing = saved code not in this PDF. */
type Status = 'linked' | 'auto' | 'check' | 'missing' | 'none'

interface Draft {
  code: string | null
  factor: string
  status: Status
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  linked: { label: 'povezano', cls: 'bg-green-100 text-green-700' },
  auto: { label: 'predlog', cls: 'bg-brand-50 text-brand-700' },
  check: { label: 'proveri', cls: 'bg-amber-100 text-amber-800' },
  missing: { label: 'nema u PDF-u', cls: 'bg-red-100 text-red-700' },
  none: { label: 'nije povezano', cls: 'bg-slate-100 text-slate-500' },
}

type Filter = 'all' | 'review' | 'none'

/** New suggestions and broken links; saved links that still match are not shown again. */
const needsReview = (s: Status) => s === 'auto' || s === 'check' || s === 'missing'

export function ImportPage() {
  const [report, setReport] = useState<LagerReport | null>(null)
  const [fileName, setFileName] = useState('')
  const [date, setDate] = useState('')
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [imports, setImports] = useState<BookStockImport[]>([])

  useEffect(() => {
    listImports().then(setImports).catch(() => setImports([]))
  }, [])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    setError('')
    setResult(null)
    try {
      const [r, arts, cats] = await Promise.all([readLagerPdf(file), listArticles(), listCategories()])
      if (!r.rows.length) throw new Error('U PDF-u nije pronađen nijedan artikal. Da li je ovo lager lista?')
      setReport(r)
      setFileName(file.name)
      setDate(r.date ?? new Date().toISOString().slice(0, 10))
      setArticles(arts)
      setCategories(cats)
      setDrafts(initialDrafts(arts, r.rows))
      setFilter(arts.some((a) => a.code) ? 'review' : 'all')
    } catch (e) {
      setError(`PDF nije pročitan: ${e instanceof Error ? e.message : String(e)}`)
      setReport(null)
    }
    setReading(false)
  }

  const rowOf = useMemo(() => new Map((report?.rows ?? []).map((r) => [r.code, r])), [report])
  const options = useMemo(
    () => [...(report?.rows ?? [])].filter((r) => !isRetired(r)).sort((a, b) => a.name.localeCompare(b.name)),
    [report],
  )

  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))

  const pick = (a: Article, code: string | null) => {
    const row = code ? rowOf.get(code) : undefined
    setDraft(a.id, {
      code,
      factor: String(row ? suggestFactor(a, row.unit) : 1),
      status: code ? 'linked' : 'none',
    })
  }

  const counts = useMemo(() => {
    const c = { review: 0, none: 0 }
    for (const d of Object.values(drafts)) {
      if (needsReview(d.status)) c.review++
      if (d.status === 'none') c.none++
    }
    return c
  }, [drafts])

  const sections = useMemo(() => {
    const show = (a: Article) => {
      const s = drafts[a.id]?.status
      if (filter === 'review') return s != null && needsReview(s)
      if (filter === 'none') return s === 'none'
      return true
    }
    const known = new Set(categories.map((c) => c.id))
    const list = categories.map((c) => ({ id: c.id, name: c.name, items: articles.filter((a) => a.category_id === c.id && show(a)) }))
    list.push({ id: '__none', name: 'Bez kategorije', items: articles.filter((a) => (!a.category_id || !known.has(a.category_id)) && show(a)) })
    return list.filter((s) => s.items.length)
  }, [articles, categories, drafts, filter])

  /** Accountant's articles with stock that none of ours points to. */
  const orphans = useMemo(() => {
    const used = new Set(Object.values(drafts).map((d) => d.code))
    return options.filter((r) => !used.has(r.code) && r.stanje !== 0)
  }, [drafts, options])

  const save = async () => {
    if (!report || saving) return
    setSaving(true)
    setError('')
    const links: LagerLink[] = []
    for (const a of articles) {
      const d = drafts[a.id]
      if (!d) continue
      const factor = Number(d.factor.replace(',', '.')) || 1
      const code = d.code
      if (code !== (a.code ?? null) || (code && factor !== (a.book_factor ?? 1))) {
        links.push({ articleId: a.id, code, factor: code ? factor : 1 })
      }
    }
    try {
      const res = await saveLagerImport(
        date,
        fileName,
        report.rows.map(({ code, name, unit, ulaz, izlaz, stanje, cena }) => ({ code, name, unit, ulaz, izlaz, stanje, cena })),
        links,
      )
      setResult(
        `Sačuvano stanje na dan ${formatDate(date)}: ${res.rows} knjigovodstvenih artikala, ${res.linked} naših artikala povezano` +
          (links.length ? ` (${links.length} veza promenjeno).` : '.') +
          (res.isLatest ? '' : ' Ovo je stariji PDF — trenutno stanje ostaje iz novijeg.'),
      )
      setReport(null)
      listImports().then(setImports).catch(() => {})
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(
        /lager_|book_factor|schema cache/i.test(msg)
          ? `Baza još nema tabele za lager listu — u Supabase SQL Editoru pokreni supabase/migrations/011_lager_articles.sql. (${msg})`
          : `Čuvanje nije uspelo: ${msg}`,
      )
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Knjigovodstvo (lager lista)</h1>

      <Card className="space-y-3">
        <p className="text-sm text-slate-600">
          Učitaj PDF lager liste od knjigovođe. Aplikacija pročita sve artikle i njihovo <strong>Stanje</strong>, i
          poveže ih sa našim artiklima. Veze se pamte — sledeći put samo učitaš novi PDF.
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-brand-700">
          {reading ? 'Čitam PDF...' : 'Izaberi PDF'}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={reading}
            onChange={(e) => {
              onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {imports.length > 0 && !report && (
          <p className="text-xs text-slate-400">
            Poslednji uvozi: {imports.slice(0, 5).map((i) => formatDate(i.date)).join(', ')}
          </p>
        )}
      </Card>

      {error && <Card className="bg-red-50 text-sm text-red-700">{error}</Card>}
      {result && (
        <Card className="space-y-2 bg-green-50 text-sm text-green-800">
          <p>{result}</p>
          <Link to={`/admin/compare?date=${date}`} className="inline-block font-semibold text-brand-700">
            Uporedi sa popisom →
          </Link>
        </Card>
      )}
      {reading && <Spinner />}

      {report && (
        <>
          <ReportSummary report={report} fileName={fileName} date={date} onDate={setDate} />

          <div className="flex flex-wrap items-center gap-2">
            {([
              ['all', `Svi (${articles.length})`],
              ['review', `Za proveru (${counts.review})`],
              ['none', `Nepovezani (${counts.none})`],
            ] as const).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  filter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {sections.map((s) => (
            <section key={s.id} className="space-y-2">
              <h2 className="border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-600">
                {s.name} <span className="font-normal text-slate-400">({s.items.length})</span>
              </h2>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
                {s.items.map((a) => (
                  <LinkRow
                    key={a.id}
                    article={a}
                    draft={drafts[a.id]}
                    row={drafts[a.id]?.code ? rowOf.get(drafts[a.id].code!) : undefined}
                    options={options}
                    onPick={(code) => pick(a, code)}
                    onFactor={(factor) => setDraft(a.id, { factor })}
                  />
                ))}
              </div>
            </section>
          ))}
          {sections.length === 0 && <p className="py-4 text-center text-slate-400">Nema artikala za prikaz.</p>}

          {orphans.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-surface p-3 text-sm">
              <summary className="cursor-pointer font-medium text-slate-600">
                Knjigovodstveni artikli sa stanjem koje nijedan naš artikal ne koristi ({orphans.length})
              </summary>
              <ul className="mt-2 space-y-0.5 text-slate-500">
                {orphans.map((r) => (
                  <li key={r.code}>
                    <span className="font-mono text-xs text-slate-400">{r.code}</span> {r.name} —{' '}
                    {formatNum(r.stanje)} {bookUnitLabel(r.unit)}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="sticky bottom-3 flex justify-end">
            <Button onClick={save} disabled={saving || !date} className="shadow-lg">
              {saving ? 'Čuvam...' : 'Sačuvaj stanje i veze'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function initialDrafts(articles: Article[], rows: LagerRow[]): Record<string, Draft> {
  const codes = new Set(rows.map((r) => r.code))
  const unit = new Map(rows.map((r) => [r.code, r.unit]))
  const out: Record<string, Draft> = {}
  for (const a of articles) {
    if (a.code) {
      out[a.id] = { code: a.code, factor: String(a.book_factor ?? 1), status: codes.has(a.code) ? 'linked' : 'missing' }
      continue
    }
    const s = suggestLager(a, rows)
    out[a.id] = s
      ? { code: s.code, factor: String(suggestFactor(a, unit.get(s.code) ?? '')), status: s.score >= SURE_SCORE ? 'auto' : 'check' }
      : { code: null, factor: '1', status: 'none' }
  }
  return out
}

function ReportSummary({
  report,
  fileName,
  date,
  onDate,
}: {
  report: LagerReport
  fileName: string
  date: string
  onDate: (d: string) => void
}) {
  const ok = totalsMatch(report)
  return (
    <Card className={`space-y-2 ${ok ? '' : 'border-amber-300 bg-amber-50/60'}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-800">{fileName}</p>
          <p className="text-sm text-slate-500">{report.rows.length} artikala u PDF-u</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Stanje na dan</span>
          <Input type="date" value={date} onChange={(e) => onDate(e.target.value)} />
        </label>
      </div>
      {ok ? (
        <p className="text-sm text-green-700">
          ✓ Pročitano sve — Σ Stanje {formatNum(report.sums.stanje)} i Σ Iznos {formatNum(report.sums.iznos)} se slažu
          sa redom UKUPNO.
        </p>
      ) : (
        <p className="text-sm text-amber-800">
          ⚠ Zbir se ne slaže sa redom UKUPNO
          {report.totals
            ? ` (pročitano Σ Stanje ${formatNum(report.sums.stanje)}, u PDF-u ${formatNum(report.totals.stanje)})`
            : ' (red UKUPNO nije pronađen)'}
          . Proveri da li neki artikal fali.
        </p>
      )}
      {report.unreadable.length > 0 && (
        <p className="text-sm text-amber-800">Nisu pročitani redovi: {report.unreadable.join('; ')}</p>
      )}
    </Card>
  )
}

function LinkRow({
  article,
  draft,
  row,
  options,
  onPick,
  onFactor,
}: {
  article: Article
  draft: Draft | undefined
  row: LagerRow | undefined
  options: LagerRow[]
  onPick: (code: string | null) => void
  onFactor: (f: string) => void
}) {
  if (!draft) return null
  const ours = unitLabel(article)
  const factor = Number(draft.factor.replace(',', '.')) || 1
  const st = STATUS[draft.status]
  return (
    <div className={`space-y-1.5 px-3 py-2 ${article.active ? '' : 'opacity-60'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-medium text-slate-800">
          {article.name} <span className="text-xs font-normal text-slate-400">({ours})</span>
        </p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <Select value={draft.code ?? ''} onChange={(e) => onPick(e.target.value || null)}>
            <option value="">— nije povezano —</option>
            {draft.status === 'missing' && draft.code && <option value={draft.code}>šifra {draft.code} (nema u PDF-u)</option>}
            {options.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} · {formatNum(r.stanje)} {bookUnitLabel(r.unit)}
              </option>
            ))}
          </Select>
        </div>
        {row && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>1 {ours} =</span>
            <div className="w-20">
              <Input inputMode="decimal" value={draft.factor} onChange={(e) => onFactor(e.target.value)} />
            </div>
            <span>{bookUnitLabel(row.unit)}</span>
          </div>
        )}
      </div>
      {row && (
        <p className="text-xs text-slate-400">
          Knjigovodstveno stanje: {formatNum(row.stanje)} {bookUnitLabel(row.unit)}
          {factor !== 1 && ` = ${formatNum(row.stanje / factor)} ${ours}`}
        </p>
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}.${m}.${y}.` : iso
}
