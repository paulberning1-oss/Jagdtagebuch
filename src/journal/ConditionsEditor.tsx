// „Bedingungen“ im Ansitz-Formular: automatisch geholte Werte anzeigen und von Hand korrigieren.
// Korrekturen landen in `hunt.overrides` – die Messwerte in `hunt.env` bleiben unverändert erhalten.
import { Pencil, RotateCcw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Chip, DecimalInput } from '../components/ui'
import { effectiveEnv, type Hunt, type HuntOverrides, type PressureTrend } from '../domain/hunt'
import { COMPASS_8, compass16 } from '../lib/geo'
import { fmtTime, fromBerlinLocal, toBerlinDate, toBerlinLocal } from '../lib/time'

const n1 = (x: number | null | undefined) => (x == null ? '–' : x.toLocaleString('de-DE', { maximumFractionDigits: 1 }))
const TRENDS: PressureTrend[] = ['steigend', 'gleichbleibend', 'fallend']

export function ConditionsEditor({ h, onChange }: { h: Hunt; onChange: (o: HuntOverrides) => void }) {
  const [editing, setEditing] = useState(false)
  const env = effectiveEnv(h)
  const o = h.overrides ?? {}
  const w = env?.weather
  const set = (patch: Partial<HuntOverrides>) => onChange({ ...o, ...patch })
  const reset = (key: keyof HuntOverrides) => {
    const next = { ...o }
    delete next[key]
    onChange(next)
  }
  const manual = (k: keyof HuntOverrides) => o[k] !== undefined && o[k] !== null
  const day = toBerlinDate(new Date(h.start))
  const timeOf = (t: number | null | undefined) => (t ? toBerlinLocal(new Date(t)).slice(11, 16) : '')
  const fromTime = (hhmm: string) => (hhmm ? fromBerlinLocal(`${day}T${hhmm}`).getTime() : null)

  if (!env) return <p className="text-ink-dim">Bedingungen werden berechnet…</p>

  return (
    <div className="card">
      {h.weatherStatus === 'pending' && !w && <p className="mb-2 text-sm text-hint">Wetter wird geladen, sobald Internet da ist.</p>}

      <Row k="Sonne" manual={manual('sunrise') || manual('sunset')}>
        Aufgang {env.sun.sunrise ? fmtTime(new Date(env.sun.sunrise)) : '–'} · Untergang {env.sun.sunset ? fmtTime(new Date(env.sun.sunset)) : '–'} Uhr
      </Row>
      <Row k="Mond" manual={manual('moonIllumination') || manual('moonUp')}>
        {env.moon.illumination} % beleuchtet · {env.moon.upDuringHunt ? 'am Himmel' : 'nicht am Himmel'}
      </Row>
      <Row k="Temperatur" manual={manual('temperature')}>
        {n1(w?.temperature)} °C
      </Row>
      <Row k="Wind" manual={manual('windDirection') || manual('windSpeed')}>
        {w?.windDirectionAvg != null || w?.windDirection != null ? `aus ${compass16((w?.windDirectionAvg ?? w?.windDirection)!)}` : '–'} ·{' '}
        {n1(w?.windSpeedAvg ?? w?.windSpeed)} km/h
      </Row>
      <Row k="Luftfeuchte" manual={manual('humidity')}>
        {n1(w?.humidity)} %
      </Row>
      <Row k="Luftdruck" manual={manual('pressure') || manual('pressureTrend')}>
        {n1(w?.pressure)} hPa{w?.pressureTrend ? `, ${w.pressureTrend}` : ''}
      </Row>
      <Row k="Niederschlag" manual={manual('precipitation')}>
        {n1(w?.precipitation)} mm
      </Row>

      <button className="btn mt-3 w-full !min-h-12 !text-base" onClick={() => setEditing(!editing)}>
        <Pencil className="size-5" /> {editing ? 'Fertig mit Ändern' : 'Werte ändern'}
      </button>

      {editing && (
        <div className="mt-4 grid gap-4 border-t border-line pt-4">
          <Field label="Sonnenaufgang / -untergang" onReset={manual('sunrise') || manual('sunset') ? () => onChange(omit(o, 'sunrise', 'sunset')) : undefined}>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" type="time" value={timeOf(env.sun.sunrise)} onChange={(e) => set({ sunrise: fromTime(e.target.value) })} />
              <input className="input" type="time" value={timeOf(env.sun.sunset)} onChange={(e) => set({ sunset: fromTime(e.target.value) })} />
            </div>
          </Field>
          <Field label="Mondbeleuchtung (%)" onReset={manual('moonIllumination') ? () => reset('moonIllumination') : undefined}>
            <DecimalInput value={env.moon.illumination} onChange={(v) => set({ moonIllumination: v == null ? null : Math.max(0, Math.min(100, Math.round(v))) })} />
          </Field>
          <Field label="Mond am Himmel?" onReset={manual('moonUp') ? () => reset('moonUp') : undefined}>
            <div className="flex gap-2">
              <Chip active={env.moon.upDuringHunt} onClick={() => set({ moonUp: true })}>
                Ja
              </Chip>
              <Chip active={!env.moon.upDuringHunt} onClick={() => set({ moonUp: false })}>
                Nein
              </Chip>
            </div>
          </Field>
          <Field label="Temperatur (°C)" onReset={manual('temperature') ? () => reset('temperature') : undefined}>
            <DecimalInput value={w?.temperature ?? null} onChange={(v) => set({ temperature: v })} />
          </Field>
          <Field label="Wind – woher?" onReset={manual('windDirection') ? () => reset('windDirection') : undefined}>
            <div className="grid grid-cols-4 gap-2">
              {COMPASS_8.map((c, i) => {
                const cur = w?.windDirectionAvg ?? w?.windDirection
                return (
                  <button key={c} className={`btn !min-h-11 !px-0 ${cur != null && compass16(cur) === compass16(i * 45) ? 'btn-primary' : ''}`} onClick={() => set({ windDirection: i * 45 })}>
                    {c}
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="Windstärke (km/h)" onReset={manual('windSpeed') ? () => reset('windSpeed') : undefined}>
            <DecimalInput value={w?.windSpeedAvg ?? w?.windSpeed ?? null} onChange={(v) => set({ windSpeed: v })} />
          </Field>
          <Field label="Luftfeuchtigkeit (%)" onReset={manual('humidity') ? () => reset('humidity') : undefined}>
            <DecimalInput value={w?.humidity ?? null} onChange={(v) => set({ humidity: v })} />
          </Field>
          <Field label="Luftdruck (hPa) und Tendenz" onReset={manual('pressure') || manual('pressureTrend') ? () => onChange(omit(o, 'pressure', 'pressureTrend')) : undefined}>
            <DecimalInput value={w?.pressure ?? null} onChange={(v) => set({ pressure: v })} />
            <div className="mt-2 flex flex-wrap gap-2">
              {TRENDS.map((t) => (
                <Chip key={t} active={w?.pressureTrend === t} onClick={() => set({ pressureTrend: t })}>
                  {t}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Niederschlag (mm)" onReset={manual('precipitation') ? () => reset('precipitation') : undefined}>
            <DecimalInput value={w?.precipitation ?? null} onChange={(v) => set({ precipitation: v })} />
          </Field>
          <p className="text-sm text-ink-dim">Von Hand geänderte Werte sind mit „von Hand“ markiert. Die gemessenen Werte bleiben gespeichert – ↺ stellt sie wieder her.</p>
        </div>
      )}
    </div>
  )
}

function omit(o: HuntOverrides, ...keys: (keyof HuntOverrides)[]): HuntOverrides {
  const next = { ...o }
  for (const k of keys) delete next[k]
  return next
}

function Row({ k, manual, children }: { k: string; manual: boolean; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-line/50 py-1.5 last:border-0">
      <span className="w-28 shrink-0 text-sm text-ink-dim">{k}</span>
      <span className="flex-1">{children}</span>
      {manual && <span className="shrink-0 rounded-full border border-accent/60 px-2 text-xs text-accent">von Hand</span>}
    </div>
  )
}

function Field({ label, onReset, children }: { label: string; onReset?: () => void; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="label !mb-0 flex-1">{label}</span>
        {onReset && (
          <button className="flex items-center gap-1 text-sm text-accent underline" onClick={onReset}>
            <RotateCcw className="size-4" /> Messwert
          </button>
        )}
      </div>
      {children}
    </div>
  )
}
