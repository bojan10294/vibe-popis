import path from 'node:path'
import os from 'node:os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite's dep cache lives OUTSIDE the OneDrive-synced project folder.
// OneDrive locks files under node_modules on Windows, which breaks
// Vite's re-optimization (EPERM on rmdir node_modules/.vite/deps).
const cacheDir = path.join(os.tmpdir(), 'popis-vite-cache')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir,
  server: {
    host: true,
    port: 5174,
  },
})
