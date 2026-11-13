import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useToast } from '../components/ui'
import { db } from '../db/db'
import { ownDataCounts, revierBounds } from '../db/ownData'
import { setSetting, useSetting } from '../db/settings'
import { clearDemoData, DEMO_CENTER, DEMO_ZOOM, loadDemoData } from '../demo/demoRevier'
import { navigate } from '../lib/router'
import { hasGoogleKey } from '../map/googleTiles'
import { SpeciesEditor } from './SpeciesEditor'

export default function SettingsPage() {
  const toast = useToast()
  const scentLength = useSetting('scentLength') ?? 300
  const scentWidth = useSetting('scentWidth') ?? 40
  const demoCount = useLiveQuery(async () => {
    const f = await db.facilities.filter((x) => !!x.demo).count()
    const b = await db.boundaries.filter((x) => !!x.demo).count()
    return f + b
  }, [])
  const own = useLiveQuery(() => ownDataCounts(), [])
  const ownCount = own?.facilities
  const [storage, setStorage] = useState<{ used: number; quota: number; persisted: boolean } | null>(null)

  useEffect(() => {
    ;(async () => {
      const est = await navigator.storage?.estimate?.()
      const persisted = (await navigator.storage?.persisted?.()) ?? false
      if (est) setStorage({ used: est.usage ?? 0, quota: est.quota ?? 0, persisted })
    })()
  }, [demoCount, ownCount])

  const mb = (b: number) => (b / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })

  return (
    <div className="h-full overflow-y-auto p-4 pt-safe">
      <h1 className="mb-4 text-2xl font-bold">Mehr</h1>

      <section className="card mb-4">
        <h2 className="mb-3 text-lg font-bold">Witterungskegel</h2>
        <label className="mb-4 block">
          <span className="label">Länge: {scentLength} m</span>
          <input
            type="range"
            className="h-10 w-full accent-[#d4a72c]"
            min={100}
            max={800}
            step={50}
            value={scentLength}
            onChange={(e) => setSetting('scentLength', Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="label">Öffnung: {scentWidth}°</span>
          <input
            type="range"
            className="h-10 w-full accent-[#d4a72c]"
            min={20}
            max={90}
            step={5}
            value={scentWidth}
            onChange={(e) => setSetting('scentWidth', Number(e.target.value))}
          />
        </label>
        <p className="text-sm text-ink-dim">
          Bei schwachem, drehendem Wind lieber breiter einstellen. Die Witterung zieht oft weiter, als man denkt.
        </p>
      </section>

      <section className="card mb-4">
        <h2 className="mb-1 text-lg font-bold">Wildarten</h2>
        <p className="mb-3 text-ink-dim">Antippen zum Bearbeiten. Die Reihenfolge gilt für alle Auswahllisten.</p>
        <SpeciesEditor />
      </section>

      <section className="card mb-4">
        <h2 className="mb-1 text-lg font-bold">Beispielrevier (Testdaten)</h2>
        <p className="mb-3 text-ink-dim">
          Fiktives Revier „Heidekamp“ zum Ausprobieren. Eigene Einträge bleiben beim Löschen unberührt.
          {demoCount ? ` Aktuell geladen: ${demoCount} Objekte.` : ''}
        </p>
        <div className="grid gap-2">
          <button
            className="btn btn-primary"
            onClick={async () => {
              await loadDemoData()
              await setSetting('mapView', { ...DEMO_CENTER, zoom: DEMO_ZOOM })
              toast('Beispielrevier geladen', 'success')
              navigate('karte')
            }}
          >
            {demoCount ? 'Beispielrevier neu laden' : 'Beispielrevier laden'}
          </button>
          <button
            className="btn btn-danger"
            disabled={!demoCount}
            onClick={async () => {
              if (!confirm('Alle Testdaten löschen? Deine eigenen Einträge bleiben erhalten.')) return
              await clearDemoData()
              // Karte wieder auf das eigene Revier stellen (falls vorhanden)
              const r = await revierBounds()
              if (r?.own) {
                await setSetting('mapView', {
                  lat: (r.bounds.south + r.bounds.north) / 2,
                  lng: (r.bounds.west + r.bounds.east) / 2,
                  zoom: 15,
                })
              }
              toast('Testdaten gelöscht', 'success')
            }}
          >
            Testdaten löschen
          </button>
        </div>
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 text-lg font-bold">Deine Daten auf diesem Gerät</h2>
        {own && (
          <ul className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1">
            <li>Einrichtungen: {own.facilities}</li>
            <li>Reviergrenzen: {own.boundaries}</li>
            <li>Ansitze: {own.hunts}</li>
            <li>Sichtungen: {own.sightings}</li>
            <li>Revierkarten-Fotos: {own.overlays}</li>
          </ul>
        )}
        <p className="text-sm text-ink-dim">
          Ohne Testdaten. Die Daten gehören zu <b>diesem Browser auf diesem Gerät</b>. Ein anderer Browser, ein privater Tab,
          das Öffnen über einen Link in einer anderen App (z. B. Mail, Claude) oder ein Symbol auf dem Home-Bildschirm hat
          jeweils einen eigenen, getrennten Speicher. Öffne die App deshalb immer auf demselben Weg, am besten in Safari.
        </p>
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 text-lg font-bold">Speicher & Datenschutz</h2>
        <p className="mb-2 text-ink-dim">
          Alle Revierdaten liegen nur auf diesem Gerät. Nur die Koordinaten gehen für das Wetter an Open-Meteo.
        </p>
        {storage && (
          <p className="mb-2">
            Belegt: {mb(storage.used)} MB von ca. {mb(storage.quota)} MB
            <br />
            Dauerhaft gesichert:{' '}
            {storage.persisted ? (
              <span className="text-good">ja</span>
            ) : (
              <span className="text-hint">nein – App auf dem iPhone zum Home-Bildschirm hinzufügen (ab Phase 5)</span>
            )}
          </p>
        )}
        <p className="text-sm text-ink-dim">Export/Import als Backup kommt in Phase 5.</p>
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 text-lg font-bold">Kartenebenen</h2>
        <p className="text-ink-dim">
          Google Satellit:{' '}
          {hasGoogleKey() ? <span className="text-good">Schlüssel hinterlegt</span> : <span>kein Schlüssel (Ebene ausgeblendet)</span>}
        </p>
      </section>

      <p className="pb-4 text-center text-sm text-ink-dim">Ansitzplaner · Version {__APP_VERSION__}</p>
    </div>
  )
}
