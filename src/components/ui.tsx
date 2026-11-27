import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

// Solid buttons shift via brightness, not a different shade: the shade scale is
// remapped in dark mode (see index.css), brightness works in both themes.
const variants: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-on-brand border border-black/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] hover:-translate-y-px hover:brightness-105 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_0_0_4px_rgb(212_245_74/0.28)]',
  secondary: 'bg-surface text-slate-800 border border-slate-200 shadow-sm hover:-translate-y-px hover:bg-slate-50',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger:
    'bg-red-600 text-white border border-black/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] hover:-translate-y-px hover:brightness-110',
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-base font-semibold tracking-tight active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/** `interactive` for cards that are (inside) a link or button: they lift and glow on hover. */
export function Card({
  children,
  className = '',
  interactive = false,
}: {
  children: ReactNode
  className?: string
  interactive?: boolean
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-surface p-4 shadow-sm ${interactive ? 'lift' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block text-slate-500">{label}</span>
      {children}
    </label>
  )
}

const control =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-800 shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:bg-surface focus:ring-4 focus:ring-brand-500/20'

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={control} {...props} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={control} {...props} />
}

export function Spinner() {
  return (
    <div className="flex h-40 items-center justify-center gap-1.5" role="status" aria-label="Učitavam">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-brand-500"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="font-display text-lg font-semibold tracking-tight text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
    </div>
  )
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: 'slate' | 'green' | 'red' | 'amber'
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  return (
    <span className={`eyebrow inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function ThemeSwitch({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Uključi svetlu temu' : 'Uključi tamnu temu'}
      title={dark ? 'Svetla tema' : 'Tamna tema'}
      className="relative flex h-8 w-14 shrink-0 items-center rounded-full border border-slate-200 bg-slate-100 p-0.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.08)] hover:border-slate-300"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-surface text-slate-700 shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.3,1.4,0.5,1)] ${
          dark ? 'translate-x-6' : ''
        }`}
      >
        {dark ? (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        )}
      </span>
    </button>
  )
}

export function formatQty(n: number | null | undefined): string {
  if (n == null) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('sr-RS', { maximumFractionDigits: 2 })
}
