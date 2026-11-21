// Jahreskalender als Balken: eine Zeile je Phase, Monate als Raster, heute als Linie.
import { dayOfYear, fmtMonthDay, todayMonthDay, yearSegments, type KnowStatus } from '../domain/knowledge'

export interface YearBarRow {
  id: string
  label: string
  from: string
  to: string
  status: KnowStatus
  active?: boolean
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const monthStart = (m: number) => (dayOfYear(`${String(m).padStart(2, '0')}-01`) / 365) * 100

export function YearBar({ rows, onPick }: { rows: YearBarRow[]; onPick?: (id: string) => void }) {
  const today = (dayOfYear(todayMonthDay()) / 365) * 100
  if (!rows.length) return <p className="text-sm text-ink-dim">Keine Phasen eingetragen.</p>
  return (
    <div className="text-sm">
      {/* Monatsleiste */}
      <div className="flex">
        <div className="w-[38%] shrink-0" />
        <div className="relative h-5 flex-1 text-[11px] text-ink-dim">
          {MONTHS.map((m, i) => (
            <span key={i} className="absolute top-0 -translate-x-1/2" style={{ left: `${monthStart(i + 1) + 100 / 24}%` }}>
              {m}
            </span>
          ))}
        </div>
      </div>
      {rows.map((r) => (
        <button
          key={r.id}
          type="button"
          className="flex w-full items-center py-0.5 text-left"
          onClick={() => onPick?.(r.id)}
          title={`${r.label}: ${fmtMonthDay(r.from)}–${fmtMonthDay(r.to)}`}
        >
          <span className={`w-[38%] shrink-0 truncate pr-2 ${r.active === false ? 'text-ink-dim line-through' : ''}`}>{r.label}</span>
          <span className="relative h-5 flex-1 overflow-hidden rounded bg-panel-2">
            {Array.from({ length: 11 }, (_, i) => (
              <span key={i} className="absolute inset-y-0 w-px bg-line" style={{ left: `${monthStart(i + 2)}%` }} />
            ))}
            {yearSegments(r.from, r.to).map(([a, b], i) => (
              <span
                key={i}
                className={`absolute inset-y-0.5 rounded-sm ${
                  r.active === false ? 'bg-line' : r.status === 'geprueft' ? 'bg-good' : 'bg-hint/70'
                }`}
                style={{ left: `${a * 100}%`, width: `${Math.max(0.8, (b - a) * 100)}%` }}
              />
            ))}
            <span className="absolute inset-y-0 w-0.5 bg-warn" style={{ left: `${today}%` }} aria-hidden />
          </span>
        </button>
      ))}
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-dim">
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-hint/70" />
          Vorschlag – ungeprüft
        </span>
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-good" />
          geprüft
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-0.5 bg-warn" />
          heute
        </span>
      </p>
    </div>
  )
}
