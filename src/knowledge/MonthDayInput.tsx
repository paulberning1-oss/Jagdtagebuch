// Tag + Monat ohne Jahr (für Kalender-Phasen und Jagdzeiten), Wert als „MM-TT“.
import { daysInMonth, mmdd } from '../domain/knowledge'

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export function MonthDayInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [m, d] = value.split('-').map(Number)
  return (
    <div className="flex gap-2" role="group" aria-label={label}>
      <select className="input !w-24" value={d} aria-label={`${label}: Tag`} onChange={(e) => onChange(mmdd(m, Number(e.target.value)))}>
        {Array.from({ length: daysInMonth(m) }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}.
          </option>
        ))}
      </select>
      <select className="input flex-1" value={m} aria-label={`${label}: Monat`} onChange={(e) => onChange(mmdd(Number(e.target.value), d))}>
        {MONTH_NAMES.map((name, i) => (
          <option key={i + 1} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}
