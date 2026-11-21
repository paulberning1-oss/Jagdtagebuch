// Vorlage: Jagdzeiten Niedersachsen – vom Nutzer ausdrücklich gewünscht, abgeschrieben aus der von ihm
// genannten Quelle (schonzeiten.de, „Jagdzeiten Niedersachsen 2026“, abgerufen am 21.11.2026).
// NICHT von einer KI erzeugt. Wird nur auf Knopfdruck des Nutzers in seine eigene Tabelle übernommen
// (`buildNiedersachsenSeasons`) und ist danach normal bearbeitbar. Maßgeblich bleibt die DVO-NJagdG.
import type { Season } from './knowledge'
import { DEFAULT_SPECIES } from './species'

export const NDS_SOURCE = 'schonzeiten.de – Jagdzeiten Niedersachsen (abgerufen 21.11.2026), maßgeblich: DVO-NJagdG'
export const NDS_SOURCE_URL = 'https://schonzeiten.de/jagdzeiten-niedersachsen-jagd/'

const ALL: [string, string] = ['01-01', '12-31']
type Row = { label: string; ranges: [string, string][]; note?: string } | { label: string; closed: true; note?: string }
interface Group {
  /** Kennung der Wildart in der App, oder für Arten ohne Eintrag in der Wildarten-Liste: „nds:<name>“ */
  speciesId: string
  /** Name für Arten ohne Eintrag in der Wildarten-Liste */
  name?: string
  rows: Row[]
}

const ELTERNTIER = 'BJagdG § 22 Abs. 4 (Elterntierschutz) und DVO-NJagdG § 4 beachten'
const VSG = 'in Vogelschutzgebieten (Anlage DVO-NJagdG)'
const r = (label: string, ...ranges: [string, string][]): Row => ({ label, ranges })
const rn = (label: string, note: string, ...ranges: [string, string][]): Row => ({ label, ranges, note })
const keine = (label: string, note?: string): Row => ({ label, closed: true, note })

/** Gruppen für die Wildarten der App-Startliste */
const OWN: Group[] = [
  {
    speciesId: 'rehwild',
    rows: [r('Böcke', ['04-01', '01-31']), r('Schmalrehe', ['04-01', '05-15'], ['09-01', '01-31']), r('Ricken', ['09-01', '01-31']), r('Kitze', ['09-01', '01-31'])],
  },
  {
    speciesId: 'schwarzwild',
    rows: ['Keiler', 'Bachen', 'Überläufer', 'Frischlinge'].map((l) => rn(l, ELTERNTIER, ALL)),
  },
  {
    speciesId: 'rotwild',
    rows: [
      r('Hirsche', ['08-01', '01-31']),
      r('Alttiere', ['08-01', '01-31']),
      r('Kälber', ['08-01', '01-31']),
      r('Schmalspießer', ['04-01', '05-15'], ['08-01', '01-31']),
      r('Schmaltiere', ['04-01', '05-15'], ['08-01', '01-31']),
    ],
  },
  {
    speciesId: 'damwild',
    rows: [
      r('Hirsche', ['08-01', '01-31']),
      r('Alttiere', ['09-01', '01-31']),
      r('Kälber', ['09-01', '01-31']),
      r('Schmalspießer', ['04-01', '05-15'], ['08-01', '01-31']),
      r('Schmaltiere', ['04-01', '05-15'], ['08-01', '01-31']),
    ],
  },
  { speciesId: 'fuchs', rows: [r('Altfüchse', ['06-16', '02-28']), r('Jungfüchse', ALL)] },
  { speciesId: 'dachs', rows: [r('Altdachse', ['08-01', '01-31']), r('Jungdachse', ALL)] },
  { speciesId: 'waschbaer', rows: [r('Alt', ['07-16', '03-31']), r('Jung', ALL)] },
  { speciesId: 'hase', rows: [r('Feldhase', ['10-01', '12-31'])] },
  {
    speciesId: 'wildgaense',
    rows: [
      rn('Graugans', `${VSG} nur 16.07.–30.11.`, ['07-16', '01-15']),
      rn('Kanadagans', `${VSG} nur 01.08.–30.11.`, ['07-16', '01-15']),
      r('Nilgans', ['07-16', '01-15']),
      rn('Nonnengans', 'stark reglementiert – Einzelheiten DVO-NJagdG § 3 Abs. 16', ['08-01', '01-15']),
      keine('Blässgans'),
      keine('Saatgans'),
      keine('Ringelgans'),
    ],
  },
  {
    speciesId: 'wildenten',
    rows: [
      r('Stockente', ['09-01', '01-15']),
      r('Krickente', ['10-01', '01-15']),
      r('Pfeifente', ['10-01', '01-15']),
      keine('Reiherente'),
      keine('Tafelente'),
      keine('Bergente'),
      keine('Spießente'),
      keine('Samtente'),
      keine('Trauerente'),
    ],
  },
]

const other = (name: string, rows: Row[]): Group => ({ speciesId: `nds:${slugName(name)}`, name, rows })

/** Weitere Arten mit Jagdzeit (ohne Eintrag in der Wildarten-Liste) */
const OTHER: Group[] = [
  other('Sikawild', [
    r('Hirsche', ['08-01', '01-31']),
    r('Alttiere', ['09-01', '01-31']),
    r('Kälber', ['09-01', '01-31']),
    r('Schmalspießer', ['08-01', '01-31']),
    r('Schmaltiere', ['08-01', '01-31']),
  ]),
  other('Muffelwild', [r('Muffelwild', ['08-01', '01-31'])]),
  other('Gamswild', [r('Gamswild', ['08-01', '12-15'])]),
  other('Wildkaninchen', [r('Alt', ['10-01', '02-15']), r('Jung', ALL)]),
  other('Steinmarder', [r('Steinmarder', ['10-16', '02-28'])]),
  other('Baummarder', [r('Baummarder', ['10-16', '02-28'])]),
  other('Iltis', [r('Iltis', ['08-01', '02-28'])]),
  other('Hermelin', [r('Hermelin', ['08-01', '02-28'])]),
  other('Marderhund', [r('Alt', ['09-01', '02-28']), r('Jung', ALL)]),
  other('Mink', [r('Alt', ['08-01', '02-28']), r('Jung', ALL)]),
  other('Nutria', [r('Nutria', ALL)]),
  other('Fasan', [r('Fasan', ['10-01', '01-15'])]),
  other('Rebhuhn', [r('Rebhuhn', ['09-16', '11-30'])]),
  other('Ringeltaube', [
    rn(
      'Alttauben',
      '20.08.–31.10. und 21.02.–31.03. nur Alttauben, die in Trupps auf Acker-, Baumschul- oder Grünland-Neueinsaaten einfallen (Schadensabwehr, DVO-NJagdG § 2 Abs. 1 Satz 11a)',
      ['08-20', '03-31'],
    ),
    rn('Jungtauben', '21.02.–31.10. nur zur Schadensabwehr in Trupps auf Kulturen (DVO-NJagdG § 2 Abs. 1 Satz 11b)', ALL),
  ]),
  other('Türkentaube', [r('Türkentaube', ['11-01', '12-31'])]),
  other('Waldschnepfe', [r('Waldschnepfe', ['10-16', '12-31'])]),
  other('Blässhuhn', [r('Blässhuhn', ['09-11', '02-20'])]),
  other('Höckerschwan', [
    rn('Höckerschwan', `nur Schadensabwehr (Trupps auf Ackerkulturen/Grünland-Neueinsaaten); ${VSG} nur 01.11.–30.11.`, ['11-01', '02-20']),
  ]),
  other('Silbermöwe', [r('Silbermöwe', ['10-01', '02-10'])]),
  other('Rabenkrähe', [r('Rabenkrähe', ['08-01', '02-20'])]),
  other('Elster', [r('Elster', ['08-01', '02-28'])]),
  other('Kormoran', [rn('Kormoran', 'nicht im Jagdrecht – nach der Niedersächsischen Kormoranverordnung (NKormoranVO)', ['08-21', '02-28'])]),
]

export const NDS_GROUPS: Group[] = [...OWN, ...OTHER]

function slugName(s: string) {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Alle Zeilen der Vorlage als eigene Jagdzeiten. Feste Kennungen „nds:<wildart>:<klasse>[:2]“ –
 * so entstehen beim erneuten Übernehmen (oder auf einem zweiten Gerät) keine Doppelten.
 * `species` = Wildarten-Liste des Nutzers: Steht eine weitere Art dort schon (gleicher Name), wird sie
 * verwendet; fehlt eine Startart (gelöscht), bekommt die Jagdzeit den Namen mit.
 */
export function buildNiedersachsenSeasons(species: { id: string; name: string }[]): Season[] {
  const ids = new Set(species.map((s) => s.id))
  const byName = new Map(species.map((s) => [s.name.trim().toLowerCase(), s.id]))
  const defaultName = new Map(DEFAULT_SPECIES.map((s) => [s.id, s.name]))
  const out: Season[] = []
  for (const g of NDS_GROUPS) {
    const own = g.name ? byName.get(g.name.toLowerCase()) : undefined
    const speciesId = own ?? g.speciesId
    const name = own ? undefined : (g.name ?? (ids.has(g.speciesId) ? undefined : defaultName.get(g.speciesId)))
    const base = g.speciesId.startsWith('nds:') ? g.speciesId.slice(4) : g.speciesId
    for (const row of g.rows) {
      const id = `nds:${base}:${slugName(row.label)}`
      const note = row.note ? `${row.note} · Quelle: ${NDS_SOURCE}` : `Quelle: ${NDS_SOURCE}`
      const common = { speciesId, label: row.label, note, ...(name ? { name } : {}) }
      if ('closed' in row) {
        out.push({ ...common, id, from: '01-01', to: '12-31', closed: true })
      } else {
        row.ranges.forEach(([from, to], i) => out.push({ ...common, id: i ? `${id}:${i + 1}` : id, from, to }))
      }
    }
  }
  return out
}
