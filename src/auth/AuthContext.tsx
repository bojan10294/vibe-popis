import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getToken, run, sb, setToken } from '../data/supabase'
import { seedIfEmpty } from '../data/seed'
import type { User } from '../data/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (name: string, pin: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

/** First admin login fills an empty database with the starting article list. */
async function afterLogin(user: User) {
  if (user.role === 'admin') await seedIfEmpty().catch((e) => console.error('seed failed', e))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const token = getToken()
      if (token) {
        try {
          const u = await run<User | null>(sb().rpc('app_me', { p_token: token }))
          if (!u) setToken(null)
          else await afterLogin(u)
          if (alive) setUser(u)
        } catch (e) {
          console.error(e)
        }
      }
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

  const login = useCallback(async (name: string, pin: string) => {
    const trimmed = name.trim()
    if (!trimmed || !pin) return { ok: false, error: 'Unesite ime i PIN.' }
    try {
      const res = await run<{ token: string; user: User } | null>(
        sb().rpc('app_login', { p_name: trimmed, p_pin: pin }),
      )
      if (!res) return { ok: false, error: 'Pogrešno ime ili PIN.' }
      setToken(res.token)
      await afterLogin(res.user)
      setUser(res.user)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Nema veze sa serverom. Proverite internet.' }
    }
  }, [])

  const logout = useCallback(() => {
    const token = getToken()
    if (token) sb().rpc('app_logout', { p_token: token }).then(() => undefined, () => undefined)
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
