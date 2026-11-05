import { useEffect, useMemo, useState } from 'react'
import {
  deleteArticle,
  deleteCategory,
  listArticles,
  listCategories,
  listSuppliers,
  saveArticles,
  saveCategories,
  upsertArticle,
  upsertCategory,
} from '../../data/repository'
import { ORDER_UNITS, UNITS, type Article, type Category, type MeasureKind, type Supplier, type OrderUnit, type Unit } from '../../data/types'
import { uuid } from '../../lib/crypto'
import { KIND_LABELS, WEEKDAYS_ON, formatNum, formatSize, unitLabel } from '../../lib/measure'
import { Button, Input, Select, Spinner } from '../../components/ui'

const NO_CAT = '__none'

export function Articles() {
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    const [a, c, sup] = await Promise.all([listArticles(), listCategories(), listSuppliers()])
    setArticles(a)
    setCategories(c)
    setSuppliers(sup)
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
      supplier_id: null,
      regular_target: null,
      kind: 'count',
      unit: 'kom',
      allow_decimal: false,
      bottle_sizes: [],
      minimum: 0,
      order_qty: 1,
      order_unit: 'kom',
      pack_size: 1,
      weekend_target: null,
      ask_note: false,
      count_weekday: null,
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

  const supplierName = new Map(suppliers.map((x) => [x.id, x.name]))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Artikli ({articles.length})</h1>
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

          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
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
                  <p className="mt-0.5 text-xs leading-tight text-slate-400">{summary(a, supplierName.get(a.supplier_id ?? ''))}</p>
                </button>
                <button
                  onClick={() => toggleActive(a)}
                  title={a.active ? 'Isključi iz popisa' : 'Uključi u popis'}
                  className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${a.active ? 'bg-green-500' : 'bg-slate-300'}`}
                >
                  <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${a.active ? 'translate-x-5' : ''}`} />
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
          suppliers={suppliers}
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

function summary(a: Article, supplier?: string): string {
  const parts = [KIND_LABELS[a.kind]]
  parts.unshift(supplier ? `🚚 ${supplier}` : '⚠ bez dobavljača')
  if (a.count_weekday != null) parts.unshift(`📅 samo ${WEEKDAYS_ON[a.count_weekday]}`)
  if (a.kind === 'bottle') {
    parts.push(
      a.bottle_sizes
        .map((s) => `${formatSize(s.size_l)}${s.empty_weight_g == null ? ' (bez težine!)' : ` · prazna ${s.empty_weight_g} g`}`)
        .join(', ') || 'nema veličina!',
    )
  } else if (a.kind === 'count' || a.kind === 'weight') {
    parts.push(a.unit)
  }
  const u = unitLabel(a)
  if (a.ask_note) {
    parts.push('broj + šta fali')
    return parts.join(' · ')
  }
  if (a.kind === 'yes_no') {
    parts.push(`nema → ${formatNum(a.order_qty)} ${a.order_unit}`)
    return parts.join(' · ')
  }
  if (a.regular_target != null) {
    parts.push(
      `dopuni do ${formatNum(a.regular_target)} ${u}` + (a.minimum > 0 ? ` (kad ima < ${formatNum(a.minimum)})` : ''),
    )
  } else {
    parts.push(`ispod ${formatNum(a.minimum)} ${u} → ${formatNum(a.order_qty)} ${a.order_unit}`)
  }
  if (packMissing(a)) parts.push(`⚠ upiši koliko ${u} ima u 1 ${a.order_unit}`)
  else if (a.pack_size !== 1 || a.order_unit !== u) parts.push(`1 ${a.order_unit} = ${formatNum(a.pack_size)} ${u}`)
  if (a.weekend_target != null) parts.push(`vikend: ${formatNum(a.weekend_target)} ${u}`)
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

/** A crate/pack still at the default "1 = 1 kom" — the weekend math would be way off. */
function packMissing(a: Pick<Article, 'kind' | 'pack_size' | 'order_unit'>): boolean {
  return a.kind === 'count' && a.pack_size === 1 && ['gajba', 'paket', 'kutija'].includes(a.order_unit)
}

function OrderUnitSelect({ value, onChange }: { value: OrderUnit; onChange: (u: OrderUnit) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as OrderUnit)}>
      {ORDER_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
    </Select>
  )
}

/** A worked example under the weekend field, e.g. "ima 12 → fali 38 → 2 paket". */
function weekendExample(target: number | null, pack: number, orderUnit: string, unit: string): string | null {
  if (target == null || target <= 0) return null
  const has = Math.round(target / 4)
  const packs = Math.ceil((target - has) / pack)
  return `Primer: ako ima ${formatNum(has)} ${unit}, fali ${formatNum(target - has)} → poruči ${packs} ${orderUnit} (biće ${formatNum(has + packs * pack)} ${unit}).`
}

/** Worked example for "dopuni do", e.g. "ako ima 2 kg → poruči 3 kg (biće 5 kg)". */
function fillExample(target: number | null, min: number | null, pack: number, orderUnit: string, unit: string): string | null {
  if (target == null || target <= 0) return null
  const has = Math.round(target * 0.4 * 10) / 10
  const packs = Math.ceil(Math.round(((target - has) / pack) * 1000) / 1000)
  const when = min ? ` Ako ima ${formatNum(min)} ${unit} ili više, ne poručuje se.` : ''
  const qty = orderUnit === unit ? packs * pack : packs
  return `Primer: ako ima ${formatNum(has)} ${unit} → poruči ${formatNum(qty)} ${orderUnit} (biće ${formatNum(has + packs * pack)} ${unit}).${when}`
}

const COUNT_UNITS: Unit[] = UNITS.filter((u) => u !== 'kg' && u !== 'g')

function ArticleEditor({
  article,
  isNew,
  categories,
  suppliers,
  onClose,
  onSaved,
  onDelete,
}: {
  article: Article
  isNew: boolean
  categories: Category[]
  suppliers: Supplier[]
  onClose: () => void
  onSaved: () => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<Article>(article)
  // Number fields are edited as strings so "0," or "" don't jump around.
  const [minimum, setMinimum] = useState(String(article.minimum))
  const [orderQty, setOrderQty] = useState(String(article.order_qty))
  const [fillMode, setFillMode] = useState(article.regular_target != null)
  const [regularTarget, setRegularTarget] = useState(
    article.regular_target == null ? '' : String(article.regular_target),
  )
  const [packSize, setPackSize] = useState(String(article.pack_size))
  const [weekendTarget, setWeekendTarget] = useState(
    article.weekend_target == null ? '' : String(article.weekend_target),
  )
  const [sizes, setSizes] = useState(
    article.bottle_sizes.map((s) => ({
      size: String(s.size_l),
      empty: s.empty_weight_g == null ? '' : String(s.empty_weight_g),
    })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    if (saving || !draft.name.trim()) return
    setSaving(true)
    setError('')
    try {
      await persist()
    } catch (e) {
      setError(`Čuvanje nije uspelo: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
      return
    }
    setSaving(false)
    onSaved()
  }

  const persist = () =>
    upsertArticle({
      ...draft,
      name: draft.name.trim(),
      minimum: num(minimum) ?? 0,
      order_qty: num(orderQty) ?? 1,
      regular_target: fillMode ? num(regularTarget) : null,
      pack_size: num(packSize) || 1,
      weekend_target: num(weekendTarget),
      bottle_sizes:
        draft.kind === 'bottle'
          ? sizes
              .map((s) => ({ size_l: num(s.size) ?? 0, empty_weight_g: num(s.empty) }))
              .filter((s) => s.size_l > 0)
              .sort((a, b) => a.size_l - b.size_l)
          : [],
    })

  const minUnit = unitLabel(draft)

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Enter in any text field saves; Esc closes without saving.
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') {
            e.preventDefault()
            save()
          }
        }}
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
          <L label="Dobavljač">
            <Select value={draft.supplier_id ?? ''} onChange={(e) => set('supplier_id', e.target.value || null)}>
              <option value="">— bez dobavljača —</option>
              {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </L>

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
                    className="rounded-lg border border-slate-200 bg-surface px-2.5 py-1 text-sm text-brand-700"
                  >
                    + {v.replace('.', ',')} l
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={draft.ask_note}
              onChange={(e) => set('ask_note', e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-medium text-slate-700">Samo broj + šta fali</span>
              <span className="block text-xs text-slate-400">
                Radnik upiše ukupan broj i u polje „Treba da se poruči” šta fali (npr. ukusi čaja). Nema minimuma
                ni pakovanja — na listu nabavke ide samo ono što upiše.
              </span>
            </span>
          </label>

          {!draft.ask_note && (
          <div className="space-y-4 rounded-xl bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">Poručivanje</p>

            {draft.kind === 'yes_no' ? (
              <div className="grid grid-cols-2 gap-2">
                <L label="Kad je „Nema”, poruči">
                  <Input inputMode="decimal" value={orderQty} onChange={(e) => setOrderQty(e.target.value)} />
                </L>
                <L label="Jedinica">
                  <OrderUnitSelect value={draft.order_unit} onChange={(u) => set('order_unit', u)} />
                </L>
              </div>
            ) : (
              <>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">
                    Pakovanje — koliko {minUnit} ima u 1 {draft.order_unit} (različito za svaki artikal)
                  </p>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span>1</span>
                    <div className="w-28">
                      <OrderUnitSelect value={draft.order_unit} onChange={(u) => set('order_unit', u)} />
                    </div>
                    <span>=</span>
                    <div className="w-24">
                      <Input inputMode="decimal" value={packSize} onChange={(e) => setPackSize(e.target.value)} />
                    </div>
                    <span>{minUnit}</span>
                  </div>
                  {packMissing({ kind: draft.kind, pack_size: num(packSize) || 1, order_unit: draft.order_unit }) && (
                    <p className="mt-1.5 text-xs font-medium text-amber-700">
                      ⚠ Upiši koliko {minUnit} ima u 1 {draft.order_unit} — inače vikend obračun neće biti tačan.
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-slate-500">Običan dan</p>
                    <div className="flex rounded-lg bg-slate-200 p-0.5 text-xs font-semibold">
                      {([
                        [false, 'Uvek ista količina'],
                        [true, 'Dopuni do poželjnog'],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setFillMode(mode)}
                          className={`rounded-md px-2.5 py-1 transition ${
                            fillMode === mode ? 'bg-surface text-slate-800 shadow-sm' : 'text-slate-500'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {fillMode ? (
                    <div className="space-y-2 text-sm text-slate-600">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Poželjno da ima</span>
                        <div className="w-20">
                          <Input inputMode="decimal" value={regularTarget} onChange={(e) => setRegularTarget(e.target.value)} />
                        </div>
                        <span>{minUnit}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Poruči tek kad ima manje od</span>
                        <div className="w-20">
                          <Input inputMode="decimal" value={minimum} placeholder="—" onChange={(e) => setMinimum(e.target.value)} />
                        </div>
                        <span>{minUnit}</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {fillExample(num(regularTarget), num(minimum), num(packSize) || 1, draft.order_unit, minUnit) ??
                          'Poručuje se razlika do poželjnog. Prazno „manje od” = poruči čim nešto fali.'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span>Ispod</span>
                      <div className="w-20">
                        <Input inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
                      </div>
                      <span>{minUnit} → poruči</span>
                      <div className="w-16">
                        <Input inputMode="decimal" value={orderQty} onChange={(e) => setOrderQty(e.target.value)} />
                      </div>
                      <span>{draft.order_unit}</span>
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">Četvrtak — za vikend treba da ima</p>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <div className="w-24">
                      <Input
                        inputMode="decimal"
                        value={weekendTarget}
                        placeholder="—"
                        onChange={(e) => setWeekendTarget(e.target.value)}
                      />
                    </div>
                    <span>{minUnit}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {weekendExample(num(weekendTarget), num(packSize) || 1, draft.order_unit, minUnit) ??
                      'Subotom i nedeljom nema dostave. Prazno = četvrtak se računa kao običan dan.'}
                  </p>
                </div>
              </>
            )}
          </div>
          )}

          <L label="Kad se broji">
            <Select
              value={draft.count_weekday == null ? '' : String(draft.count_weekday)}
              onChange={(e) => set('count_weekday', e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">Svaki popis</option>
              {/* Monday first, Sunday last */}
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>Jednom nedeljno — samo {WEEKDAYS_ON[d]}</option>
              ))}
            </Select>
          </L>

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

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

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
