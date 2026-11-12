/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import pkg from './package.json' with { type: 'json' }

// "handy"-Modus: startet den Entwicklungsserver mit HTTPS (selbst signiertes
// Zertifikat), damit Standort & Co. auch auf dem iPhone im WLAN funktionieren.
export default defineConfig(({ mode }) => ({
  // Relative Pfade, damit die App auch unter github.io/<repo>/ läuft.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tailwindcss(), ...(mode === 'handy' ? [basicSsl()] : [])],
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
  },
}))
