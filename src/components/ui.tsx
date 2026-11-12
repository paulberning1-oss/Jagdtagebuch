import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

// ---------- Bottom-Sheet: Panel, das von unten über die Karte fährt ----------

export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: ReactNode
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-[1000] flex max-h-[55%] flex-col rounded-t-3xl border-t border-line bg-panel shadow-2xl">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <h2 className="flex-1 truncate text-xl font-bold">{title}</h2>
        {onClose && (
          <button className="btn-round !size-12" onClick={onClose} aria-label="Schließen">
            <X />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      {footer && <div className="flex gap-2 border-t border-line px-4 py-3">{footer}</div>}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

// ---------- Kurze Meldungen ("Toasts") ----------

type ToastKind = 'info' | 'error' | 'success'
interface Toast {
  id: number
  text: string
  kind: ToastKind
}
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const show = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5000 : 3000)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[3000] flex flex-col items-center gap-2 p-3 pt-safe">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
            className={`pointer-events-auto max-w-md rounded-xl border px-4 py-3 text-base font-medium shadow-xl ${
              t.kind === 'error'
                ? 'border-warn bg-[#3a1a12] text-ink'
                : t.kind === 'success'
                  ? 'border-good bg-[#14301a] text-ink'
                  : 'border-line bg-panel text-ink'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

// ---------- Auswahl-Chips (große Tipp-Flächen) ----------

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-12 rounded-full border px-4 text-base font-semibold transition active:scale-95 ${
        active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-panel-2 text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** Einfach- oder Mehrfachauswahl als Chips */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  multi = false,
}: {
  options: { id: T; label: string }[]
  value: T[]
  onChange: (v: T[]) => void
  multi?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value.includes(o.id)
        return (
          <Chip
            key={o.id}
            active={active}
            onClick={() => {
              if (multi) onChange(active ? value.filter((v) => v !== o.id) : [...value, o.id])
              else onChange(active ? [] : [o.id])
            }}
          >
            {o.label}
          </Chip>
        )
      })}
    </div>
  )
}

/** Zähler mit großen − / + Knöpfen */
export function Stepper({ value, onChange, min = 1 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" className="btn !size-14 !px-0 text-2xl" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Anzahl verringern">
        −
      </button>
      <span className="min-w-12 text-center text-3xl font-bold">{value}</span>
      <button type="button" className="btn !size-14 !px-0 text-2xl" onClick={() => onChange(value + 1)} aria-label="Anzahl erhöhen">
        +
      </button>
    </div>
  )
}

/** Bewertung 1–5 mit großen Sternen */
export function Stars({ value, onChange, size = 'lg' }: { value: number | null; onChange?: (v: number | null) => void; size?: 'lg' | 'sm' }) {
  const cls = size === 'lg' ? 'text-4xl min-w-12 min-h-12' : 'text-base'
  return (
    <div className="flex gap-1" role={onChange ? 'radiogroup' : undefined} aria-label="Bewertung">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value != null && n <= value
        const star = <span className={on ? 'text-accent' : 'text-line'}>★</span>
        return onChange ? (
          <button
            type="button"
            key={n}
            className={`${cls} leading-none`}
            aria-label={`${n} von 5`}
            onClick={() => onChange(value === n ? null : n)}
          >
            {star}
          </button>
        ) : (
          <span key={n} className={cls}>
            {star}
          </span>
        )
      })}
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-dim">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Zahlenfeld, das Komma UND Punkt akzeptiert ("32,5").
 * type="number" verschluckt auf dem iPhone mit deutscher Tastatur teils das Komma.
 */
export function DecimalInput({
  value,
  onChange,
  ...rest
}: {
  value: number | null
  onChange: (v: number | null) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', ','))
  return (
    <input
      {...rest}
      className="input"
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.,]/g, '')
        setText(t)
        const n = Number(t.replace(',', '.'))
        onChange(t === '' || isNaN(n) ? null : n)
      }}
    />
  )
}
