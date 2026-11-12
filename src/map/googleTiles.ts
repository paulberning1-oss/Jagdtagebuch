// Google Satellit über die Google Map Tiles API.
// - Schlüssel kommt ausschließlich aus der .env (VITE_GOOGLE_MAPS_API_KEY)
// - Ohne Schlüssel oder ohne Internet ist die Ebene nicht verfügbar
// - Google-Kacheln werden NICHT offline gespeichert (Nutzungsbedingungen)

import L from 'leaflet'
import type { TileProvider } from './providers'

const KEY: string = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim()
const BASE = 'https://tile.googleapis.com'

interface Session {
  token: string
  /** Ablauf in ms seit 1970 */
  expiry: number
}

let session: Session | null = null

export const hasGoogleKey = () => KEY.length > 0

async function getSession(): Promise<Session> {
  if (session && session.expiry - Date.now() > 3600_000) return session
  const res = await fetch(`${BASE}/v1/createSession?key=${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: 'satellite', language: 'de-DE', region: 'DE' }),
  })
  if (!res.ok) throw new Error(`Google-Sitzung fehlgeschlagen (${res.status})`)
  const json = await res.json()
  session = { token: json.session, expiry: Number(json.expiry) * 1000 }
  return session
}

/**
 * Google verlangt, dass die aktuellen Urheberrechtsangaben für den sichtbaren
 * Ausschnitt angezeigt werden. Die holen wir bei jeder Kartenbewegung.
 */
export async function fetchGoogleAttribution(bounds: L.LatLngBounds, zoom: number): Promise<string> {
  const s = await getSession()
  const p = new URLSearchParams({
    session: s.token,
    key: KEY,
    zoom: String(Math.round(zoom)),
    north: bounds.getNorth().toFixed(5),
    south: bounds.getSouth().toFixed(5),
    east: bounds.getEast().toFixed(5),
    west: bounds.getWest().toFixed(5),
  })
  const res = await fetch(`${BASE}/tile/v1/viewport?${p}`)
  if (!res.ok) return 'Google'
  const json = await res.json()
  return json.copyright ? `Google · ${json.copyright}` : 'Google'
}

export const googleProvider: TileProvider = {
  id: 'google',
  label: 'Google Satellit',
  description: 'Nur online, wird nicht offline gespeichert',
  offlineCacheable: false,
  isAvailable: () => hasGoogleKey() && navigator.onLine,
  async createLayer() {
    const s = await getSession()
    return L.tileLayer(`${BASE}/v1/2dtiles/{z}/{x}/{y}?session=${s.token}&key=${encodeURIComponent(KEY)}`, {
      maxZoom: 21,
      maxNativeZoom: 20,
      attribution: 'Google',
    })
  },
}
