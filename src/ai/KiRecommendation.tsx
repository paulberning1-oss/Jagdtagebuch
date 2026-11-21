// KI-Ansitzempfehlung im Assistenten (Teilschritt 7): schickt Plan + eigene Daten an Claude (über die Funktion „ki“)
// und zeigt Sitz, Anmarschweg, Erwartung, worauf achten und warum – jede Aussage mit Herkunft.
import { AlertTriangle, ChevronDown, ChevronUp, Play, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { parseEmpfehlung, type KiEmpfehlung, type KiPoint, type SourceKind } from '../../supabase/functions/ki/schemas'
import { useToast } from '../components/ui'
import { useAccount } from '../cloud/auth'
import { cloudEnabled } from '../cloud/supabase'
import type { Facility } from '../db/db'
import { setSetting, useSetting } from '../db/settings'
import type { StandRating } from '../domain/assistant'
import type { Hunt, HuntEnv, Sighting } from '../domain/hunt'
import { startHunt } from '../journal/huntActions'
import { useCalendar, useKnowledge, useSeasons, useSpeciesNames } from '../knowledge/hooks'
import { navigate } from '../lib/router'
import { askKi, KI_CONSENT_VERSION, KiError, type KiAnswer } from './ki'
import { KiErrorBox } from './KiSection'
import { buildPlanContext } from './planContext'

interface Props {
  start: number
  end: number
  speciesId: string | null
  speciesName: string
  env: HuntEnv | null
  ratings: StandRating[] | null
  facilities: Facility[] | undefined
  hunts: Hunt[] | undefined
  sightings: Sighting[] | undefined
  scent: { length: number; width: number }
}

interface Result {
  key: string
  answer: KiAnswer
  rec: KiEmpfehlung | null
}

/** Letztes Ergebnis bleibt erhalten, solange die App offen ist (Wechsel zwischen Reitern) */
let lastResult: Result | null = null

export function KiRecommendation(p: Props) {
  const account = useAccount()
  const consent = useSetting('kiConsent')
  const unverified = useSetting('kiUnverified') ?? false
  const demo = useSetting('kiDemo') ?? false
  const knowledge = useKnowledge()
  const calendar = useCalendar()
  const seasons = useSeasons()
  const names = useSpeciesNames()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<KiError | null>(null)
  const [result, setResult] = useState<Result | null>(lastResult)
  const [showData, setShowData] = useState(false)

  const ctx = useMemo(() => {
    if (!p.env || !p.ratings || !p.facilities || !p.hunts || !p.sightings || !knowledge || !calendar || !seasons) return null
    return buildPlanContext({
      start: p.start,
      end: p.end,
      speciesId: p.speciesId,
      speciesName: p.speciesName,
      env: p.env,
      ratings: p.ratings,
      facilities: p.facilities,
      hunts: p.hunts,
      sightings: p.sightings,
      knowledge,
      calendar,
      seasons,
      speciesNames: names,
      includeUnverified: unverified,
      includeDemo: demo,
      scent: { length: p.scent.length, width: p.scent.width },
    })
  }, [p.start, p.end, p.speciesId, p.speciesName, p.env, p.ratings, p.facilities, p.hunts, p.sightings, p.scent.length, p.scent.width, knowledge, calendar, seasons, names, unverified, demo])

  const hasDemo = !!p.facilities?.some((f) => f.demo) || !!p.hunts?.some((h) => h.demo)
  const key = `${p.start}|${p.speciesId}|${unverified}|${demo}`
  const shown = result?.key === key ? result : null
  const agreed = !!consent && consent.version >= KI_CONSENT_VERSION

  const run = async () => {
    if (!ctx) return
    setBusy(true)
    setError(null)
    try {
      const answer = await askKi('empfehlung', [{ role: 'user', content: ctx.question }], ctx.context)
      const r = { key, answer, rec: parseEmpfehlung(answer.text) }
      lastResult = r
      setResult(r)
    } catch (e) {
      setError(e instanceof KiError ? e : new KiError('api', String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card mb-4 !border-accent/60">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
        <Sparkles className="text-accent" /> KI-Empfehlung (Claude)
      </h2>
      <p className="mb-3 text-sm text-ink-dim">
        Claude kombiniert Wetter, Wind, Mond, Phase, dein Revier, dein Tagebuch (mit Fazit und Fehlern) und die Punktbewertung unten.
      </p>

      {!cloudEnabled || !account ? (
        <p className="text-sm text-ink-dim">Die KI geht nur mit Konto – bitte unter „Mehr → Mein Konto“ anmelden.</p>
      ) : (
        <>
          <div className="mb-3 grid gap-2 text-sm">
            <Toggle checked={unverified} onChange={(v) => setSetting('kiUnverified', v)}>
              Auch <b>ungeprüftes</b> Jagdwissen mitschicken (wird als ungeprüft markiert)
            </Toggle>
            {hasDemo && (
              <Toggle checked={demo} onChange={(v) => setSetting('kiDemo', v)}>
                Auch <b>Testdaten</b> (Beispielrevier) mitschicken
              </Toggle>
            )}
          </div>

          {ctx && ctx.counts.stands === 0 ? (
            <p className="text-sm text-warn">Keine eigenen Sitze vorhanden{hasDemo ? ' – nur Testdaten. Schalte „Testdaten mitschicken“ ein, um es auszuprobieren.' : '.'}</p>
          ) : (
            <>
              {agreed ? (
                <button className="btn btn-primary w-full" onClick={run} disabled={busy || !ctx}>
                  <Sparkles /> {busy ? 'Claude denkt nach … (bis zu 1 Minute)' : shown ? 'Neu fragen' : 'KI-Empfehlung holen'}
                </button>
              ) : (
                <div className="rounded-xl border border-hint/60 p-3 text-sm">
                  <p className="mb-2">Vor der ersten Nutzung brauchst du einmal die Datenschutz-Zustimmung. Was gesendet würde, siehst du unten.</p>
                  <button className="btn w-full !min-h-12 !text-base" onClick={() => navigate('mehr')}>
                    Zu „Mehr → KI-Assistent“
                  </button>
                </div>
              )}
              {ctx && (
                <button className="mt-2 flex w-full items-center gap-1 text-left text-sm text-ink-dim" onClick={() => setShowData((x) => !x)}>
                  {showData ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  Was wird gesendet? {ctx.counts.stands} Sitze, {ctx.counts.objects} Objekte, {ctx.counts.routes} Wege, {ctx.counts.similar} von{' '}
                  {ctx.counts.hunts} Ansitzen, {ctx.counts.knowledge} Wissensabschnitte, ca.{' '}
                  {((ctx.context.length + ctx.question.length) / 3500).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tsd. Token
                </button>
              )}
              {ctx && showData && (
                <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-line bg-bg p-2 text-xs whitespace-pre-wrap">
                  {ctx.question}
                  {'\n\n――――― stabiler Teil (wird zwischengespeichert) ―――――\n\n'}
                  {ctx.context}
                </pre>
              )}
            </>
          )}
          {error && <KiErrorBox error={error} />}
          {shown && <ResultView r={shown} facilities={p.facilities ?? []} canStart={Math.abs(p.start - Date.now()) < 90 * 60000} />}
        </>
      )}
    </section>
  )
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

const KIND_STYLE: Record<SourceKind, string> = {
  tagebuch: 'border-good/60 text-good',
  jagdwissen: 'border-accent/60 text-accent',
  bewertung: 'border-line text-ink-dim',
  tabelle: 'border-hint/60 text-hint',
  vermutung: 'border-warn/60 text-warn',
}

function Source({ art, herkunft }: { art: SourceKind; herkunft: string }) {
  return <span className={`badge !whitespace-normal ${KIND_STYLE[art]}`}>{herkunft || art}</span>
}

function Points({ title, list }: { title: string; list: KiPoint[] }) {
  if (!list.length) return null
  return (
    <div className="mb-3">
      <h4 className="mb-1 font-bold">{title}</h4>
      <ul className="grid gap-2">
        {list.map((x, i) => (
          <li key={i} className="text-sm">
            {x.text} <Source art={x.art} herkunft={x.herkunft} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResultView({ r, facilities, canStart }: { r: Result; facilities: Facility[]; canStart: boolean }) {
  const toast = useToast()
  const { rec, answer } = r
  if (!rec) {
    return (
      <div className="mt-3 rounded-xl border border-line p-3 text-sm">
        <p className="mb-1 text-warn">Die Antwort hatte nicht das erwartete Format:</p>
        <p className="whitespace-pre-line">{answer.text}</p>
      </div>
    )
  }
  // Nur Sitze/Wege aus den eigenen Daten anerkennen (Schutz vor erfundenen Kennungen)
  const stand = facilities.find((f) => f.id === rec.sitz.id)
  const alt = rec.alternative.id ? facilities.find((f) => f.id === rec.alternative.id) : null
  const route = rec.anmarschweg.id ? facilities.find((f) => f.id === rec.anmarschweg.id && f.type === 'anmarsch') : null
  const routeWrong = !!rec.anmarschweg.id && (!route || route.standId !== stand?.id)
  const level = { gering: 'border-line text-ink-dim', mittel: 'border-hint/60 text-hint', gut: 'border-good/60 text-good' }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-3 rounded-xl border-2 border-accent bg-panel-2 p-3">
        <p className="text-sm text-ink-dim">Empfohlener Sitz</p>
        <p className="text-xl font-bold">{stand?.name || rec.sitz.name}</p>
        {!stand && (
          <p className="flex items-center gap-1 text-sm text-warn">
            <AlertTriangle className="size-4" /> Diesen Sitz gibt es in deinen Daten nicht – Empfehlung mit Vorsicht lesen.
          </p>
        )}
        {rec.sitz.kurz && <p className="mt-1">{rec.sitz.kurz}</p>}
        <p className="mt-2 text-sm">
          <b>Anmarsch:</b> {route ? `„${route.name || 'Anmarschweg'}“` : rec.anmarschweg.name || 'kein eingezeichneter Weg'}
          {rec.anmarschweg.hinweis && <> – {rec.anmarschweg.hinweis}</>}
        </p>
        {routeWrong && <p className="text-sm text-warn">⚠ Der genannte Weg gehört nicht zu diesem Sitz.</p>}
        {stand && canStart && (
          <button
            className="btn btn-primary mt-3 w-full !min-h-12"
            onClick={async () => {
              try {
                await startHunt({ stand })
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

      {rec.alternative.name && (
        <p className="mb-3 text-sm">
          <b>Alternative:</b> {alt?.name || rec.alternative.name}
          {rec.alternative.kurz && <> – {rec.alternative.kurz}</>}
        </p>
      )}

      {rec.erwartung.length > 0 && (
        <div className="mb-3">
          <h4 className="mb-1 font-bold">Erwartung</h4>
          <ul className="grid gap-2">
            {rec.erwartung.map((e, i) => (
              <li key={i} className="text-sm">
                <b>{e.wildart}</b> · {e.uhrzeit} <span className={`badge ${level[e.einschaetzung]}`}>{e.einschaetzung}</span>{' '}
                {e.herkunft && <span className="text-xs text-ink-dim">({e.herkunft})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Points title="Worauf achten" list={rec.achten} />
      <Points title="Warum" list={rec.warum} />

      {rec.jagdzeit && (
        <p className="mb-3 rounded-xl border border-hint/40 p-2 text-sm">
          <b>Jagdzeit:</b> {rec.jagdzeit}
        </p>
      )}
      {rec.datenlage && (
        <p className="mb-3 rounded-xl border border-line p-2 text-sm text-ink-dim">
          <b className="text-ink">Datenlage:</b> {rec.datenlage}
        </p>
      )}
      <p className="text-xs text-ink-dim">
        {answer.model} · heute {answer.used}/{answer.limit} Anfragen · {answer.usage.input + answer.usage.cacheRead + answer.usage.cacheWrite} Token rein (
        {answer.usage.cacheRead} aus dem Cache), {answer.usage.output} raus. Die KI kann sich irren – entscheide selbst.
      </p>
    </div>
  )
}
