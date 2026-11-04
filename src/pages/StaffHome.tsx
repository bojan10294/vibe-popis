import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createCount, getActiveCountForUser, listArticles } from '../data/repository'
import { Button, Card, Spinner } from '../components/ui'

export function StaffHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const justFinished = (location.state as { finished?: boolean } | null)?.finished === true
  const [activeId, setActiveId] = useState<string | null>(null)
  const [articleCount, setArticleCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const active = await getActiveCountForUser(user.id)
      setActiveId(active?.id ?? null)
      const arts = await listArticles({ activeOnly: true })
      setArticleCount(arts.length)
      setLoading(false)
    })()
  }, [user])

  if (!user) return null
  if (loading) return <Spinner />

  const startCount = async () => {
    const count = await createCount(user)
    navigate(`/count/${count.id}`)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Zdravo, {user.name}</h1>

      {justFinished && !activeId && (
        <Card className="border-green-200 bg-green-50 text-green-800">
          ✓ Popis je završen i poslat. Hvala!
        </Card>
      )}

      {activeId ? (
        <Card className="space-y-3 border-brand-200 bg-brand-50">
          <p className="font-medium text-brand-800">Imaš nezavršen popis.</p>
          <p className="text-sm text-brand-700/80">Nastavi odakle si stao.</p>
          <Button onClick={() => navigate(`/count/${activeId}`)} className="w-full py-4 text-lg">
            Nastavi popis
          </Button>
        </Card>
      ) : (
        <Card className="space-y-3">
          <p className="text-slate-600">
            Artikala za brojanje: <strong>{articleCount}</strong>. Ideš kategoriju po kategoriju,
            artikal po artikal.
          </p>
          <Button onClick={startCount} className="w-full py-4 text-lg">
            + Novi popis
          </Button>
        </Card>
      )}
    </div>
  )
}
