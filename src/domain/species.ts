// Wildarten mit Geschlechts-/Altersklassen. Startliste – in Phase 3 in der App editierbar.

export interface Species {
  id: string
  name: string
  /** Geschlecht/Altersklassen zur Auswahl */
  sexAge: string[]
  order: number
  /** Kurzzeichen für Listen/Karte */
  short: string
  /** Farbe auf der Karte */
  color?: string
}

/** Farben für selbst angelegte Wildarten */
export const SPECIES_PALETTE = ['#e0a458', '#7cc47f', '#6fa8dc', '#c27ba0', '#e06666', '#93c47d', '#f6b26b', '#8e7cc3', '#76a5af', '#ffd966']

export function speciesColor(s: Species | undefined): string {
  if (!s) return '#9e9e9e'
  return s.color ?? SPECIES_PALETTE[Math.abs(s.order) % SPECIES_PALETTE.length]
}

export const DEFAULT_SPECIES: Species[] = [
  { id: 'rehwild', color: '#d9a066', name: 'Rehwild', short: 'Re', order: 1, sexAge: ['Bock', 'Ricke', 'Schmalreh', 'Kitz'] },
  { id: 'schwarzwild', color: '#8a8a8a', name: 'Schwarzwild', short: 'Sw', order: 2, sexAge: ['Keiler', 'Bache', 'Überläufer', 'Frischling'] },
  { id: 'rotwild', color: '#c0504d', name: 'Rotwild', short: 'Rt', order: 3, sexAge: ['Hirsch', 'Spießer', 'Alttier', 'Schmaltier', 'Kalb'] },
  { id: 'damwild', color: '#e6b8a2', name: 'Damwild', short: 'Dw', order: 4, sexAge: ['Hirsch', 'Spießer', 'Alttier', 'Schmaltier', 'Kalb'] },
  { id: 'fuchs', color: '#ff8c42', name: 'Fuchs', short: 'Fu', order: 5, sexAge: ['Rüde', 'Fähe', 'Jungfuchs'] },
  { id: 'dachs', color: '#cfcfcf', name: 'Dachs', short: 'Da', order: 6, sexAge: ['Altdachs', 'Jungdachs'] },
  { id: 'waschbaer', color: '#a3a3c2', name: 'Waschbär', short: 'Wb', order: 7, sexAge: ['Alt', 'Jung'] },
  { id: 'hase', color: '#b5a27a', name: 'Hase', short: 'Ha', order: 8, sexAge: ['Alt', 'Jung'] },
  { id: 'wildgaense', color: '#7fb3d5', name: 'Wildgänse', short: 'Gä', order: 9, sexAge: [] },
  { id: 'wildenten', color: '#76c7a5', name: 'Wildenten', short: 'En', order: 10, sexAge: ['Erpel', 'Ente'] },
]

/** Verhalten bei einer Sichtung */
export const BEHAVIORS = ['äsend', 'ziehend', 'flüchtig', 'sichernd', 'ruhend', 'wühlend', 'brunftig', 'schreckend'] as const
