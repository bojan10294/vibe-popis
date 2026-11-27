import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  deleteDelivery,
  getDelivery,
  listDeliveries,
  listDeliveryLines,
  listDeliveryLinesFor,
  listRequestsForDelivery,
} from '../../data/repository'
import { downloadCsv, fileDate } from '../../lib/csv'
import type { ArticleRequest, Delivery, DeliveryLine } from '../../data/types'
import { checkDelivery, type DeliveryCheck } from '../../data/orders'
import type { ArrivalLine } from '../../lib/arrivals'
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

  /** Every line of every faktura, one row each. */
  const exportAll = async () => {
    const lines = await listDeliveryLinesFor(list.map((d) => d.id))
    const byId = new Map(list.map((d) => [d.id, d]))
    downloadCsv(
      `fakture-${fileDate(new Date().toISOString())}.csv`,
      ['Datum', 'Dobavljač', 'Uneo', 'Status', 'Artikal', 'Stiglo / vraćeno', 'Količina', 'Jedinica', 'Količina (brojanje)', 'Jedinica brojanja', 'Napomena'],
      lines
        .map((l) => ({ l, d: byId.get(l.delivery_id)! }))
        .sort((a, b) => b.d.created_at.localeCompare(a.d.created_at))
        .map(({ l, d }) => [
          fmtDateTime(d.confirmed_at ?? d.created_at),
          d.supplier_name ?? '',
          d.user_name,
          d.status === 'confirmed' ? 'potvrđeno' : 'u toku',
          l.article_name,
          l.direction === 'return' ? 'vraćeno' : 'stiglo',
          l.qty,
          l.unit,
          l.base_qty,
          l.base_unit,
          d.note,
        ]),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Fakture</h1>
        {list.length > 0 && (
          <button
            onClick={exportAll}
            className="rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ⬇ Excel
          </button>
        )}
      </div>
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
  const [check, setCheck] = useState<DeliveryCheck | null>(null)
  const [requests, setRequests] = useState<ArticleRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([getDelivery(id), listDeliveryLines(id)]).then(([d, ls]) => {
      setDelivery(d ?? null)
      setLines(ls)
      setLoading(false)
      // Live: later fakture from the same supplier count too.
      if (d?.status === 'confirmed') checkDelivery(d).then(setCheck, () => setCheck(null))
      listRequestsForDelivery(id).then(setRequests, () => setRequests([]))
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

      {requests.length > 0 && (
        <Card className="space-y-1 text-sm">
          <p className="font-semibold text-slate-800">🆕 Novi artikli sa ove fakture</p>
          {requests.map((r) => (
            <p key={r.id} className="flex justify-between gap-3">
              <span className="text-slate-700">{r.name}</span>
              <span className="text-slate-500">
                {r.qty ? `${formatNum(r.qty)} ${r.unit} · ` : ''}
                {r.status === 'pending' ? (
                  <Link to="/admin#zahtevi" className="font-medium text-brand-700 hover:underline">čeka potvrdu →</Link>
                ) : r.status === 'approved' ? (
                  'potvrđen'
                ) : (
                  'odbijen'
                )}
              </span>
            </p>
          ))}
        </Card>
      )}

      {check && <ArrivalCheck check={check} />}

      <Button variant="ghost" onClick={onDelete} className="text-red-500">
        Obriši fakturu
      </Button>
    </div>
  )
}

/** Naručeno vs stiglo: the order list of the last Popis for this supplier vs. its fakture since then. */
function ArrivalCheck({ check }: { check: DeliveryCheck }) {
  const shown = check.lines
  if (shown.length === 0) {
    return (
      <Card className="text-sm text-slate-500">
        Na listi nabavke od popisa {fmtDateTime(check.count_datetime)} nije bilo ništa od ovog dobavljača (na račun).
      </Card>
    )
  }
  const tone: Record<ArrivalLine['status'], string> = {
    ok: 'text-green-700',
    short: 'text-amber-700',
    missing: 'text-red-600',
    extra: 'text-slate-500',
  }
  const label = (l: ArrivalLine) =>
    l.status === 'ok'
      ? '✓ stiglo'
      : l.status === 'missing'
        ? 'nije stiglo'
        : l.status === 'short'
          ? `stiglo ${formatNum(l.arrivedBase)} od ${formatNum(l.orderedBase)}`
          : 'nije naručeno'
  return (
    <section className="space-y-1.5">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Naručeno vs stiglo{' '}
        <Link to={`/admin/orders/${check.count_id}`} className="normal-case text-brand-700 hover:underline">
          (lista od {fmtDateTime(check.count_datetime)})
        </Link>
      </h2>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-surface">
        {shown.map((l) => (
          <div key={l.article_id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-0 truncate text-slate-800">{l.name}</span>
            <span className="shrink-0 text-right">
              <span className={`font-semibold ${tone[l.status]}`}>{label(l)}</span>
              <span className="block text-xs text-slate-400">
                {l.status === 'extra'
                  ? `stiglo ${formatNum(l.arrivedBase)} ${l.baseUnit}`
                  : `naručeno ${formatNum(l.ordered)} ${l.orderUnit}`}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="px-1 text-xs text-slate-400">Računaju se sve fakture ovog dobavljača od tog popisa. Keš se ne prati.</p>
    </section>
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
