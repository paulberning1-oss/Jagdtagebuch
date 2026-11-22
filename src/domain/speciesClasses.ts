// Klassen je Wildart in zwei Stufen: erst Geschlecht (bzw. Art bei Gänsen/Enten), dann Klasse mit Alter.
// Gespeichert wird weiterhin nur der Klassenname in `sexAge` (Sichtung: Liste, Erlegung: ein Wert) –
// die bisherigen Namen (Bock, Ricke, Schmalreh, Kitz …) sind enthalten, alte Einträge passen also weiter.
import type { Species } from './species'

export interface ClassGroup {
  /** z. B. „männlich (Bock)“, „Art“ */
  label: string
  classes: string[]
}

const m = (word: string, classes: string[]): ClassGroup => ({ label: `männlich (${word})`, classes })
const w = (word: string, classes: string[]): ClassGroup => ({ label: `weiblich (${word})`, classes })
const u = (classes: string[]): ClassGroup => ({ label: 'unbekannt', classes })

/** Fachliche Klassen der Start-Wildarten (Jägersprache, Altersangaben als Richtwerte) */
export const CLASS_TREES: Record<string, ClassGroup[]> = {
  rehwild: [
    m('Bock', ['Bockkitz', 'Jährling / Spießer', 'Bock', 'junger Bock (2–3 J.)', 'mittelalter Bock (4–5 J.)', 'alter Bock (6+ J.)']),
    w('Ricke', ['Rickenkitz', 'Schmalreh', 'Ricke', 'junge Ricke (2–3 J.)', 'alte Ricke (6+ J.)']),
    u(['Kitz', 'Reh (unbestimmt)']),
  ],
  schwarzwild: [
    m('Keiler', ['Frischlingskeiler', 'Überläuferkeiler', 'Keiler', 'angehender Keiler (2–4 J.)', 'Hauptschwein (5–7 J.)', 'alter Keiler (8+ J.)']),
    w('Bache', ['Frischlingsbache', 'Überläuferbache', 'Bache', 'führende Bache', 'Leitbache']),
    u(['Frischling', 'Überläufer', 'Sau (unbestimmt)']),
  ],
  rotwild: [
    m('Hirsch', ['Hirschkalb', 'Spießer', 'Hirsch', 'junger Hirsch (2–4 J.)', 'mittelalter Hirsch (5–9 J.)', 'alter Hirsch (10+ J.)']),
    w('Tier', ['Wildkalb', 'Schmaltier', 'Alttier', 'führendes Alttier']),
    u(['Kalb', 'Rotwild (unbestimmt)']),
  ],
  damwild: [
    m('Hirsch', ['Hirschkalb', 'Spießer', 'Hirsch', 'Knieper (2 J.)', 'Löffler (3 J.)', 'Halbschaufler (4 J.)', 'Schaufler (5+ J.)']),
    w('Tier', ['Wildkalb', 'Schmaltier', 'Alttier', 'führendes Alttier']),
    u(['Kalb', 'Damwild (unbestimmt)']),
  ],
  fuchs: [m('Rüde', ['Jungrüde', 'Rüde', 'alter Rüde']), w('Fähe', ['Jungfähe', 'Fähe', 'alte Fähe']), u(['Jungfuchs', 'Fuchs (unbestimmt)'])],
  dachs: [m('Rüde', ['Jungrüde', 'Rüde']), w('Fähe', ['Jungfähe', 'Fähe']), u(['Jungdachs', 'Altdachs'])],
  waschbaer: [m('Rüde', ['Jungrüde', 'Rüde']), w('Fähe', ['Jungfähe', 'Fähe']), u(['Jung', 'Alt'])],
  hase: [m('Rammler', ['Rammler']), w('Häsin', ['Häsin']), u(['Jung', 'Alt'])],
  wildgaense: [
    { label: 'Art', classes: ['Graugans', 'Kanadagans', 'Nilgans', 'Blässgans', 'Saatgans', 'Nonnengans', 'Ringelgans', 'Gans (unbestimmt)'] },
    { label: 'Alter', classes: ['Altvogel', 'Jungvogel'] },
  ],
  wildenten: [
    { label: 'Art', classes: ['Stockente', 'Krickente', 'Pfeifente', 'Reiherente', 'Tafelente', 'Schellente', 'Ente (unbestimmt)'] },
    { label: 'Geschlecht', classes: ['Erpel', 'Ente'] },
  ],
}

/**
 * Klassen einer Wildart als Gruppen. Eigene Wildarten (oder geänderte Klassen im Wildarten-Editor):
 * Klassen, die nicht im Baum stehen, kommen in eine Gruppe „Klasse“ bzw. „Weitere“.
 */
export function classTree(sp: Pick<Species, 'id' | 'sexAge'> | undefined): ClassGroup[] {
  if (!sp) return []
  const tree = CLASS_TREES[sp.id] ?? []
  const known = new Set(tree.flatMap((g) => g.classes))
  const extra = sp.sexAge.filter((c) => c.trim() && !known.has(c))
  if (!extra.length) return tree
  return [...tree, { label: tree.length ? 'Weitere' : 'Klasse', classes: [...extra, ...(tree.length ? [] : ['unbekannt'])] }]
}

/** Alle Klassen einer Wildart (flach, z. B. für die KI beim Foto-Import) */
export const allClasses = (sp: Pick<Species, 'id' | 'sexAge'> | undefined) => [...new Set(classTree(sp).flatMap((g) => g.classes))]

/** Gruppe, zu der eine Klasse gehört (für die Anzeige der gewählten Stufe) */
export const groupOf = (tree: ClassGroup[], cls: string) => tree.findIndex((g) => g.classes.includes(cls))
