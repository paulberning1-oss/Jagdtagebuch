// „Aus Foto nachtragen“: handschriftliche Tagebuchseiten fotografieren → Claude liest sie → Entwürfe prüfen → übernehmen.
// Route: #/tagebuch/foto
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, Camera, Check, ImagePlus, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { parseTagebuch, type FotoTagebuch } from '../../supabase/functions/ki/schemas'
import { askKi, KI_CONSENT_VERSION, KiError, type KiAnswer, type KiImage } from '../ai/ki'
import { KiErrorBox } from '../ai/KiSection'
import { useToast } from '../components/ui'
import { useAccount } from '../cloud/auth'
import { cloudEnabled } from '../cloud/supabase'
import { db } from '../db/db'
import { useSetting } from '../db/settings'
import { ACTIVITY_LEVELS } from '../domain/hunt'
import { fromPos } from '../lib/geo'
import { resizeImage } from '../lib/image'
import { navigate } from '../lib/router'
import { syncPendingWeather } from '../services/weatherSync'
import { useSpecies } from './hooks'
import { draftBlocker, draftToRecords, importPrompt, importStands, toDrafts, type DraftHunt, type ImportContext } from './photoImport'

const MAX_PHOTOS = 4

interface Picked {
  id: string
  file: File
  url: string
}

async function toKiImage(file: File): Promise<KiImage> {
  // Groß genug, dass Handschrift lesbar bleibt, klein genug für die Übertragung
  const { blob } = await resizeImage(file, 2000, 0.85)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Foto konnte nicht gelesen werden'))
    r.readAsDataURL(blob)
  })
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}

export function PhotoImportPage() {
  const toast = useToast()
  const account = useAccount()
  const consent = useSetting('kiConsent')
  const species = useSpecies()
  const facilities = useLiveQuery(() => db.facilities.toArray(), [])
  const existing = useLiveQuery(() => db.hunts.toArray(), [])
  const [photos, setPhotos] = useState<Picked[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<KiError | null>(null)
  const [result, setResult] = useState<{ answer: KiAnswer; data: FotoTagebuch | null } | null>(null)
  const [drafts, setDrafts] = useState<DraftHunt[]>([])
  const [saving, setSaving] = useState(false)

  // Vorschaubilder wieder freigeben
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useMemo<ImportContext | null>(() => {
    if (!facilities) return null
    const stands = importStands(facilities)
    const pts = stands.map((s) => fromPos((s.geometry as { coordinates: number[] }).coordinates))
    const fallbackPos = pts.length ? { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length } : null
    return { stands, species, fallbackPos, now: Date.now() }
  }, [facilities, species])

  const agreed = !!consent && consent.version >= KI_CONSENT_VERSION
  const addFiles = (files: FileList | null) => {
    if (!files) return
    const next = [...photos]
    for (const f of Array.from(files)) {
      if (next.length >= MAX_PHOTOS) {
        toast(`Höchstens ${MAX_PHOTOS} Seiten auf einmal – den Rest danach.`, 'error')
        break
      }
      next.push({ id: `${f.name}-${f.size}-${next.length}`, file: f, url: URL.createObjectURL(f) })
    }
    setPhotos(next)
  }

  const read = async () => {
    if (!ctx || !photos.length) return
    setBusy(true)
    setError(null)
    try {
      const images = await Promise.all(photos.map((p) => toKiImage(p.file)))
      const answer = await askKi('foto', [{ role: 'user', content: importPrompt(ctx) }], undefined, images)
      const data = parseTagebuch(answer.text)
      setResult({ answer, data })
      setDrafts(data ? toDrafts(data, ctx, existing ?? []) : [])
    } catch (e) {
      setError(e instanceof KiError ? e : new KiError('api', (e as Error).message))
    } finally {
      setBusy(false)
    }
  }

  const update = (key: string, patch: Partial<DraftHunt>) =>
    setDrafts((list) =>
      list.map((d) => {
        if (d.key !== key) return d
        const next = { ...d, ...patch }
        return { ...next, blocker: ctx ? draftBlocker(next, ctx) : next.blocker }
      }),
    )

  const save = async () => {
    if (!ctx) return
    const chosen = drafts.filter((d) => d.selected && !draftBlocker(d, ctx))
    if (!chosen.length) return
    setSaving(true)
    try {
      const recs = chosen.map((d) => draftToRecords(d, ctx))
      await db.transaction('rw', db.hunts, db.sightings, async () => {
        await db.hunts.bulkAdd(recs.map((r) => r.hunt))
        await db.sightings.bulkAdd(recs.flatMap((r) => r.sightings))
      })
      syncPendingWeather()
      toast(`${recs.length} Ansitz(e) übernommen – das Wetter wird nachgeladen.`, 'success')
      navigate('tagebuch')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = ctx ? drafts.filter((d) => d.selected && !draftBlocker(d, ctx)).length : 0

  return (
    <div className="h-full overflow-y-auto p-4 pt-safe">
      <div className="mb-3 flex items-center gap-2">
        <button className="btn-round !size-12" onClick={() => navigate('tagebuch')} aria-label="Zurück zum Tagebuch">
          <ArrowLeft />
        </button>
        <h1 className="flex-1 text-2xl font-bold">Aus Foto nachtragen</h1>
      </div>

      {!cloudEnabled || !account ? (
        <p className="card text-ink-dim">Das Lesen der Fotos macht die KI – das geht nur mit Konto (Mehr → Mein Konto).</p>
      ) : !agreed ? (
        <div className="card">
          <p className="mb-3">Die Fotos werden zum Lesen an die KI (Claude) geschickt. Dafür brauchst du einmal die Datenschutz-Zustimmung.</p>
          <button className="btn w-full" onClick={() => navigate('mehr')}>
            Zu „Mehr → KI-Assistent“
          </button>
        </div>
      ) : !result ? (
        <>
          <p className="mb-4 text-sm text-ink-dim">
            Fotografiere die Seiten deines Jagdtagebuchs (bis zu {MAX_PHOTOS} auf einmal). Claude liest die Handschrift und schlägt die Einträge
            vor – du prüfst sie, bevor etwas gespeichert wird. Tipp: gerade von oben, gutes Licht, ganze Seite im Bild.
          </p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {photos.map((p, i) => (
              <div key={p.id} className="relative overflow-hidden rounded-xl border border-line">
                <img src={p.url} alt={`Seite ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                <span className="absolute top-1 left-1 rounded-md bg-bg/80 px-1.5 text-sm font-bold">{i + 1}</span>
                <button
                  className="absolute top-1 right-1 rounded-full bg-bg/80 p-1"
                  onClick={() => {
                    URL.revokeObjectURL(p.url)
                    setPhotos(photos.filter((x) => x.id !== p.id))
                  }}
                  aria-label={`Seite ${i + 1} entfernen`}
                >
                  <X className="size-5" />
                </button>
              </div>
            ))}
          </div>
          {photos.length < MAX_PHOTOS && (
            <div className="mb-4 grid grid-cols-2 gap-2">
              <label className="btn cursor-pointer">
                <Camera /> Foto machen
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
              </label>
              <label className="btn cursor-pointer">
                <ImagePlus /> Aus Fotos
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
              </label>
            </div>
          )}
          <button className="btn btn-primary w-full" disabled={!photos.length || busy || !ctx} onClick={read}>
            <Sparkles /> {busy ? 'Claude liest die Seiten … (bis zu 2 Minuten)' : `Lesen lassen (${photos.length} ${photos.length === 1 ? 'Seite' : 'Seiten'})`}
          </button>
          <p className="mt-1 text-xs text-ink-dim">Zählt als eine KI-Anfrage. Die Fotos werden nicht in der App gespeichert.</p>
          {error && <KiErrorBox error={error} />}
        </>
      ) : (
        <>
          {!result.data ? (
            <div className="card mb-4">
              <p className="mb-2 text-warn">Die Antwort hatte nicht das erwartete Format.</p>
              <button className="btn w-full" onClick={() => setResult(null)}>
                Noch einmal versuchen
              </button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-sm text-ink-dim">
                {drafts.length} {drafts.length === 1 ? 'Eintrag' : 'Einträge'} erkannt. Prüfe Datum, Zeit und Sitz – alles andere kannst du nach dem Übernehmen
                im Eintrag ändern.
              </p>
              {result.data.hinweis && (
                <p className="mb-3 flex gap-2 rounded-xl border border-hint/60 p-2 text-sm">
                  <AlertTriangle className="size-5 shrink-0 text-hint" /> {result.data.hinweis}
                </p>
              )}
              <div className="grid gap-3 pb-3">
                {drafts.map((d) => (
                  <DraftCard key={d.key} d={d} ctx={ctx!} onChange={(patch) => update(d.key, patch)} />
                ))}
              </div>
              <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 p-3 pb-safe">
                <button className="btn btn-primary w-full" disabled={!selectedCount || saving} onClick={save}>
                  <Check /> {selectedCount} {selectedCount === 1 ? 'Eintrag' : 'Einträge'} übernehmen
                </button>
                <button className="mt-2 w-full text-sm text-ink-dim underline" onClick={() => setResult(null)}>
                  Verwerfen und andere Fotos wählen
                </button>
              </div>
            </>
          )}
          <p className="mt-2 text-xs text-ink-dim">
            {result.answer.model} · heute {result.answer.used}/{result.answer.limit} Anfragen
          </p>
        </>
      )}
    </div>
  )
}

function DraftCard({ d, ctx, onChange }: { d: DraftHunt; ctx: ImportContext; onChange: (p: Partial<DraftHunt>) => void }) {
  const e = d.entry
  const species = useSpecies()
  const name = (id: string, text: string) => species.find((s) => s.id === id)?.name ?? text
  const blocker = draftBlocker(d, ctx)
  const info = [
    e.wind_richtung && `Wind aus ${e.wind_richtung}${e.wind_kmh >= 0 ? ` ${e.wind_kmh} km/h` : ''}`,
    e.temperatur_c > -99 && `${e.temperatur_c} °C`,
    e.wetter_text,
    e.aktivitaet > 0 && `Aktivität: ${ACTIVITY_LEVELS.find((a) => a.value === e.aktivitaet)?.label}`,
    e.sterne > 0 && `${'★'.repeat(e.sterne)}`,
  ].filter(Boolean)

  return (
    <div className={`card ${d.selected && !blocker ? '!border-accent/70' : 'opacity-80'}`}>
      <label className="mb-3 flex items-center gap-3">
        <input
          type="checkbox"
          className="size-6 shrink-0 accent-[var(--color-accent)]"
          checked={d.selected && !blocker}
          disabled={!!blocker}
          onChange={(ev) => onChange({ selected: ev.target.checked })}
        />
        <span className="text-lg font-bold">{e.sitz_text || 'Eintrag'}</span>
      </label>
      <div className="mb-2 grid grid-cols-[1.4fr_1fr_1fr] gap-2">
        <input type="date" className="input !min-h-12 !px-2 !text-base" value={d.date} onChange={(ev) => onChange({ date: ev.target.value, selected: true })} aria-label="Datum" />
        <input type="time" className="input !min-h-12 !px-2 !text-base" value={d.from} onChange={(ev) => onChange({ from: ev.target.value })} aria-label="Beginn" />
        <input type="time" className="input !min-h-12 !px-2 !text-base" value={d.to} onChange={(ev) => onChange({ to: ev.target.value })} aria-label="Ende" />
      </div>
      <select className="input mb-2 !min-h-12 !text-base" value={d.standId} onChange={(ev) => onChange({ standId: ev.target.value })} aria-label="Sitz">
        <option value="">{ctx.fallbackPos ? 'Ohne festen Sitz' : 'Sitz wählen …'}</option>
        {ctx.stands.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name || 'Sitz'}
          </option>
        ))}
      </select>
      {info.length > 0 && <p className="text-sm text-ink-dim">{info.join(' · ')}</p>}
      {e.anblick.length > 0 && (
        <p className="text-sm">
          <b>Anblick:</b>{' '}
          {e.anblick.map((a) => `${a.anzahl} ${name(a.wildart_id, a.wildart_text)}${a.geschlecht_alter.length ? ` (${a.geschlecht_alter.join(', ')})` : ''}${a.uhrzeit ? ` ${a.uhrzeit}` : ''}`).join('; ')}
        </p>
      )}
      {e.erlegt.length > 0 && (
        <p className="text-sm text-good">
          <b>Erlegt:</b> {e.erlegt.map((k) => `${name(k.wildart_id, k.wildart_text)}${k.geschlecht_alter ? ` (${k.geschlecht_alter})` : ''}${k.gewicht_kg > 0 ? `, ${k.gewicht_kg} kg` : ''}`).join('; ')}
        </p>
      )}
      {e.fazit && (
        <p className="text-sm">
          <b>Fazit:</b> {e.fazit}
        </p>
      )}
      {e.fehler && (
        <p className="text-sm">
          <b>Nächstes Mal anders:</b> {e.fehler}
        </p>
      )}
      {e.notizen && <p className="text-sm text-ink-dim">{e.notizen}</p>}
      {(d.notes.length > 0 || blocker) && (
        <ul className="mt-2 grid gap-1 text-sm">
          {blocker && <li className="text-warn">⚠ {blocker}</li>}
          {d.notes.map((n, i) => (
            <li key={i} className="text-hint">
              • {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
