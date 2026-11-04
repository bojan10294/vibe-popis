import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteCount, listCounts } from '../../data/repository'
import type { Count } from '../../data/types'
import { fmtDateTime } from '../../lib/format'
import { Badge, Button, EmptyState, Spinner } from '../../components/ui'

export function Counts() {
  const [counts, setCounts] = useState<Count[]>([])
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setCounts(await listCounts())
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  if (loading) return <Spinner />

  const onDelete = async (id: string) => {
    if (!confirm('Obrisati ovaj popis i sve njegove stavke?')) return
    await deleteCount(id)
    reload()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Istorija popisa</h1>
      {counts.length === 0 ? (
        <EmptyState title="Nema popisa" hint="Popisi se pojavljuju kad radnici počnu brojanje." />
      ) : (
        <div className="space-y-2">
          {counts.map((c) => (
            <CountRow key={c.id} count={c} onDelete={() => onDelete(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

export function CountRow({ count: c, onDelete }: { count: Count; onDelete?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <Link to={`/admin/counts/${c.id}`} className="min-w-0 flex-1 hover:underline">
        <p className="font-medium text-slate-800">{fmtDateTime(c.datetime)}</p>
        <p className="text-sm text-slate-500">{c.user_name}</p>
      </Link>
      <div className="flex items-center gap-2">
        <Badge tone={c.status === 'finished' ? 'green' : 'amber'}>
          {c.status === 'finished' ? 'završeno' : 'u toku'}
        </Badge>
        {onDelete && (
          <Button variant="ghost" onClick={onDelete} className="px-2 py-1 text-sm text-red-500">
            Obriši
          </Button>
        )}
      </div>
    </div>
  )
}
