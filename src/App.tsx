import { BookOpen, Compass, Map as MapIcon, Menu, Telescope } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { AuthGate } from './cloud/auth'
import { ToastProvider } from './components/ui'
import { navigate, useLocation, type Route } from './lib/router'
import JournalPage from './pages/JournalPage'
import { startWeatherSync } from './services/weatherSync'
import MapPage from './pages/MapPage'
import PlaceholderPage from './pages/PlaceholderPage'
import SettingsPage from './pages/SettingsPage'
import SightingsPage from './pages/SightingsPage'

const NAV: { route: Route; label: string; icon: ReactNode }[] = [
  { route: 'karte', label: 'Karte', icon: <MapIcon /> },
  { route: 'sichtungen', label: 'Sichtungen', icon: <Telescope /> },
  { route: 'tagebuch', label: 'Tagebuch', icon: <BookOpen /> },
  { route: 'assistent', label: 'Assistent', icon: <Compass /> },
  { route: 'mehr', label: 'Mehr', icon: <Menu /> },
]

export default function App() {
  const { route, parts } = useLocation()
  // Wetterdaten offener Ansitze nachladen, sobald Internet da ist
  useEffect(() => startWeatherSync(), [])
  return (
    <ToastProvider>
      <AuthGate>
      <div className="flex h-dvh flex-col">
        <main className="relative flex-1 overflow-hidden">
          {route === 'karte' && <MapPage />}
          {route === 'sichtungen' && <SightingsPage />}
          {route === 'tagebuch' && <JournalPage parts={parts} />}
          {route === 'assistent' && (
            <PlaceholderPage title="Kombinations-Assistent" phase={4}>
              Bewertung jedes Sitzes mit 0–100 Punkten aus Regelwerk und deinem Tagebuch – mit Begründung.
            </PlaceholderPage>
          )}
          {route === 'mehr' && <SettingsPage />}
        </main>
        <nav className="pb-safe grid grid-cols-5 border-t border-line bg-panel">
          {NAV.map((n) => (
            <button
              key={n.route}
              onClick={() => navigate(n.route)}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                route === n.route ? 'text-accent' : 'text-ink-dim'
              }`}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>
      </div>
      </AuthGate>
    </ToastProvider>
  )
}
