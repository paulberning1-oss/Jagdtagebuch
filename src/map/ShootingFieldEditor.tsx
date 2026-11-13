// Schussfeld eines Sitzes einstellen: Sektor (von–bis) mit Reichweite oder rundum (360°).
import type { Facility } from '../db/db'
import { DEFAULT_RANGE, DEFAULT_WIDTH, fromStartEnd, ROUND, shootingField } from '../domain/shootingField'
import { COMPASS_8, compass16, normDeg } from '../lib/geo'

type Patch = Partial<Pick<Facility, 'bearing' | 'fieldWidth' | 'fieldRange'>>

export function ShootingFieldEditor({ f, update }: { f: Facility; update: (p: Patch) => void }) {
  const field = shootingField(f)
  const round = (f.fieldWidth ?? DEFAULT_WIDTH) >= ROUND
  const start = field && !field.round ? field.start : null
  const end = field && !field.round ? field.end : null
  const range = f.fieldRange ?? DEFAULT_RANGE

  const setSector = (s: number, e: number) => {
    // Gleicher Start und Ende wäre „rundum“ – im Sektor-Modus dann Standardbreite nehmen
    if (normDeg(e - s) === 0) e = normDeg(s + DEFAULT_WIDTH)
    update(fromStartEnd(s, e))
  }
  const setStart = (s: number) => setSector(s, end ?? normDeg(s + DEFAULT_WIDTH))
  const setEnd = (e: number) => setSector(start ?? normDeg(e - DEFAULT_WIDTH), e)

  return (
    <div className="mb-4 rounded-2xl border border-line p-3">
      <span className="label">Schussfeld</span>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button className={`btn ${!round ? 'btn-primary' : ''}`} onClick={() => round && update({ fieldWidth: DEFAULT_WIDTH })}>
          Sektor
        </button>
        <button className={`btn ${round ? 'btn-primary' : ''}`} onClick={() => update({ fieldWidth: ROUND })}>
          Rundum (360°)
        </button>
      </div>

      {!round && (
        <>
          <p className="mb-3 text-sm text-ink-dim">
            {field
              ? `Von ${compass16(field.start)} (${Math.round(field.start)}°) bis ${compass16(field.end)} (${Math.round(field.end)}°) – ${Math.round(field.width)}° breit, Blick nach ${compass16(field.mid)}.`
              : 'Noch kein Schussfeld festgelegt: Wähle, von welcher bis zu welcher Himmelsrichtung du schießen kannst (im Uhrzeigersinn).'}
          </p>
          <AngleRow label="Von" value={start} onChange={setStart} />
          <AngleRow label="Bis" value={end} onChange={setEnd} />
        </>
      )}

      {(round || field) && (
        <label className="block">
          <span className="label">Reichweite: {range} m</span>
          <input
            type="range"
            className="h-10 w-full accent-[#d4a72c]"
            min={25}
            max={400}
            step={25}
            value={range}
            onChange={(e) => update({ fieldRange: Number(e.target.value) })}
          />
        </label>
      )}

      {(round || field) && (
        <button className="mt-1 text-sm text-ink-dim underline" onClick={() => update({ bearing: null, fieldWidth: DEFAULT_WIDTH })}>
          Schussfeld entfernen
        </button>
      )}
    </div>
  )
}

function AngleRow({ label, value, onChange }: { label: string; value: number | null; onChange: (d: number) => void }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="w-10 text-sm font-semibold">{label}</span>
        <input
          className="input !min-h-11 flex-1 !text-base"
          type="number"
          inputMode="numeric"
          min={0}
          max={359}
          placeholder="Grad"
          value={value == null ? '' : Math.round(value)}
          onChange={(e) => e.target.value !== '' && onChange(normDeg(Number(e.target.value)))}
        />
      </div>
      <div className="grid grid-cols-8 gap-1">
        {COMPASS_8.map((c, i) => (
          <button
            key={c}
            className={`btn !min-h-11 !px-0 !text-sm ${value != null && Math.round(value) === i * 45 ? 'btn-primary' : ''}`}
            onClick={() => onChange(i * 45)}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}
