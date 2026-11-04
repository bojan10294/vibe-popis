import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCounts, listOrdersForCount } from '../../data/repository'
import type { Count } from '../../data/types'
import { fmtDateTime } from '../../lib/format'
import { Card, EmptyState, Spinner } from '../../components/ui'
import { CountRow } from './Counts'

export function Dashboard() {
  const [counts, setCounts] = useState<Count[]>([])
  const [pendingOrders, setPendingOrders] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const all = await listCounts()
      setCounts(all)
      const last = all.find((c) => c.status === 'finished')
      if (last) {
        const orders = await listOrdersForCount(last.id)
        setPendingOrders(orders.filter((o) => o.order_status === 'pending').length)
      }
      setLoading(false)
    })()
  }, [])

  if (loading) return <Spinner />

  const active = counts.filter((c) => c.status === 'in_progress')
  const finished = counts.filter((c) => c.status === 'finished')
  const last = finished[0]

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Pregled</h1>

      {last && (
        <Link to="/admin/orders" className="block">
          <Card className="border-brand-200 bg-brand-50 hover:bg-brand-100">
            <p className="text-sm text-brand-700">Poslednji popis: {fmtDateTime(last.datetime)} · {last.user_name}</p>
            <p className="mt-1 text-2xl font-bold text-brand-800">
              {pendingOrders ?? 0} artikala za poručiti →
            </p>
          </Card>
        </Link>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Popisi u toku</h2>
        {active.length === 0 ? (
          <EmptyState title="Niko trenutno ne radi popis" />
        ) : (
          <div className="space-y-2">{active.map((c) => <CountRow key={c.id} count={c} />)}</div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Završeni popisi</h2>
        {finished.length === 0 ? (
          <EmptyState title="Još nema završenih popisa" hint="Radnik pokreće popis sa svog naloga." />
        ) : (
          <div className="space-y-2">
            {finished.slice(0, 5).map((c) => <CountRow key={c.id} count={c} />)}
            {finished.length > 5 && (
              <Link to="/admin/counts" className="block text-center text-sm text-brand-700 hover:underline">
                Svi popisi →
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
