import { describe, expect, it } from 'vitest'
import { fromBerlinLocal } from '../lib/time'
import { classStateText, daysUntil, noteWithoutSource, seasonOpen, seasonOverview } from './knowledge'
import { buildNiedersachsenSeasons } from './seasonsNiedersachsen'
import { DEFAULT_SPECIES } from './species'

const day = (d: string) => fromBerlinLocal(`${d}T12:00`).getTime()
const names = new Map(DEFAULT_SPECIES.map((s) => [s.id, s.name]))
const rows = buildNiedersachsenSeasons(DEFAULT_SPECIES)

describe('Vorlage Jagdzeiten Niedersachsen', () => {
  it('feste, eindeutige Kennungen und gültige Daten', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
    expect(rows.every((r) => r.id.startsWith('nds:') && /^\d\d-\d\d$/.test(r.from) && /^\d\d-\d\d$/.test(r.to))).toBe(true)
    expect(rows.every((r) => r.note?.includes('Quelle: schonzeiten.de'))).toBe(true)
    // gleiche Eingabe → gleiche Zeilen (kein Zufall, keine Doppelten beim erneuten Übernehmen)
    expect(buildNiedersachsenSeasons(DEFAULT_SPECIES)).toEqual(rows)
  })

  it('Werte aus der Tabelle', () => {
    const get = (id: string) => rows.find((r) => r.id === id)!
    expect(get('nds:rehwild:boecke')).toMatchObject({ speciesId: 'rehwild', from: '04-01', to: '01-31' })
    expect(get('nds:rehwild:schmalrehe')).toMatchObject({ from: '04-01', to: '05-15' })
    expect(get('nds:rehwild:schmalrehe:2')).toMatchObject({ from: '09-01', to: '01-31' })
    expect(get('nds:fuchs:altfuechse')).toMatchObject({ from: '06-16', to: '02-28' })
    expect(get('nds:steinmarder:steinmarder')).toMatchObject({ speciesId: 'nds:steinmarder', name: 'Steinmarder', from: '10-16' })
    expect(get('nds:wildgaense:blaessgans').closed).toBe(true)
    expect(noteWithoutSource(get('nds:schwarzwild:bachen').note)).toContain('Elterntierschutz')
    expect(noteWithoutSource(get('nds:rehwild:boecke').note)).toBe('')
  })

  it('eigene Wildart mit gleichem Namen wird verwendet, gelöschte Startart bekommt den Namen mit', () => {
    const list = [...DEFAULT_SPECIES.filter((s) => s.id !== 'hase'), { id: 'k_1', name: 'Steinmarder' }]
    const r = buildNiedersachsenSeasons(list)
    expect(r.find((x) => x.id === 'nds:steinmarder:steinmarder')).toMatchObject({ speciesId: 'k_1' })
    expect(r.find((x) => x.id === 'nds:steinmarder:steinmarder')!.name).toBeUndefined()
    expect(r.find((x) => x.id === 'nds:hase:feldhase')).toMatchObject({ speciesId: 'hase', name: 'Hase' })
  })

  it('Übersicht „Aktuell“ am 21.11.2026', () => {
    const t = day('2026-11-21')
    const o = seasonOverview(rows, t, names, DEFAULT_SPECIES.map((s) => s.id))
    expect(o[0].speciesId).toBe('rehwild')
    const reh = o[0].classes
    const boecke = reh.find((c) => c.label === 'Böcke')!
    expect(boecke).toMatchObject({ open: true, endDay: '01-31', endsIn: 71 })
    expect(classStateText(boecke)).toBe('Jagdzeit bis 31.01. · noch 72 Tage')
    expect(reh.find((c) => c.label === 'Schmalrehe')!.open).toBe(true)
    const sw = o.find((s) => s.speciesId === 'schwarzwild')!.classes[0]
    expect(classStateText(sw)).toBe('Jagdzeit ganzjährig')
    const rebhuhn = o.find((s) => s.name === 'Rebhuhn')!.classes[0]
    expect(rebhuhn).toMatchObject({ open: true, endDay: '11-30', endsIn: 9 })
    expect(classStateText(o.find((s) => s.speciesId === 'wildgaense')!.classes.find((c) => c.label === 'Saatgans')!)).toContain('keine Jagdzeit')
  })

  it('Schmalrehe im Juni: Schonzeit bis 1. September, Böcke frei', () => {
    const t = day('2026-06-15')
    const reh = seasonOverview(rows, t, names)[0].classes
    expect(reh.find((c) => c.label === 'Schmalrehe')).toMatchObject({ open: false, openDay: '09-01', opensIn: 78 })
    expect(reh.find((c) => c.label === 'Böcke')!.open).toBe(true)
    expect(daysUntil('06-15', t)).toBe(0)
    expect(daysUntil('06-14', t)).toBe(364)
    expect(seasonOpen({ id: 'a', speciesId: 'x', label: '', from: '01-01', to: '12-31', closed: true }, t)).toBe(false)
  })
})
