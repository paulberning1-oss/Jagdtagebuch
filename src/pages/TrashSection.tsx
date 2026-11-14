// „Mehr → Zuletzt gelöscht“: gelöschte Objekte und Reviergrenzen wiederherstellen oder endgültig löschen.
import { useLiveQuery } from 'dexie-react-hooks'
import { ArchiveRestore, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '../components/ui'
import { db, type Facility } from '../db/db'
import { daysLeft, purgeTrash, restoreTrash, TRASH_DAYS, type TrashEntry } from '../db/trash'
import { fmtDate, fmtTime } from '../lib/time'

export function TrashSection() {
  const entries = useLiveQuery(() => db.trash.orderBy('deletedAt').reverse().toArray(), []) ?? []
  const toast = useToast()
  const [showAll, setShowAll] = useState(false)
  const shown = entries.slice(0, showAll ? 100 : 5)

  /** Beim Sitz die mitgelöschten Anmarschwege (gleiche Gruppe) gleich mit wiederherstellen */
  const withRoutes = (e: TrashEntry) => [
    e.id,
    ...entries.filter((x) => x.batch === e.batch && x.id !== e.id && (x.item as Facility).standId === e.item.id).map((x) => x.id),
  ]

  const restore = async (ids: string[]) => {
    const n = await restoreTrash(ids)
    toast(n === 1 ? 'Wiederhergestellt' : `${n} Einträge wiederhergestellt`, 'success')
  }

  const purgeAll = async () => {
    if (!confirm(`Alle ${entries.length} Einträge endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return
    await purgeTrash(entries.map((e) => e.id))
    toast('Zuletzt gelöscht ist leer')
  }

  return (
    <section className="card mb-4">
      <h2 className="mb-1 text-lg font-bold">Zuletzt gelöscht</h2>
      <p className="mb-3 text-ink-dim">
        Gelöschte Objekte und Reviergrenzen bleiben {TRASH_DAYS} Tage hier und lassen sich wiederherstellen – auch auf deinen anderen Geräten.
      </p>
      {!entries.length && <p className="text-ink-dim">Nichts gelöscht.</p>}
      {entries.length > 0 && (
        <>
          <div className="mb-3 grid gap-2">
            {shown.map((e) => {
              const d = new Date(e.deletedAt)
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {e.label}
                      {e.demo && <span className="ml-2 text-xs font-normal text-ink-dim">Beispiel</span>}
                    </span>
                    <span className="block text-sm text-ink-dim">
                      {e.kind} · gelöscht {fmtDate(d)}, {fmtTime(d)} · noch {daysLeft(e)} Tag{daysLeft(e) === 1 ? '' : 'e'}
                    </span>
                  </span>
                  <button className="btn !min-h-11 !px-3 !text-base" onClick={() => restore(withRoutes(e))} aria-label={`${e.label} wiederherstellen`}>
                    <ArchiveRestore className="size-5" /> Zurück
                  </button>
                </div>
              )
            })}
            {entries.length > 5 && (
              <button className="text-left text-sm font-semibold text-accent underline" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Weniger anzeigen' : `Alle ${entries.length} anzeigen`}
              </button>
            )}
            {showAll && entries.length > 100 && <p className="text-sm text-ink-dim">… und {entries.length - 100} weitere.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn" onClick={() => restore(entries.map((e) => e.id))}>
              <ArchiveRestore /> Alle zurück
            </button>
            <button className="btn btn-danger" onClick={purgeAll}>
              <Trash2 /> Leeren
            </button>
          </div>
        </>
      )}
    </section>
  )
}
