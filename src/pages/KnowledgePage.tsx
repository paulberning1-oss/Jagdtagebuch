// Jagdwissen: je Wildart Verhaltenswissen + Jahreskalender, bearbeitbarer Jagdkalender,
// eigene Jagd-/Schonzeiten (nur vom Nutzer gepflegt), Reiter „Aktuell“ (was ist heute frei, was läuft).
// Route: #/wissen[/<reiter>[/<wildart>]] – eigener Knopf „Aktuell“ in der unteren Leiste.
import { Check, Pencil, Plus, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ask } from '../components/ConfirmDialog'
import { SpeechTextarea } from '../components/SpeechTextarea'
import { Chip, useToast } from '../components/ui'
import { trashCalendarPhase, trashKnowledge, trashSeason } from '../db/trash'
import {
  allYear,
  fmtMonthDay,
  inRange,
  isDefaultId,
  noteWithoutSource,
  seasonOpen,
  STATUS_LABEL,
  type CalendarPhase,
  type KnowledgeEntry,
  type KnowStatus,
  type Season,
} from '../domain/knowledge'
import { useSpecies } from '../journal/hooks'
import { saveCalendarPhase, saveKnowledge, saveSeason, useCalendar, useKnowledge, useSeasons, useSpeciesNames } from '../knowledge/hooks'
import { MonthDayInput } from '../knowledge/MonthDayInput'
import { NDS_SOURCE } from '../domain/seasonsNiedersachsen'
import { CurrentTab } from '../knowledge/CurrentTab'
import { NdsImport } from '../knowledge/NdsImport'
import { YearBar } from '../knowledge/YearBar'
import { newId } from '../lib/id'
import { fmtDate } from '../lib/time'

type Tab = 'aktuell' | 'wissen' | 'kalender' | 'jagdzeiten'
const TABS: [Tab, string][] = [
  ['aktuell', 'Aktuell'],
  ['wissen', 'Wissen'],
  ['kalender', 'Kalender'],
  ['jagdzeiten', 'Jagdzeiten'],
]
/** Auswahl „Allgemein“ (speciesId null) */
const ALLG = 'allg'
/** Auswahl „Alle“ (nur Kalender) */
const ALLE = 'alle'

const sid = (key: string) => (key === ALLG ? null : key)
const TRASH_NOTE = 'Wiederherstellbar unter „Mehr → Zuletzt gelöscht“.'

export default function KnowledgePage({ parts }: { parts: string[] }) {
  const [tab, setTab] = useState<Tab>(TABS.some(([t]) => t === parts[0]) ? (parts[0] as Tab) : 'aktuell')
  const [species, setSpecies] = useState<string>(parts[1] ?? 'rehwild')

  return (
    <div className="h-full overflow-y-auto p-4 pt-safe">
      <h1 className="mb-3 text-2xl font-bold">{tab === 'aktuell' ? 'Jagd aktuell' : 'Jagdwissen'}</h1>
      <div className="mb-4 grid grid-cols-4 gap-1.5">
        {TABS.map(([t, label]) => (
          <button key={t} className={`btn !min-h-12 !rounded-xl !px-1 !text-sm ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'aktuell' && (
        <CurrentTab
          onOpen={(t, sp) => {
            if (sp) setSpecies(sp)
            setTab(t)
          }}
        />
      )}
      {(tab === 'wissen' || tab === 'kalender') && <SpeciesChips value={species} onChange={setSpecies} withAll={tab === 'kalender'} />}
      {tab === 'wissen' && <KnowledgeTab speciesKey={species === ALLE ? 'rehwild' : species} onCalendar={() => setTab('kalender')} />}
      {tab === 'kalender' && <CalendarTab speciesKey={species} onPickSpecies={setSpecies} />}
      {tab === 'jagdzeiten' && <SeasonsTab />}
    </div>
  )
}

function SpeciesChips({ value, onChange, withAll }: { value: string; onChange: (v: string) => void; withAll: boolean }) {
  const species = useSpecies()
  return (
    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 whitespace-nowrap [&>*]:shrink-0">
      {withAll && (
        <Chip active={value === ALLE} onClick={() => onChange(ALLE)}>
          Alle
        </Chip>
      )}
      <Chip active={value === ALLG} onClick={() => onChange(ALLG)}>
        Allgemein
      </Chip>
      {species.map((s) => (
        <Chip key={s.id} active={value === s.id} onClick={() => onChange(s.id)}>
          {s.name}
        </Chip>
      ))}
    </div>
  )
}

function StatusBadge({ status, own }: { status: KnowStatus; own?: boolean }) {
  if (own) return <span className="badge border-accent/60 text-accent">eigenes Wissen</span>
  return status === 'geprueft' ? (
    <span className="badge border-good/60 text-good">
      <Check className="size-3.5" /> geprüft
    </span>
  ) : (
    <span className="badge border-hint/60 text-hint">{STATUS_LABEL.ungeprueft}</span>
  )
}

/** Knopf geprüft ↔ ungeprüft */
function StatusToggle({ status, onChange }: { status: KnowStatus; onChange: (s: KnowStatus) => void }) {
  return status === 'geprueft' ? (
    <button className="btn !min-h-11 !px-3 !text-base" onClick={() => onChange('ungeprueft')}>
      <Undo2 className="size-5" /> Wieder ungeprüft
    </button>
  ) : (
    <button className="btn !min-h-11 !px-3 !text-base !border-good/60 text-good" onClick={() => onChange('geprueft')}>
      <Check className="size-5" /> Als geprüft markieren
    </button>
  )
}

// ---------- Wissen ----------

function KnowledgeTab({ speciesKey, onCalendar }: { speciesKey: string; onCalendar: () => void }) {
  const all = useKnowledge()
  const calendar = useCalendar()
  const names = useSpeciesNames()
  const [adding, setAdding] = useState<KnowledgeEntry | null>(null)
  const speciesId = sid(speciesKey)
  const list = useMemo(() => (all ?? []).filter((k) => k.speciesId === speciesId), [all, speciesId])
  const phases = useMemo(() => (calendar ?? []).filter((p) => p.speciesId === speciesId), [calendar, speciesId])
  const checked = list.filter((k) => k.own || k.status === 'geprueft').length
  const name = speciesId ? (names.get(speciesId) ?? speciesId) : 'Allgemein'

  if (!all) return <p className="text-ink-dim">Lade…</p>
  return (
    <>
      <p className="mb-4 rounded-xl border border-hint/40 bg-panel p-3 text-sm text-ink-dim">
        Die Vorschläge sind allgemeines Wissen aus der Jagdpraxis und <b className="text-hint">ungeprüft</b>. Prüfe jeden Abschnitt, ändere
        ihn oder ergänze dein eigenes Wissen (z. B. was Opa sagt) und setze ihn dann auf <b className="text-good">geprüft</b>. Die KI nutzt
        später nur geprüftes Wissen – ungeprüftes nur, wenn du es ausdrücklich erlaubst.
      </p>

      <section className="card mb-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Jahreskalender {name}</h2>
          <button className="btn !min-h-11 !px-3 !text-base" onClick={onCalendar}>
            <Pencil className="size-5" /> Bearbeiten
          </button>
        </div>
        <YearBar rows={phases} onPick={onCalendar} />
      </section>

      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold uppercase tracking-wide text-ink-dim">
          {list.length ? `Verhalten · ${checked} von ${list.length} geprüft` : 'Verhalten'}
        </h2>
      </div>
      <div className="grid gap-3 pb-3">
        {list.map((k) => (
          <KnowledgeCard key={k.id} entry={k} />
        ))}
        {!list.length && !adding && <p className="text-ink-dim">Für {name} gibt es noch keine Abschnitte. Leg einen eigenen an.</p>}
        {adding && <KnowledgeCard entry={adding} isNew onDone={() => setAdding(null)} />}
      </div>
      {!adding && (
        <button
          className="btn mb-6 w-full"
          onClick={() =>
            setAdding({ id: newId(), speciesId, title: '', text: '', status: 'geprueft', own: true, order: 1000 + list.length })
          }
        >
          <Plus /> Eigener Abschnitt
        </button>
      )}
    </>
  )
}

function KnowledgeCard({ entry, isNew = false, onDone }: { entry: KnowledgeEntry; isNew?: boolean; onDone?: () => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState<KnowledgeEntry | null>(isNew ? entry : null)
  const modified = isDefaultId(entry.id) && entry.updatedAt != null
  const set = (patch: Partial<KnowledgeEntry>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  const save = async () => {
    if (!draft) return
    if (!draft.title.trim() && !draft.text.trim()) return toast('Bitte Überschrift oder Text eingeben', 'error')
    await saveKnowledge({ ...draft, title: draft.title.trim() || 'Eigener Abschnitt' })
    setDraft(null)
    onDone?.()
  }
  const cancel = () => {
    setDraft(null)
    onDone?.()
  }
  const reset = async () => {
    if (!(await ask(`„${entry.title}“ auf den Vorschlag zurücksetzen?\n\nDeine Änderungen und Ergänzungen an diesem Abschnitt gehen in „Zuletzt gelöscht“.`, { ok: 'Zurücksetzen', danger: true })))
      return
    await trashKnowledge(entry)
    setDraft(null)
    toast(`Zurückgesetzt – ${TRASH_NOTE}`)
  }
  const remove = async () => {
    if (!(await ask(`Abschnitt „${entry.title}“ löschen?\n\n${TRASH_NOTE}`))) return
    await trashKnowledge(entry)
    toast(`Gelöscht – ${TRASH_NOTE}`)
  }

  if (draft) {
    return (
      <div className="card">
        <label className="mb-3 block">
          <span className="label">Überschrift</span>
          <input className="input" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="z. B. Böcke an der Eichenkanzel" />
        </label>
        <div className="mb-3">
          <span className="label">{draft.own ? 'Text' : 'Text (Vorschlag – du kannst ihn ändern)'}</span>
          <SpeechTextarea label="Text" value={draft.text} onChange={(text) => set({ text })} />
        </div>
        {!draft.own && (
          <div className="mb-3">
            <span className="label">Eigene Ergänzung</span>
            <SpeechTextarea
              label="Eigene Ergänzung"
              value={draft.addition ?? ''}
              onChange={(addition) => set({ addition })}
              placeholder="Was du oder Opa dazu wisst, z. B. „Bei uns beginnt die Blattzeit eher Anfang August.“"
            />
          </div>
        )}
        <label className="mb-4 block">
          <span className="label">Quelle (optional)</span>
          <input className="input" value={draft.source ?? ''} onChange={(e) => set({ source: e.target.value })} placeholder="z. B. Opa, eigene Beobachtung" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn flex-1" onClick={cancel}>
            Abbrechen
          </button>
          <button className="btn btn-primary flex-1" onClick={save}>
            Speichern
          </button>
        </div>
        {!isNew && (modified || entry.own) && (
          <div className="mt-3 border-t border-line pt-3">
            {entry.own ? (
              <button className="btn btn-danger w-full" onClick={remove}>
                <Trash2 /> Abschnitt löschen
              </button>
            ) : (
              <button className="btn w-full" onClick={reset}>
                <RotateCcw /> Auf Vorschlag zurücksetzen
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-lg font-bold">{entry.title}</h3>
        <StatusBadge status={entry.status} own={entry.own} />
      </div>
      {modified && <p className="mb-1 text-xs text-ink-dim">von dir geändert</p>}
      <p className="whitespace-pre-line text-ink">{entry.text}</p>
      {entry.addition?.trim() && (
        <div className="mt-2 rounded-lg border-l-4 border-accent bg-panel-2 p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Ergänzung{entry.source ? ` · ${entry.source}` : ''}</p>
          <p className="whitespace-pre-line">{entry.addition}</p>
        </div>
      )}
      {entry.own && entry.source && <p className="mt-1 text-sm text-ink-dim">Quelle: {entry.source}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!entry.own && <StatusToggle status={entry.status} onChange={(status) => saveKnowledge({ ...entry, status })} />}
        <button className="btn !min-h-11 !px-3 !text-base" onClick={() => setDraft(entry)}>
          <Pencil className="size-5" /> {entry.own ? 'Bearbeiten' : 'Bearbeiten / ergänzen'}
        </button>
      </div>
    </div>
  )
}

// ---------- Kalender ----------

function CalendarTab({ speciesKey, onPickSpecies }: { speciesKey: string; onPickSpecies: (k: string) => void }) {
  const calendar = useCalendar()
  const names = useSpeciesNames()
  const species = useSpecies()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState<CalendarPhase | null>(null)

  if (!calendar) return <p className="text-ink-dim">Lade…</p>

  const intro = (
    <p className="mb-4 rounded-xl border border-line bg-panel p-3 text-sm text-ink-dim">
      Der Kalender schlägt im Tagebuch und im Assistenten die <b className="text-ink">jagdliche Phase</b> vor (z. B. Blattzeit, Rauschzeit,
      Maisernte). Zeiträume sind Richtwerte – pass sie an dein Revier an. Ausgeschaltete Phasen werden nicht vorgeschlagen.
      <br />
      <b className="text-ink">Jagd- und Schonzeiten stehen nicht hier</b>, sondern im Reiter „Jagdzeiten“.
    </p>
  )

  // Übersicht über alle Wildarten
  if (speciesKey === ALLE) {
    const groups = [
      { key: ALLG, name: 'Allgemein', list: calendar.filter((p) => p.speciesId == null) },
      ...species.map((s) => ({ key: s.id, name: s.name, list: calendar.filter((p) => p.speciesId === s.id) })),
    ].filter((g) => g.list.length > 0)
    return (
      <>
        {intro}
        {groups.map(({ key, name, list }) => (
          <section key={key} className="card mb-3">
            <button className="mb-2 flex w-full items-center text-left" onClick={() => onPickSpecies(key)}>
              <h2 className="flex-1 text-lg font-bold">{name}</h2>
              <span className="text-sm text-accent">Bearbeiten ›</span>
            </button>
            <YearBar rows={list} onPick={() => onPickSpecies(key)} />
          </section>
        ))}
      </>
    )
  }

  const speciesId = sid(speciesKey)
  const list = calendar.filter((p) => p.speciesId === speciesId)
  const name = speciesId ? (names.get(speciesId) ?? speciesId) : 'Allgemein'
  return (
    <>
      {intro}
      <section className="card mb-4">
        <h2 className="mb-2 text-lg font-bold">Jahreskalender {name}</h2>
        <YearBar rows={list} onPick={setEditing} />
      </section>
      <div className="grid gap-3 pb-3">
        {list.map((p) =>
          editing === p.id ? (
            <PhaseEditor key={p.id} phase={p} onDone={() => setEditing(null)} />
          ) : (
            <PhaseCard key={p.id} phase={p} onEdit={() => setEditing(p.id)} />
          ),
        )}
        {adding && <PhaseEditor phase={adding} isNew onDone={() => setAdding(null)} />}
      </div>
      {!adding && (
        <button
          className="btn mb-6 w-full"
          onClick={() => setAdding({ id: newId(), speciesId, label: '', from: '06-01', to: '06-30', status: 'geprueft', active: true, own: true })}
        >
          <Plus /> Eigene Phase
        </button>
      )}
    </>
  )
}

function PhaseCard({ phase: p, onEdit }: { phase: CalendarPhase; onEdit: () => void }) {
  const now = inRange(p.from, p.to, Date.now())
  return (
    <div className={`card ${p.active ? '' : 'opacity-60'}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-lg font-bold">{p.label}</h3>
        {p.active && now && <span className="badge border-warn/60 text-warn">jetzt</span>}
        {!p.active && <span className="badge border-line text-ink-dim">aus</span>}
        <StatusBadge status={p.status} own={p.own} />
      </div>
      <p className="text-ink-dim">
        {fmtMonthDay(p.from)} – {fmtMonthDay(p.to)}
        {isDefaultId(p.id) && p.updatedAt != null && ' · von dir geändert'}
      </p>
      {p.note?.trim() && <p className="mt-1 whitespace-pre-line">{p.note}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!p.own && <StatusToggle status={p.status} onChange={(status) => saveCalendarPhase({ ...p, status })} />}
        <button className="btn !min-h-11 !px-3 !text-base" onClick={onEdit}>
          <Pencil className="size-5" /> Bearbeiten
        </button>
      </div>
    </div>
  )
}

function PhaseEditor({ phase, isNew = false, onDone }: { phase: CalendarPhase; isNew?: boolean; onDone: () => void }) {
  const toast = useToast()
  const [d, setD] = useState(phase)
  const set = (patch: Partial<CalendarPhase>) => setD((x) => ({ ...x, ...patch }))
  const modified = isDefaultId(phase.id) && phase.updatedAt != null

  const save = async () => {
    if (!d.label.trim()) return toast('Bitte einen Namen eingeben', 'error')
    await saveCalendarPhase({ ...d, label: d.label.trim() })
    onDone()
  }
  const reset = async () => {
    if (!(await ask(`„${phase.label}“ auf den Vorschlag zurücksetzen?\n\nDeine Änderung geht in „Zuletzt gelöscht“.`, { ok: 'Zurücksetzen', danger: true }))) return
    await trashCalendarPhase(phase)
    toast(`Zurückgesetzt – ${TRASH_NOTE}`)
    onDone()
  }
  const remove = async () => {
    if (!(await ask(`Phase „${phase.label}“ löschen?\n\n${TRASH_NOTE}`))) return
    await trashCalendarPhase(phase)
    toast(`Gelöscht – ${TRASH_NOTE}`)
    onDone()
  }

  return (
    <div className="card">
      <label className="mb-3 block">
        <span className="label">Name</span>
        <input className="input" value={d.label} onChange={(e) => set({ label: e.target.value })} placeholder="z. B. Bock-Fegen am Bruch" />
      </label>
      <div className="mb-3">
        <span className="label">von</span>
        <MonthDayInput label="von" value={d.from} onChange={(from) => set({ from })} />
      </div>
      <div className="mb-3">
        <span className="label">bis</span>
        <MonthDayInput label="bis" value={d.to} onChange={(to) => set({ to })} />
      </div>
      <label className="mb-3 block">
        <span className="label">Notiz (optional)</span>
        <input className="input" value={d.note ?? ''} onChange={(e) => set({ note: e.target.value })} placeholder="z. B. bei uns meist 1 Woche später" />
      </label>
      <button className={`btn mb-4 w-full ${d.active ? '' : '!border-warn/60'}`} onClick={() => set({ active: !d.active })}>
        {d.active ? 'Wird vorgeschlagen – ausschalten' : 'Ausgeschaltet – wieder einschalten'}
      </button>
      <div className="flex gap-2">
        <button className="btn flex-1" onClick={onDone}>
          Abbrechen
        </button>
        <button className="btn btn-primary flex-1" onClick={save}>
          Speichern
        </button>
      </div>
      {!isNew && (modified || phase.own) && (
        <div className="mt-3 border-t border-line pt-3">
          {phase.own ? (
            <button className="btn btn-danger w-full" onClick={remove}>
              <Trash2 /> Phase löschen
            </button>
          ) : (
            <button className="btn w-full" onClick={reset}>
              <RotateCcw /> Auf Vorschlag zurücksetzen
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Jagdzeiten (nur vom Nutzer gepflegt) ----------

/** Auswahl „Andere Wildart“ (nicht in der Wildarten-Liste) */
const OTHER = '__andere'

function SeasonsTab() {
  const seasons = useSeasons()
  const species = useSpecies()
  const names = useSpeciesNames()
  const [editing, setEditing] = useState<Season | null>(null)
  const [isNew, setIsNew] = useState(false)
  const now = Date.now()

  if (!seasons) return <p className="text-ink-dim">Lade…</p>
  const groups = species.map((s) => ({ key: s.id, name: s.name, list: seasons.filter((x) => x.speciesId === s.id) })).filter((g) => g.list.length)
  // Weitere Arten (nicht in der Wildarten-Liste, z. B. Steinmarder) bzw. inzwischen gelöschte Wildarten
  const otherIds = [...new Set(seasons.filter((x) => !names.has(x.speciesId)).map((x) => x.speciesId))]
  const others = otherIds.map((id) => {
    const list = seasons.filter((x) => x.speciesId === id)
    return { key: id, name: list.find((x) => x.name)?.name ?? 'Gelöschte Wildart', list }
  })

  const startNew = () => {
    setIsNew(true)
    setEditing({ id: newId(), speciesId: species[0]?.id ?? 'rehwild', label: '', from: '05-01', to: '10-15', note: '' })
  }

  return (
    <>
      <div className="mb-4 rounded-xl border-2 border-warn/60 bg-panel p-3 text-sm">
        <p className="mb-1 font-bold text-warn">Diese Tabelle pflegst nur du.</p>
        <p className="text-ink-dim">
          Die KI trägt hier nichts ein und erfindet keine Jagd- oder Schonzeiten. Maßgeblich sind das Bundesjagdgesetz und das Jagdrecht
          deines Bundeslandes (in Niedersachsen die DVO-NJagdG) – übernimm die Zeiten von dort bzw. aus der Vorlage und prüfe sie.
        </p>
        <p className="mt-1 text-ink-dim">
          Eine Zeile = Zeitraum, in dem diese Wildart/Klasse bejagt werden darf. Außerhalb davon zeigt die App „Schonzeit laut deiner
          Tabelle“.
        </p>
      </div>

      <section className="card mb-4">
        <h2 className="mb-2 text-lg font-bold">Vorlage Niedersachsen</h2>
        <NdsImport compact />
      </section>

      {editing ? (
        <SeasonEditor
          season={editing}
          isNew={isNew}
          onDone={() => {
            setEditing(null)
            setIsNew(false)
          }}
        />
      ) : (
        <button className="btn mb-4 w-full" onClick={startNew}>
          <Plus /> Jagdzeit eintragen
        </button>
      )}

      {!seasons.length && !editing && <p className="text-ink-dim">Noch keine Jagdzeiten eingetragen.</p>}
      {seasons.length > 0 && <p className="mb-2 text-sm text-ink-dim">Stand heute, {fmtDate(new Date(now))}:</p>}
      {[...groups, ...others].map(({ key, name, list }) => (
        <section key={key} className="card mb-3">
          <h2 className="mb-2 text-lg font-bold">{name}</h2>
          <div className="grid gap-2">
            {list.map((x) => {
              const open = seasonOpen(x, now)
              const hint = noteWithoutSource(x.note)
              // Quelle der Vorlage steht oben einmal – nur abweichende Quellen je Zeile zeigen
              const src = x.note?.includes('Quelle:') && !x.note.includes(NDS_SOURCE) ? x.note.slice(x.note.indexOf('Quelle:')) : ''
              return (
                <button
                  key={x.id}
                  className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-3 text-left"
                  onClick={() => {
                    setIsNew(false)
                    setEditing(x)
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{x.label || name}</p>
                    <p className="text-ink-dim">
                      {x.closed ? 'keine Jagdzeit' : allYear(x.from, x.to) ? 'ganzjährig' : `${fmtMonthDay(x.from)} – ${fmtMonthDay(x.to)}`}
                    </p>
                    {hint && <p className="text-sm text-ink-dim">{hint}</p>}
                    {src && <p className="text-xs text-ink-dim/80">{src}</p>}
                  </div>
                  <span className={`badge shrink-0 ${open ? 'border-good/60 text-good' : 'border-warn/60 text-warn'}`}>
                    {open ? 'heute Jagdzeit' : x.closed ? 'geschont' : 'heute Schonzeit'}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}

function SeasonEditor({ season, isNew, onDone }: { season: Season; isNew: boolean; onDone: () => void }) {
  const toast = useToast()
  const species = useSpecies()
  const names = useSpeciesNames()
  const [d, setD] = useState(season)
  const set = (patch: Partial<Season>) => setD((x) => ({ ...x, ...patch }))
  const isOther = !names.has(d.speciesId)
  const displayName = names.get(season.speciesId) ?? season.name ?? season.speciesId

  const save = async () => {
    let { speciesId, name } = d
    if (isOther) {
      name = name?.trim()
      if (!name) return toast('Bitte den Namen der Wildart eingeben', 'error')
      // Neue „andere“ Art: Kennung aus dem Namen; bestehende behalten ihre Kennung
      if (speciesId === OTHER) speciesId = `x:${name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-')}`
    } else name = undefined
    await saveSeason({ ...d, speciesId, name, label: d.label.trim() })
    toast('Jagdzeit gespeichert', 'success')
    onDone()
  }
  const remove = async () => {
    if (!(await ask(`Diese Jagdzeit löschen?\n\n${TRASH_NOTE}`))) return
    await trashSeason(season, displayName)
    toast(`Gelöscht – ${TRASH_NOTE}`)
    onDone()
  }

  return (
    <div className="card mb-4 !border-accent">
      <h2 className="mb-3 text-lg font-bold">{isNew ? 'Jagdzeit eintragen' : 'Jagdzeit bearbeiten'}</h2>
      <label className="mb-3 block">
        <span className="label">Wildart</span>
        <select className="input" value={d.speciesId} onChange={(e) => set({ speciesId: e.target.value })}>
          {species.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {isOther && d.speciesId !== OTHER && <option value={d.speciesId}>{d.name ?? 'Andere Wildart'}</option>}
          <option value={OTHER}>Andere Wildart (nur Jagdzeit) …</option>
        </select>
      </label>
      {isOther && (
        <label className="mb-3 block">
          <span className="label">Name der Wildart</span>
          <input className="input" value={d.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="z. B. Steinmarder" />
        </label>
      )}
      <label className="mb-3 block">
        <span className="label">Klasse / Bezeichnung</span>
        <input className="input" value={d.label} onChange={(e) => set({ label: e.target.value })} placeholder="z. B. Böcke, Schmalrehe, Frischlinge" />
      </label>
      <button className={`btn mb-3 w-full !text-base ${d.closed ? '!border-warn/60 text-warn' : ''}`} onClick={() => set({ closed: !d.closed })}>
        {d.closed ? 'Keine Jagdzeit (ganzjährig geschont) – ändern' : 'Keine Jagdzeit? Hier antippen'}
      </button>
      {!d.closed && (
        <>
          <div className="mb-3">
            <span className="label">Jagdzeit von</span>
            <MonthDayInput label="Jagdzeit von" value={d.from} onChange={(from) => set({ from })} />
          </div>
          <div className="mb-3">
            <span className="label">bis</span>
            <MonthDayInput label="Jagdzeit bis" value={d.to} onChange={(to) => set({ to })} />
          </div>
        </>
      )}
      <label className="mb-4 block">
        <span className="label">Hinweis / Quelle / Stand</span>
        <textarea
          className="input !min-h-20 py-3"
          value={d.note ?? ''}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="z. B. Landesjagdzeitenverordnung, Stand 2026"
        />
      </label>
      <div className="flex gap-2">
        {!isNew && (
          <button className="btn btn-danger" onClick={remove} aria-label="Löschen">
            <Trash2 />
          </button>
        )}
        <button className="btn flex-1" onClick={onDone}>
          Abbrechen
        </button>
        <button className="btn btn-primary flex-1" onClick={save}>
          Speichern
        </button>
      </div>
    </div>
  )
}
