// Wildarten mit Geschlechts-/Altersklassen. Startliste – in Phase 3 in der App editierbar.

export interface Species {
  id: string
  name: string
  /** Geschlecht/Altersklassen zur Auswahl */
  sexAge: string[]
  order: number
  /** Kurzzeichen für Listen/Karte */
  short: string
}

export const DEFAULT_SPECIES: Species[] = [
  { id: 'rehwild', name: 'Rehwild', short: 'Re', order: 1, sexAge: ['Bock', 'Ricke', 'Schmalreh', 'Kitz'] },
  { id: 'schwarzwild', name: 'Schwarzwild', short: 'Sw', order: 2, sexAge: ['Keiler', 'Bache', 'Überläufer', 'Frischling'] },
  { id: 'rotwild', name: 'Rotwild', short: 'Rt', order: 3, sexAge: ['Hirsch', 'Spießer', 'Alttier', 'Schmaltier', 'Kalb'] },
  { id: 'damwild', name: 'Damwild', short: 'Dw', order: 4, sexAge: ['Hirsch', 'Spießer', 'Alttier', 'Schmaltier', 'Kalb'] },
  { id: 'fuchs', name: 'Fuchs', short: 'Fu', order: 5, sexAge: ['Rüde', 'Fähe', 'Jungfuchs'] },
  { id: 'dachs', name: 'Dachs', short: 'Da', order: 6, sexAge: ['Altdachs', 'Jungdachs'] },
  { id: 'waschbaer', name: 'Waschbär', short: 'Wb', order: 7, sexAge: ['Alt', 'Jung'] },
  { id: 'hase', name: 'Hase', short: 'Ha', order: 8, sexAge: ['Alt', 'Jung'] },
  { id: 'wildgaense', name: 'Wildgänse', short: 'Gä', order: 9, sexAge: [] },
  { id: 'wildenten', name: 'Wildenten', short: 'En', order: 10, sexAge: ['Erpel', 'Ente'] },
]

/** Verhalten bei einer Sichtung */
export const BEHAVIORS = ['äsend', 'ziehend', 'flüchtig', 'sichernd', 'ruhend', 'wühlend', 'brunftig', 'schreckend'] as const
