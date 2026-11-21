// Knopf „Jagdzeiten Niedersachsen übernehmen“: schreibt die Vorlage in die eigene Tabelle.
// Bereits vorhandene Zeilen (gleiche Kennung) bleiben unverändert – eigene Änderungen gehen nicht verloren.
import { Download } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { ask } from '../components/ConfirmDialog'
import { useToast } from '../components/ui'
import { db } from '../db/db'
import { buildNiedersachsenSeasons, NDS_SOURCE_URL } from '../domain/seasonsNiedersachsen'
import { useSpecies } from '../journal/hooks'

export function NdsImport({ compact = false }: { compact?: boolean }) {
  const toast = useToast()
  const species = useSpecies()
  const rows = useMemo(() => buildNiedersachsenSeasons(species), [species])
  const existing = useLiveQuery(() => db.seasons.bulkGet(rows.map((r) => r.id)), [rows])
  if (!existing) return null
  const missing = rows.filter((_, i) => !existing[i])

  if (!missing.length)
    return compact ? (
      <p className="text-sm text-ink-dim">
        ✓ Vorlage Niedersachsen ist übernommen ({rows.length} Zeilen, Quelle{' '}
        <a className="text-accent underline" href={NDS_SOURCE_URL} target="_blank" rel="noreferrer">
          schonzeiten.de
        </a>
        ).
      </p>
    ) : null

  const run = async () => {
    const fresh = missing.length === rows.length
    const ok = await ask(
      `${missing.length} Jagdzeiten für Niedersachsen in deine Tabelle übernehmen?\n\n` +
        'Quelle: schonzeiten.de (Jagdzeiten Niedersachsen 2026, abgerufen am 21.11.2026). ' +
        'Bitte prüfe die Zeiten gegen die DVO-NJagdG – maßgeblich ist das geltende Landesrecht.' +
        (fresh ? '' : `\n\n${rows.length - missing.length} Zeilen sind schon da und bleiben unverändert.`),
      { ok: 'Übernehmen' },
    )
    if (!ok) return
    const now = Date.now()
    await db.seasons.bulkPut(missing.map((s) => ({ ...s, updatedAt: now })))
    toast(`${missing.length} Jagdzeiten übernommen`, 'success')
  }

  return (
    <div>
      <button className="btn btn-primary w-full" onClick={run}>
        <Download /> Jagdzeiten Niedersachsen übernehmen
      </button>
      <p className="mt-1 text-xs text-ink-dim">
        {missing.length === rows.length
          ? `${rows.length} Zeilen aus der Tabelle von `
          : `${missing.length} von ${rows.length} Zeilen fehlen noch (z. B. gelöscht) – Vorlage von `}
        <a className="text-accent underline" href={NDS_SOURCE_URL} target="_blank" rel="noreferrer">
          schonzeiten.de
        </a>
        , danach normal bearbeitbar.
      </p>
    </div>
  )
}
