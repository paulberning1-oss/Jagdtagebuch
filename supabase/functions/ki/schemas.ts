// Feste Antwortformate (Structured Outputs) – auf dem Server festgelegt, die App kann sie nicht ändern.
// Wird auch von der App importiert (Typen + Prüfung der Antwort).

const str = (description: string) => ({ type: 'string', description })
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})

/** Art einer Aussage – für die Kennzeichnung „aus deinem Tagebuch / aus dem Jagdwissen / Vermutung“ */
export const SOURCE_KINDS = ['tagebuch', 'jagdwissen', 'bewertung', 'tabelle', 'vermutung'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

const point = obj({
  text: str('Die Aussage, kurz und konkret'),
  art: { type: 'string', enum: [...SOURCE_KINDS], description: 'Woher die Aussage stammt' },
  herkunft: str('Kennzeichnung wörtlich, z. B. „aus deinem Tagebuch (5 Ansitze)“, „aus dem Jagdwissen“, „aus der Punktbewertung“, „aus deiner Jagdzeiten-Tabelle“ oder „Vermutung“'),
})

export const EMPFEHLUNG_SCHEMA = obj({
  sitz: obj({
    id: str('Kennung des empfohlenen Sitzes genau wie in den Daten ([id: …])'),
    name: str('Name des Sitzes'),
    kurz: str('Ein Satz: warum dieser Sitz'),
  }),
  alternative: obj({
    id: str('Kennung eines zweitbesten Sitzes oder leer'),
    name: str('Name oder leer'),
    kurz: str('Ein Satz: wann/warum die Alternative, oder leer'),
  }),
  anmarschweg: obj({
    id: str('Kennung des empfohlenen Anmarschwegs genau wie in den Daten, oder leer, wenn keiner eingezeichnet ist'),
    name: str('Name des Wegs oder leer'),
    hinweis: str('Worauf beim Anmarsch achten (Wind, Wechsel, Zeit), ein bis zwei Sätze'),
  }),
  erwartung: {
    type: 'array',
    description: 'Was zu erwarten ist – höchstens 4 Einträge',
    items: obj({
      wildart: str('Wildart (und ggf. Stück/Klasse)'),
      uhrzeit: str('Zeitfenster, z. B. „ca. 16:30–17:15“'),
      einschaetzung: { type: 'string', enum: ['gering', 'mittel', 'gut'], description: 'Wie wahrscheinlich' },
      herkunft: str('Kennzeichnung wie oben'),
    }),
  },
  achten: { type: 'array', description: 'Worauf achten – 2 bis 5 Punkte', items: point },
  warum: { type: 'array', description: 'Begründung – 2 bis 6 Punkte, wichtigste zuerst', items: point },
  datenlage: str('Was an Daten fehlt oder unsicher ist (offen sagen); leer, wenn alles reicht'),
  jagdzeit: str('Jagdzeit der Zielwildart am Tag NUR laut mitgeschickter Tabelle mit Hinweis aufs Landesjagdrecht; leer, wenn nicht in der Tabelle'),
})

export interface KiPoint {
  text: string
  art: SourceKind
  herkunft: string
}

export interface KiEmpfehlung {
  sitz: { id: string; name: string; kurz: string }
  alternative: { id: string; name: string; kurz: string }
  anmarschweg: { id: string; name: string; hinweis: string }
  erwartung: { wildart: string; uhrzeit: string; einschaetzung: 'gering' | 'mittel' | 'gut'; herkunft: string }[]
  achten: KiPoint[]
  warum: KiPoint[]
  datenlage: string
  jagdzeit: string
}

/** Antworttext der KI als Empfehlung lesen (tolerant; null, wenn unbrauchbar) */
export function parseEmpfehlung(text: string): KiEmpfehlung | null {
  try {
    const d = JSON.parse(text) as Partial<KiEmpfehlung>
    if (!d || typeof d !== 'object' || !d.sitz || typeof d.sitz.name !== 'string') return null
    const s = (x: unknown) => (typeof x === 'string' ? x : '')
    const pts = (a: unknown): KiPoint[] =>
      Array.isArray(a)
        ? a
            .filter((p) => p && typeof p.text === 'string')
            .map((p) => ({ text: p.text, art: (SOURCE_KINDS as readonly string[]).includes(p.art) ? p.art : 'vermutung', herkunft: s(p.herkunft) }))
        : []
    return {
      sitz: { id: s(d.sitz.id), name: s(d.sitz.name), kurz: s(d.sitz.kurz) },
      alternative: { id: s(d.alternative?.id), name: s(d.alternative?.name), kurz: s(d.alternative?.kurz) },
      anmarschweg: { id: s(d.anmarschweg?.id), name: s(d.anmarschweg?.name), hinweis: s(d.anmarschweg?.hinweis) },
      erwartung: Array.isArray(d.erwartung)
        ? d.erwartung
            .filter((e) => e && typeof e.wildart === 'string')
            .map((e) => ({
              wildart: e.wildart,
              uhrzeit: s(e.uhrzeit),
              einschaetzung: (['gering', 'mittel', 'gut'] as const).includes(e.einschaetzung) ? e.einschaetzung : 'mittel',
              herkunft: s(e.herkunft),
            }))
        : [],
      achten: pts(d.achten),
      warum: pts(d.warum),
      datenlage: s(d.datenlage),
      jagdzeit: s(d.jagdzeit),
    }
  } catch {
    return null
  }
}

// ---------- Handschriftliche Tagebuchseiten (Aufgabe „foto“) ----------

export const WIND_8 = ['', 'N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'] as const
const int = (description: string) => ({ type: 'integer', description })
const strList = (description: string) => ({ type: 'array', items: { type: 'string' }, description })

export const TAGEBUCH_SCHEMA = obj({
  eintraege: {
    type: 'array',
    description: 'Ein Eintrag je Ansitz/Jagdtag auf den Fotos, in der Reihenfolge der Seiten',
    items: obj({
      datum: str('Datum als JJJJ-MM-TT; Jahr aus dem Zusammenhang, sonst das in der Nachricht genannte Jahr'),
      beginn: str('Beginn als HH:MM oder leer, wenn nicht notiert'),
      ende: str('Ende als HH:MM oder leer'),
      sitz_id: str('Kennung des Sitzes aus der Liste, wenn eindeutig zuzuordnen; sonst leer'),
      sitz_text: str('Sitz/Ort so, wie er notiert ist'),
      jagdart: { type: 'string', enum: ['ansitz', 'pirsch', 'drueckjagd', 'sonstige'] },
      zielwildarten: strList('Kennungen der Zielwildarten aus der Liste (leer, wenn nicht notiert)'),
      wind_richtung: { type: 'string', enum: [...WIND_8], description: 'Windrichtung (woher), leer wenn nicht notiert' },
      wind_kmh: int('Windstärke in km/h; aus Worten schätzen (still 2, schwach 8, mäßig 18, frisch 30, stark 45); -1 = nicht notiert'),
      temperatur_c: { type: 'number', description: 'Temperatur in °C; -99 = nicht notiert' },
      wetter_text: str('Wetter so, wie notiert (z. B. Nieselregen, Nebel, klar)'),
      anblick: {
        type: 'array',
        items: obj({
          wildart_id: str('Kennung aus der Liste oder leer'),
          wildart_text: str('Wildart so, wie notiert'),
          anzahl: int('Anzahl Stück (mindestens 1)'),
          geschlecht_alter: strList('Klassen aus der Liste der Wildart, z. B. Bock, Ricke, Kitz'),
          uhrzeit: str('HH:MM oder leer'),
          verhalten: str('Verhalten wie notiert, möglichst ein Wort aus der Liste'),
        }),
      },
      erlegt: {
        type: 'array',
        items: obj({
          wildart_id: str('Kennung aus der Liste oder leer'),
          wildart_text: str('Wildart so, wie notiert'),
          geschlecht_alter: str('Klasse, z. B. Bock, Überläufer'),
          uhrzeit: str('HH:MM oder leer'),
          gewicht_kg: { type: 'number', description: 'Gewicht aufgebrochen in kg; 0 = nicht notiert' },
        }),
      },
      stoerungen: strList('Störungen, möglichst Wörter aus der Liste'),
      aktivitaet: int('Wildaktivität 1 (sehr ruhig) bis 5 (sehr rege), 0 = nicht notiert'),
      sterne: int('Gesamteindruck 1–5 Sterne, 0 = nicht notiert'),
      fazit: str('Fazit/Erkenntnis, möglichst wörtlich'),
      fehler: str('Fehler / was nächstes Mal anders, möglichst wörtlich'),
      notizen: str('Alles Übrige, möglichst wörtlich'),
      unsicher: str('Was schwer lesbar oder geraten ist (konkret nennen); leer, wenn alles klar'),
    }),
  },
  hinweis: str('Allgemeiner Hinweis zu den Fotos (z. B. Seite unscharf, Teil abgeschnitten); leer, wenn nichts'),
})

export interface FotoAnblick {
  wildart_id: string
  wildart_text: string
  anzahl: number
  geschlecht_alter: string[]
  uhrzeit: string
  verhalten: string
}
export interface FotoErlegt {
  wildart_id: string
  wildart_text: string
  geschlecht_alter: string
  uhrzeit: string
  gewicht_kg: number
}
export interface FotoEintrag {
  datum: string
  beginn: string
  ende: string
  sitz_id: string
  sitz_text: string
  jagdart: 'ansitz' | 'pirsch' | 'drueckjagd' | 'sonstige'
  zielwildarten: string[]
  wind_richtung: (typeof WIND_8)[number]
  wind_kmh: number
  temperatur_c: number
  wetter_text: string
  anblick: FotoAnblick[]
  erlegt: FotoErlegt[]
  stoerungen: string[]
  aktivitaet: number
  sterne: number
  fazit: string
  fehler: string
  notizen: string
  unsicher: string
}
export interface FotoTagebuch {
  eintraege: FotoEintrag[]
  hinweis: string
}

/** Antwort der KI für Tagebuchseiten lesen (tolerant; null, wenn unbrauchbar) */
export function parseTagebuch(text: string): FotoTagebuch | null {
  try {
    const d = JSON.parse(text) as { eintraege?: unknown; hinweis?: unknown }
    if (!d || !Array.isArray(d.eintraege)) return null
    const s = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
    const n = (x: unknown, dflt: number) => (typeof x === 'number' && Number.isFinite(x) ? x : dflt)
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && !!v.trim()).map((v) => v.trim()) : [])
    const arr = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object') : [])
    const eintraege = arr(d.eintraege).map(
      (e): FotoEintrag => ({
        datum: s(e.datum),
        beginn: s(e.beginn),
        ende: s(e.ende),
        sitz_id: s(e.sitz_id),
        sitz_text: s(e.sitz_text),
        jagdart: (['ansitz', 'pirsch', 'drueckjagd', 'sonstige'] as const).includes(e.jagdart as never) ? (e.jagdart as FotoEintrag['jagdart']) : 'ansitz',
        zielwildarten: list(e.zielwildarten),
        wind_richtung: (WIND_8 as readonly string[]).includes(e.wind_richtung as string) ? (e.wind_richtung as FotoEintrag['wind_richtung']) : '',
        wind_kmh: n(e.wind_kmh, -1),
        temperatur_c: n(e.temperatur_c, -99),
        wetter_text: s(e.wetter_text),
        anblick: arr(e.anblick).map((a) => ({
          wildart_id: s(a.wildart_id),
          wildart_text: s(a.wildart_text),
          anzahl: Math.max(1, Math.round(n(a.anzahl, 1))),
          geschlecht_alter: list(a.geschlecht_alter),
          uhrzeit: s(a.uhrzeit),
          verhalten: s(a.verhalten),
        })),
        erlegt: arr(e.erlegt).map((k) => ({
          wildart_id: s(k.wildart_id),
          wildart_text: s(k.wildart_text),
          geschlecht_alter: s(k.geschlecht_alter),
          uhrzeit: s(k.uhrzeit),
          gewicht_kg: n(k.gewicht_kg, 0),
        })),
        stoerungen: list(e.stoerungen),
        aktivitaet: Math.round(n(e.aktivitaet, 0)),
        sterne: Math.round(n(e.sterne, 0)),
        fazit: s(e.fazit),
        fehler: s(e.fehler),
        notizen: s(e.notizen),
        unsicher: s(e.unsicher),
      }),
    )
    return { eintraege, hinweis: s(d.hinweis) }
  } catch {
    return null
  }
}


/** Aufgabe → Antwortformat (nur diese Aufgaben liefern JSON) */
export const TASK_SCHEMAS: Partial<Record<string, Record<string, unknown>>> = {
  empfehlung: EMPFEHLUNG_SCHEMA,
  foto: TAGEBUCH_SCHEMA,
}
