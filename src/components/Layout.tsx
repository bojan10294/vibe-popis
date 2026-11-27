import type { ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
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
  { to: '/admin/deliveries', label: 'Fakture' },
  { to: '/admin/articles', label: 'Artikli' },
  { to: '/admin/suppliers', label: 'Dobavljači' },
  { to: '/admin/import', label: 'Knjigovodstvo' },
  { to: '/admin/compare', label: 'Poređenje' },
  { to: '/admin/users', label: 'Zaposleni' },
]

export function AppLogo({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/icon-192.png"
      alt=""
      width={size}
      height={size}
      className="rounded-[28%] shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_8px_20px_-10px_rgb(0_0_0/0.4)]"
    />
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [theme, toggleTheme] = useTheme()
  const isAdmin = user?.role === 'admin'

  const onLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-canvas/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <AppLogo />
            <div className="leading-none">
              <p className="font-display text-xl font-extrabold tracking-[-0.04em] text-slate-900">Popis</p>
              <p className="eyebrow mt-1 text-slate-500">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-500 align-middle" />
                {isAdmin ? 'Admin' : 'Radnik'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitch theme={theme} onToggle={toggleTheme} />
            {user && (
              <button
                onClick={onLogout}
                title="Odjava"
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-surface py-1 pl-1 pr-3 text-sm font-semibold text-slate-600 shadow-sm hover:text-red-600"
              >
                <span className="num flex h-6 w-6 items-center justify-center rounded-full border border-black/10 bg-brand-600 text-xs font-bold text-on-brand">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                Odjava
              </button>
            )}
          </div>
        </div>
        {isAdmin && (
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2.5 [mask-image:linear-gradient(to_right,black_90%,transparent)] [scrollbar-width:none]">
            {adminNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
                    isActive
                      ? 'border-transparent bg-ink text-on-ink shadow-sm'
                      : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-surface hover:text-slate-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      {/* Keyed by route so every page plays its entrance. */}
      <main key={pathname} className="stagger flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  )
}
