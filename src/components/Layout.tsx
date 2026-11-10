import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../lib/theme'
import { ThemeSwitch } from './ui'

interface NavItem {
  to: string
  label: string
  end?: boolean
}

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Pregled', end: true },
  { to: '/admin/orders', label: 'Nabavka' },
  { to: '/admin/counts', label: 'Popisi' },
  { to: '/admin/articles', label: 'Artikli' },
  { to: '/admin/suppliers', label: 'Dobavljači' },
  { to: '/admin/import', label: 'Knjigovodstvo' },
  { to: '/admin/compare', label: 'Poređenje' },
  { to: '/admin/users', label: 'Zaposleni' },
]

export function AppLogo({ size = 32 }: { size?: number }) {
  return <img src="/icon-192.png" alt="" width={size} height={size} className="rounded-[28%]" />
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [theme, toggleTheme] = useTheme()
  const isAdmin = user?.role === 'admin'

  const onLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-canvas/80 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <AppLogo />
            <div className="leading-tight">
              <p className="text-base font-bold tracking-tight text-slate-900">Popis</p>
              <p className="text-xs text-slate-500">{isAdmin ? 'Admin' : 'Radnik'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitch theme={theme} onToggle={toggleTheme} />
            {user && (
              <button
                onClick={onLogout}
                title="Odjava"
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-surface py-1 pl-1 pr-3 text-sm font-medium text-slate-600 shadow-sm hover:text-red-600"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                Odjava
              </button>
            )}
          </div>
        </div>
        {isAdmin && (
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none]">
            {adminNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-brand-600'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1 px-4 py-5">{children}</main>
    </div>
  )
}
