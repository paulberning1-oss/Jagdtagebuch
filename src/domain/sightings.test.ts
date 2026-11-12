import { describe, expect, it } from 'vitest'
import { destination } from '../lib/geo'
import { fromBerlinLocal } from '../lib/time'
import type { Sighting } from './hunt'
import { EMPTY_FILTER, filterSightings, heatGrid, huntingYearStart, periodOf } from './sightings'

const c = { lat: 52.64, lng: 10.3 }
let n = 0
function s(partial: Partial<Sighting>): Sighting {
  return {
    id: String(n++),
    huntId: null,
    time: fromBerlinLocal('2026-11-10T16:00').getTime(),
    speciesId: 'rehwild',
    count: 1,
    sexAge: [],
    behavior: '',
    direction: null,
    lat: c.lat,
    lng: c.lng,
    source: 'eigen',
    notes: '',
    photoIds: [],
    createdAt: 0,
    ...partial,
  }
}

describe('Sichtungen filtern', () => {
  const list = [
    s({ speciesId: 'rehwild', time: fromBerlinLocal('2026-11-10T16:00').getTime() }), // Abend
    s({ speciesId: 'schwarzwild', time: fromBerlinLocal('2026-11-10T23:30').getTime(), source: 'wildkamera' }), // Nacht
    s({ speciesId: 'rehwild', time: fromBerlinLocal('2026-06-01T05:00').getTime() }), // Morgen
    s({ speciesId: 'fuchs', time: fromBerlinLocal('2025-12-01T12:00').getTime() }), // Tag, altes Jagdjahr
  ]
  const now = fromBerlinLocal('2026-11-12T12:00').getTime()

  it('ohne Filter alle', () => expect(filterSightings(list, EMPTY_FILTER, now)).toHaveLength(4))
  it('nach Wildart', () => expect(filterSightings(list, { ...EMPTY_FILTER, speciesIds: ['rehwild'] }, now)).toHaveLength(2))
  it('nach Tageszeit', () => {
    expect(periodOf(list[0])).toBe('Abend')
    expect(periodOf(list[1])).toBe('Nacht')
    expect(periodOf(list[2])).toBe('Morgen')
    expect(filterSightings(list, { ...EMPTY_FILTER, periods: ['Nacht'] }, now)).toHaveLength(1)
  })
  it('nach Monat und Quelle', () => {
    expect(filterSightings(list, { ...EMPTY_FILTER, months: [11] }, now)).toHaveLength(2)
    expect(filterSightings(list, { ...EMPTY_FILTER, sources: ['wildkamera'] }, now)).toHaveLength(1)
  })
  it('Jagdjahr beginnt am 1. April', () => {
    expect(new Date(huntingYearStart(now)).toISOString()).toBe('2026-03-31T22:00:00.000Z')
    expect(filterSightings(list, { ...EMPTY_FILTER, range: 'jagdjahr' }, now)).toHaveLength(3)
    expect(filterSightings(list, { ...EMPTY_FILTER, range: '30' }, now)).toHaveLength(2)
  })
})

describe('Heatmap-Raster', () => {
  it('zählt Stück je 50-m-Zelle', () => {
    const a = destination(c, 45, 10)
    const b = destination(c, 45, 20)
    const far = destination(c, 90, 300)
    const cells = heatGrid([s({ ...a, count: 2 }), s({ ...b, count: 3 }), s({ ...far, count: 1 })], 50, c)
    expect(cells).toHaveLength(2)
    const big = cells.find((x) => x.value === 5)
    expect(big?.sightings).toBe(2)
  })
})
