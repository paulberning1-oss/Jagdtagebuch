// Gemeinsamer Baustein für Mehrfachauswahl in Listen („Auswählen“ → antippen → „Löschen (n)“).
// Gelöschtes landet immer in „Mehr → Zuletzt gelöscht“.
import { ListChecks, Square, SquareCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ask } from './ConfirmDialog'

export interface Selection {
  selecting: boolean
  sel: Set<string>
  start: () => void
  stop: () => void
  toggle: (k: string) => void
  setMany: (keys: string[], on: boolean) => void
}

export function useSelection(): Selection {
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  return {
    selecting,
    sel,
    start: () => setSelecting(true),
    stop: () => {
      setSelecting(false)
      setSel(new Set())
    },
    toggle: (k) => setSel((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k]))),
    setMany: (keys, on) => setSel((s) => (on ? new Set([...s, ...keys]) : new Set([...s].filter((x) => !keys.includes(x))))),
  }
}

/** Knopf „Auswählen“ (außerhalb des Auswahlmodus) */
export function SelectButton({ s, className = '' }: { s: Selection; className?: string }) {
  return (
    <button className={`btn !min-h-11 !px-3 !text-base ${className}`} onClick={s.start}>
      <ListChecks className="size-5" /> Auswählen
    </button>
  )
}

/** Schnellauswahl: alles / alle Beispiel-Einträge */
export function SelectToolbar({ s, allKeys, demoKeys }: { s: Selection; allKeys: string[]; demoKeys: string[] }) {
  const allOn = allKeys.length > 0 && allKeys.every((k) => s.sel.has(k))
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <button className="btn !min-h-11 !px-3 !text-base" onClick={() => s.setMany(allKeys, !allOn)}>
        {allOn ? 'Nichts auswählen' : `Alles auswählen (${allKeys.length})`}
      </button>
      {demoKeys.length > 0 && (
        <button className="btn !min-h-11 !px-3 !text-base" onClick={() => s.setMany(demoKeys, true)}>
          Alle Beispiel-Einträge ({demoKeys.length})
        </button>
      )}
    </div>
  )
}

/** Kästchen vor einem Eintrag */
export function SelectCheck({ on }: { on: boolean }) {
  return on ? <SquareCheck className="shrink-0 text-accent" /> : <Square className="shrink-0 text-ink-dim" />
}

/** Abbrechen / Löschen (n) – für den Fuß eines Panels oder eine Leiste */
export function SelectActions({ s, onDelete }: { s: Selection; onDelete: () => void }) {
  return (
    <>
      <button className="btn flex-1" onClick={s.stop}>
        Abbrechen
      </button>
      <button className="btn btn-danger flex-1" disabled={!s.sel.size} onClick={onDelete}>
        <Trash2 /> Löschen ({s.sel.size})
      </button>
    </>
  )
}

/** Sicherheitsfrage vor dem Löschen */
export const confirmTrash = (n: number, extra = '') =>
  ask(`${n} ${n === 1 ? 'Eintrag' : 'Einträge'} löschen?${extra ? `\n\n${extra}` : ''}\n\nDu kannst sie 30 Tage lang unter „Mehr → Zuletzt gelöscht“ wiederherstellen.`)

export const TRASH_HINT = 'wiederherstellen unter „Mehr → Zuletzt gelöscht“'
