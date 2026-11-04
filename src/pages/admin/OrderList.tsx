import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getCount,
  getLatestFinishedCount,
  listCategories,
  listOrdersForCount,
  updateOrderLine,
  setOrderStatus,
} from '../../data/repository'
import type { Category, Count, OrderLine } from '../../data/types'
import { formatNum, isWeekendOrderDay } from '../../lib/measure'
import { fmtDateTime } from '../../lib/format'
import { Button, Card, EmptyState, Spinner } from '../../components/ui'

export function OrderList() {
  const { countId } = useParams<{ countId?: string }>()
  const [count, setCount] = useState<Count | null>(null)
  const [orders, setOrders] = useState<OrderLine[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const c = countId ? await getCount(countId) : await getLatestFinishedCount()
      setCount(c ?? null)
      if (c) setOrders(await listOrdersForCount(c.id))
      setCategories(await listCategories())
      setLoading(false)
    })()
  }, [countId])

  const groups = useMemo(() => {
    const order = new Map(categories.map((c) => [c.id, c.sort_order]))
    const name = new Map(categories.map((c) => [c.id, c.name]))
    const map = new Map<string, OrderLine[]>()
    for (const o of orders) {
      const key = o.category_id && name.has(o.category_id) ? o.category_id : ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9))
      .map(([key, list]) => ({
        name: name.get(key) ?? 'Ostalo',
        list: list.sort((a, b) => a.article_name.localeCompare(b.article_name)),
      }))
  }, [orders, categories])

  const updateQty = async (line: OrderLine, raw: string) => {
    const qty = Number(raw.replace(',', '.')) || 0
    const updated = { ...line, suggested_order_qty: qty }
    setOrders((prev) => prev.map((o) => (o.id === line.id ? updated : o)))
    await updateOrderLine(updated)
  }

  const toggleStatus = async (line: OrderLine) => {
    const status = line.order_status === 'ordered' ? 'pending' : 'ordered'
    setOrders((prev) => prev.map((o) => (o.id === line.id ? { ...o, order_status: status } : o)))
    await setOrderStatus(line.id, status)
  }

  const asText = () =>
    groups
      .map((g) => `${g.name}\n` + g.list.map((o) => `- ${o.article_name}: ${qtyText(o)}`).join('\n'))
      .join('\n\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText())
      alert('Lista je kopirana.')
    } catch {
      alert(asText())
    }
  }

  const exportCsv = () => {
    const header = 'Kategorija,Artikal,Stanje,Minimum,Poruciti,Jedinica,Status,Fali\n'
    const body = groups
      .flatMap((g) =>
        g.list.map((o) =>
          [
            csv(g.name),
            csv(o.article_name),
            o.kind === 'yes_no' ? 'nema' : formatNum(o.counted),
            o.kind === 'yes_no' || noteOnly(o) ? '' : formatNum(o.minimum),
            noteOnly(o) ? '' : formatNum(o.suggested_order_qty),
            noteOnly(o) ? '' : o.order_unit,
            o.order_status === 'ordered' ? 'poruceno' : 'za porucivanje',
            csv(o.note ?? ''),
          ].join(','),
        ),
      )
      .join('\n')
    download('lista-nabavke.csv', header + body)
  }

  if (loading) return <Spinner />
  if (!count) {
    return <EmptyState title="Još nema završenih popisa" hint="Lista nabavke se pravi kad radnik završi popis." />
  }

  const pending = orders.filter((o) => o.order_status === 'pending').length
  const weekend = isWeekendOrderDay(new Date(count.datetime))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Lista nabavke</h1>
          <p className="text-sm text-slate-500">
            Popis <Link to={`/admin/counts/${count.id}`} className="text-brand-700 hover:underline">{fmtDateTime(count.datetime)}</Link>{' '}
            · {count.user_name} · {orders.length} artikala · {pending} za poručiti
          </p>
          {weekend && (
            <p className="mt-1 inline-block rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Popis od četvrtka — poručuje se za vikend (do ciljnog stanja)
            </p>
          )}
        </div>
        {orders.length > 0 && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={copy} className="text-sm">Kopiraj</Button>
            <Button variant="secondary" onClick={exportCsv} className="text-sm">CSV</Button>
          </div>
        )}
      </div>

      {orders.length === 0 ? (
        <Card className="text-center text-slate-500">Sve je iznad minimuma — nema šta da se poruči.</Card>
      ) : (
        groups.map((g) => (
          <section key={g.name} className="space-y-1.5">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.name}</h2>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
              {g.list.map((o) => (
                <div key={o.id} className={`flex items-center gap-3 px-3 py-2 ${o.order_status === 'ordered' ? 'bg-green-50/60' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight text-slate-800">{o.article_name}</p>
                    <p className="text-xs text-slate-400">
                      {o.kind === 'yes_no'
                        ? 'označeno: nema'
                        : noteOnly(o)
                          ? `ima ${formatNum(o.counted)} ${o.unit}`
                          : `ima ${formatNum(o.counted)} ${o.unit} · ${weekend ? 'treba' : 'min'} ${formatNum(o.minimum)}`}
                    </p>
                    {o.note && <p className="mt-0.5 text-sm font-medium text-red-600">Fali: {o.note}</p>}
                  </div>
                  <div className={`flex items-center gap-1 ${noteOnly(o) ? 'hidden' : ''}`}>
                    <input
                      inputMode="decimal"
                      defaultValue={String(o.suggested_order_qty)}
                      onBlur={(e) => updateQty(o, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      aria-label={`Količina za ${o.article_name}`}
                      className="w-14 rounded-lg border border-slate-300 bg-surface px-2 py-1 text-right font-semibold text-slate-800 outline-none focus:border-brand-500"
                    />
                    <span className="w-11 text-xs text-slate-500">{o.order_unit}</span>
                  </div>
                  <button
                    onClick={() => toggleStatus(o)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      o.order_status === 'ordered' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {o.order_status === 'ordered' ? '✓ poručeno' : 'za poručiti'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

/** "Samo broj + šta fali" lines: no quantity, the note says what to order. */
function noteOnly(o: OrderLine): boolean {
  return !!o.note && o.suggested_order_qty === 0
}

function qtyText(o: OrderLine): string {
  if (noteOnly(o)) return `fali: ${o.note}`
  const qty = `${formatNum(o.suggested_order_qty)} ${o.order_unit}`
  return o.note ? `${qty} (fali: ${o.note})` : qty
}

function csv(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

function download(filename: string, content: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
