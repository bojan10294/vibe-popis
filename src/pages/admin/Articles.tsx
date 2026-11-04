import { useEffect, useMemo, useState } from 'react'
import {
  deleteArticle,
  deleteCategory,
  listArticles,
  listCategories,
  saveArticles,
  saveCategories,
  upsertArticle,
  upsertCategory,
} from '../../data/repository'
import { UNITS, type Article, type Category, type MeasureKind, type Unit } from '../../data/types'
import { uuid } from '../../lib/crypto'
import { KIND_LABELS, formatNum, formatSize, unitLabel } from '../../lib/measure'
import { Button, Input, Select, Spinner } from '../../components/ui'

const NO_CAT = '__none'

export function Articles() {
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    const [a, c] = await Promise.all([listArticles(), listCategories()])
    setArticles(a)
    setCategories(c)
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (a: Article) => !q || a.name.toLowerCase().includes(q)
    const known = new Set(categories.map((c) => c.id))
    const list = categories.map((c) => ({
      category: c as Category | null,
      id: c.id,
      articles: articles.filter((a) => a.category_id === c.id && match(a)),
    }))
    const orphans = articles.filter((a) => (!a.category_id || !known.has(a.category_id)) && match(a))
    if (orphans.length) list.push({ category: null, id: NO_CAT, articles: orphans })
    return q ? list.filter((s) => s.articles.length > 0) : list
  }, [articles, categories, query])

  const newArticle = (categoryId: string | null) => {
    const maxSort = articles.reduce((m, a) => Math.max(m, a.sort_order), 0)
    setEditing({
      id: uuid(),
      name: '',
      category_id: categoryId,
      kind: 'count',
      unit: 'kom',
      allow_decimal: false,
      bottle_sizes: [],
      minimum: 0,
      minimum_weekend: null,
      active: true,
      sort_order: maxSort + 1,
      last_unit_price: 0,
      book_stock: null,
    })
  }

  // Inline form for a new category (id null) or renaming an existing one.
  const [catForm, setCatForm] = useState<{ id: string | null; name: string } | null>(null)

  const saveCategory = async () => {
    const name = catForm?.name.trim()
    if (!catForm || !name) return
    const existing = categories.find((c) => c.id === catForm.id)
    if (existing) {
      await upsertCategory({ ...existing, name })
    } else {
      const order = categories.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1
      await upsertCategory({ id: `cat-${uuid()}`, name, sort_order: order })
    }
    setCatForm(null)
    reload()
  }

  const removeCategory = async (c: Category, count: number) => {
    const msg = count
      ? `Obrisati kategoriju "${c.name}"? ${count} artikala ostaje, ali bez kategorije.`
      : `Obrisati kategoriju "${c.name}"?`
    if (!confirm(msg)) return
    await deleteCategory(c.id)
    reload()
  }

  const moveCategory = async (index: number, dir: -1 | 1) => {
    const other = categories[index + dir]
    const cur = categories[index]
    if (!other) return
    await saveCategories([
      { ...cur, sort_order: other.sort_order },
      { ...other, sort_order: cur.sort_order },
    ])
    reload()
  }

  const moveArticle = async (list: Article[], index: number, dir: -1 | 1) => {
    const cur = list[index]
    const other = list[index + dir]
    if (!other) return
    await saveArticles([
      { ...cur, sort_order: other.sort_order },
      { ...other, sort_order: cur.sort_order },
    ])
    reload()
  }

  const toggleActive = async (a: Article) => {
    await upsertArticle({ ...a, active: !a.active })
    reload()
  }

  const remove = async (a: Article) => {
    if (!confirm(`Obrisati "${a.name}"? Stari popisi ostaju sačuvani.`)) return
    await deleteArticle(a.id)
    setEditing(null)
    reload()
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-800">Artikli ({articles.length})</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setCatForm({ id: null, name: '' })} className="text-sm">+ Kategorija</Button>
          <Button onClick={() => newArticle(categories[0]?.id ?? null)} className="text-sm">+ Artikal</Button>
        </div>
      </div>

      {catForm && (
        <div className="flex gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
          <Input
            value={catForm.name}
            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && saveCategory()}
            placeholder={catForm.id ? 'Novi naziv kategorije' : 'Naziv nove kategorije'}
            autoFocus
          />
          <Button onClick={saveCategory} disabled={!catForm.name.trim()}>Sačuvaj</Button>
          <Button variant="ghost" onClick={() => setCatForm(null)}>Otkaži</Button>
        </div>
      )}

      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pretraga po nazivu" />

      {sections.map((s, si) => (
        <section key={s.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
              {s.category?.name ?? 'Bez kategorije'}{' '}
              <span className="font-normal text-slate-400">({s.articles.length})</span>
            </h2>
            {s.category && !query && (
              <div className="flex items-center gap-1 text-sm">
                <IconBtn label="Pomeri gore" onClick={() => moveCategory(si, -1)} disabled={si === 0}>↑</IconBtn>
                <IconBtn label="Pomeri dole" onClick={() => moveCategory(si, 1)} disabled={si === categories.length - 1}>↓</IconBtn>
                <IconBtn label="Preimenuj" onClick={() => {
                  setCatForm({ id: s.category!.id, name: s.category!.name })
                  window.scrollTo(0, 0)
                }}>✎</IconBtn>
                <IconBtn label="Obriši kategoriju" onClick={() => removeCategory(s.category!, s.articles.length)} danger>🗑</IconBtn>
              </div>
            )}
          </div>

          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {s.articles.map((a, i) => (
              <div key={a.id} className={`flex items-center gap-1.5 py-1.5 pl-1 pr-2 ${a.active ? '' : 'bg-slate-50'}`}>
                {!query && (
                  <div className="flex shrink-0 flex-col">
                    <ArrowBtn label="Gore" onClick={() => moveArticle(s.articles, i, -1)} disabled={i === 0}>▲</ArrowBtn>
                    <ArrowBtn label="Dole" onClick={() => moveArticle(s.articles, i, 1)} disabled={i === s.articles.length - 1}>▼</ArrowBtn>
                  </div>
                )}
                <button onClick={() => setEditing(a)} className="min-w-0 flex-1 py-1 text-left">
                  <p className={`font-medium leading-tight ${a.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                    {a.name}
                  </p>
                  <p className="mt-0.5 text-xs leading-tight text-slate-400">{summary(a)}</p>
                </button>
                <button
                  onClick={() => toggleActive(a)}
                  title={a.active ? 'Isključi iz popisa' : 'Uključi u popis'}
                  className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${a.active ? 'bg-green-500' : 'bg-slate-300'}`}
                >
                  <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${a.active ? 'translate-x-5' : ''}`} />
                </button>
                <IconBtn label="Uredi" onClick={() => setEditing(a)}>✎</IconBtn>
                <IconBtn label="Obriši" onClick={() => remove(a)} danger>🗑</IconBtn>
              </div>
            ))}
            {!query && (
              <button
                onClick={() => newArticle(s.category?.id ?? null)}
                className="w-full px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                + Dodaj artikal u {s.category?.name ?? 'Bez kategorije'}
              </button>
            )}
          </div>
        </section>
      ))}

      {sections.length === 0 && <p className="py-6 text-center text-slate-400">Nema artikala za prikaz.</p>}

      {editing && (
        <ArticleEditor
          article={editing}
          isNew={!articles.some((a) => a.id === editing.id)}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
          onDelete={() => remove(editing)}
        />
      )}
    </div>
  )
}

function summary(a: Article): string {
  const parts = [KIND_LABELS[a.kind]]
  if (a.kind === 'bottle') {
    parts.push(
      a.bottle_sizes
        .map((s) => `${formatSize(s.size_l)}${s.empty_weight_g == null ? ' (bez težine!)' : ` · prazna ${s.empty_weight_g} g`}`)
        .join(', ') || 'nema veličina!',
    )
  } else if (a.kind === 'count' || a.kind === 'weight') {
    parts.push(a.unit)
  }
  if (a.kind !== 'yes_no') {
    let min = `min ${formatNum(a.minimum)} ${unitLabel(a)}`
    if (a.minimum_weekend != null) min += ` · vikend ${formatNum(a.minimum_weekend)}`
    parts.push(min)
  }
  return parts.join(' · ')
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base disabled:opacity-25 ${
        danger ? 'text-red-500 hover:bg-red-50' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

function ArrowBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-5 w-7 items-center justify-center text-[10px] text-slate-400 hover:text-slate-700 disabled:opacity-20"
    >
      {children}
    </button>
  )
}

const COUNT_UNITS: Unit[] = UNITS.filter((u) => u !== 'kg' && u !== 'g')

function ArticleEditor({
  article,
  isNew,
  categories,
  onClose,
  onSaved,
  onDelete,
}: {
  article: Article
  isNew: boolean
  categories: Category[]
  onClose: () => void
  onSaved: () => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<Article>(article)
  // Number fields are edited as strings so "0," or "" don't jump around.
  const [minimum, setMinimum] = useState(String(article.minimum))
  const [weekend, setWeekend] = useState(article.minimum_weekend == null ? '' : String(article.minimum_weekend))
  const [sizes, setSizes] = useState(
    article.bottle_sizes.map((s) => ({
      size: String(s.size_l),
      empty: s.empty_weight_g == null ? '' : String(s.empty_weight_g),
    })),
  )
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof Article>(k: K, v: Article[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const num = (s: string) => {
    const n = Number(s.replace(',', '.'))
    return s.trim() === '' || Number.isNaN(n) ? null : n
  }

  const setKind = (kind: MeasureKind) => {
    setDraft((d) => ({
      ...d,
      kind,
      unit: kind === 'weight' ? (d.unit === 'g' ? 'g' : 'kg') : kind === 'bottle' ? 'l' : kind === 'espresso' ? 'kesa' : d.unit === 'kg' || d.unit === 'g' ? 'kom' : d.unit,
    }))
    if (kind === 'bottle' && sizes.length === 0) setSizes([{ size: '0.7', empty: '' }])
  }

  const save = async () => {
    if (!draft.name.trim()) return
    setSaving(true)
    await upsertArticle({
      ...draft,
      name: draft.name.trim(),
      minimum: num(minimum) ?? 0,
      minimum_weekend: num(weekend),
      bottle_sizes:
        draft.kind === 'bottle'
          ? sizes
              .map((s) => ({ size_l: num(s.size) ?? 0, empty_weight_g: num(s.empty) }))
              .filter((s) => s.size_l > 0)
              .sort((a, b) => a.size_l - b.size_l)
          : [],
    })
    setSaving(false)
    onSaved()
  }

  const minUnit = unitLabel(draft)

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{isNew ? 'Novi artikal' : 'Uredi artikal'}</h2>
          <button onClick={onClose} className="text-2xl leading-none text-slate-400" aria-label="Zatvori">×</button>
        </div>

        <div className="space-y-3">
          <L label="Naziv">
            <Input value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus={isNew} />
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Kategorija">
              <Select value={draft.category_id ?? ''} onChange={(e) => set('category_id', e.target.value || null)}>
                <option value="">— bez kategorije —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </L>
            <L label="Kako se broji">
              <Select value={draft.kind} onChange={(e) => setKind(e.target.value as MeasureKind)}>
                {(Object.keys(KIND_LABELS) as MeasureKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </Select>
            </L>
          </div>

          {draft.kind === 'count' && (
            <div className="grid grid-cols-2 items-end gap-3">
              <L label="Jedinica">
                <Select value={draft.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
                  {COUNT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </Select>
              </L>
              <label className="flex items-center gap-2 pb-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={draft.allow_decimal}
                  onChange={(e) => set('allow_decimal', e.target.checked)}
                  className="h-4 w-4"
                />
                Može pola (npr. 6,5)
              </label>
            </div>
          )}

          {draft.kind === 'weight' && (
            <L label="Meri se u">
              <Select value={draft.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
                <option value="kg">kilogramima (kg)</option>
                <option value="g">gramima (g)</option>
              </Select>
            </L>
          )}

          {draft.kind === 'bottle' && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-600">Veličine flaša</p>
              <p className="text-xs text-slate-400">
                Radnik unosi broj punih flaša i težinu načete. Od načete se oduzima težina prazne flaše.
              </p>
              {sizes.map((s, i) => (
                <div key={i} className="flex items-end gap-2">
                  <L label="Veličina (l)">
                    <Input
                      inputMode="decimal"
                      value={s.size}
                      onChange={(e) => setSizes((p) => p.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)))}
                    />
                  </L>
                  <L label="Prazna flaša (g)">
                    <Input
                      inputMode="numeric"
                      value={s.empty}
                      placeholder="npr. 450"
                      onChange={(e) => setSizes((p) => p.map((x, j) => (j === i ? { ...x, empty: e.target.value } : x)))}
                    />
                  </L>
                  <IconBtn label="Ukloni" onClick={() => setSizes((p) => p.filter((_, j) => j !== i))} danger>×</IconBtn>
                </div>
              ))}
              <div className="flex gap-2">
                {['0.7', '1', '0.5', '1.5'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSizes((p) => [...p, { size: v, empty: '' }])}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-brand-700"
                  >
                    + {v.replace('.', ',')} l
                  </button>
                ))}
              </div>
            </div>
          )}

          {draft.kind === 'yes_no' ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              Kad radnik označi „Nema”, artikal ide na listu nabavke.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <L label={`Poruči ispod (${minUnit})`}>
                <Input inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
              </L>
              <L label="Vikendom (pet–ned)">
                <Input
                  inputMode="decimal"
                  value={weekend}
                  placeholder="isto"
                  onChange={(e) => setWeekend(e.target.value)}
                />
              </L>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => set('active', e.target.checked)}
              className="h-4 w-4"
            />
            Aktivan (prikazuje se u popisu)
          </label>
        </div>

        <div className="mt-5 flex justify-between gap-2">
          {isNew ? <span /> : (
            <Button variant="ghost" onClick={onDelete} className="text-red-600">Obriši</Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Otkaži</Button>
            <Button onClick={save} disabled={saving || !draft.name.trim()}>
              {saving ? 'Čuvam...' : 'Sačuvaj'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      {children}
    </label>
  )
}
