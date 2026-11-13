/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { execSync } from 'node:child_process'
import pkg from './package.json' with { type: 'json' }

/** Kurze Commit-Kennung: auf GitHub aus GITHUB_SHA, lokal aus git */
function buildCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'lokal'
  }
}

// "handy"-Modus: startet den Entwicklungsserver mit HTTPS (selbst signiertes
// Zertifikat), damit Standort & Co. auch auf dem iPhone im WLAN funktionieren.
export default defineConfig(({ mode }) => ({
  // Relative Pfade, damit die App auch unter github.io/<repo>/ läuft.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Stand der Version (Zeitpunkt + Commit), damit man auf dem Handy sieht, ob die neue Version da ist
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
  },
  plugins: [react(), tailwindcss(), ...(mode === 'handy' ? [basicSsl()] : [])],
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
  },
}))
