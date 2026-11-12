import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import { DEFAULT_SPECIES, type Species } from '../domain/species'

/** Wildarten (live aus der Datenbank, sortiert) */
export function useSpecies(): Species[] {
  const list = useLiveQuery(() => db.species.orderBy('order').toArray(), [])
  return list && list.length ? list : DEFAULT_SPECIES
}

export function useSpeciesMap(): Map<string, Species> {
  const list = useSpecies()
  return useMemo(() => new Map(list.map((s) => [s.id, s])), [list])
}

/** Aktuelle Zeit, die sich regelmäßig aktualisiert (für laufende Uhren) */
export function useNow(intervalMs = 15000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function useRunningHunt() {
  return useLiveQuery(() => db.hunts.where('status').equals('running').first(), [])
}

/** Dauer als "1:25 h" bzw. "45 min" */
export function fmtDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`
}
