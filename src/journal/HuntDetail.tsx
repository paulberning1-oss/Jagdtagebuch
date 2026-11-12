// Detailansicht eines Ansitzes mit allen automatisch ermittelten Bedingungen.
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, CloudSun, Loader2, Moon, Navigation, Pencil, RefreshCw, Sunset, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Stars, useToast } from '../components/ui'
import { db } from '../db/db'
import { relText, weatherCodeText } from '../domain/environment'
import { HUNT_TYPES, type Hunt } from '../domain/hunt'
import { navigate } from '../lib/router'
import { fmtDate, fmtTime } from '../lib/time'
import { loadHuntWeather } from '../services/weatherSync'
import { fmtDuration, useSpeciesMap } from './hooks'
import { deleteHunt } from './huntActions'

const n1 = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 1 })
const t = (ms: number | null | undefined) => (ms ? fmtTime(new Date(ms)) : '–')

function Tile({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="card mb-3">
      <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
        {icon} {title}
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">{children}</dl>
    </div>
  )
}
function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt className="text-ink-dim">{k}</dt>
      <dd>{v}</dd>
    </>
  )
}

export function HuntDetail({ id }: { id: string }) {
  const h = useLiveQuery(() => db.hunts.get(id), [id])
  const sightings = useLiveQuery(() => db.sightings.where('huntId').equals(id).sortBy('time'), [id]) ?? []
  const speciesMap = useSpeciesMap()
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  if (h === undefined) return <p className="p-4 text-ink-dim">Lade…</p>
  if (!h) return <p className="p-4 text-ink-dim">Eintrag nicht gefunden.</p>

  const reload = async () => {
    setLoading(true)
    try {
      await loadHuntWeather(h)
      toast('Wetter geladen', 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const remove = async () => {
    if (!confirm('Diesen Ansitz mit allen Sichtungen löschen?')) return
    await deleteHunt(h.id)
    toast('Ansitz gelöscht')
    navigate('tagebuch')
  }

  const w = h.env?.weather
  const sun = h.env?.sun
  const moon = h.env?.moon
  const cal = h.env?.calendar

  return (
    <div className="h-full overflow-y-auto">
      <div className="pt-safe sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-panel/95 px-3 py-2 backdrop-blur">
        <button className="btn-round !size-12" onClick={() => navigate('tagebuch')} aria-label="Zurück">
          <ArrowLeft />
        </button>
        <div className="flex-1">
          <p className="text-lg font-bold leading-tight">{h.standName}</p>
          <p className="text-sm text-ink-dim">{fmtDate(new Date(h.start))}</p>
        </div>
        <button className="btn-round !size-12" onClick={() => navigate('tagebuch', h.id, 'bearbeiten')} aria-label="Bearbeiten">
          <Pencil />
        </button>
      </div>

      <div className="px-4 py-4">
        <div className="card mb-3">
          <p className="text-xl font-bold">
            {t(h.start)}–{t(h.end)} Uhr
            {h.end && <span className="font-normal text-ink-dim"> · {fmtDuration(h.end - h.start)}</span>}
          </p>
          <p className="mb-2 text-ink-dim">
            {HUNT_TYPES.find((x) => x.id === h.huntType)?.label}
            {h.targetSpecies.length > 0 && ` auf ${h.targetSpecies.map((s) => speciesMap.get(s)?.name ?? s).join(', ')}`}
          </p>
          <Stars value={h.rating} size="sm" />
          {h.demo && <p className="mt-2 text-sm text-hint">Testdaten</p>}
        </div>

        <WeatherBlock h={h} loading={loading} onReload={reload} />
        {w && (
          <Tile icon={<CloudSun className="text-accent" />} title="Wetter">
            <Row
              k="Wind"
              v={
                w.windDirection != null ? (
                  <span className="inline-flex items-center gap-2">
                    {/* Pfeil zeigt, wohin der Wind weht */}
                    <Navigation className="size-5 text-accent" style={{ transform: `rotate(${w.windDirection + 180 - 45}deg)` }} />
                    aus {w.windCompass} ({w.windDirection}°), {n1(w.windSpeed ?? 0)} km/h
                  </span>
                ) : (
                  '–'
                )
              }
            />
            {w.windDirectionAvg != null && <Row k="im Mittel" v={`${w.windDirectionAvg}°, ${n1(w.windSpeedAvg ?? 0)} km/h`} />}
            {w.gustsMax != null && <Row k="Böen max." v={`${n1(w.gustsMax)} km/h`} />}
            <Row k="Temperatur" v={w.temperature != null ? `${n1(w.temperature)} °C` : '–'} />
            <Row k="Himmel" v={`${w.cloudCover != null ? `${w.cloudCover} % bewölkt` : '–'}${w.weatherCode != null ? ` · ${weatherCodeText(w.weatherCode)}` : ''}`} />
            <Row k="Luftfeuchte" v={w.humidity != null ? `${w.humidity} %` : '–'} />
            <Row
              k="Luftdruck"
              v={
                w.pressure != null
                  ? `${n1(w.pressure)} hPa, ${w.pressureTrend ?? '–'} (3 h: ${fmtDelta(w.pressureDelta3h)}, 12 h: ${fmtDelta(w.pressureDelta12h)})`
                  : '–'
              }
            />
            <Row k="Niederschlag" v={`${n1(w.precipitation ?? 0)} mm während, ${n1(w.precipitation24h ?? 0)} mm in 24 h davor`} />
            {w.snowDepthCm != null && <Row k="Schneehöhe" v={`${w.snowDepthCm} cm`} />}
            <Row k="Quelle" v={`Open-Meteo (${w.source === 'archive' ? 'Archiv' : 'Wettermodell'})`} />
          </Tile>
        )}

        {sun && (
          <Tile icon={<Sunset className="text-accent" />} title="Sonne">
            <Row k="Aufgang" v={`${t(sun.sunrise)} Uhr`} />
            <Row k="Untergang" v={`${t(sun.sunset)} Uhr`} />
            <Row k="Bürgerl. Dämmerung" v={`${t(sun.civilDawn)} / ${t(sun.civilDusk)} Uhr`} />
            <Row k="Naut. Dämmerung" v={`${t(sun.nauticalDawn)} / ${t(sun.nauticalDusk)} Uhr`} />
            <Row k="Tageszeit" v={sun.period} />
            {sun.period === 'Morgen' ? (
              <>
                <Row k="Beginn" v={relText(sun.startMinFromSunrise, 'Sonnenaufgang')} />
                <Row k="Ende" v={relText(sun.endMinFromSunrise, 'Sonnenaufgang')} />
              </>
            ) : (
              <>
                <Row k="Beginn" v={relText(sun.startMinFromSunset, 'Sonnenuntergang')} />
                <Row k="Ende" v={relText(sun.endMinFromSunset, 'Sonnenuntergang')} />
              </>
            )}
          </Tile>
        )}

        {moon && (
          <Tile icon={<Moon className="text-accent" />} title="Mond">
            <Row k="Phase" v={`${moon.phaseName}, ${moon.illumination} % beleuchtet`} />
            <Row k="Auf-/Untergang" v={`${t(moon.moonrise)} / ${t(moon.moonset)} Uhr`} />
            <Row k="Am Himmel" v={moon.upDuringHunt ? `ja (${moon.upPercent} % der Ansitzzeit)` : 'nein'} />
          </Tile>
        )}

        {cal && (
          <p className="mb-4 text-ink-dim">
            {cal.weekday}, {cal.monthName} · {cal.season}
          </p>
        )}

        <div className="card mb-3">
          <h3 className="mb-2 text-lg font-bold">Anblick ({sightings.reduce((a, s) => a + s.count, 0)} Stück)</h3>
          {sightings.length ? (
            <ul className="grid gap-1">
              {sightings.map((s) => (
                <li key={s.id}>
                  {fmtTime(new Date(s.time))} · {s.count}× {speciesMap.get(s.speciesId)?.name ?? s.speciesId}
                  {s.sexAge.length ? ` (${s.sexAge.join(', ')})` : ''}
                  {s.behavior ? `, ${s.behavior}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-dim">Kein Anblick</p>
          )}
        </div>

        <div className="card mb-3">
          <h3 className="mb-2 text-lg font-bold">Erfolg</h3>
          {h.success && h.kills.length ? (
            <ul className="grid gap-1">
              {h.kills.map((k) => (
                <li key={k.id}>
                  {fmtTime(new Date(k.time))} · {speciesMap.get(k.speciesId)?.name ?? k.speciesId}
                  {k.sexAge ? ` (${k.sexAge})` : ''}
                  {k.weightKg != null ? `, ${n1(k.weightKg)} kg aufgebrochen` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-dim">Keine Beute</p>
          )}
        </div>

        {(h.disturbances.length > 0 || h.notes) && (
          <div className="card mb-3">
            {h.disturbances.length > 0 && <p className="mb-1">Störungen: {h.disturbances.join(', ')}</p>}
            {h.notes && <p className="whitespace-pre-wrap text-ink-dim">{h.notes}</p>}
          </div>
        )}

        <div className="mb-8 grid grid-cols-[auto_1fr] gap-2">
          <button className="btn btn-danger" onClick={remove} aria-label="Löschen">
            <Trash2 />
          </button>
          <button className="btn" onClick={() => navigate('tagebuch', h.id, 'bearbeiten')}>
            <Pencil /> Bearbeiten
          </button>
        </div>
      </div>
    </div>
  )
}

function fmtDelta(d: number | null) {
  if (d == null) return '–'
  return `${d > 0 ? '+' : ''}${n1(d)} hPa`
}

function WeatherBlock({ h, loading, onReload }: { h: Hunt; loading: boolean; onReload: () => void }) {
  if (h.status === 'running') return null
  if (h.weatherStatus === 'ok')
    return (
      <div className="mb-2 flex justify-end">
        <button className="text-sm text-ink-dim underline" onClick={onReload} disabled={loading}>
          {loading ? 'lade…' : 'Wetter neu laden'}
        </button>
      </div>
    )
  return (
    <div className={`card mb-3 ${h.weatherStatus === 'error' ? 'border-warn/60' : 'border-hint/60'}`}>
      <p className="mb-2">
        {h.weatherStatus === 'pending'
          ? 'Wetterdaten fehlen noch – sie werden automatisch geladen, sobald Internet da ist.'
          : `Wetter konnte nicht geladen werden: ${h.weatherError ?? 'unbekannter Fehler'}`}
      </p>
      <button className="btn w-full" onClick={onReload} disabled={loading}>
        {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Wetter jetzt laden
      </button>
    </div>
  )
}
