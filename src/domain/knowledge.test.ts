import { describe, expect, it } from 'vitest'
import { fromBerlinLocal } from '../lib/time'
import {
  DEFAULT_CALENDAR,
  dayOfYear,
  inRange,
  isDefaultId,
  mergeWithDefaults,
  seasonsAt,
  yearSegments,
  type CalendarPhase,
  type Season,
} from './knowledge'
import { DEFAULT_KNOWLEDGE } from './knowledgeDefaults'
import { suggestPhases } from './phases'

const day = (d: string) => fromBerlinLocal(`${d}T12:00`).getTime()

describe('Jagdwissen & Jagdkalender', () => {
  it('Vorschläge haben eindeutige Kennungen und sind ungeprüft', () => {
    for (const list of [DEFAULT_KNOWLEDGE, DEFAULT_CALENDAR]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length)
      expect(list.every((x) => x.status === 'ungeprueft' && isDefaultId(x.id))).toBe(true)
    }
    // Startwissen für jede Haupt-Wildart
    for (const s of ['rehwild', 'schwarzwild', 'rotwild', 'damwild', 'fuchs']) {
      expect(DEFAULT_KNOWLEDGE.some((k) => k.speciesId === s)).toBe(true)
    }
  })

  it('gespeicherte Änderung ersetzt den Vorschlag, eigene Einträge kommen dazu', () => {
    const changed: CalendarPhase = { ...DEFAULT_CALENDAR[0], from: '04-01', status: 'geprueft', updatedAt: 1 }
    const own: CalendarPhase = { id: 'x1', speciesId: 'rehwild', label: 'Eigen', from: '06-01', to: '06-10', status: 'geprueft', active: true, own: true }
    const merged = mergeWithDefaults(DEFAULT_CALENDAR, [own, changed])
    expect(merged).toHaveLength(DEFAULT_CALENDAR.length + 1)
    expect(merged[0]).toBe(changed)
    expect(merged.at(-1)).toBe(own)
    expect(isDefaultId(own.id)).toBe(false)
  })

  it('ausgeschaltete Phasen werden nicht vorgeschlagen, eigene schon', () => {
    const blatt = DEFAULT_CALENDAR.find((p) => p.id === 'p:rehwild:blattzeit')!
    const cal = mergeWithDefaults(DEFAULT_CALENDAR, [
      { ...blatt, active: false },
      { id: 'o', speciesId: 'rehwild', label: 'Bock am Bruch', from: '07-20', to: '08-05', status: 'geprueft', active: true, own: true },
    ])
    const p = suggestPhases(day('2026-08-01'), ['rehwild'], cal)
    expect(p).not.toContain('Blattzeit (Rehwild)')
    expect(p).toContain('Bock am Bruch (Rehwild)')
  })

  it('Namen eigener Wildarten in Vorschlägen', () => {
    const cal = [{ speciesId: 'k_muffel', label: 'Brunft', from: '10-15', to: '12-15' }]
    expect(suggestPhases(day('2026-11-01'), [], cal, new Map([['k_muffel', 'Muffelwild']]))).toEqual(['Brunft (Muffelwild)'])
  })

  it('Zeiträume über den Jahreswechsel', () => {
    expect(inRange('11-01', '01-31', day('2026-12-24'))).toBe(true)
    expect(inRange('11-01', '01-31', day('2027-01-31'))).toBe(true)
    expect(inRange('11-01', '01-31', day('2027-02-01'))).toBe(false)
    expect(yearSegments('11-01', '01-31')).toHaveLength(2)
    expect(yearSegments('05-01', '06-30')).toHaveLength(1)
    expect(dayOfYear('01-01')).toBe(0)
    expect(dayOfYear('12-31')).toBe(364)
  })

  it('Jagdzeiten nur aus der eigenen Tabelle', () => {
    const seasons: Season[] = [
      { id: 'a', speciesId: 'rehwild', label: 'Böcke', from: '05-01', to: '10-15' },
      { id: 'b', speciesId: 'rehwild', label: 'Ricken', from: '09-01', to: '01-31' },
    ]
    const s = seasonsAt(seasons, 'rehwild', day('2026-06-15'))
    expect(s.map((x) => [x.season.label, x.open])).toEqual([
      ['Böcke', true],
      ['Ricken', false],
    ])
    // Ohne Eintrag: nichts (die App erfindet keine Jagdzeiten)
    expect(seasonsAt(seasons, 'schwarzwild', day('2026-06-15'))).toEqual([])
  })
})
