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
    <div className="relative mx-auto flex min-h-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="absolute right-5 top-5">
        <ThemeSwitch theme={theme} onToggle={toggleTheme} />
      </div>
      <div className="stagger">
        <div>
          <div className="mb-8">
            <AppLogo size={56} />
            <p className="eyebrow mt-6 text-slate-500">Inventar kafića</p>
            <h1 className="mt-2 font-display text-6xl font-extrabold leading-[0.9] tracking-[-0.05em] text-slate-900">
              Popis<span className="text-brand-500">.</span>
            </h1>
            <p className="mt-3 max-w-[16rem] text-base text-slate-500">Brojanje robe, fakture i lista nabavke na jednom mestu.</p>
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
              {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <Button type="submit" className="w-full py-3" disabled={busy}>
                {busy ? 'Provera...' : 'Prijavi se →'}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
