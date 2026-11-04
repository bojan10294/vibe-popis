import { useCallback, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'popis:theme'
const BAR_COLOR: Record<Theme, string> = { light: '#f4f5f9', dark: '#0c0f17' }

/** Saved choice, else the phone's own setting. Mirrors the inline script in index.html. */
export function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme])
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // storage blocked — the choice just won't be remembered
  }
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }, [])
  return [theme, toggle]
}
