import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteDelivery, getDelivery, listDeliveries, listDeliveryLines } from '../../data/repository'
import type { Delivery, DeliveryLine } from '../../data/types'
import { fmtDateTime } from '../../lib/format'
import { formatNum } from '../../lib/measure'
import { Badge, Button, Card, EmptyState, Spinner } from '../../components/ui'

/** Fakture the workers entered, newest first. */
export function Deliveries() {
  const [list, setList] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listDeliveries().then((d) => {
      setList(d)
      setLoading(false)
    })
  }, [])

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Fakture</h1>
      {list.length === 0 ? (
        <EmptyState title="Nema unetih faktura" hint="Radnici unose fakture sa početnog ekrana: „Unesi fakturu”." />
      ) : (
        <div className="space-y-2">
          {list.map((d) => (
            <Link
              key={d.id}
              to={`/admin/deliveries/${d.id}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-surface p-3 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-800">
                  {d.supplier_name ?? 'Bez dobavljača'} · {fmtDateTime(d.confirmed_at ?? d.created_at)}
                </p>
                <p className="truncate text-sm text-slate-500">
                  {d.user_name}
                  {d.note ? ` · ${d.note}` : ''}
                </p>
              </div>
              <Badge tone={d.status === 'confirmed' ? 'green' : 'amber'}>
                {d.status === 'confirmed' ? 'potvrđeno' : 'u toku'}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function DeliveryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [lines, setLines] = useState<DeliveryLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([getDelivery(id), listDeliveryLines(id)]).then(([d, ls]) => {
      setDelivery(d ?? null)
      setLines(ls)
      setLoading(false)
    })
  }, [id])

  if (loading) return <Spinner />
  if (!delivery || !id) return <p className="text-slate-500">Faktura nije pronađena.</p>

  const onDelete = async () => {
    if (!confirm('Obrisati ovu fakturu i sve njene stavke?')) return
    await deleteDelivery(id)
    navigate('/admin/deliveries')
  }

  return (
    <div className="space-y-4">
      <div>
        <Link to="/admin/deliveries" className="text-sm font-medium text-brand-600 hover:underline">
          ← Sve fakture
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
          {delivery.supplier_name ?? 'Bez dobavljača'}
        </h1>
        <p className="text-sm text-slate-500">
          {delivery.user_name} · {fmtDateTime(delivery.confirmed_at ?? delivery.created_at)}{' '}
          <Badge tone={delivery.status === 'confirmed' ? 'green' : 'amber'}>
            {delivery.status === 'confirmed' ? 'potvrđeno' : 'u toku'}
          </Badge>
        </p>
      </div>

      {delivery.note && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Napomena</p>
          <p className="text-amber-900">{delivery.note}</p>
        </Card>
      )}

      {lines.length === 0 ? (
        <EmptyState title="Nema stavki" />
      ) : (
        <>
          <LineSection title="Stiglo" lines={lines.filter((l) => (l.direction ?? 'in') === 'in')} />
          <LineSection title="↩ Vraćeno dobavljaču" tone="red" lines={lines.filter((l) => l.direction === 'return')} />
        </>
      )}

      <Button variant="ghost" onClick={onDelete} className="text-red-500">
        Obriši fakturu
      </Button>
    </div>
  )
}

function LineSection({ title, lines, tone }: { title: string; lines: DeliveryLine[]; tone?: 'red' }) {
  if (lines.length === 0) return null
  return (
    <section className="space-y-1.5">
      <h2 className={`px-1 text-xs font-semibold uppercase tracking-wide ${tone === 'red' ? 'text-red-500' : 'text-slate-400'}`}>
        {title} ({lines.length})
      </h2>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
        {lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="min-w-0 truncate text-slate-800">{l.article_name}</span>
            <span className={`shrink-0 text-right text-sm font-semibold ${tone === 'red' ? 'text-red-600' : 'text-slate-700'}`}>
              {formatNum(l.qty)} {l.unit}
              {l.unit !== l.base_unit && (
                <span className="block text-xs font-normal text-slate-400">
                  = {formatNum(l.base_qty)} {l.base_unit}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
