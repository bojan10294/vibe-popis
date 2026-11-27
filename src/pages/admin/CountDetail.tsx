import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getCount,
  listArticles,
  listCategories,
  listLinesForCount,
  listOrdersForCount,
} from '../../data/repository'
import type { Article, Category, Count, CountLine } from '../../data/types'
import { describeInput, formatNum, noteOf } from '../../lib/measure'
import { type CompareTotals } from '../../lib/compare'
import { comparisonFor } from '../../data/orders'
import { downloadCsv, fileDate } from '../../lib/csv'
import { Badge, Card, Spinner, formatMoney } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'

/** Manjak / višak of this Popis, computed exactly like on Poređenje. */
interface Comparison {
  date: string
  totals: CompareTotals
}

export function CountDetail() {
  const { id } = useParams<{ id: string }>()
  const [count, setCount] = useState<Count | null>(null)
  const [lines, setLines] = useState<CountLine[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [orderCount, setOrderCount] = useState(0)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const [c, l, a, cats, orders] = await Promise.all([
        getCount(id),
        listLinesForCount(id),
        listArticles(),
        listCategories(),
        listOrdersForCount(id),
      ])
      setCount(c ?? null)
      setLines(l)
      setArticles(a)
      setCategories(cats)
      setOrderCount(orders.length)
      setLoading(false)
      if (c?.status !== 'finished') return
      // No comparison when it fails: the counted values still show.
      comparisonFor(c, a).then(setComparison, () => setComparison(null))
    })()
  }, [id])

  const articleMap = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles])

  const groups = useMemo(() => {
    const order = new Map(categories.map((c) => [c.id, c.sort_order]))
    const name = new Map(categories.map((c) => [c.id, c.name]))
    const map = new Map<string, CountLine[]>()
    for (const l of lines) {
      const key = l.category_id && name.has(l.category_id) ? l.category_id : ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    const sortOf = (l: CountLine) => articleMap.get(l.article_id)?.sort_order ?? 1e9
    return Array.from(map.entries())
      .sort(([a], [b]) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9))
      .map(([key, ls]) => ({
        name: name.get(key) ?? 'Ostalo',
        lines: ls.sort((x, y) => sortOf(x) - sortOf(y)),
      }))
  }, [lines, categories, articleMap])


  if (loading) return <Spinner />
  if (!count) return <p className="text-slate-500">Popis nije pronađen.</p>

  const describe = (l: CountLine) => {
    const a = articleMap.get(l.article_id)
    if (a && a.kind === l.input.kind) return describeInput(a, l.input, l.counted)
    // Article deleted or its kind changed since: fall back to the saved snapshot.
    const note = noteOf(l.input)
    const base = l.input.kind === 'yes_no' ? (l.input.has ? 'Ima' : 'Nema') : `${formatNum(l.counted)} ${l.unit}`
    return note ? `${base} · fali: ${note}` : base
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Popis {fmtDateTime(count.datetime)}</h1>
          <p className="text-sm text-slate-500">
            Radio: <strong className="text-slate-700">{count.user_name}</strong>
            {count.finished_at && <> · završeno {fmtDateTime(count.finished_at)}</>}
          </p>
          <div className="mt-1">
            <Badge tone={count.status === 'finished' ? 'green' : 'amber'}>
              {count.status === 'finished' ? 'završeno' : 'u toku'}
            </Badge>
          </div>
        </div>
        {count.status === 'finished' && (
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/admin/compare?count=${count.id}${comparison ? `&date=${comparison.date}` : ''}`}
              className="rounded-xl border border-slate-200 bg-surface px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Uporedi sa knjigovodstvom
            </Link>
            <Link
              to={`/admin/orders/${count.id}`}
              className="rounded-xl bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
            >
              Lista nabavke ({orderCount})
            </Link>
          </div>
        )}
        <button
          onClick={() =>
            downloadCsv(
              `popis-${fileDate(count.datetime)}.csv`,
              ['Kategorija', 'Artikal', 'Uneto', 'Količina', 'Jedinica'],
              groups.flatMap((g) => g.lines.map((l) => [g.name, l.article_name, describe(l), l.counted, l.unit])),
            )
          }
          className="rounded-xl border border-slate-200 bg-surface px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
        >
          ⬇ Excel
        </button>
      </div>

      {comparison && (
        <Link to={`/admin/compare?count=${count.id}&date=${comparison.date}`} className="block space-y-1.5">
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-red-200">
              <p className="text-xs text-slate-500">Manjak ({comparison.totals.shortN})</p>
              <p className="text-lg font-bold text-red-600">{formatMoney(comparison.totals.shortage)} din</p>
            </Card>
            <Card className="border-green-200">
              <p className="text-xs text-slate-500">Višak ({comparison.totals.surN})</p>
              <p className="text-lg font-bold text-green-600">{formatMoney(comparison.totals.surplus)} din</p>
            </Card>
          </div>
          <p className="px-1 text-xs text-slate-400">
            Prema lager listi od {fmtDate(comparison.date)}, isto kao na Poređenju. Dodirni za detalje →
          </p>
        </Link>
      )}

      {groups.map((g) => (
        <section key={g.name} className="space-y-1.5">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.name}</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-surface">
            <table className="w-full text-sm">
              <tbody>
                {g.lines.map((l) => {
                  const nema = (l.input.kind === 'yes_no' && !l.input.has) || noteOf(l.input) !== ''
                  return (
                    <tr key={l.id} className="border-t border-slate-100 first:border-t-0">
                      <td className="px-3 py-2 font-medium text-slate-800">{l.article_name}</td>
                      <td className={`px-3 py-2 text-right ${nema ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                        {describe(l)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {lines.length === 0 && (
        <Card className="text-center text-slate-400">Još nema unetih stavki.</Card>
      )}
    </div>
  )
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}.`
}
