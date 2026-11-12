import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

/** Alle Einstellungen mit Standardwerten an einer Stelle */
export interface Settings {
  /** Länge des Witterungskegels in Metern */
  scentLength: number
  /** Öffnung des Witterungskegels in Grad */
  scentWidth: number
  /** Gewählte Kartenebene */
  baseLayer: string
  /** Letzter Kartenausschnitt */
  mapView: { lat: number; lng: number; zoom: number } | null
}

export const DEFAULT_SETTINGS: Settings = {
  scentLength: 300,
  scentWidth: 40,
  baseLayer: 'esri',
  mapView: null,
}

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const row = await db.settings.get(key)
  return (row?.value as Settings[K]) ?? DEFAULT_SETTINGS[key]
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  return db.settings.put({ key, value })
}

/** React-Hook: liefert den aktuellen Wert (live) – oder undefined, solange geladen wird */
export function useSetting<K extends keyof Settings>(key: K): Settings[K] | undefined {
  return useLiveQuery(async () => {
    const row = await db.settings.get(key)
    return (row?.value as Settings[K]) ?? DEFAULT_SETTINGS[key]
  }, [key])
}
