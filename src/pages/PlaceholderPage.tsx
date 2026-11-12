import type { ReactNode } from 'react'

export default function PlaceholderPage({ title, phase, children }: { title: string; phase: number; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto p-4 pt-safe">
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <div className="card">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent">Kommt in Phase {phase}</p>
        <p className="text-ink-dim">{children}</p>
      </div>
    </div>
  )
}
