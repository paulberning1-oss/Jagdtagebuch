import { describe, expect, it } from 'vitest'
import type { Facility } from '../db/db'
import { destination, toPos } from '../lib/geo'
import { analyzeScent } from './scent'

const stand = { lat: 52.6, lng: 10.3 }

function fac(partial: Partial<Facility> & Pick<Facility, 'type' | 'geometry'>): Facility {
  return { id: Math.random().toString(), name: 'Test', notes: '', photoIds: [], createdAt: 0, updatedAt: 0, ...partial }
}

describe('Witterungskegel', () => {
  // Kirrung liegt 150 m nordöstlich des Sitzes
  const kirrung = fac({ type: 'kirrung', name: 'Buchenecke', geometry: { type: 'Point', coordinates: toPos(destination(stand, 45, 150)) } })
  const base = { stand, length: 300, width: 40 }

  it('Wind aus SW trägt die Witterung zur Kirrung im NO → Warnung', () => {
    const r = analyzeScent({ ...base, windFrom: 225 }, [kirrung])
    expect(r.scentDir).toBe(45)
    const warn = r.messages.find((m) => m.severity === 'warn')
    expect(warn?.text).toContain('Kirrung')
    expect(warn?.text).toContain('Buchenecke')
  })

  it('Wind aus NO trägt die Witterung weg → keine Warnung', () => {
    const r = analyzeScent({ ...base, windFrom: 45 }, [kirrung])
    expect(r.messages.some((m) => m.severity === 'warn')).toBe(false)
    expect(r.messages[0].severity).toBe('good')
  })

  it('Wechsel quer durch den Kegel wird erkannt', () => {
    const m = destination(stand, 0, 200)
    const wechsel = fac({
      type: 'wechsel',
      geometry: { type: 'LineString', coordinates: [toPos(destination(m, 270, 200)), toPos(destination(m, 90, 200))] },
    })
    const r = analyzeScent({ ...base, windFrom: 180 }, [wechsel])
    expect(r.messages[0].severity).toBe('warn')
    expect(r.messages[0].text).toContain('Wechsel')
  })

  it('Wind von hinten zum Schussfeld wird gemeldet', () => {
    const r = analyzeScent({ ...base, windFrom: 180, standBearing: 0 }, [])
    expect(r.messages.some((m) => m.severity === 'warn' && m.text.includes('von hinten'))).toBe(true)
  })
})
