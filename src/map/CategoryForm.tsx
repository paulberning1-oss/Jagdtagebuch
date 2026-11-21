// Eigene Kategorie anlegen oder bearbeiten (z. B. „Hochwasserrinne“, „Holzpolter“).
import { ask } from '../components/ConfirmDialog'
import { Check, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Chip, useToast } from '../components/ui'
import { db } from '../db/db'
import { trashCategory } from '../db/trash'
import { OBJECT_COLORS, type Category, type GeometryKind, type ScentSensitivity } from '../domain/facilityTypes'
import { newId } from '../lib/id'

const KINDS: { id: GeometryKind; label: string }[] = [
  { id: 'point', label: 'Punkt' },
  { id: 'line', label: 'Linie' },
  { id: 'area', label: 'Fläche' },
]
const SCENT: { id: 'warn' | 'hint' | 'none'; label: string }[] = [
  { id: 'warn', label: 'Warnen' },
  { id: 'hint', label: 'Hinweis' },
  { id: 'none', label: 'Egal' },
]

export function CategoryForm({
  initial,
  presetKind,
  onSaved,
  onCancel,
}: {
  initial?: Category
  presetKind?: GeometryKind
  onSaved: (c: Category) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [label, setLabel] = useState(initial?.label ?? '')
  const [kinds, setKinds] = useState<GeometryKind[]>(initial?.kinds ?? [presetKind ?? 'point'])
  const [color, setColor] = useState(initial?.color ?? OBJECT_COLORS[6])
  const [scent, setScent] = useState<ScentSensitivity>(initial?.scent ?? null)
  const [hasCrop, setHasCrop] = useState(initial?.hasCrop ?? false)

  const save = async () => {
    if (!label.trim()) return toast('Bitte einen Namen eingeben', 'error')
    if (!kinds.length) return toast('Bitte mindestens Punkt, Linie oder Fläche wählen', 'error')
    const c: Category = {
      id: initial?.id ?? `k_${newId()}`,
      label: label.trim(),
      kinds: KINDS.map((k) => k.id).filter((k) => kinds.includes(k)),
      color,
      scent,
      hasCrop: hasCrop && kinds.includes('area'),
      order: initial?.order ?? Date.now(),
      createdAt: initial?.createdAt ?? Date.now(),
    }
    await db.categories.put(c)
    toast(initial ? 'Kategorie gespeichert' : 'Kategorie angelegt', 'success')
    onSaved(c)
  }

  const remove = async () => {
    if (!initial) return
    const used = await db.facilities.where('type').equals(initial.id).count()
    if (used) return toast(`Wird noch von ${used} Objekt(en) genutzt – erst diese löschen oder umstellen.`, 'error')
    if (!await ask(`Kategorie „${initial.label}“ löschen?\n\n30 Tage lang wiederherstellbar unter „Mehr → Zuletzt gelöscht“.`)) return
    await trashCategory(initial)
    onCancel()
  }

  return (
    <div>
      <label className="mb-4 block">
        <span className="label">Name der Kategorie</span>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Holzpolter, Hochwasserrinne" autoFocus />
      </label>

      <span className="label">Zeichnen als</span>
      <div className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Chip
            key={k.id}
            active={kinds.includes(k.id)}
            onClick={() => setKinds(kinds.includes(k.id) ? kinds.filter((x) => x !== k.id) : [...kinds, k.id])}
          >
            {k.label}
          </Chip>
        ))}
      </div>

      <span className="label">Farbe</span>
      <div className="mb-4 grid grid-cols-6 gap-2">
        {OBJECT_COLORS.map((c) => (
          <button
            key={c}
            aria-label={`Farbe ${c}`}
            className={`flex h-11 items-center justify-center rounded-xl border-2 ${color === c ? 'border-ink' : 'border-transparent'}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
          >
            {color === c && <Check className="size-5 text-black" />}
          </button>
        ))}
      </div>

      <span className="label">Zieht meine Witterung hierüber …</span>
      <div className="mb-1 flex flex-wrap gap-2">
        {SCENT.map((s) => (
          <Chip key={s.id} active={(scent ?? 'none') === s.id} onClick={() => setScent(s.id === 'none' ? null : s.id)}>
            {s.label}
          </Chip>
        ))}
      </div>
      <p className="mb-4 text-sm text-ink-dim">„Warnen“ z. B. bei Einständen und Wechseln, „Hinweis“ bei Äsung. Wird beim Wind-Check und vom Assistenten genutzt.</p>

      {kinds.includes('area') && (
        <label className="mb-4 flex items-center gap-3">
          <input type="checkbox" className="size-6 accent-[#d4a72c]" checked={hasCrop} onChange={(e) => setHasCrop(e.target.checked)} />
          <span>Feld „Feldfrucht“ anbieten (Agrarfläche)</span>
        </label>
      )}

      <div className="flex gap-2">
        {initial && (
          <button className="btn btn-danger" onClick={remove} aria-label="Kategorie löschen">
            <Trash2 />
          </button>
        )}
        <button className="btn flex-1" onClick={onCancel}>
          Abbrechen
        </button>
        <button className="btn btn-primary flex-1" onClick={save}>
          Speichern
        </button>
      </div>
    </div>
  )
}
