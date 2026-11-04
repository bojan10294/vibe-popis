import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Badge } from './ui'

interface NavItem {
  to: string
  label: string
  end?: boolean
}

const staffNav: NavItem[] = [{ to: '/count', label: 'Popis', end: true }]

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Nabavka' },
  { to: '/admin/counts', label: 'Popisi' },
  { to: '/admin/articles', label: 'Artikli' },
  { to: '/admin/import', label: 'Knjigovodstvo' },
  { to: '/admin/users', label: 'Zaposleni' },
]

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const nav = user?.role === 'admin' ? adminNav : staffNav

  const onLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-brand-700">Popis</span>
            {user && (
              <Badge tone={user.role === 'admin' ? 'amber' : 'green'}>
                {user.role === 'admin' ? 'Admin' : 'Radnik'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            {user && <span className="text-sm text-slate-500">{user.name}</span>}
            <button
              onClick={onLogout}
              className="text-sm font-medium text-slate-500 hover:text-red-600"
            >
              Odjava
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                  isActive ? 'bg-brand-100 text-brand-700' : 'text-slate-500 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 px-4 py-5">{children}</main>
    </div>
  )
}
