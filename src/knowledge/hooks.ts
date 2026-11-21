// Jagdwissen, Jagdkalender und eigene Jagdzeiten aus der Datenbank (mit den Vorschlägen zusammengeführt).
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../db/db'
import { DEFAULT_CALENDAR, mergeWithDefaults, type CalendarPhase, type KnowledgeEntry, type Season } from '../domain/knowledge'
import { DEFAULT_KNOWLEDGE } from '../domain/knowledgeDefaults'
import { useSpecies } from '../journal/hooks'

/** Alle Wissensabschnitte (Vorschläge + eigene Änderungen/Abschnitte) */
export function useKnowledge(): KnowledgeEntry[] | undefined {
  const stored = useLiveQuery(() => db.knowledge.toArray(), [])
  return useMemo(() => stored && mergeWithDefaults(DEFAULT_KNOWLEDGE, stored), [stored])
}

/** Jagdkalender (Vorschläge + eigene Änderungen/Phasen), auch ausgeschaltete */
export function useCalendar(): CalendarPhase[] | undefined {
  const stored = useLiveQuery(() => db.calendar.toArray(), [])
  return useMemo(() => stored && mergeWithDefaults(DEFAULT_CALENDAR, stored), [stored])
}

/** Eigene Jagdzeiten */
export function useSeasons(): Season[] | undefined {
  return useLiveQuery(() => db.seasons.toArray(), [])
}

/** Wildart-Kennung → Name */
export function useSpeciesNames(): Map<string, string> {
  const species = useSpecies()
  return useMemo(() => new Map(species.map((s) => [s.id, s.name])), [species])
}

export const saveKnowledge = (k: KnowledgeEntry) => db.knowledge.put({ ...k, updatedAt: Date.now() })
export const saveCalendarPhase = (p: CalendarPhase) => db.calendar.put({ ...p, updatedAt: Date.now() })
export const saveSeason = (s: Season) => db.seasons.put({ ...s, updatedAt: Date.now() })
