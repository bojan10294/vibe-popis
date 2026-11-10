import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createCount, getActiveCountForUser, listArticles } from '../data/repository'
import { Card, Spinner } from '../components/ui'
import { Fireworks } from '../components/Fireworks'
import { countedOn } from '../lib/measure'

export function StaffHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const justFinished = (location.state as { finished?: boolean } | null)?.finished === true
  const [activeId, setActiveId] = useState<string | null>(null)
  const [articleCount, setArticleCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const active = await getActiveCountForUser(user.id)
      setActiveId(active?.id ?? null)
      const arts = await listArticles({ activeOnly: true })
      setArticleCount(arts.filter((a) => countedOn(a, new Date())).length)
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

  const today = new Date().toLocaleDateString('sr-Latn-RS', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium capitalize text-slate-500">{today}</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Zdravo, {user.name} 👋</h1>
      </div>

      {justFinished && !activeId && <Fireworks />}
      {justFinished && !activeId && (
        <Card className="flex items-center gap-3 border-green-200 bg-green-50">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">✓</span>
          <p className="font-medium text-green-800">Popis je završen i poslat. Hvala!</p>
        </Card>
      )}

      <button
        onClick={activeId ? () => navigate(`/count/${activeId}`) : startCount}
        disabled={starting}
        className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-indigo-600 p-6 text-left text-white shadow-lg shadow-brand-600/30 transition active:scale-[0.99] disabled:opacity-70"
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 right-10 h-32 w-32 rounded-full bg-white/10" />
        <p className="relative text-sm font-medium text-white/80">
          {activeId ? 'Imaš nezavršen popis' : `${articleCount} artikala za brojanje`}
        </p>
        <p className="relative mt-1 text-2xl font-extrabold">
          {starting ? 'Pokrećem...' : activeId ? 'Nastavi popis →' : '+ Novi popis'}
        </p>
        <p className="relative mt-3 text-sm text-white/80">
          {activeId ? 'Nastavljaš tačno odakle si stao.' : 'Ideš kategoriju po kategoriju, artikal po artikal.'}
        </p>
      </button>
    </div>
  )
}
