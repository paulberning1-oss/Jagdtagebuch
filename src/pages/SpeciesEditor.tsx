// Wildarten-Liste bearbeiten: umbenennen, Geschlecht/Altersklassen, Farbe, Reihenfolge, neu, löschen.
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '../components/ui'
import { db } from '../db/db'
import { speciesColor, SPECIES_PALETTE, type Species } from '../domain/species'
import { newId } from '../lib/id'

export function SpeciesEditor() {
  const list = useLiveQuery(() => db.species.orderBy('order').toArray(), []) ?? []
  const [open, setOpen] = useState<string | null>(null)
  const toast = useToast()

  const move = async (i: number, dir: -1 | 1) => {
    const a = list[i]
    const b = list[i + dir]
    if (!a || !b) return
    await db.transaction('rw', db.species, async () => {
      await db.species.update(a.id, { order: b.order })
      await db.species.update(b.id, { order: a.order })
    })
  }

  const add = async () => {
    const order = (list[list.length - 1]?.order ?? 0) + 1
    const s: Species = { id: newId(), name: 'Neue Wildart', short: 'NW', order, sexAge: [], color: SPECIES_PALETTE[order % SPECIES_PALETTE.length] }
    await db.species.add(s)
    setOpen(s.id)
  }

  const remove = async (s: Species) => {
    const nS = await db.sightings.where('speciesId').equals(s.id).count()
    const nH = await db.hunts.filter((h) => h.targetSpecies.includes(s.id) || h.kills.some((k) => k.speciesId === s.id)).count()
    if (nS + nH > 0) {
      toast(`„${s.name}“ wird noch in ${nS} Sichtung(en) und ${nH} Ansitz(en) verwendet – nicht gelöscht.`, 'error')
      return
    }
    if (!confirm(`„${s.name}“ löschen?`)) return
    await db.species.delete(s.id)
  }

  return (
    <div>
      <div className="grid gap-2">
        {list.map((s, i) => (
          <div key={s.id} className="rounded-xl border border-line bg-bg">
            <button className="flex min-h-14 w-full items-center gap-3 px-3 text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
              <span className="inline-flex size-8 items-center justify-center rounded-full text-xs font-extrabold text-black" style={{ background: speciesColor(s) }}>
                {s.short}
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{s.name}</span>
                <span className="block text-sm text-ink-dim">{s.sexAge.join(', ') || '–'}</span>
              </span>
              {open === s.id ? <ChevronDown /> : <ChevronRight />}
            </button>
            {open === s.id && <SpeciesForm s={s} onMove={(d) => move(i, d)} onDelete={() => remove(s)} first={i === 0} last={i === list.length - 1} />}
          </div>
        ))}
      </div>
      <button className="btn mt-3 w-full" onClick={add}>
        <Plus /> Wildart hinzufügen
      </button>
    </div>
  )
}

function SpeciesForm({
  s,
  onMove,
  onDelete,
  first,
  last,
}: {
  s: Species
  onMove: (d: -1 | 1) => void
  onDelete: () => void
  first: boolean
  last: boolean
}) {
  const [name, setName] = useState(s.name)
  const [short, setShort] = useState(s.short)
  const [classes, setClasses] = useState(s.sexAge.join(', '))
  const save = (patch: Partial<Species>) => db.species.update(s.id, patch)

  return (
    <div className="border-t border-line p-3">
      <label className="mb-3 block">
        <span className="label">Name</span>
        <input className="input" value={name} onChange={(e) => (setName(e.target.value), save({ name: e.target.value }))} />
      </label>
      <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
        <label>
          <span className="label">Kürzel (Karte)</span>
          <input className="input" maxLength={3} value={short} onChange={(e) => (setShort(e.target.value), save({ short: e.target.value }))} />
        </label>
        <label>
          <span className="label">Farbe</span>
          <input type="color" className="h-14 w-20 rounded-xl border border-line bg-bg" value={speciesColor(s)} onChange={(e) => save({ color: e.target.value })} />
        </label>
      </div>
      <label className="mb-3 block">
        <span className="label">Geschlecht / Altersklassen (mit Komma getrennt)</span>
        <input
          className="input"
          value={classes}
          placeholder="z. B. Bock, Ricke, Kitz"
          onChange={(e) => {
            setClasses(e.target.value)
            save({
              sexAge: e.target.value
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }}
        />
      </label>
      <div className="grid grid-cols-[auto_auto_1fr] gap-2">
        <button className="btn" disabled={first} onClick={() => onMove(-1)} aria-label="nach oben">
          <ArrowUp />
        </button>
        <button className="btn" disabled={last} onClick={() => onMove(1)} aria-label="nach unten">
          <ArrowDown />
        </button>
        <button className="btn btn-danger" onClick={onDelete}>
          <Trash2 /> Löschen
        </button>
      </div>
    </div>
  )
}
