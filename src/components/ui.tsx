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
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[3000] flex flex-col items-center gap-2 p-3 pt-safe">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`max-w-md rounded-xl border px-4 py-3 text-base font-medium shadow-xl ${
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
