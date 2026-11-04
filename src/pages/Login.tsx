import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Field, Input } from '../components/ui'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await login(name, pin)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Greška')
      return
    }
    navigate('/')
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-brand-700">Popis</h1>
        <p className="mt-1 text-sm text-slate-500">Inventarna kontrola — prijava</p>
      </div>
      <Card className="w-full">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Ime">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vaše ime"
              autoComplete="username"
            />
          </Field>
          <Field label="PIN / lozinka">
            <Input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
              autoComplete="current-password"
              inputMode="numeric"
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Provera...' : 'Prijavi se'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
