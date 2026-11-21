// Kombinations-Assistent: Welcher Sitz passt heute am besten?
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, CalendarDays, ChevronDown, ChevronUp, CloudOff, Compass, Loader2, Minus, Play, Plus, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { KiRecommendation } from '../ai/KiRecommendation'
import { usePlanConditions } from '../assistant/usePlanConditions'
import { Chip, useToast } from '../components/ui'
import { db, type Facility } from '../db/db'
import { setSetting, useSetting } from '../db/settings'
import { bestWindFor, huntStats, OWN_DATA_HALF, rateStands, type StandRating, type StatGroup } from '../domain/assistant'
import { weatherCodeText } from '../domain/environment'
import { typeInfo } from '../domain/facilityTypes'
import type { HuntEnv } from '../domain/hunt'
import { classStateText, seasonOverview } from '../domain/knowledge'
import { inPhase, phaseLabel } from '../domain/phases'
import { RULES, STRENGTHS, type RuleSettings } from '../domain/rules'
import { startHunt } from '../journal/huntActions'
import { useSpecies } from '../journal/hooks'
import { useCalendar, useSeasons, useSpeciesNames } from '../knowledge/hooks'
import { COMPASS_8, compass16, fromPos, type LatLng } from '../lib/geo'
import { navigate } from '../lib/router'
import { eveningStart, morningStart } from '../lib/sun'
import { fmtDate, fmtTime, fromBerlinLocal, toBerlinLocal } from '../lib/time'

type Tab = 'empfehlung' | 'statistik' | 'regelwerk'

export default function AssistantPage() {
  const [tab, setTab] = useState<Tab>('empfehlung')
  return (
    <div className="h-full overflow-y-auto p-4 pt-safe">
      <h1 className="mb-1 text-2xl font-bold">Kombinations-Assistent</h1>
      <p className="mb-4 text-sm italic text-ink-dim">„Erfolgreich wird nur, wer kombinieren kann.“</p>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {(
          [
            ['empfehlung', 'Empfehlung'],
            ['statistik', 'Statistik'],
            ['regelwerk', 'Regelwerk'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} className={`btn !min-h-12 !px-2 !text-base ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'empfehlung' && <Recommendation />}
      {tab === 'statistik' && <Statistics />}
      {tab === 'regelwerk' && <RuleEditor />}
    </div>
  )
}

// ---------- gemeinsame Bausteine ----------

function useStands(): Facility[] | undefined {
  return useLiveQuery(async () => (await db.facilities.toArray()).filter((f) => typeInfo(f.type).isStand && f.geometry.type === 'Point'), [])
}

function SpeciesPicker() {
  const species = useSpecies()
  const value = useSetting('assistantSpecies') ?? 'rehwild'
  return (
    // Eine wischbare Zeile statt vieler Zeilen
    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 whitespace-nowrap [&>*]:shrink-0">
      <Chip active={value === 'alle'} onClick={() => setSetting('assistantSpecies', 'alle')}>
        Alle
      </Chip>
      {species.map((s) => (
        <Chip key={s.id} active={value === s.id} onClick={() => setSetting('assistantSpecies', s.id)}>
          {s.name}
        </Chip>
      ))}
    </div>
  )
}

function useTarget() {
  const species = useSpecies()
  const value = useSetting('assistantSpecies') ?? 'rehwild'
  const speciesId = value === 'alle' ? null : value
  return { speciesId, speciesName: species.find((s) => s.id === speciesId)?.name ?? 'Wild' }
}

const scoreColor = (s: number) => (s >= 70 ? 'bg-good text-bg' : s >= 45 ? 'bg-hint text-bg' : 'bg-warn text-bg')

// ---------- Empfehlung ----------

type Preset = 'abend' | 'morgen' | 'jetzt' | 'frei'

function Recommendation() {
  const stands = useStands()
  const facilities = useLiveQuery(() => db.facilities.toArray(), [])
  const hunts = useLiveQuery(() => db.hunts.toArray(), [])
  const sightings = useLiveQuery(() => db.sightings.toArray(), [])
  const ruleSettings = useSetting('ruleSettings')
  const scentLength = useSetting('scentLength') ?? 300
  const scentWidth = useSetting('scentWidth') ?? 40
  const { speciesId, speciesName } = useTarget()

  const [preset, setPreset] = useState<Preset>('abend')
  const [custom, setCustom] = useState(() => toBerlinLocal(new Date()))
  const [nowAt, setNowAt] = useState(() => roundTo5(Date.now()))
  const [manualWind, setManualWind] = useState<number | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  // Mittelpunkt der Sitze – dafür wird das Wetter abgefragt
  const center = useMemo<LatLng | null>(() => {
    if (!stands?.length) return null
    const own = stands.filter((s) => !s.demo)
    const list = (own.length ? own : stands).map((s) => fromPos((s.geometry as { coordinates: number[] }).coordinates))
    return { lat: round3(list.reduce((a, p) => a + p.lat, 0) / list.length), lng: round3(list.reduce((a, p) => a + p.lng, 0) / list.length) }
  }, [stands])

  const start = useMemo(() => {
    if (!center) return nowAt
    if (preset === 'jetzt') return nowAt
    if (preset === 'frei') return fromBerlinLocal(custom).getTime()
    if (preset === 'morgen') return roundTo5(morningStart(center.lat, center.lng).getTime())
    const today = eveningStart(center.lat, center.lng).getTime()
    // Ist es für heute Abend schon zu spät? Dann morgen Abend
    return roundTo5(today + 60 * 60000 < Date.now() ? eveningStart(center.lat, center.lng, new Date(Date.now() + 86400000)).getTime() : today)
  }, [preset, custom, nowAt, center])
  const durationMin = speciesId === 'schwarzwild' || speciesId === 'fuchs' ? 180 : 120
  const end = start + durationMin * 60000

  const { env, weather } = usePlanConditions(center, start, end, manualWind)

  const ratings = useMemo(() => {
    if (!env || !stands || !facilities || !hunts || !sightings) return null
    return rateStands(stands, {
      start,
      env,
      speciesId,
      speciesName,
      facilities,
      sightings,
      hunts,
      scentLength,
      scentWidth,
      settings: ruleSettings ?? {},
    })
  }, [env, stands, facilities, hunts, sightings, start, speciesId, speciesName, scentLength, scentWidth, ruleSettings])

  if (stands === undefined) return <p className="text-ink-dim">Lade…</p>
  if (!stands.length) {
    return (
      <div className="card">
        <p className="mb-3">Der Assistent bewertet deine Sitze. Lege zuerst auf der Karte Sitze an (Hochsitz, Kanzel, Leiter) – oder lade unter „Mehr“ das Beispielrevier zum Ausprobieren.</p>
        <button className="btn w-full" onClick={() => navigate('karte')}>
          Zur Karte
        </button>
      </div>
    )
  }

  return (
    <>
      <section className="card mb-4">
        <h2 className="mb-2 text-lg font-bold">Wann und worauf?</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <Chip active={preset === 'abend'} onClick={() => setPreset('abend')}>
            Heute Abend
          </Chip>
          <Chip active={preset === 'morgen'} onClick={() => setPreset('morgen')}>
            Morgen früh
          </Chip>
          <Chip
            active={preset === 'jetzt'}
            onClick={() => {
              setNowAt(roundTo5(Date.now()))
              setPreset('jetzt')
            }}
          >
            Jetzt
          </Chip>
          <Chip active={preset === 'frei'} onClick={() => setPreset('frei')}>
            Andere Zeit
          </Chip>
        </div>
        {preset === 'frei' && (
          <input type="datetime-local" className="input mb-3" value={custom} onChange={(e) => e.target.value && setCustom(e.target.value)} />
        )}
        <p className="mb-3 text-sm text-ink-dim">
          {fmtDate(new Date(start))}, {fmtTime(new Date(start))}–{fmtTime(new Date(end))} Uhr
        </p>
        <SpeciesPicker />
        {env && <ConditionsView env={env} weather={weather} manualWind={manualWind} setManualWind={setManualWind} />}
        <CalendarBox time={start} speciesId={speciesId} speciesName={speciesName} />
      </section>

      <KiRecommendation
        start={start}
        end={end}
        speciesId={speciesId}
        speciesName={speciesName}
        env={env}
        ratings={ratings}
        facilities={facilities}
        hunts={hunts}
        sightings={sightings}
        scent={{ length: scentLength, width: scentWidth }}
      />

      {!ratings && <p className="text-ink-dim">Berechne…</p>}
      <div className="grid gap-3 pb-4">
        {ratings?.map((r, i) => (
          <RatingCard
            key={r.stand.id}
            rank={i + 1}
            r={r}
            open={open === r.stand.id}
            onToggle={() => setOpen(open === r.stand.id ? null : r.stand.id)}
            canStart={Math.abs(start - Date.now()) < 90 * 60000}
            bestWind={hunts && sightings ? bestWindFor(r.stand.id, hunts, sightings, speciesId) : null}
          />
        ))}
      </div>
    </>
  )
}

function ConditionsView({
  env,
  weather,
  manualWind,
  setManualWind,
}: {
  env: HuntEnv
  weather: ReturnType<typeof usePlanConditions>['weather']
  manualWind: number | null
  setManualWind: (d: number | null) => void
}) {
  const w = env.weather
  const sun = env.sun
  const windFrom = w?.windDirectionAvg ?? w?.windDirection ?? null
  const items: string[] = [sun.period]
  if (sun.sunset && (sun.period === 'Abend' || sun.period === 'Nacht')) items.push(`Sonnenuntergang ${fmtTime(new Date(sun.sunset))}`)
  if (sun.sunrise && sun.period === 'Morgen') items.push(`Sonnenaufgang ${fmtTime(new Date(sun.sunrise))}`)
  if (w?.temperature != null) items.push(`${Math.round(w.temperature)} °C`)
  if (w?.weatherCode != null && weatherCodeText(w.weatherCode)) items.push(weatherCodeText(w.weatherCode))
  if (w?.pressureTrend) items.push(`Luftdruck ${w.pressureTrend}`)
  if ((w?.precipitation24h ?? 0) > 0) items.push(`Regen 24 h: ${fmt1(w!.precipitation24h!)} mm`)
  items.push(`Mond ${env.moon.illumination} % (${env.moon.phaseName}${env.moon.upPercent ? `, ${env.moon.upPercent} % der Zeit am Himmel` : ', nicht am Himmel'})`)

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center gap-2">
        <Compass className="shrink-0 text-accent" />
        <p className="text-lg font-semibold">
          {windFrom != null ? `Wind aus ${compass16(windFrom)}` : 'Wind unbekannt'}
          {w?.windSpeedAvg != null && manualWind == null && ` · ${Math.round(w.windSpeedAvg)} km/h`}
          {w?.gustsMax != null && manualWind == null && ` · Böen ${Math.round(w.gustsMax)}`}
          {manualWind != null && <span className="text-sm font-normal text-ink-dim"> – selbst gewählt</span>}
        </p>
        {weather.status === 'loading' && manualWind == null && <Loader2 className="animate-spin text-ink-dim" />}
      </div>
      {weather.status === 'error' && (
        <p className="mb-2 flex items-start gap-2 text-sm text-hint">
          <CloudOff className="size-4 shrink-0 translate-y-0.5" /> {weather.message} Wähle den Wind unten selbst.
        </p>
      )}
      <p className="mb-3 text-sm text-ink-dim">{items.join(' · ')}</p>
      <p className="label">Wind selbst wählen (z. B. nach Gefühl vor Ort)</p>
      <div className="flex flex-wrap gap-2">
        <Chip active={manualWind == null} onClick={() => setManualWind(null)}>
          Vorhersage
        </Chip>
        {COMPASS_8.map((c, i) => (
          <Chip key={c} active={manualWind === i * 45} onClick={() => setManualWind(i * 45)}>
            {c}
          </Chip>
        ))}
      </div>
    </div>
  )
}

function RatingCard({
  rank,
  r,
  open,
  onToggle,
  canStart,
  bestWind,
}: {
  rank: number
  r: StandRating
  open: boolean
  onToggle: () => void
  canStart: boolean
  bestWind: ReturnType<typeof bestWindFor>
}) {
  const toast = useToast()
  const top = r.reasons.slice(0, 2)
  return (
    <div className={`card ${rank === 1 ? 'border-accent' : ''}`}>
      <button className="flex w-full items-center gap-3 text-left" onClick={onToggle}>
        <span className={`flex size-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold ${scoreColor(r.score)}`}>{r.score}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold">
            {rank}. {r.stand.name || typeInfo(r.stand.type).label}
            {r.stand.demo && <span className="ml-2 text-xs font-normal text-ink-dim">Beispiel</span>}
          </span>
          <span className="block text-sm text-ink-dim">
            {top.map((x) => `${x.points > 0 ? '+' : '−'} ${shortText(x.text)}`).join(' · ') || typeInfo(r.stand.type).label}
          </span>
        </span>
        {open ? <ChevronUp className="shrink-0" /> : <ChevronDown className="shrink-0" />}
      </button>

      {open && (
        <div className="mt-3 border-t border-line pt-3">
          <ul className="mb-3 grid gap-2">
            {r.reasons.map((x, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-0.5 inline-flex min-w-11 shrink-0 items-center justify-center gap-0.5 rounded-lg px-1.5 py-0.5 text-xs font-bold ${
                    x.points > 0 ? 'bg-good/20 text-good' : 'bg-warn/20 text-warn'
                  }`}
                >
                  {x.points > 0 ? <Plus className="size-3" /> : <Minus className="size-3" />}
                  {Math.abs(x.points)}
                </span>
                <span>{x.text}</span>
              </li>
            ))}
          </ul>
          <div className="mb-3 rounded-xl bg-panel-2 p-3 text-sm">
            <p className="mb-1 flex items-center gap-2 font-semibold">
              <BookOpen className="size-4 text-accent" /> Aus deinem Tagebuch
            </p>
            {r.own.total === 0 ? (
              <p className="text-ink-dim">Noch keine Ansitze an diesem Sitz – die Bewertung stützt sich nur auf das Regelwerk ({r.rules} Punkte).</p>
            ) : (
              <>
                <p className="text-ink-dim">
                  {r.own.total} Ansitze hier ({r.own.erlegt}× erlegt, {r.own.anblick}× Anblick). Davon {fmt1(r.own.n)} ähnlich wie heute
                  {r.own.score != null && <> mit Ø {r.own.score} Punkten</>}.
                </p>
                <p className="text-ink-dim">
                  Regelwerk {r.rules} Punkte · eigene Erfahrung fließt zu {Math.round(r.own.share * 100)} % ein (ab {OWN_DATA_HALF} ähnlichen Ansitzen zur Hälfte).
                </p>
              </>
            )}
            {bestWind && (
              <p className="mt-1 text-ink-dim">
                Bester Wind laut Tagebuch: <b className="text-ink">{bestWind.label}</b> ({bestWind.anblickQuote} % mit Anblick, {bestWind.hunts} Ansitze).
              </p>
            )}
          </div>
          {canStart && (
            <button
              className="btn btn-primary w-full"
              onClick={async () => {
                try {
                  await startHunt({ stand: r.stand })
                  navigate('tagebuch')
                } catch (e) {
                  toast((e as Error).message, 'error')
                }
              }}
            >
              <Play /> Ansitz hier starten
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Kurzfassung einer Begründung für die Übersicht */
function shortText(t: string) {
  const s = t.replace(/^Wind aus [A-ZÖÜ]+: /, '').split(/[.–(]/)[0].trim()
  return s.length > 48 ? s.slice(0, 46) + '…' : s
}

// ---------- Statistik ----------

const GROUPS: { id: StatGroup; label: string }[] = [
  { id: 'sitz', label: 'Sitz' },
  { id: 'tageszeit', label: 'Tageszeit' },
  { id: 'wind', label: 'Wind' },
  { id: 'mond', label: 'Mond' },
  { id: 'luftdruck', label: 'Luftdruck' },
  { id: 'monat', label: 'Monat' },
]

function Statistics() {
  const hunts = useLiveQuery(() => db.hunts.toArray(), [])
  const sightings = useLiveQuery(() => db.sightings.toArray(), [])
  const stands = useStands()
  const { speciesId, speciesName } = useTarget()
  const [group, setGroup] = useState<StatGroup>('sitz')
  const [standId, setStandId] = useState<string>('alle')
  const filtered = useMemo(
    () => (hunts && group !== 'sitz' && standId !== 'alle' ? hunts.filter((h) => h.standId === standId) : hunts),
    [hunts, group, standId],
  )
  const rows = useMemo(
    () => (filtered && sightings ? huntStats(filtered, sightings, speciesId, group, stands ?? []) : []),
    [filtered, sightings, speciesId, group, stands],
  )
  // Nur Sitze mit Ansitzen zur Auswahl
  const standsWithHunts = useMemo(() => (stands ?? []).filter((s) => hunts?.some((h) => h.standId === s.id)), [stands, hunts])
  if (!hunts || !filtered) return <p className="text-ink-dim">Lade…</p>
  const done = filtered.filter((h) => h.status === 'done')
  const demo = done.filter((h) => h.demo).length

  return (
    <>
      <SpeciesPicker />
      <div className="mb-4 flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>
            {g.label}
          </Chip>
        ))}
      </div>
      {group !== 'sitz' && standsWithHunts.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 whitespace-nowrap [&>*]:shrink-0">
          <Chip active={standId === 'alle'} onClick={() => setStandId('alle')}>
            Alle Sitze
          </Chip>
          {standsWithHunts.map((s) => (
            <Chip key={s.id} active={standId === s.id} onClick={() => setStandId(s.id)}>
              {s.name || typeInfo(s.type).label}
            </Chip>
          ))}
        </div>
      )}
      <p className="mb-3 text-sm text-ink-dim">
        {done.length} Ansitze{demo ? ` (davon ${demo} Testdaten)` : ''}. Anblick = {speciesId ? speciesName : 'irgendein Wild'} gesehen oder erlegt.
      </p>
      {!rows.length && <p className="card text-ink-dim">Noch keine passenden Ansitze im Tagebuch.</p>}
      <div className="grid gap-2 pb-4">
        {rows.map((r) => (
          <div key={r.key} className="card !p-3">
            <div className="mb-1 flex items-baseline gap-2">
              <span className="flex-1 truncate font-semibold">{r.label}</span>
              <span className="text-sm text-ink-dim">
                {r.hunts} Ansitz{r.hunts === 1 ? '' : 'e'}
                {r.erlegt ? ` · ${r.erlegt}× erlegt` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-panel-2">
                <div className={`h-full rounded-full ${r.anblickQuote >= 60 ? 'bg-good' : r.anblickQuote >= 35 ? 'bg-hint' : 'bg-warn'}`} style={{ width: `${r.anblickQuote}%` }} />
              </div>
              <span className="w-24 text-right text-sm font-semibold">{r.anblickQuote} % Anblick</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------- Regelwerk ----------

function RuleEditor() {
  const settings = useSetting('ruleSettings') ?? {}
  const set = (next: RuleSettings) => setSetting('ruleSettings', next)
  return (
    <>
      <div className="card mb-4 text-sm text-ink-dim">
        <p className="mb-2">
          Jeder Sitz startet bei 50 Punkten. Jede Regel gibt Plus- oder Minuspunkte. Dazu kommt deine eigene Erfahrung aus dem Tagebuch:
        </p>
        <p className="mb-2 rounded-lg bg-panel-2 p-2 text-center font-mono text-ink">Punkte = (1 − a) · Regelwerk + a · eigene Daten</p>
        <p>
          a = n / (n + {OWN_DATA_HALF}), n = Zahl ähnlicher Ansitze an diesem Sitz. Mit 10 ähnlichen Ansitzen zählt deine Erfahrung zur Hälfte, mit 30 schon zu drei Vierteln.
        </p>
      </div>
      <div className="grid gap-3 pb-4">
        {RULES.map((rule) => {
          const v = settings[rule.id] ?? 1
          return (
            <div key={rule.id} className={`card ${v === 0 ? 'opacity-60' : ''}`}>
              <div className="mb-1 flex items-center gap-2">
                <h3 className="flex-1 font-bold">{rule.label}</h3>
                <span className="rounded-full border border-hint/50 px-2 py-0.5 text-xs text-hint">Vorschlag, bitte prüfen</span>
              </div>
              <p className="mb-3 text-sm text-ink-dim">{rule.description}</p>
              <div className="flex flex-wrap gap-2">
                {STRENGTHS.map((s) => (
                  <Chip key={s.value} active={v === s.value} onClick={() => set({ ...settings, [rule.id]: s.value })}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>
          )
        })}
        <button className="btn" onClick={() => set({})}>
          <RotateCcw /> Alle Regeln zurücksetzen
        </button>
      </div>
    </>
  )
}

// ---------- Hilfen ----------

const roundTo5 = (t: number) => Math.round(t / 300000) * 300000
const round3 = (x: number) => Math.round(x * 1000) / 1000
const fmt1 = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 1 })

// ---------- Jagdkalender & eigene Jagdzeiten zum geplanten Zeitpunkt ----------

function CalendarBox({ time, speciesId, speciesName }: { time: number; speciesId: string | null; speciesName: string }) {
  const calendar = useCalendar()
  const seasons = useSeasons()
  const names = useSpeciesNames()
  if (!calendar || !seasons) return null
  const phases = calendar.filter(
    (p) => p.active !== false && inPhase(p, time) && (speciesId == null || p.speciesId == null || p.speciesId === speciesId),
  )
  const states = speciesId ? (seasonOverview(seasons.filter((x) => x.speciesId === speciesId), time, names)[0]?.classes ?? []) : []

  return (
    <div className="mt-3 rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center gap-2">
        <CalendarDays className="shrink-0 text-accent" />
        <h3 className="flex-1 font-bold">Jagdkalender</h3>
        <button className="text-sm text-accent underline" onClick={() => navigate('wissen', 'wissen', speciesId ?? 'allg')}>
          Jagdwissen
        </button>
      </div>
      {phases.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {phases.map((p) => (
            <span key={p.id} className={`badge ${p.status === 'geprueft' || p.own ? 'border-good/60 text-good' : 'border-hint/60 text-hint'}`}>
              {phaseLabel(p, names)}
              {p.status !== 'geprueft' && !p.own && ' · ungeprüft'}
            </span>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-sm text-ink-dim">Keine Phase im Kalender für dieses Datum.</p>
      )}
      {speciesId &&
        (states.length ? (
          <div className="grid gap-1 text-sm">
            {states.map((c) => (
              <p key={c.label} className={c.open ? 'text-good' : 'text-warn'}>
                {c.label || speciesName}: {classStateText(c)} (laut deiner Tabelle)
              </p>
            ))}
            <p className="text-xs text-ink-dim">Nur aus deiner eigenen Tabelle – maßgeblich ist das Jagdrecht deines Bundeslandes.</p>
          </div>
        ) : (
          <p className="text-sm text-ink-dim">
            Jagdzeit für {speciesName}: nicht eingetragen.{' '}
            <button className="text-accent underline" onClick={() => navigate('wissen', 'jagdzeiten')}>
              Eintragen
            </button>
          </p>
        ))}
    </div>
  )
}
