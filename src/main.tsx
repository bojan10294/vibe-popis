import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts ship with the app (works offline, no Google request).
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker only in production builds — in dev it would cache Vite's modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
}
