import { useLiveQuery } from 'dexie-react-hooks'
import type { RuleSettings } from '../domain/rules'
import type { SightingFilter } from '../domain/sightings'
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
  /** Filter der Sichtungskarte */
  sightingFilter: SightingFilter
  /** Darstellung der Sichtungen */
  sightingView: 'punkte' | 'heatmap'
  /** Assistent: Zielwildart ('alle' = jede Wildart) */
  assistantSpecies: string
  /** Assistent: eigene Stärke je Regel */
  ruleSettings: RuleSettings
  /** Kompass auf der Karte eingeblendet (nur dieses Gerät) */
  compassOpen: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  scentLength: 300,
  scentWidth: 40,
  baseLayer: 'esri',
  mapView: null,
  sightingFilter: { speciesIds: [], range: 'alle', periods: [], months: [], sources: [] },
  sightingView: 'punkte',
  assistantSpecies: 'rehwild',
  ruleSettings: {},
  compassOpen: false,
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
