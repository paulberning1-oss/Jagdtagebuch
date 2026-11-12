import { useEffect, useState } from 'react'

// Einfaches Routing über den #-Teil der Adresse – funktioniert auch auf GitHub Pages.
export type Route = 'karte' | 'sichtungen' | 'tagebuch' | 'assistent' | 'mehr'
const ROUTES: Route[] = ['karte', 'sichtungen', 'tagebuch', 'assistent', 'mehr']

function parse(): Route {
  const r = window.location.hash.replace(/^#\/?/, '').split('/')[0] as Route
  return ROUTES.includes(r) ? r : 'karte'
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export const navigate = (r: Route) => {
  window.location.hash = `/${r}`
}
