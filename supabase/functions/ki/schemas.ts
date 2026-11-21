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

/** Aufgabe → Antwortformat (nur diese Aufgaben liefern JSON) */
export const TASK_SCHEMAS: Partial<Record<string, Record<string, unknown>>> = {
  empfehlung: EMPFEHLUNG_SCHEMA,
}
