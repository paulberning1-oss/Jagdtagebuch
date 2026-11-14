// „Mehr → Zuletzt gelöscht“: gelöschte Einträge aller Listen wiederherstellen oder endgültig löschen.
import { useLiveQuery } from 'dexie-react-hooks'
import { ArchiveRestore, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { SelectButton, SelectCheck, SelectToolbar, useSelection } from '../components/Selection'
import { useToast } from '../components/ui'
import { db } from '../db/db'
import { childrenOf, daysLeft, purgeTrash, restoreTrash, TRASH_DAYS, type TrashEntry } from '../db/trash'
import { fmtDate, fmtTime } from '../lib/time'

export function TrashSection() {
  const entries = useLiveQuery(() => db.trash.orderBy('deletedAt').reverse().toArray(), []) ?? []
  const toast = useToast()
  const [showAll, setShowAll] = useState(false)
  const sel = useSelection()
  const shown = entries.slice(0, showAll || sel.selecting ? 500 : 5)

  /** Mit dem Eintrag die zugehörigen gleich mit wiederherstellen (Anmarschwege eines Sitzes, Sichtungen eines Ansitzes) */
  const withChildren = (list: TrashEntry[]) => [...new Set(list.flatMap((e) => [e.id, ...childrenOf(entries, e).map((c) => c.id)]))]

  const restore = async (ids: string[]) => {
    const n = await restoreTrash(ids)
    toast(n === 1 ? 'Wiederhergestellt' : `${n} Einträge wiederhergestellt`, 'success')
  }

  const purge = async (ids: string[], all = false) => {
    if (!ids.length) return
    const text = all ? `Alle ${ids.length} Einträge` : `${ids.length} ${ids.length === 1 ? 'Eintrag' : 'Einträge'}`
    if (!confirm(`${text} endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return
    await purgeTrash(ids)
    toast(all ? 'Zuletzt gelöscht ist leer' : 'Endgültig gelöscht')
    sel.stop()
  }

  const selected = entries.filter((e) => sel.sel.has(e.id))

  return (
    <section className="card mb-4">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">{sel.selecting ? `Zuletzt gelöscht · ${sel.sel.size} ausgewählt` : 'Zuletzt gelöscht'}</h2>
        {entries.length > 1 && !sel.selecting && <SelectButton s={sel} />}
      </div>
      <p className="mb-3 text-ink-dim">
        Gelöschte Objekte, Grenzen, Ansitze, Sichtungen, Wildarten und Kategorien bleiben {TRASH_DAYS} Tage hier und lassen sich
        wiederherstellen – auch auf deinen anderen Geräten.
      </p>
      {!entries.length && <p className="text-ink-dim">Nichts gelöscht.</p>}
      {sel.selecting && <SelectToolbar s={sel} allKeys={entries.map((e) => e.id)} demoKeys={entries.filter((e) => e.demo).map((e) => e.id)} />}
      {entries.length > 0 && (
        <>
          <div className="mb-3 grid gap-2">
            {shown.map((e) => {
              const d = new Date(e.deletedAt)
              const on = sel.sel.has(e.id)
              const info = (
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {e.label}
                    {e.demo && <span className="ml-2 text-xs font-normal text-ink-dim">Beispiel</span>}
                  </span>
                  <span className="block text-sm text-ink-dim">
                    {e.kind} · gelöscht {fmtDate(d)}, {fmtTime(d)} · noch {daysLeft(e)} Tag{daysLeft(e) === 1 ? '' : 'e'}
                  </span>
                </span>
              )
              return sel.selecting ? (
                <button
                  key={e.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left ${on ? 'border-accent' : 'border-line'}`}
                  onClick={() => sel.toggle(e.id)}
                  aria-pressed={on}
                >
                  <SelectCheck on={on} />
                  {info}
                </button>
              ) : (
                <div key={e.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  {info}
                  <button className="btn !min-h-11 !px-3 !text-base" onClick={() => restore(withChildren([e]))} aria-label={`${e.label} wiederherstellen`}>
                    <ArchiveRestore className="size-5" /> Zurück
                  </button>
                </div>
              )
            })}
            {entries.length > 5 && !sel.selecting && (
              <button className="text-left text-sm font-semibold text-accent underline" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Weniger anzeigen' : `Alle ${entries.length} anzeigen`}
              </button>
            )}
          </div>
          {sel.selecting ? (
            <div className="grid grid-cols-3 gap-2">
              <button className="btn !px-2 !text-base" onClick={sel.stop}>
                Abbrechen
              </button>
              <button
                className="btn !px-2 !text-base"
                disabled={!selected.length}
                onClick={async () => {
                  await restore(withChildren(selected))
                  sel.stop()
                }}
              >
                <ArchiveRestore className="size-5" /> Zurück
              </button>
              <button className="btn btn-danger !px-2 !text-base" disabled={!selected.length} onClick={() => purge(selected.map((e) => e.id))}>
                <Trash2 className="size-5" /> Endgültig
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn" onClick={() => restore(entries.map((e) => e.id))}>
                <ArchiveRestore /> Alle zurück
              </button>
              <button className="btn btn-danger" onClick={() => purge(entries.map((e) => e.id), true)}>
                <Trash2 /> Leeren
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
