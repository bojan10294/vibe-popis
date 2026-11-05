import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteSupplier, listArticles, listSuppliers, saveSuppliers } from '../../data/repository'
import type { Article, Supplier } from '../../data/types'
import { uuid } from '../../lib/crypto'
import { Button, Input, Spinner } from '../../components/ui'

/** Supplier list: add, rename, phone, reorder (= order of groups on the order list), delete. */
export function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<{ id: string | null; name: string; phone: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const reload = async () => {
    const [s, a] = await Promise.all([listSuppliers(), listArticles()])
    setSuppliers(s)
    setArticles(a)
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  const save = async () => {
    const name = form?.name.trim()
    if (!form || !name) return
    const phone = form.phone.trim() || null
    const existing = suppliers.find((s) => s.id === form.id)
    if (existing) {
      await saveSuppliers([{ ...existing, name, phone }])
    } else {
      const order = suppliers.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1
      await saveSuppliers([{ id: `sup-${uuid()}`, name, phone, sort_order: order }])
    }
    setForm(null)
    reload()
  }

  const move = async (index: number, dir: -1 | 1) => {
    const cur = suppliers[index]
    const other = suppliers[index + dir]
    if (!other) return
    await saveSuppliers([
      { ...cur, sort_order: other.sort_order },
      { ...other, sort_order: cur.sort_order },
    ])
    reload()
  }

  const remove = async (s: Supplier, count: number) => {
    const msg = count
      ? `Obrisati dobavljača "${s.name}"? ${count} artikala ostaje, ali bez dobavljača.`
      : `Obrisati dobavljača "${s.name}"?`
    if (!confirm(msg)) return
    await deleteSupplier(s.id)
    reload()
  }

  if (loading) return <Spinner />

  const known = new Set(suppliers.map((s) => s.id))
  const without = articles.filter((a) => !a.supplier_id || !known.has(a.supplier_id))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Dobavljači ({suppliers.length})</h1>
          <p className="text-sm text-slate-500">Lista nabavke je podeljena po dobavljačima, ovim redom.</p>
        </div>
        <Button onClick={() => setForm({ id: null, name: '', phone: '' })} className="text-sm">+ Dobavljač</Button>
      </div>

      {form && (
        <div
          className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3"
          onKeyDown={(e) => e.key === 'Enter' && save()}
        >
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Naziv dobavljača"
            autoFocus
          />
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Telefon (nije obavezno)"
            inputMode="tel"
          />
          <div className="flex gap-2">
            <Button onClick={save} disabled={!form.name.trim()}>Sačuvaj</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>Otkaži</Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
        {suppliers.map((s, i) => {
          const list = articles.filter((a) => a.supplier_id === s.id)
          const isOpen = open === s.id
          return (
            <div key={s.id}>
              <div className="flex items-center gap-1.5 py-1.5 pl-1 pr-2">
                <div className="flex shrink-0 flex-col">
                  <Arrow label="Gore" onClick={() => move(i, -1)} disabled={i === 0}>▲</Arrow>
                  <Arrow label="Dole" onClick={() => move(i, 1)} disabled={i === suppliers.length - 1}>▼</Arrow>
                </div>
                <button onClick={() => setOpen(isOpen ? null : s.id)} className="min-w-0 flex-1 py-1 text-left">
                  <p className="font-medium leading-tight text-slate-800">{s.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {list.length} artikala{s.phone ? ` · ${s.phone}` : ''} · {isOpen ? 'sakrij ▲' : 'prikaži ▼'}
                  </p>
                </button>
                <Icon label="Uredi" onClick={() => {
                  setForm({ id: s.id, name: s.name, phone: s.phone ?? '' })
                  window.scrollTo(0, 0)
                }}>✎</Icon>
                <Icon label="Obriši" onClick={() => remove(s, list.length)} danger>🗑</Icon>
              </div>
              {isOpen && (
                <p className="px-10 pb-3 text-sm text-slate-600">
                  {list.length ? list.map((a) => a.name).join(', ') : 'Nema artikala. Dodeli ih u Artikli → ✎ → Dobavljač.'}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {without.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Bez dobavljača ({without.length}):</p>
          <p className="mt-1">{without.map((a) => a.name).join(', ')}</p>
          <p className="mt-2 text-amber-700">
            Dodeli ih u <Link to="/admin/articles" className="font-medium underline">Artikli</Link> → ✎ → Dobavljač.
          </p>
        </div>
      )}
    </div>
  )
}

function Icon({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${
        danger ? 'text-red-500 hover:bg-red-50' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

function Arrow({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
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
