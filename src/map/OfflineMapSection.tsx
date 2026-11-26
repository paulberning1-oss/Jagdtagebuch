// „Mehr → Offline-Karte“: Kacheln des Reviers vorab aufs Gerät laden (nur erlaubte Anbieter).
import { useLiveQuery } from 'dexie-react-hooks'
import { CloudDownload, Map as MapIcon, Trash2, X } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { ask } from '../components/ConfirmDialog'
import { Chip, useToast } from '../components/ui'
import { revierBounds, type Bounds } from '../db/ownData'
import { setSetting, useSetting } from '../db/settings'
import { navigate } from '../lib/router'
import { hasGoogleKey } from './googleTiles'
import { OFFLINE_PROVIDERS, type TileProvider } from './providers'
import { areaKm2, padBounds, tileCount } from './tileMath'
import { deleteTiles, downloadTiles, tileDb, type DownloadProgress, type TilePack } from './tileStore'

const MIN_ZOOM = 12
/** Rand um das Revier in Metern */
const MARGIN_M = 300
/** Obergrenze je Download (Schutz vor versehentlich riesigen Gebieten) */
const MAX_TILES = 25_000

const DETAIL: { z: number; label: string }[] = [
  { z: 16, label: 'Übersicht' },
  { z: 17, label: 'Normal' },
  { z: 18, label: 'Genau' },
  { z: 19, label: 'Sehr genau' },
]

// Laufender Download liegt außerhalb der Komponente → läuft weiter, wenn man die Seite verlässt
interface Running {
  provider: string
  progress: DownloadProgress
  abort: AbortController
}
let running: Running | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const useRunning = () => useSyncExternalStore(subscribe, () => running)

const mb = (bytes: number) => (bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })
const sameBounds = (a: Bounds, b: Bounds) =>
  Math.abs(a.south - b.south) < 1e-6 && Math.abs(a.north - b.north) < 1e-6 && Math.abs(a.west - b.west) < 1e-6 && Math.abs(a.east - b.east) < 1e-6

export function OfflineMapSection() {
  const [area, setArea] = useState<{ bounds: Bounds; own: boolean } | null | undefined>(undefined)
  useEffect(() => {
    revierBounds().then((r) => setArea(r ? { bounds: padBounds(r.bounds, MARGIN_M), own: r.own } : null))
  }, [])

  return (
    <section className="card mb-4" id="offline-karte">
      <h2 className="mb-1 text-lg font-bold">Offline-Karte</h2>
      <p className="mb-3 text-ink-dim">
        Lädt die Karte deines Reviers (mit {MARGIN_M} m Rand) auf dieses Gerät. Dann geht die Karte auch ohne Empfang im Wald.
        Nur bei Anbietern, die das erlauben – Esri, Google, OpenStreetMap und Topo nicht.
      </p>
      {area === undefined ? null : area === null ? (
        <p className="text-hint">Lege zuerst dein Revier an (Grenze oder Sitze), dann kann ich das Gebiet berechnen.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-dim">
            Gebiet: ca. {areaKm2(area.bounds).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km²
            {!area.own && ' – Achtung: das ist das Beispielrevier, du hast noch kein eigenes Revier angelegt.'}
          </p>
          <div className="grid gap-3">
            {OFFLINE_PROVIDERS.map((p) => (
              <ProviderCard key={p.id} provider={p} bounds={area.bounds} />
            ))}
          </div>
        </>
      )}
      <p className="mt-3 text-sm text-ink-dim">
        Google Satellit:{' '}
        {hasGoogleKey() ? <span className="text-good">Schlüssel hinterlegt</span> : <span>kein Schlüssel (Ebene ausgeblendet)</span>} – nur
        online.
      </p>
    </section>
  )
}

function ProviderCard({ provider, bounds }: { provider: TileProvider; bounds: Bounds }) {
  const toast = useToast()
  const off = provider.offline!
  const pack = useLiveQuery(() => tileDb.packs.get(provider.id), [provider.id]) as TilePack | undefined | null
  const run = useRunning()
  const baseLayer = useSetting('baseLayer')
  const options = DETAIL.filter((d) => d.z <= off.maxZoom)
  const [maxZ, setMaxZ] = useState(Math.min(18, off.maxZoom))
  useEffect(() => {
    if (pack) setMaxZ(pack.maxZoom)
  }, [pack])

  const count = tileCount(bounds, MIN_ZOOM, maxZ)
  const estMb = (count * off.avgKb) / 1024
  const mine = run?.provider === provider.id ? run : null
  const otherBusy = !!run && !mine
  const resumable = !!pack && (pack.partial || pack.failed > 0) && pack.maxZoom === maxZ && sameBounds(pack.bounds, bounds)
  const upToDate = !!pack && !pack.partial && !pack.failed && pack.maxZoom === maxZ && sameBounds(pack.bounds, bounds)

  const start = async () => {
    if (!navigator.onLine) return toast('Zum Herunterladen brauchst du Internet (am besten WLAN).', 'error')
    if (count > MAX_TILES) return toast(`Zu viele Kacheln (${count.toLocaleString('de-DE')}). Bitte eine gröbere Stufe wählen.`, 'error')
    // Anderes Gebiet oder andere Stufe → alte Kacheln dieses Anbieters weg, damit nichts Überflüssiges liegen bleibt
    if (pack && !resumable) {
      if (!(await ask(`Die bisher gespeicherte Karte (${mb(pack.bytes)} MB) wird ersetzt. Weiter?`, { ok: 'Ersetzen' }))) return
      await deleteTiles(provider.id)
    }
    const abort = new AbortController()
    running = { provider: provider.id, progress: { done: 0, total: count, failed: 0, bytes: 0 }, abort }
    emit()
    try {
      const res = await downloadTiles({
        provider: provider.id,
        url: off.url,
        bounds,
        minZoom: MIN_ZOOM,
        maxZoom: maxZ,
        total: count,
        parallel: off.parallel,
        signal: abort.signal,
        onProgress: (pr) => {
          if (running?.abort === abort) {
            running = { ...running, progress: pr }
            emit()
          }
        },
      })
      if (abort.signal.aborted) toast('Abgebrochen – der geladene Teil bleibt gespeichert, du kannst später fortsetzen.')
      else if (res.failed) toast(`Fertig, aber ${res.failed} Kacheln fehlen (Verbindung?). Tippe auf „Fortsetzen“.`, 'error')
      else toast(`${provider.label}: Revier offline gespeichert (${mb(res.bytes)} MB)`, 'success')
    } catch (e) {
      toast(`Speichern fehlgeschlagen: ${(e as Error).message}`, 'error')
    } finally {
      if (running?.abort === abort) running = null
      emit()
    }
  }

  const remove = async () => {
    if (!pack || !(await ask(`Offline-Karte „${provider.label}“ von diesem Gerät löschen (${mb(pack.bytes)} MB)? Online geht sie weiter.`))) return
    await deleteTiles(provider.id)
    toast('Offline-Karte gelöscht', 'success')
  }

  return (
    <div className="rounded-xl border border-line p-3">
      <p className="font-semibold">{provider.label}</p>
      <p className="mb-2 text-sm text-ink-dim">
        {provider.description.split(',')[0]} · {off.coverage}
      </p>

      {pack && !mine && (
        <p className={`mb-2 text-sm ${pack.partial || pack.failed ? 'text-hint' : 'text-good'}`}>
          {pack.partial ? 'Teilweise gespeichert' : pack.failed ? 'Gespeichert, einige Kacheln fehlen' : 'Offline gespeichert'}: {pack.count.toLocaleString('de-DE')}{' '}
          Kacheln, {mb(pack.bytes)} MB, bis Stufe {pack.maxZoom} ·{' '}
          {new Date(pack.savedAt).toLocaleDateString('de-DE')}
        </p>
      )}

      {mine ? (
        <div>
          <div className="mb-1 h-3 overflow-hidden rounded-full bg-bg">
            <div className="h-full bg-accent transition-all" style={{ width: `${(100 * mine.progress.done) / Math.max(1, mine.progress.total)}%` }} />
          </div>
          <p className="mb-2 text-sm text-ink-dim">
            {mine.progress.done.toLocaleString('de-DE')} von {mine.progress.total.toLocaleString('de-DE')} Kacheln · {mb(mine.progress.bytes)} MB
            {mine.progress.failed > 0 && ` · ${mine.progress.failed} fehlgeschlagen`}
          </p>
          <button className="btn w-full" onClick={() => mine.abort.abort()}>
            <X /> Abbrechen
          </button>
        </div>
      ) : (
        <>
          <p className="mb-1 text-sm text-ink-dim">Genauigkeit</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {options.map((d) => (
              <Chip key={d.z} active={maxZ === d.z} onClick={() => setMaxZ(d.z)}>
                {d.label}
              </Chip>
            ))}
          </div>
          <p className="mb-3 text-sm text-ink-dim">
            {count.toLocaleString('de-DE')} Kacheln, geschätzt ca. {estMb < 1 ? '< 1' : Math.round(estMb).toLocaleString('de-DE')} MB
            {count > MAX_TILES && <span className="text-warn"> – zu viel, bitte gröber wählen</span>}
          </p>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <button className="btn btn-primary" disabled={otherBusy || upToDate || count > MAX_TILES} onClick={start}>
              <CloudDownload /> {upToDate ? 'Aktuell gespeichert' : resumable ? 'Fortsetzen' : pack ? 'Neu speichern' : 'Revier offline speichern'}
            </button>
            <button
              className={`btn !px-3 ${baseLayer === provider.id ? 'btn-primary' : ''}`}
              aria-label="Auf der Karte anzeigen"
              title="Auf der Karte anzeigen"
              onClick={async () => {
                await setSetting('baseLayer', provider.id)
                navigate('karte')
              }}
            >
              <MapIcon />
            </button>
            <button className="btn btn-danger !px-3" disabled={!pack} aria-label="Offline-Karte löschen" onClick={remove}>
              <Trash2 />
            </button>
          </div>
          {otherBusy && <p className="mt-2 text-sm text-ink-dim">Erst wenn der andere Download fertig ist.</p>}
        </>
      )}
    </div>
  )
}
