// Eigene Rückfrage statt window.confirm(): Manche Umgebungen (In-App-Browser, eingebettete
// Fenster) unterdrücken die Browser-Rückfrage und antworten sofort mit „Nein“ – dann
// passierte beim Löschen einfach nichts. Aufruf überall: `if (!(await ask('…'))) return`.
import { useEffect, useState } from 'react'

interface AskOptions {
  /** Text des Bestätigen-Knopfs (Standard: „Löschen“ bei Löschfragen, sonst „Ja“) */
  ok?: string
  /** Text des Abbrechen-Knopfs */
  cancel?: string
  /** Rot hervorheben (Standard: bei Lösch-/Verwerfen-Fragen) */
  danger?: boolean
}

interface Request extends Required<AskOptions> {
  text: string
  resolve: (yes: boolean) => void
}

let show: ((r: Request) => void) | null = null

export function ask(text: string, opts: AskOptions = {}): Promise<boolean> {
  const destructive = /lösch|verwerf/i.test(text)
  return new Promise((resolve) => {
    const req: Request = {
      text,
      ok: opts.ok ?? (destructive ? 'Löschen' : 'Ja'),
      cancel: opts.cancel ?? 'Abbrechen',
      danger: opts.danger ?? destructive,
      resolve,
    }
    // Ohne eingebundenen Dialog (z. B. in Tests) auf die Browser-Rückfrage zurückfallen
    if (show) show(req)
    else resolve(typeof window !== 'undefined' && window.confirm(text))
  })
}

/** Einmal in App.tsx einbinden */
export function ConfirmHost() {
  const [queue, setQueue] = useState<Request[]>([])
  useEffect(() => {
    show = (r) => setQueue((q) => [...q, r])
    return () => {
      show = null
    }
  }, [])
  const cur = queue[0]
  if (!cur) return null
  const answer = (yes: boolean) => {
    cur.resolve(yes)
    setQueue((q) => q.slice(1))
  }
  return (
    <div
      className="fixed inset-0 z-[6000] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={() => answer(false)}
    >
      <div className="pb-safe w-full max-w-md rounded-2xl border border-line bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <p className="mb-4 whitespace-pre-line text-lg">{cur.text}</p>
        <div className="flex gap-2">
          <button className="btn flex-1" onClick={() => answer(false)} autoFocus>
            {cur.cancel}
          </button>
          <button className={`btn flex-1 ${cur.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => answer(true)}>
            {cur.ok}
          </button>
        </div>
      </div>
    </div>
  )
}
