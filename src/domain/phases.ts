// Jagdliche Phasen (Verhalten des Wildes im Jahreslauf) – Grundstock für den Jagdkalender.
// VORSCHLAG – ungeprüft. Zeiträume sind grobe, regional schwankende Richtwerte aus allgemeiner Jagdpraxis.
// Ab Teilschritt 5 („Jagdwissen“) bearbeitbar. KEINE Jagd- oder Schonzeiten – die pflegt der Nutzer selbst.
import { berlinParts } from '../lib/time'

export interface PhaseDef {
  /** Wildart (Kennung) oder null = allgemein */
  speciesId: string | null
  label: string
  /** Beginn/Ende als „MM-TT“, darf über den Jahreswechsel gehen */
  from: string
  to: string
}

export const DEFAULT_PHASES: PhaseDef[] = [
  // Rehwild
  { speciesId: 'rehwild', label: 'Fegezeit', from: '03-15', to: '05-31' },
  { speciesId: 'rehwild', label: 'Setzzeit', from: '05-01', to: '06-30' },
  { speciesId: 'rehwild', label: 'Blattzeit', from: '07-15', to: '08-15' },
  { speciesId: 'rehwild', label: 'Gehörnabwurf', from: '10-15', to: '12-31' },
  // Schwarzwild
  { speciesId: 'schwarzwild', label: 'Rauschzeit', from: '11-01', to: '01-31' },
  { speciesId: 'schwarzwild', label: 'Frischzeit', from: '02-01', to: '04-30' },
  { speciesId: 'schwarzwild', label: 'Sauen im Getreide/Mais', from: '06-15', to: '09-30' },
  // Rotwild
  { speciesId: 'rotwild', label: 'Geweihabwurf', from: '02-15', to: '04-30' },
  { speciesId: 'rotwild', label: 'Setzzeit', from: '05-15', to: '06-30' },
  { speciesId: 'rotwild', label: 'Fegen', from: '07-15', to: '08-31' },
  { speciesId: 'rotwild', label: 'Brunft', from: '09-10', to: '10-15' },
  // Damwild
  { speciesId: 'damwild', label: 'Geweihabwurf', from: '04-01', to: '05-15' },
  { speciesId: 'damwild', label: 'Setzzeit', from: '06-01', to: '06-30' },
  { speciesId: 'damwild', label: 'Fegen', from: '08-15', to: '09-15' },
  { speciesId: 'damwild', label: 'Brunft', from: '10-15', to: '11-15' },
  // Fuchs, Hase, Gänse
  { speciesId: 'fuchs', label: 'Ranz', from: '01-01', to: '02-28' },
  { speciesId: 'fuchs', label: 'Jungfüchse am Bau', from: '04-01', to: '06-15' },
  { speciesId: 'hase', label: 'Rammelzeit', from: '01-15', to: '03-31' },
  { speciesId: 'wildgaense', label: 'Zugzeit', from: '10-01', to: '02-28' },
  // Allgemein (Landwirtschaft)
  { speciesId: null, label: 'Getreideernte', from: '07-15', to: '08-31' },
  { speciesId: null, label: 'Maisernte', from: '09-15', to: '10-31' },
]

const SPECIES_NAMES: Record<string, string> = {
  rehwild: 'Rehwild',
  schwarzwild: 'Schwarzwild',
  rotwild: 'Rotwild',
  damwild: 'Damwild',
  fuchs: 'Fuchs',
  hase: 'Hase',
  wildgaense: 'Wildgänse',
}

const md = (s: string) => {
  const [m, d] = s.split('-').map(Number)
  return m * 100 + d
}

/** Liegt der Tag (Berliner Datum) in der Phase? Über den Jahreswechsel möglich. */
export function inPhase(p: PhaseDef, time: number): boolean {
  const { month, day } = berlinParts(new Date(time))
  const x = month * 100 + day
  const a = md(p.from)
  const b = md(p.to)
  return a <= b ? x >= a && x <= b : x >= a || x <= b
}

/** Anzeigename, z. B. „Blattzeit (Rehwild)“ */
export const phaseLabel = (p: PhaseDef) => (p.speciesId ? `${p.label} (${SPECIES_NAMES[p.speciesId] ?? p.speciesId})` : p.label)

/**
 * Phasen, die zum Datum passen. Mit Zielwildarten: deren Phasen zuerst, dann allgemeine,
 * dann die übrigen Wildarten.
 */
export function suggestPhases(time: number, speciesIds: string[] = [], defs: PhaseDef[] = DEFAULT_PHASES): string[] {
  const active = defs.filter((p) => inPhase(p, time))
  const rank = (p: PhaseDef) => (p.speciesId && speciesIds.includes(p.speciesId) ? 0 : p.speciesId == null ? 1 : 2)
  return [...active].sort((a, b) => rank(a) - rank(b)).map(phaseLabel)
}
