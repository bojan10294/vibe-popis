import { useEffect, useState } from 'react'
import { createUser, deleteUser, listUsers, setUserPin, setUserRole } from '../../data/repository'
import { useAuth } from '../../auth/AuthContext'
import type { Role, User } from '../../data/types'
import { Badge, Button, Card, Input, Select, Spinner } from '../../components/ui'

export function Users() {
  const { user: current } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const reload = async () => {
    setUsers(await listUsers())
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  const add = async () => {
    if (!name.trim() || !pin.trim()) return
    setError('')
    try {
      await createUser(name.trim(), role, pin)
      setName('')
      setPin('')
      reload()
    } catch (e) {
      setError(String(e).includes('duplicate') ? 'Već postoji nalog sa tim imenom.' : String(e))
    }
  }

  const [pinFor, setPinFor] = useState<string | null>(null)
  const [newPin, setNewPin] = useState('')
  const [notice, setNotice] = useState('')

  const savePin = async (u: User) => {
    if (!newPin.trim()) return
    await setUserPin(u.id, newPin.trim())
    setPinFor(null)
    setNewPin('')
    setNotice(`PIN za ${u.name} je promenjen.`)
  }

  const toggleRole = async (u: User) => {
    await setUserRole(u.id, u.role === 'admin' ? 'staff' : 'admin')
    reload()
  }

  const remove = async (u: User) => {
    if (u.id === current?.id) {
      alert('Ne možete obrisati svoj nalog.')
      return
    }
    if (!confirm(`Obrisati korisnika ${u.name}? Njegovi popisi ostaju sačuvani.`)) return
    try {
      await deleteUser(u.id)
    } catch (e) {
      alert(String(e))
    }
    reload()
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Zaposleni</h1>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-slate-600">Novi nalog</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ime" />
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="staff">Radnik</option>
            <option value="admin">Admin</option>
          </Select>
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            type="password"
            inputMode="numeric"
          />
          <Button onClick={add} disabled={!name.trim() || !pin.trim()}>Dodaj</Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </Card>

      {notice && <Card className="border-green-200 bg-green-50 text-sm text-green-800">{notice}</Card>}

      <div className="space-y-2">
        {users.map((u) => (
          <Card key={u.id} className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">{u.name}</p>
                <Badge tone={u.role === 'admin' ? 'amber' : 'green'}>
                  {u.role === 'admin' ? 'Admin' : 'Radnik'}
                </Badge>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {u.id !== current?.id && (
                  <Button variant="ghost" onClick={() => toggleRole(u)} className="text-sm">
                    {u.role === 'admin' ? 'Učini radnikom' : 'Učini adminom'}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPinFor(pinFor === u.id ? null : u.id)
                    setNewPin('')
                    setNotice('')
                  }}
                  className="text-sm"
                >
                  Promeni PIN
                </Button>
                <Button variant="ghost" onClick={() => remove(u)} className="text-sm text-red-500">
                  Obriši
                </Button>
              </div>
            </div>
            {pinFor === u.id && (
              <div className="flex gap-2">
                <Input
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && savePin(u)}
                  placeholder={`Novi PIN za ${u.name}`}
                  type="password"
                  inputMode="numeric"
                  autoFocus
                />
                <Button onClick={() => savePin(u)} disabled={!newPin.trim()}>Sačuvaj</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
