import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  finishCount,
  getCount,
  listArticles,
  listCategories,
  listLinesForCount,
  saveLine,
  setCategoryDone,
} from '../data/repository'
import type { Article, Count, CountInput, CountLine } from '../data/types'
import { countedOn, describeInput } from '../lib/measure'
import { MeasureInput } from '../components/MeasureInput'
import { Button, Spinner } from '../components/ui'

const NO_CAT = '__none'

interface Group {
  id: string
  name: string
  articles: Article[]
}

type View =
  | { mode: 'categories' }
  | { mode: 'article'; groupId: string; index: number; fromReview: boolean }
  | { mode: 'review' }

export function CountSession() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [count, setCount] = useState<Count | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [lines, setLines] = useState<Map<string, CountLine>>(new Map())
  const [view, setView] = useState<View>({ mode: 'categories' })
  const [loading, setLoading] = useState(true)
  const [finishing, setFinishing] = useState(false)
  /** Article list inside a category, for jumping back to any article. */
  const [showList, setShowList] = useState(false)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const [c, allArticles, categories, ls] = await Promise.all([
        getCount(id),
        listArticles({ activeOnly: true }),
        listCategories(),
        listLinesForCount(id),
      ])
      // Weekly articles (glasses, spoons...) only show up on their day.
      const day = c ? new Date(c.datetime) : new Date()
      const articles = allArticles.filter((a) => countedOn(a, day))
      const gs: Group[] = categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        articles: articles.filter((a) => a.category_id === cat.id),
      }))
      const known = new Set(categories.map((cat) => cat.id))
      const orphans = articles.filter((a) => !a.category_id || !known.has(a.category_id))
      if (orphans.length) gs.push({ id: NO_CAT, name: 'Bez kategorije', articles: orphans })
      setCount(c ?? null)
      setGroups(gs.filter((g) => g.articles.length > 0))
      setLines(new Map(ls.map((l) => [l.article_id, l])))
      setLoading(false)
    })()
  }, [id])

  const savingRef = useRef(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  const done = useMemo(() => new Set(count?.done_categories ?? []), [count])
  const allDone = groups.length > 0 && groups.every((g) => done.has(g.id))

  if (loading) return <Spinner />
  if (!count || !id) return <p className="text-slate-500">Popis nije pronađen.</p>
  if (count.status === 'finished') {
    return (
      <div className="space-y-3">
        <p className="text-slate-600">Ovaj popis je već završen.</p>
        <Button onClick={() => navigate('/count')}>Nazad</Button>
      </div>
    )
  }

  const firstOpenIndex = (g: Group) => {
    const i = g.articles.findIndex((a) => !lines.has(a.id))
    return i === -1 ? 0 : i
  }

  const openGroup = (g: Group) => {
    setShowList(false)
    setView({ mode: 'article', groupId: g.id, index: firstOpenIndex(g), fromReview: false })
  }

  const jumpTo = (g: Group, index: number) => {
    setShowList(false)
    setView({ mode: 'article', groupId: g.id, index, fromReview: false })
  }

  const onSubmit = async (group: Group, index: number, input: CountInput, fromReview: boolean) => {
    // Ignore double taps while the previous entry is still saving.
    if (savingRef.current) return
    savingRef.current = true
    const article = group.articles[index]
    const line = await saveLine(id, article, input).finally(() => {
      savingRef.current = false
    })
    const next = new Map(lines).set(article.id, line)
    setLines(next)
    if (fromReview) {
      setView({ mode: 'review' })
      return
    }
    const open = group.articles.findIndex((a, i) => i > index && !next.has(a.id))
    if (open !== -1) {
      setView({ mode: 'article', groupId: group.id, index: open, fromReview })
      return
    }
    const earlier = group.articles.findIndex((a) => !next.has(a.id))
    if (earlier !== -1) {
      setView({ mode: 'article', groupId: group.id, index: earlier, fromReview })
      return
    }
    // Every article in the category has a value → category is done.
    const updated = await setCategoryDone(id, group.id, true)
    if (updated) setCount(updated)
    setView({ mode: 'categories' })
  }

  const finish = async () => {
    setFinishing(true)
    await finishCount(id)
    navigate('/count', { state: { finished: true } })
  }

  // --- One article at a time -------------------------------------------------
  if (view.mode === 'article') {
    const group = groups.find((g) => g.id === view.groupId)
    if (!group) return null
    const article = group.articles[view.index]
    const filled = group.articles.filter((a) => lines.has(a.id)).length
    return (
      <div className="space-y-5 pb-10">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setView(view.fromReview ? { mode: 'review' } : { mode: 'categories' })}
            className="text-sm font-medium text-brand-700"
          >
            ← {view.fromReview ? 'Pregled' : 'Kategorije'}
          </button>
          {view.fromReview ? (
            <span className="text-sm text-slate-500">
              {view.index + 1} / {group.articles.length}
            </span>
          ) : (
            <button
              onClick={() => setShowList((s) => !s)}
              className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition active:scale-95"
            >
              ☰ {view.index + 1} / {group.articles.length}
              <span className="text-xs">{showList ? '▲' : '▼'}</span>
            </button>
          )}
        </div>

        {showList && !view.fromReview && (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-sm">
            {group.articles.map((a, i) => {
              const line = lines.get(a.id)
              const current = i === view.index
              return (
                <button
                  key={a.id}
                  onClick={() => jumpTo(group, i)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left ${
                    current ? 'bg-brand-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        line ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {line ? '✓' : i + 1}
                    </span>
                    <span className={`truncate ${current ? 'font-semibold text-brand-700' : 'text-slate-800'}`}>{a.name}</span>
                  </span>
                  <span className="shrink-0 text-right text-sm text-slate-500">
                    {line ? describeInput(a, line.input, line.counted) : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{group.name}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${(filled / group.articles.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <h1 className="mb-5 text-2xl font-bold text-slate-800">{article.name}</h1>
          <MeasureInput
            key={article.id}
            article={article}
            initial={lines.get(article.id)?.input ?? null}
            submitLabel={view.fromReview ? 'Sačuvaj' : 'Dalje →'}
            onSubmit={(input) => onSubmit(group, view.index, input, view.fromReview)}
          />
        </div>

        {!view.fromReview && (
          <div className="flex justify-between">
            <Button
              variant="ghost"
              disabled={view.index === 0}
              onClick={() => setView({ ...view, index: view.index - 1 })}
            >
              ← Prethodni
            </Button>
            {lines.has(article.id) && view.index < group.articles.length - 1 && (
              <Button variant="ghost" onClick={() => setView({ ...view, index: view.index + 1 })}>
                Sledeći →
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }

  // --- Review before finishing -----------------------------------------------
  if (view.mode === 'review') {
    return (
      <div className="space-y-4 pb-28">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Proveri popis</h1>
          <p className="text-sm text-slate-500">Dodirni stavku da je ispraviš.</p>
        </div>
        {groups.map((g) => (
          <section key={g.id} className="space-y-1.5">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.name}</h2>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
              {g.articles.map((a, i) => {
                const line = lines.get(a.id)
                return (
                  <button
                    key={a.id}
                    onClick={() => setView({ mode: 'article', groupId: g.id, index: i, fromReview: true })}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0 truncate text-slate-800">{a.name}</span>
                    <span
                      className={`shrink-0 text-right text-sm font-semibold ${
                        line?.input.kind === 'yes_no'
                          ? line.input.has ? 'text-green-700' : 'text-red-600'
                          : 'text-slate-700'
                      }`}
                    >
                      {line ? describeInput(a, line.input, line.counted) : '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200/70 bg-surface/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl gap-3">
            <Button variant="ghost" onClick={() => setView({ mode: 'categories' })}>
              Nazad
            </Button>
            <Button onClick={finish} disabled={finishing} className="flex-1 bg-green-600 hover:brightness-110">
              {finishing ? 'Čuvam...' : '✓ Sve u redu, završi popis'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // --- Category list ---------------------------------------------------------
  const doneCount = groups.filter((g) => done.has(g.id)).length
  return (
    <div className="space-y-4 pb-28">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Popis</h1>
          <p className="text-sm text-slate-500">Izaberi kategoriju, redom koji ti odgovara.</p>
        </div>
        <span className="shrink-0 rounded-full bg-surface px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
          {doneCount} / {groups.length}
        </span>
      </div>
      <div className="space-y-2.5">
        {groups.map((g) => {
          const filled = g.articles.filter((a) => lines.has(a.id)).length
          const isDone = done.has(g.id)
          const started = filled > 0
          const pct = (filled / g.articles.length) * 100
          return (
            <button
              key={g.id}
              onClick={() => openGroup(g)}
              className={`w-full rounded-2xl border p-4 text-left shadow-sm transition active:scale-[0.99] ${
                isDone ? 'border-green-200 bg-green-50' : started ? 'border-amber-200 bg-surface' : 'border-slate-200/80 bg-surface'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                      isDone ? 'bg-green-600 text-white' : started ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {isDone ? '✓' : g.articles.length}
                  </span>
                  <p className={`truncate text-base font-semibold ${isDone ? 'text-green-800' : 'text-slate-800'}`}>{g.name}</p>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${isDone ? 'text-green-700' : 'text-brand-700'}`}>
                  {isDone ? 'Gotovo' : started ? `${filled}/${g.articles.length} →` : 'Počni →'}
                </span>
              </div>
              {started && !isDone && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                </div>
              )}
            </button>
          )
        })}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200/70 bg-surface/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl gap-3">
          <Button variant="ghost" onClick={() => navigate('/count')}>
            Izađi
          </Button>
          <Button onClick={() => setView({ mode: 'review' })} disabled={!allDone} className="flex-1">
            {allDone ? 'Pregled i završetak' : `Preostalo kategorija: ${groups.length - doneCount}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
