import { describe, expect, it } from 'vitest'
import { parseTagebuch, type FotoEintrag } from '../../supabase/functions/ki/schemas'
import { checkRequest } from '../../supabase/functions/ki/validate'
import type { Facility } from '../db/db'
import { DEFAULT_SPECIES } from '../domain/species'
import { fromBerlinLocal } from '../lib/time'
import { draftBlocker, draftToRecords, matchStand, toDrafts, type ImportContext } from './photoImport'

const stand = (id: string, name: string): Facility => ({
  id,
  type: 'hochsitz',
  name,
  geometry: { type: 'Point', coordinates: [7.21, 52.52] },
  notes: '',
  photoIds: [],
  createdAt: 0,
  updatedAt: 0,
})
const ctx: ImportContext = {
  stands: [stand('s1', 'Eichenkanzel'), stand('s2', 'Leiter am Bruch')],
  species: DEFAULT_SPECIES,
  fallbackPos: { lat: 52.52, lng: 7.21 },
  now: fromBerlinLocal('2026-11-22T12:00').getTime(),
}
const entry = (e: Partial<FotoEintrag> = {}): FotoEintrag => ({
  datum: '2026-10-14',
  beginn: '16:30',
  ende: '18:45',
  sitz_id: '',
  sitz_text: 'Eichenkanzel',
  jagdart: 'ansitz',
  zielwildarten: ['rehwild'],
  wind_richtung: 'SW',
  wind_kmh: 8,
  temperatur_c: 9,
  wetter_text: 'leichter Nieselregen',
  anblick: [
    { wildart_id: 'rehwild', wildart_text: 'Reh', anzahl: 2, geschlecht_alter: ['Ricke', 'Kitz'], uhrzeit: '17:40', verhalten: 'äsend' },
    { wildart_id: '', wildart_text: 'Fasan', anzahl: 1, geschlecht_alter: [], uhrzeit: '', verhalten: 'laufend' },
  ],
  erlegt: [{ wildart_id: 'rehwild', wildart_text: 'Bock', geschlecht_alter: 'Bock', uhrzeit: '18:10', gewicht_kg: 16.5 }],
  stoerungen: ['Hunde', 'Traktor auf dem Nachbarfeld'],
  aktivitaet: 4,
  sterne: 5,
  fazit: 'Bock kam aus der Dickung',
  fehler: 'Zu spät angesessen',
  notizen: '',
  unsicher: '',
  ...e,
})

describe('Foto-Import: Tagebuchseiten → Ansitze', () => {
  it('Sitz per Kennung oder Name', () => {
    expect(matchStand({ sitz_id: 's2', sitz_text: '' }, ctx.stands)?.id).toBe('s2')
    expect(matchStand({ sitz_id: '', sitz_text: 'eichenkanzel' }, ctx.stands)?.id).toBe('s1')
    expect(matchStand({ sitz_id: '', sitz_text: 'Bruch' }, ctx.stands)?.id).toBe('s2')
    expect(matchStand({ sitz_id: '', sitz_text: 'Waldrand' }, ctx.stands)).toBeUndefined()
  })

  it('Entwürfe: Annahmen bei fehlender Zeit, Zukunft und Doppelte nicht vorausgewählt', () => {
    const d = toDrafts(
      {
        eintraege: [
          entry(),
          entry({ datum: '2026-10-20', beginn: '', ende: '', sitz_text: 'Waldrand' }),
          entry({ datum: '2027-01-05' }),
          entry({ datum: '14.10.' }),
        ],
        hinweis: '',
      },
      ctx,
      [{ start: fromBerlinLocal('2026-10-14T16:30').getTime(), standId: 's1', standName: 'Eichenkanzel' }],
    )
    expect(d[0]).toMatchObject({ standId: 's1', from: '16:30', to: '18:45', selected: false }) // doppelt
    expect(d[0].notes.join()).toContain('doppelt')
    expect(d[1]).toMatchObject({ from: '17:00', to: '19:00', standId: '', selected: true })
    expect(d[1].notes.join()).toContain('Waldrand')
    expect(d[2].blocker).toContain('Zukunft')
    expect(d[3].blocker).toContain('Datum')
    expect(draftBlocker({ ...d[3], date: '2026-10-15' }, ctx)).toBeNull()
  })

  it('Eintrag → Ansitz mit Sichtungen, Erlegung, Handwerten und Notizen', () => {
    const [d] = toDrafts({ eintraege: [entry()], hinweis: '' }, ctx)
    const { hunt, sightings } = draftToRecords(d, ctx)
    expect(hunt.standId).toBe('s1')
    expect(hunt.start).toBe(fromBerlinLocal('2026-10-14T16:30').getTime())
    expect(hunt.status).toBe('done')
    expect(hunt.overrides).toEqual({ windDirection: 225, windSpeed: 8, temperature: 9 })
    expect(hunt.kills).toHaveLength(1)
    expect(hunt.kills[0]).toMatchObject({ speciesId: 'rehwild', sexAge: 'Bock', weightKg: 16.5 })
    expect(hunt.success).toBe(true)
    expect(hunt.rating).toBe(5)
    expect(hunt.activity).toBe(4)
    expect(hunt.conclusion).toBe('Bock kam aus der Dickung')
    expect(hunt.mistakes).toBe('Zu spät angesessen')
    expect(hunt.disturbances).toEqual(['Hunde', 'Sonstiges'])
    expect(hunt.notes).toContain('Traktor auf dem Nachbarfeld')
    expect(hunt.notes).toContain('Anblick (Wildart nicht in deiner Liste): 1 Fasan')
    expect(hunt.notes).toContain('Wetter laut Notiz: leichter Nieselregen')
    expect(hunt.weatherStatus).toBe('pending') // Wetter wird aus dem Archiv nachgeladen
    expect(sightings).toHaveLength(1)
    expect(sightings[0]).toMatchObject({ huntId: hunt.id, speciesId: 'rehwild', count: 2, behavior: 'äsend', sexAge: ['Ricke', 'Kitz'] })
    expect(sightings[0].time).toBe(fromBerlinLocal('2026-10-14T17:40').getTime())
  })

  it('über Mitternacht und ohne Sitz', () => {
    const [d] = toDrafts({ eintraege: [entry({ beginn: '22:00', ende: '01:30', sitz_text: '' })], hinweis: '' }, ctx)
    const { hunt } = draftToRecords(d, ctx)
    expect(hunt.end! - hunt.start).toBe(3.5 * 3600000)
    expect(hunt.standId).toBeNull()
  })

  it('KI-Antwort lesen ist tolerant', () => {
    const t = parseTagebuch(JSON.stringify({ eintraege: [{ datum: '2026-10-14', anblick: [{ wildart_text: 'Reh', anzahl: 0 }], wind_richtung: 'XYZ' }] }))
    expect(t?.eintraege[0]).toMatchObject({ wind_richtung: '', wind_kmh: -1, temperatur_c: -99, jagdart: 'ansitz' })
    expect(t?.eintraege[0].anblick[0].anzahl).toBe(1)
    expect(parseTagebuch('kaputt')).toBeNull()
  })
})

describe('KI-Funktion: Fotos', () => {
  const msg = [{ role: 'user', content: 'Seiten lesen' }]
  const img = { mediaType: 'image/jpeg', data: 'QUJD' }
  it('nur bei Aufgabe „foto“, mit gültigem Bild', () => {
    expect(checkRequest({ task: 'foto', consent: true, messages: msg, images: [img] }).ok).toBe(true)
    expect(checkRequest({ task: 'foto', consent: true, messages: msg }).ok).toBe(false)
    expect(checkRequest({ task: 'chat', consent: true, messages: msg, images: [img] }).ok).toBe(false)
    expect(checkRequest({ task: 'foto', consent: true, messages: msg, images: [{ mediaType: 'image/gif', data: 'QUJD' }] }).ok).toBe(false)
    expect(checkRequest({ task: 'foto', consent: true, messages: msg, images: [{ mediaType: 'image/jpeg', data: 'kein base64!' }] }).ok).toBe(false)
    expect(checkRequest({ task: 'foto', consent: true, messages: msg, images: Array(7).fill(img) }).ok).toBe(false)
  })
})
