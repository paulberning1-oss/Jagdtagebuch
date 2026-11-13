import { describe, expect, it } from 'vitest'
import { destination } from '../lib/geo'
import { DEFAULT_RANGE, fromStartEnd, inShootingField, shootingField } from './shootingField'

const STAND = { lat: 52.52, lng: 7.21 }

describe('Schussfeld', () => {
  it('liest alte Sitze (Blickrichtung + Breite) als Sektor mit Standard-Reichweite', () => {
    const f = shootingField({ type: 'hochsitz', bearing: 90, fieldWidth: 60 })!
    expect(f).toMatchObject({ round: false, start: 60, end: 120, mid: 90, width: 60, range: DEFAULT_RANGE })
  })

  it('ohne Blickrichtung gibt es kein Schussfeld – außer rundum', () => {
    expect(shootingField({ type: 'hochsitz', bearing: null, fieldWidth: 60 })).toBeNull()
    expect(shootingField({ type: 'hochsitz', bearing: null, fieldWidth: 360 })?.round).toBe(true)
  })

  it('Nicht-Sitze haben kein Schussfeld', () => {
    expect(shootingField({ type: 'wildkamera', bearing: 90, fieldWidth: 60 })).toBeNull()
  })

  it('rechnet Start/Ende über Norden hinweg richtig um', () => {
    // von NW (315°) bis O (90°) = 135° breit, Mitte 22,5°
    expect(fromStartEnd(315, 90)).toEqual({ bearing: 22.5, fieldWidth: 135 })
    expect(fromStartEnd(90, 90).fieldWidth).toBe(360)
  })

  it('prüft Winkel und Reichweite', () => {
    const f = shootingField({ type: 'hochsitz', bearing: 90, fieldWidth: 60, fieldRange: 200 })!
    expect(inShootingField(f, STAND, destination(STAND, 100, 150))).toBe(true)
    expect(inShootingField(f, STAND, destination(STAND, 100, 250))).toBe(false)
    expect(inShootingField(f, STAND, destination(STAND, 180, 100))).toBe(false)
    const round = shootingField({ type: 'hochsitz', bearing: null, fieldWidth: 360, fieldRange: 200 })!
    expect(inShootingField(round, STAND, destination(STAND, 180, 100))).toBe(true)
  })
})
