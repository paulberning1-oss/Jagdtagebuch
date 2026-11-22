import { afterEach, describe, expect, it } from 'vitest'
import { allTypes, drawRank, facilityColor, labelMinZoom, registerCustomCategories, typeInfo, typesOfKind, type Category } from './facilityTypes'

const polter: Category = {
  id: 'k_polter',
  label: 'Holzpolter',
  kinds: ['point', 'area'],
  color: '#8d6e63',
  scent: 'hint',
  hasCrop: false,
  order: 1,
  createdAt: 0,
}

afterEach(() => registerCustomCategories([]))

describe('Kategorien', () => {
  it('enthält die Startliste für eigene Objekte', () => {
    for (const t of ['gewaesser', 'graben', 'neuanpflanzung', 'zaun', 'weg', 'stoerquelle', 'dickung', 'einstand']) {
      expect(typeInfo(t).label).not.toBe('Unbekannte Kategorie')
    }
    expect(typeInfo('feld').hasCrop).toBe(true)
  })

  it('hängt eigene Kategorien ein – mit Farbe, Witterung und Geometrien', () => {
    registerCustomCategories([polter])
    const info = typeInfo('k_polter')
    expect(info).toMatchObject({ label: 'Holzpolter', custom: true, isStand: false, scent: 'hint', glyph: 'HO' })
    expect(typesOfKind('area').some((t) => t.type === 'k_polter')).toBe(true)
    expect(typesOfKind('line').some((t) => t.type === 'k_polter')).toBe(false)
    expect(allTypes().length).toBeGreaterThan(20)
  })

  it('unbekannte (z. B. gelöschte) Kategorie ist nie ein Sitz', () => {
    expect(typeInfo('k_weg').isStand).toBe(false)
    expect(typeInfo('k_weg').label).toBe('Unbekannte Kategorie')
  })

  it('eigene Farbe eines Objekts geht vor', () => {
    expect(facilityColor({ type: 'weg' })).toBe(typeInfo('weg').color)
    expect(facilityColor({ type: 'weg', color: '#ff0000' })).toBe('#ff0000')
  })
})

describe('Reihenfolge auf der Karte', () => {
  const f = (type: string, g: string) => ({ type, geometry: { type: g } })
  it('Neuanpflanzung/Zaun/Feld/Weg ganz unten, Sitze oben, Beschriftung im Hintergrund erst nah', () => {
    const order = [f('hochsitz', 'Point'), f('dickung', 'Polygon'), f('neuanpflanzung', 'Polygon'), f('wechsel', 'LineString'), f('weg', 'LineString'), f('kirrung', 'Point')]
      .sort((a, b) => drawRank(a) - drawRank(b))
      .map((x) => x.type)
    expect(order).toEqual(['neuanpflanzung', 'dickung', 'weg', 'wechsel', 'kirrung', 'hochsitz'])
    expect(labelMinZoom(f('neuanpflanzung', 'Polygon'))).toBe(18)
    expect(labelMinZoom(f('hochsitz', 'Point'))).toBe(15)
    expect(labelMinZoom(f('kirrung', 'Point'))).toBe(16)
  })
})
