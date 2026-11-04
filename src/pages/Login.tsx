import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../lib/theme'
import { AppLogo } from '../components/Layout'
import { Button, Card, Field, Input, ThemeSwitch } from '../components/ui'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [theme, toggleTheme] = useTheme()
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
    <div className="relative mx-auto flex min-h-full max-w-sm flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeSwitch theme={theme} onToggle={toggleTheme} />
      </div>
      <div className="mb-8 flex flex-col items-center text-center">
        <AppLogo size={64} />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">Popis</h1>
        <p className="mt-1 text-sm text-slate-500">Popis robe i lista nabavke</p>
      </div>
      <Card className="w-full p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Ime">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vaše ime"
              autoComplete="username"
            />
          </Field>
          <Field label="PIN">
            <Input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoComplete="current-password"
              inputMode="numeric"
            />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" className="w-full py-3" disabled={busy}>
            {busy ? 'Provera...' : 'Prijavi se'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
