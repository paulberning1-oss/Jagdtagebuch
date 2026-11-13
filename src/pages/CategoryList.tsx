// „Mehr → Kategorien“: eigene Kategorien ansehen, bearbeiten, anlegen.
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { db } from '../db/db'
import { FACILITY_TYPES, type Category } from '../domain/facilityTypes'
import { CategoryForm } from '../map/CategoryForm'

const KIND_LABEL = { point: 'Punkt', line: 'Linie', area: 'Fläche' } as const

export function CategoryList() {
  const cats = useLiveQuery(() => db.categories.orderBy('order').toArray(), []) ?? []
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>()
    for (const f of await db.facilities.toArray()) m.set(f.type, (m.get(f.type) ?? 0) + 1)
    return m
  }, [])
  const [editing, setEditing] = useState<Category | 'neu' | null>(null)

  if (editing) {
    return (
      <CategoryForm
        initial={editing === 'neu' ? undefined : editing}
        onSaved={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <>
      {!cats.length && <p className="mb-3 text-ink-dim">Noch keine eigenen Kategorien.</p>}
      <div className="mb-3 grid gap-2">
        {cats.map((c) => (
          <button key={c.id} className="btn !justify-start !px-3 text-left" onClick={() => setEditing(c)}>
            <span className="size-6 shrink-0 rounded" style={{ background: c.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{c.label}</span>
              <span className="block text-xs font-normal text-ink-dim">
                {c.kinds.map((k) => KIND_LABEL[k]).join(', ')} · {counts?.get(c.id) ?? 0} Objekt(e)
              </span>
            </span>
            <ChevronRight className="shrink-0 text-ink-dim" />
          </button>
        ))}
      </div>
      <button className="btn w-full" onClick={() => setEditing('neu')}>
        <Plus /> Neue Kategorie
      </button>
      <p className="mt-3 text-sm text-ink-dim">
        Fest eingebaut sind {FACILITY_TYPES.length} Kategorien (Sitze, Kirrung, Wechsel, Fluss/Bach, Graben, Weg, Zaun, Feld/Agrarfläche,
        Neuanpflanzung, Dickung, Einstand, Störquelle …). Eigene kommen hier dazu – auch direkt beim Hinzufügen auf der Karte.
      </p>
    </>
  )
}
