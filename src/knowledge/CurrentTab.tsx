// Reiter „Aktuell“: Was ist zum gewählten Tag (Standard: heute) bejagbar, was läuft gerade im Jahreslauf,
// was steht in den nächsten 30 Tagen an. Jagdzeiten NUR aus der eigenen Tabelle.
import { CalendarClock, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Chip } from '../components/ui'
import {
  classStateText,
  daysUntil,
  fmtMonthDay,
  inRange,
  noteWithoutSource,
  seasonOverview,
  type ClassState,
  type SpeciesSeasonState,
} from '../domain/knowledge'
import { phaseLabel } from '../domain/phases'
import { speciesColor } from '../domain/species'
import { useSpecies } from '../journal/hooks'
import { berlinParts, fromBerlinLocal } from '../lib/time'
import { useCalendar, useSeasons, useSpeciesNames } from './hooks'
import { NdsImport } from './NdsImport'

const DAY = 86400000
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const AHEAD = 30

const dateFmt = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
const noon = (y: number, m: number, d: number) => fromBerlinLocal(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00`).getTime()
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

interface Event {
  n: number
  day: string
  kind: 'start' | 'end' | 'phase'
  text: string
}

export function CurrentTab({ onOpen }: { onOpen: (tab: 'wissen' | 'kalender' | 'jagdzeiten', species?: string) => void }) {
  const seasons = useSeasons()
  const calendar = useCalendar()
  const names = useSpeciesNames()
  const species = useSpecies()
  const [time, setTime] = useState(() => Date.now())
  const [onlyMine, setOnlyMine] = useState(false)
  const today = Date.now()
  const isToday = sameDay(time, today)
  const p = berlinParts(new Date(time))
  const monthsRef = useRef<HTMLDivElement>(null)
  // gewählten Monat in der Monatsleiste sichtbar halten
  useEffect(() => {
    const el = monthsRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (el && monthsRef.current) monthsRef.current.scrollLeft = el.offsetLeft - monthsRef.current.clientWidth / 2 + el.clientWidth / 2
  }, [p.month, seasons])
  const speciesById = useMemo(() => new Map(species.map((s) => [s.id, s])), [species])

  const overview = useMemo(() => {
    const all = seasonOverview(seasons ?? [], time, names, species.map((s) => s.id))
    return onlyMine ? all.filter((s) => speciesById.has(s.speciesId)) : all
  }, [seasons, time, names, species, onlyMine, speciesById])

  const phasesNow = useMemo(() => (calendar ?? []).filter((x) => x.active !== false && inRange(x.from, x.to, time)), [calendar, time])

  const events = useMemo(() => {
    const ev: Event[] = []
    for (const s of overview)
      for (const c of s.classes) {
        const what = c.label && c.label !== s.name ? `${s.name} – ${c.label}` : s.name
        if (c.open && c.endsIn != null && c.endDay && c.endsIn <= AHEAD) ev.push({ n: c.endsIn, day: c.endDay, kind: 'end', text: `letzter Jagdtag: ${what}` })
        if (!c.open && c.opensIn != null && c.openDay && c.opensIn <= AHEAD) ev.push({ n: c.opensIn, day: c.openDay, kind: 'start', text: `Jagdzeit beginnt: ${what}` })
      }
    for (const ph of calendar ?? []) {
      if (ph.active === false || inRange(ph.from, ph.to, time)) continue
      const n = daysUntil(ph.from, time)
      if (n <= AHEAD) ev.push({ n, day: ph.from, kind: 'phase', text: `beginnt: ${phaseLabel(ph, names)}` })
    }
    return ev.sort((a, b) => a.n - b.n)
  }, [overview, calendar, time, names])

  if (!seasons || !calendar) return <p className="text-ink-dim">Lade…</p>

  const open = overview.filter((s) => s.anyOpen)
  const shut = overview.filter((s) => !s.anyOpen && s.classes.some((c) => !c.closed))
  const never = overview.filter((s) => s.classes.every((c) => c.closed))
  const hasOther = seasons.some((s) => !speciesById.has(s.speciesId))

  // Monatsleiste: ab dem laufenden Monat 12 Monate nach vorn (zum Vorausplanen)
  const now = berlinParts(new Date(today))
  const months = Array.from({ length: 12 }, (_, i) => {
    const k = now.month - 1 + i
    return { m: (k % 12) + 1, y: now.year + Math.floor(k / 12) }
  })
  const pickMonth = (m: number, y: number, i: number) => {
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
    setTime(i === 0 ? today : noon(y, m, Math.min(now.day, days)))
  }

  return (
    <>
      {/* Datum */}
      <section className="card mb-3">
        <div className="flex items-center gap-2">
          <button className="btn-round !size-12 shrink-0" onClick={() => setTime((t) => t - 7 * DAY)} aria-label="Eine Woche zurück">
            <ChevronLeft />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-sm text-ink-dim">{isToday ? 'Heute' : 'Gewählter Tag'}</p>
            <p className="text-lg font-bold">{dateFmt.format(new Date(time))}</p>
          </div>
          <button className="btn-round !size-12 shrink-0" onClick={() => setTime((t) => t + 7 * DAY)} aria-label="Eine Woche vor">
            <ChevronRight />
          </button>
        </div>
        <div ref={monthsRef} className="relative -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [&>*]:shrink-0">
          {months.map(({ m, y }, i) => {
            const active = p.month === m && p.year === y
            return (
              <button
                key={`${y}-${m}`}
                onClick={() => pickMonth(m, y, i)}
                aria-pressed={active}
                className={`min-h-10 min-w-12 rounded-full border px-3 text-sm font-semibold ${
                  active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-panel-2 text-ink'
                }`}
              >
                {MONTHS[m - 1]}
                {m === 1 && i > 0 && <span className="ml-1 text-xs opacity-70">'{String(y).slice(2)}</span>}
              </button>
            )
          })}
        </div>
        {!isToday && (
          <button className="btn mt-3 w-full !min-h-11 !text-base" onClick={() => setTime(Date.now())}>
            <CalendarClock className="size-5" /> Zurück zu heute
          </button>
        )}
      </section>

      {!seasons.length ? (
        <section className="card mb-3 !border-accent">
          <h2 className="mb-1 text-lg font-bold">Noch keine Jagdzeiten eingetragen</h2>
          <p className="mb-3 text-sm text-ink-dim">
            Damit „Aktuell“ zeigen kann, was frei ist, braucht die App deine Jagdzeiten-Tabelle. Übernimm die Vorlage für Niedersachsen oder trag
            die Zeiten selbst ein.
          </p>
          <NdsImport />
          <button className="btn mt-2 w-full" onClick={() => onOpen('jagdzeiten')}>
            Selbst eintragen
          </button>
        </section>
      ) : (
        <>
          {hasOther && (
            <div className="mb-3 flex gap-2">
              <Chip active={!onlyMine} onClick={() => setOnlyMine(false)}>
                Alle Arten
              </Chip>
              <Chip active={onlyMine} onClick={() => setOnlyMine(true)}>
                Meine Wildarten
              </Chip>
            </div>
          )}

          <SectionTitle color="text-good">Jagdzeit – frei ({open.length})</SectionTitle>
          {open.length ? (
            <div className="mb-4 grid gap-2">
              {open.map((s) => (
                <SpeciesCard key={s.speciesId} s={s} color={speciesColor(speciesById.get(s.speciesId))} />
              ))}
            </div>
          ) : (
            <p className="mb-4 text-ink-dim">Laut deiner Tabelle ist an diesem Tag nichts frei.</p>
          )}
        </>
      )}

      <SectionTitle>Was gerade läuft</SectionTitle>
      {phasesNow.length ? (
        <div className="mb-4 grid gap-2">
          {phasesNow.map((ph) => (
            <button
              key={ph.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3 text-left"
              onClick={() => onOpen('kalender', ph.speciesId ?? 'allg')}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{phaseLabel(ph, names)}</span>
                <span className="block text-sm text-ink-dim">
                  {fmtMonthDay(ph.from)} – {fmtMonthDay(ph.to)} · noch {daysUntil(ph.to, time) + 1} Tage
                </span>
              </span>
              {ph.status === 'geprueft' || ph.own ? (
                <span className="badge border-good/60 text-good">geprüft</span>
              ) : (
                <span className="badge border-hint/60 text-hint">ungeprüft</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-ink-dim">Keine Phase im Jagdkalender.</p>
      )}

      <SectionTitle>Demnächst (nächste {AHEAD} Tage)</SectionTitle>
      {events.length ? (
        <div className="card mb-4 grid gap-2 !p-3">
          {events.map((e, i) => (
            <div key={i} className="flex items-baseline gap-3">
              <span className="w-20 shrink-0 text-sm font-semibold text-ink-dim">
                {e.n === 0 ? 'heute' : e.n === 1 ? 'morgen' : `in ${e.n} T.`}
                <span className="block text-xs font-normal">{fmtMonthDay(e.day)}</span>
              </span>
              <span className={e.kind === 'start' ? 'text-good' : e.kind === 'end' ? 'text-warn' : ''}>{e.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-ink-dim">In den nächsten {AHEAD} Tagen ändert sich nichts.</p>
      )}

      {shut.length > 0 && (
        <>
          <SectionTitle color="text-warn">Schonzeit ({shut.length})</SectionTitle>
          <div className="mb-4 grid gap-2">
            {shut.map((s) => (
              <SpeciesCard key={s.speciesId} s={s} color={speciesColor(speciesById.get(s.speciesId))} />
            ))}
          </div>
        </>
      )}
      {never.length > 0 && (
        <p className="mb-4 text-sm text-ink-dim">
          <b>Keine Jagdzeit laut deiner Tabelle:</b> {never.map((s) => `${s.name} (${s.classes.map((c) => c.label).join(', ')})`).join(' · ')}
        </p>
      )}

      {seasons.length > 0 && (
        <p className="mb-6 flex gap-2 rounded-xl border border-line bg-panel p-3 text-sm text-ink-dim">
          <Info className="size-5 shrink-0" />
          <span>
            Jagdzeiten nur aus deiner eigenen Tabelle – maßgeblich ist das Landesjagdrecht (in Niedersachsen DVO-NJagdG). Elterntierschutz,
            Vogelschutzgebiete und örtliche Regelungen beachten.{' '}
            <button className="text-accent underline" onClick={() => onOpen('jagdzeiten')}>
              Tabelle ansehen
            </button>
          </span>
        </p>
      )}
    </>
  )
}

function SectionTitle({ children, color = 'text-ink' }: { children: React.ReactNode; color?: string }) {
  return <h2 className={`mb-2 text-lg font-bold ${color}`}>{children}</h2>
}

const classNote = (c: ClassState) => (c.open ? noteWithoutSource(c.seasons.find((x) => noteWithoutSource(x.note))?.note) : '')
/** offen zuerst, dann Schonzeit, dann „keine Jagdzeit“ */
const rankClass = (c: ClassState) => (c.open ? 0 : c.closed ? 2 : 1)

function SpeciesCard({ s, color }: { s: SpeciesSeasonState; color: string }) {
  const classes = [...s.classes].sort((a, b) => rankClass(a) - rankClass(b))
  // Gleicher Hinweis bei allen offenen Klassen (z. B. Elterntierschutz) → nur einmal zeigen
  const notes = classes.filter((c) => c.open).map(classNote)
  const shared = notes.length > 1 && notes[0] && notes.every((n) => n === notes[0]) ? notes[0] : ''
  const single = classes.length === 1 && classes[0].label === s.name
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="mb-1 flex flex-wrap items-baseline gap-x-2">
        <span className="flex items-center gap-2 text-lg font-bold">
          <span className="size-3 shrink-0 rounded-full" style={{ background: color }} />
          {s.name}
        </span>
        {single && <StateText c={classes[0]} />}
      </p>
      {single ? (
        classNote(classes[0]) && <p className="text-xs text-ink-dim">⚠ {classNote(classes[0])}</p>
      ) : (
        <div className="grid gap-1">
          {classes.map((c) => (
            <div key={c.label} className={c.open ? '' : 'opacity-60'}>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">{c.label || 'alle'}</span>
                <StateText c={c} />
              </p>
              {!shared && classNote(c) && <p className="text-xs text-ink-dim">⚠ {classNote(c)}</p>}
            </div>
          ))}
          {shared && <p className="text-xs text-ink-dim">⚠ {shared}</p>}
        </div>
      )}
    </div>
  )
}

function StateText({ c }: { c: ClassState }) {
  const soon = c.open && c.endsIn != null && c.endsIn < 14
  return <span className={`text-sm ${c.open ? (soon ? 'text-hint' : 'text-good') : 'text-ink-dim'}`}>{classStateText(c)}</span>
}
