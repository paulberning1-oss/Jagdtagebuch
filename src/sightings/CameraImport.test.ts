import { describe, expect, it } from 'vitest'
import { groupBursts } from './CameraImport'

const t = (min: number) => new Date(Date.UTC(2026, 10, 10, 20, 0) + min * 60000)

describe('Bildserien zusammenfassen', () => {
  it('gleiche Wildart in kurzem Abstand = eine Sichtung', () => {
    const g = groupBursts([
      { time: t(0), speciesId: 'schwarzwild', count: 3 },
      { time: t(1), speciesId: 'schwarzwild', count: 5 },
      { time: t(2.5), speciesId: 'schwarzwild', count: 4 },
      { time: t(30), speciesId: 'schwarzwild', count: 2 },
      { time: t(31), speciesId: 'rehwild', count: 1 },
    ])
    expect(g.map((x) => x.length)).toEqual([3, 1, 1])
  })
})
