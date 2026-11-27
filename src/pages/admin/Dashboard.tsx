import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { listCounts, listDeliveries, listOrdersForCount } from '../../data/repository'
import type { Count, Delivery } from '../../data/types'
import { comparisonFor } from '../../data/orders'
import type { CompareTotals } from '../../lib/compare'
import { businessDayIso } from '../../lib/day'
import { fmtDateTime } from '../../lib/format'
import { Badge, Button, Card, EmptyState, Spinner, formatMoney } from '../../components/ui'
import { disablePush, enablePush, getPushState, type PushState } from '../../lib/push'
import { CountRow } from './Counts'
import { ArticleRequests } from './ArticleRequests'

/** "Obaveštenja na ovom telefonu": push for popis, fakture and new articles. */
function PushCard() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPushState().then(setState, () => setState('unsupported'))
  }, [])

  const toggle = async () => {
    setBusy(true)
    try {
      setState(state === 'on' ? await disablePush() : await enablePush())
    } catch (e) {
      alert(`Obaveštenja nisu uključena: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  if (state === null) return null
  const hint: Record<PushState, string> = {
    on: 'Uključeno: popis završen, faktura unesena (i šta nije stiglo), novi artikal za potvrdu.',
    off: 'Dobijte obaveštenje na ovom telefonu za popis, fakture i nove artikle.',
    denied: 'Obaveštenja su blokirana. Dozvolite ih u podešavanjima telefona za ovu aplikaciju.',
    'needs-install': 'Na iPhone-u: Safari → Podeli → „Dodaj na početni ekran“, pa otvorite aplikaciju odatle.',
    unsupported: 'Ovaj pregledač ne podržava obaveštenja (ili je otvorena razvojna verzija).',
  }

  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold text-slate-800">🔔 Obaveštenja</p>
        <p className="text-sm text-slate-500">{hint[state]}</p>
      </div>
      {(state === 'on' || state === 'off') && (
        <Button
          variant={state === 'on' ? 'secondary' : 'primary'}
          onClick={toggle}
          disabled={busy}
          className="shrink-0 text-sm"
        >
          {state === 'on' ? 'Isključi' : 'Uključi'}
        </Button>
      )}
    </Card>
  )
}

/** Ordered on invoice but not (fully) arrived, from the snapshot taken when the faktura was confirmed. */
function missingCount(d: Delivery): number {
  return (d.order_check?.lines ?? []).filter((l) => l.status === 'missing' || l.status === 'short').length
}

export function Dashboard() {
  const location = useLocation()
  const [counts, setCounts] = useState<Count[]>([])
  const [orderLineCount, setOrderLineCount] = useState<number | null>(null)
  const [totals, setTotals] = useState<CompareTotals | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [requestsLoaded, setRequestsLoaded] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [all, dels] = await Promise.all([listCounts(), listDeliveries().catch(() => [] as Delivery[])])
      setCounts(all)
      setDeliveries(dels)
      const last = all.find((c) => c.status === 'finished')
      if (last) {
        const orders = await listOrdersForCount(last.id)
        setOrderLineCount(orders.length)
        comparisonFor(last).then((c) => setTotals(c?.totals ?? null), () => setTotals(null))
      }
      setLoading(false)
    })()
  }, [])

  const onRequests = useCallback(() => setRequestsLoaded(true), [])

  // Push "novi artikal" opens /admin#zahtevi: scroll there once it has rendered.
  useEffect(() => {
    if (location.hash !== '#zahtevi' || !requestsLoaded) return
    document.getElementById('zahtevi')?.scrollIntoView({ behavior: 'smooth' })
  }, [location.hash, requestsLoaded])

  if (loading) return <Spinner />

  const active = counts.filter((c) => c.status === 'in_progress')
  const finished = counts.filter((c) => c.status === 'finished')
  const last = finished[0]
  const today = businessDayIso()
  const openDeliveries = deliveries.filter((d) => d.status === 'in_progress')
  const todayDeliveries = deliveries.filter(
    (d) => d.status === 'confirmed' && businessDayIso(new Date(d.confirmed_at ?? d.created_at)) === today,
  )

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Pregled</h1>

      <ArticleRequests onChange={onRequests} />

      {last && (
        <Link to="/admin/orders" className="block">
          <Card className="border-brand-200 bg-brand-50 hover:bg-brand-100">
            <p className="text-sm text-brand-700">Poslednji popis: {fmtDateTime(last.datetime)} · {last.user_name}</p>
            <p className="mt-1 text-2xl font-bold text-brand-800">{orderLineCount ?? 0} artikala na listi nabavke →</p>
            {totals && (
              <p className="mt-1 text-sm">
                <span className="font-semibold text-red-600">manjak {formatMoney(totals.shortage)} din</span>
                {' · '}
                <span className="font-semibold text-green-600">višak {formatMoney(totals.surplus)} din</span>
              </p>
            )}
          </Card>
        </Link>
      )}

      <section>
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fakture danas</h2>
          <Link to="/admin/deliveries" className="text-sm text-brand-700 hover:underline">
            Sve fakture →
          </Link>
        </div>
        {todayDeliveries.length === 0 && openDeliveries.length === 0 ? (
          <EmptyState title="Danas još nema unetih faktura" />
        ) : (
          <div className="space-y-2">
            {[...openDeliveries, ...todayDeliveries].map((d) => {
              const missing = missingCount(d)
              return (
                <Link
                  key={d.id}
                  to={`/admin/deliveries/${d.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-surface p-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      {d.supplier_name ?? 'Bez dobavljača'} · {fmtDateTime(d.confirmed_at ?? d.created_at)}
                    </p>
                    <p className="truncate text-sm text-slate-500">{d.user_name}</p>
                  </div>
                  {d.status === 'in_progress' ? (
                    <Badge tone="amber">u toku</Badge>
                  ) : missing > 0 ? (
                    <Badge tone="red">fali {missing}</Badge>
                  ) : (
                    <Badge tone="green">potvrđeno</Badge>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <PushCard />

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
