// Klassen-Auswahl in Stufen: Geschlecht (bzw. Art) → Klasse mit Alter. Für Sichtungen (mehrere) und Erlegungen (eine).
import { X } from 'lucide-react'
import { useState } from 'react'
import type { Species } from '../domain/species'
import { classTree, groupOf } from '../domain/speciesClasses'
import { Chip } from './ui'

export function ClassPicker({
  species,
  value,
  onChange,
  multi = true,
}: {
  species: Species | undefined
  value: string[]
  onChange: (v: string[]) => void
  /** mehrere Klassen (Sichtung: z. B. Ricke + Kitz) oder genau eine (Erlegung) */
  multi?: boolean
}) {
  const tree = classTree(species)
  // Geöffnete Stufe: die der ersten gewählten Klasse, sonst keine (erst Geschlecht wählen)
  const [open, setOpen] = useState<number | null>(() => {
    const i = value.length ? groupOf(tree, value[0]) : -1
    return i >= 0 ? i : tree.length === 1 ? 0 : null
  })
  if (!tree.length) return <p className="text-sm text-ink-dim">Für diese Wildart sind keine Klassen hinterlegt (Mehr → Wildarten).</p>

  const toggle = (c: string) => {
    if (!multi) return onChange(value[0] === c ? [] : [c])
    onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c])
  }
  const count = (i: number) => value.filter((v) => tree[i].classes.includes(v)).length
  const firstIsGender = tree[0]?.label.startsWith('männlich')

  return (
    <div>
      {tree.length > 1 && (
        <>
          <p className="mb-2 text-sm text-ink-dim">{firstIsGender ? '1. Geschlecht' : '1. Auswahl'}</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {tree.map((g, i) => (
              <Chip key={g.label} active={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {g.label}
                {count(i) > 0 && <span className="ml-1 rounded-full bg-bg/30 px-1.5 text-sm">{count(i)}</span>}
              </Chip>
            ))}
          </div>
        </>
      )}
      {open != null && tree[open] && (
        <div className="mb-3 rounded-xl border border-line bg-panel p-3">
          {tree.length > 1 && <p className="mb-2 text-sm text-ink-dim">2. {firstIsGender ? 'Alter / Klasse' : tree[open].label}</p>}
          <div className="flex flex-wrap gap-2">
            {tree[open].classes.map((c) => (
              <Chip key={c} active={value.includes(c)} onClick={() => toggle(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {value.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-dim">Gewählt:</span>
          {value.map((c) => (
            <button key={c} className="badge border-accent/60 !py-1 text-accent" onClick={() => onChange(value.filter((x) => x !== c))} aria-label={`${c} entfernen`}>
              {c} <X className="size-3.5" />
            </button>
          ))}
        </div>
      )}
      {multi && tree.length > 1 && <p className="mt-2 text-xs text-ink-dim">Mehrere möglich{firstIsGender ? ', z. B. Ricke und Kitz' : ', z. B. Art und Geschlecht'}.</p>}
    </div>
  )
}
