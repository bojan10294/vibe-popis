import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  createCount,
  createDelivery,
  getActiveCountForUser,
  getActiveDeliveryForUser,
  listArticles,
} from '../data/repository'
import { Card, Spinner } from '../components/ui'
import { Fireworks } from '../components/Fireworks'
import { countedOn } from '../lib/measure'
import { activeSnapshotId } from '../lib/outbox'
import { businessDay } from '../lib/day'

export function StaffHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { finished?: boolean; deliveryConfirmed?: boolean } | null
  const justFinished = state?.finished === true
  const deliveryConfirmed = state?.deliveryConfirmed === true
  const [activeId, setActiveId] = useState<string | null>(null)
  const [deliveryId, setDeliveryId] = useState<string | null>(null)
  const [articleCount, setArticleCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const [active, delivery, arts] = await Promise.all([
          getActiveCountForUser(user.id),
          getActiveDeliveryForUser(user.id).catch(() => undefined),
          listArticles({ activeOnly: true }),
        ])
        setActiveId(active?.id ?? null)
        setDeliveryId(delivery?.id ?? null)
        setArticleCount(arts.filter((a) => countedOn(a, new Date())).length)
      } catch {
        // No internet: a popis kept on this phone can still be continued.
        setOffline(true)
        setActiveId(activeSnapshotId())
      }
      setLoading(false)
    })()
  }, [user])

  if (!user) return null
  if (loading) return <Spinner />

  const startCount = async () => {
    setStarting(true)
    const count = await createCount(user)
    navigate(`/count/${count.id}`)
  }

  const startDelivery = async () => {
    setStarting(true)
    const delivery = await createDelivery(user)
    navigate(`/delivery/${delivery.id}`)
  }

  const today = businessDay().toLocaleDateString('sr-Latn-RS', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow text-slate-500">{today}</p>
        <h1 className="mt-1 text-4xl font-extrabold text-slate-900">
          Zdravo, <span className="text-brand-700">{user.name}</span>
        </h1>
      </div>

      {offline && (
        <Card className="border-amber-200 bg-amber-50 text-sm text-amber-800">
          📴 Nema interneta. {activeId ? 'Nezavršen popis možeš da nastaviš, šalje se kad se veza vrati.' : 'Novi popis i faktura mogu kad se vrati veza.'}
        </Card>
      )}

      {justFinished && !activeId && <Fireworks />}
      {justFinished && !activeId && (
        <Card className="flex items-center gap-3 border-green-200 bg-green-50">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600 font-bold text-white shadow-[0_0_0_5px_rgb(31_160_108/0.15)]">✓</span>
          <p className="font-medium text-green-800">Popis je završen i poslat. Hvala!</p>
        </Card>
      )}

      {deliveryConfirmed && (
        <Card className="flex items-center gap-3 border-green-200 bg-green-50">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600 font-bold text-white shadow-[0_0_0_5px_rgb(31_160_108/0.15)]">✓</span>
          <p className="font-medium text-green-800">Faktura je unesena i poslata. Hvala!</p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-5">
        <button
          onClick={activeId ? () => navigate(`/count/${activeId}`) : startCount}
          disabled={starting || (offline && !activeId)}
          className="tile-obsidian group relative flex min-h-56 flex-col justify-between overflow-hidden rounded-3xl p-6 text-left hover:-translate-y-0.5 disabled:opacity-70 sm:col-span-3"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow text-white/55">{activeId ? 'Nezavršen popis' : 'Za brojanje danas'}</p>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-on-brand shadow-[0_0_0_6px_rgb(90_120_255/0.22)] transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110">
              {activeId ? '→' : '+'}
            </span>
          </div>
          <div>
            {!activeId && (
              <p className="num text-6xl font-semibold leading-none tracking-[-0.06em] text-[#a3b5ff]">
                {articleCount}
                <span className="ml-2 align-top text-sm font-medium tracking-normal text-white/50">artikala</span>
              </p>
            )}
            <p className="mt-3 font-display text-3xl font-extrabold leading-tight tracking-[-0.04em]">
              {starting ? 'Pokrećem...' : activeId ? 'Nastavi popis' : 'Novi popis'}
            </p>
            <p className="mt-1 text-sm text-white/60">
              {activeId ? 'Nastavljaš tačno odakle si stao.' : 'Kategorija po kategorija, artikal po artikal.'}
            </p>
          </div>
        </button>

        <button
          onClick={deliveryId ? () => navigate(`/delivery/${deliveryId}`) : startDelivery}
          disabled={starting || offline}
          className="lift group flex flex-col justify-between gap-6 rounded-3xl border border-slate-200 bg-surface p-5 text-left shadow-sm disabled:opacity-70 sm:col-span-2"
        >
          <span className="flex items-center justify-between">
            <span className="eyebrow text-slate-500">{deliveryId ? 'Nezavršena faktura' : 'Stigla roba'}</span>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-2xl transition-transform duration-300 group-hover:-rotate-6">
              📦
            </span>
          </span>
          <span>
            <span className="block font-display text-2xl font-extrabold leading-tight tracking-[-0.035em] text-slate-900">
              {deliveryId ? 'Nastavi fakturu →' : 'Unesi fakturu'}
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              {deliveryId ? 'Imaš nezavršenu fakturu.' : 'Stigla roba ili nešto vraćamo? Upiši ovde.'}
            </span>
          </span>
        </button>
      </div>
    </div>
  )
}
