import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  approveArticleRequest,
  listArticleRequests,
  listArticles,
  listCategories,
  listSuppliers,
  rejectArticleRequest,
} from '../../data/repository'
import type { Article, ArticleRequest, Category, Supplier, Unit } from '../../data/types'
import { ORDER_UNITS, UNITS } from '../../data/types'
import { uuid } from '../../lib/crypto'
import { fmtDateTime } from '../../lib/format'
import { formatNum } from '../../lib/measure'
import { Button, Card, Select } from '../../components/ui'

/**
 * "Novi artikli za potvrdu": what workers added as "nema ga na spisku".
 * Approve as a new article (name, category, supplier, unit) or as one that
 * already exists under another name; the amount goes onto its faktura.
 */
export function ArticleRequests({ onChange }: { onChange?: (pending: number) => void }) {
  const [requests, setRequests] = useState<ArticleRequest[] | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  useEffect(() => {
    // Before migration 017 there is no table: show nothing.
    Promise.all([listArticleRequests('pending'), listArticles(), listCategories(), listSuppliers()]).then(
      ([r, a, c, s]) => {
        setRequests(r)
        setArticles(a)
        setCategories(c)
        setSuppliers(s)
        onChange?.(r.length)
      },
      () => setRequests([]),
    )
  }, [onChange])

  if (!requests || requests.length === 0) return null

  const done = (id: string) => {
    const rest = requests.filter((r) => r.id !== id)
    setRequests(rest)
    onChange?.(rest.length)
  }

  return (
    <section id="zahtevi" className="scroll-mt-28 space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600">
        🆕 Novi artikli za potvrdu ({requests.length})
      </h2>
      {requests.map((r) => (
        <RequestCard
          key={r.id}
          req={r}
          articles={articles}
          categories={categories}
          suppliers={suppliers}
          onDone={() => done(r.id)}
        />
      ))}
    </section>
  )
}

function RequestCard({
  req,
  articles,
  categories,
  suppliers,
  onDone,
}: {
  req: ArticleRequest
  articles: Article[]
  categories: Category[]
  suppliers: Supplier[]
  onDone: () => void
}) {
  const [name, setName] = useState(req.name)
  const [categoryId, setCategoryId] = useState('')
  const [supplierId, setSupplierId] = useState(req.supplier_id ?? '')
  const [unit, setUnit] = useState<Unit>((UNITS as readonly string[]).includes(req.unit) ? (req.unit as Unit) : 'kom')
  /** "To je postojeći artikal": its id, or '' for a new one. */
  const [existingId, setExistingId] = useState('')
  const [busy, setBusy] = useState(false)

  const approve = async () => {
    setBusy(true)
    try {
      const existing = articles.find((a) => a.id === existingId)
      if (existing) {
        await approveArticleRequest(req, existing, false)
      } else {
        const weighed = unit === 'kg' || unit === 'g'
        const orderUnit = (ORDER_UNITS as readonly string[]).includes(req.unit) ? req.unit : unit
        const article: Article = {
          id: uuid(),
          name: name.trim(),
          category_id: categoryId || null,
          supplier_id: supplierId || null,
          kind: weighed ? 'weight' : 'count',
          unit,
          allow_decimal: weighed || unit === 'l',
          bottle_sizes: [],
          minimum: 0,
          order_qty: 1,
          regular_target: null,
          order_unit: orderUnit as Article['order_unit'],
          pack_size: 1,
          weekend_target: null,
          ask_note: false,
          count_weekday: null,
          active: true,
          sort_order: articles.reduce((m, a) => Math.max(m, a.sort_order), 0) + 1,
          last_unit_price: 0,
          book_stock: null,
        }
        await approveArticleRequest(req, article, true)
      }
      onDone()
    } catch (e) {
      setBusy(false)
      alert(`Nije sačuvano: ${e instanceof Error ? e.message : e}`)
    }
  }

  const reject = async () => {
    if (!confirm(`Odbiti „${req.name}”? Neće se dodati ni u artikle ni na fakturu.`)) return
    setBusy(true)
    try {
      await rejectArticleRequest(req.id)
      onDone()
    } catch (e) {
      setBusy(false)
      alert(`Nije sačuvano: ${e instanceof Error ? e.message : e}`)
    }
  }

  const control =
    'w-full rounded-xl border border-slate-200 bg-surface px-3 py-2 text-base text-slate-800 outline-none focus:border-brand-500'
  const canApprove = existingId ? true : name.trim() !== '' && categoryId !== ''

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-bold text-slate-900">{req.name}</p>
        <p className="text-sm text-slate-500">
          {req.user_name} · {fmtDateTime(req.created_at)}
          {req.qty ? ` · stiglo ${formatNum(req.qty)} ${req.unit}` : ''}
          {req.delivery_id && (
            <>
              {' · '}
              <Link to={`/admin/deliveries/${req.delivery_id}`} className="text-brand-700 hover:underline">
                faktura
              </Link>
            </>
          )}
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">To je postojeći artikal (pod drugim imenom)?</span>
        <Select value={existingId} onChange={(e) => setExistingId(e.target.value)}>
          <option value="">— Ne, novi artikal —</option>
          {[...articles]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </Select>
      </label>

      {!existingId && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-slate-500">Naziv</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={control} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Kategorija</span>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— izaberi —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Dobavljač</span>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— bez —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">Broji se u</span>
            <Select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </label>
          <p className="self-end text-xs text-slate-400 sm:pb-2">Minimum i nabavku podesi posle u Artiklima.</p>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={reject} disabled={busy} className="text-red-600">
          Odbij
        </Button>
        <Button onClick={approve} disabled={busy || !canApprove} className="flex-1">
          {busy ? 'Čuvam...' : existingId ? '✓ Potvrdi kao postojeći' : '✓ Dodaj artikal'}
        </Button>
      </div>
    </Card>
  )
}
