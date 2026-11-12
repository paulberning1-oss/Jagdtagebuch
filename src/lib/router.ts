import { useEffect, useState } from 'react'

// Einfaches Routing über den #-Teil der Adresse – funktioniert auch auf GitHub Pages.
// Beispiele: #/karte, #/tagebuch, #/tagebuch/<id>, #/tagebuch/<id>/bearbeiten
export type Route = 'karte' | 'sichtungen' | 'tagebuch' | 'assistent' | 'mehr'
const ROUTES: Route[] = ['karte', 'sichtungen', 'tagebuch', 'assistent', 'mehr']

export interface Location {
  route: Route
  /** Weitere Pfadteile nach der Route */
  parts: string[]
}

function parse(): Location {
  const [r, ...parts] = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  return ROUTES.includes(r as Route) ? { route: r as Route, parts } : { route: 'karte', parts: [] }
}

export function useLocation(): Location {
  const [loc, setLoc] = useState<Location>(parse)
  useEffect(() => {
    const on = () => setLoc(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return loc
}

export function useRoute(): Route {
  return useLocation().route
}

export const navigate = (r: Route, ...parts: string[]) => {
  window.location.hash = `/${[r, ...parts].join('/')}`
}
