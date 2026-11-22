import { describe, expect, it } from 'vitest'
import { DEFAULT_SPECIES } from './species'
import { allClasses, CLASS_TREES, classTree, groupOf } from './speciesClasses'

describe('Klassen je Wildart (Geschlecht → Alter)', () => {
  it('jede Start-Wildart hat einen Baum, alte Klassennamen bleiben gültig', () => {
    for (const sp of DEFAULT_SPECIES) {
      const tree = classTree(sp)
      expect(tree.length, sp.id).toBeGreaterThan(1)
      expect(tree.some((g) => g.label === 'Weitere'), sp.id).toBe(false) // alle bisherigen Namen sind im Baum
      for (const old of sp.sexAge) expect(allClasses(sp), `${sp.id}: ${old}`).toContain(old)
    }
  })

  it('Rehwild: männlich, weiblich, unbekannt mit Altersstufen', () => {
    const tree = classTree(DEFAULT_SPECIES.find((s) => s.id === 'rehwild'))
    expect(tree.map((g) => g.label)).toEqual(['männlich (Bock)', 'weiblich (Ricke)', 'unbekannt'])
    expect(tree[0].classes).toContain('Jährling / Spießer')
    expect(tree[1].classes).toContain('Schmalreh')
    expect(groupOf(tree, 'Kitz')).toBe(2)
  })

  it('keine Klasse doppelt innerhalb einer Wildart', () => {
    for (const [id, tree] of Object.entries(CLASS_TREES)) {
      const all = tree.flatMap((g) => g.classes)
      expect(new Set(all).size, id).toBe(all.length)
    }
  })

  it('eigene Wildart und geänderte Klassen', () => {
    expect(classTree({ id: 'k_muffel', sexAge: ['Widder', 'Schaf', 'Lamm'] })).toEqual([{ label: 'Klasse', classes: ['Widder', 'Schaf', 'Lamm', 'unbekannt'] }])
    const reh = classTree({ id: 'rehwild', sexAge: ['Bock', 'Abnormer Bock'] })
    expect(reh.at(-1)).toEqual({ label: 'Weitere', classes: ['Abnormer Bock'] })
    expect(classTree({ id: 'k_x', sexAge: [] })).toEqual([])
  })
})
