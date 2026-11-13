// Abschnitt „Konto“ unter „Mehr“: wer ist angemeldet, ist alles gesichert?
import { CloudCheck, CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '../components/ui'
import { useAccount } from './auth'
import { supabase } from './supabase'
import { countPending, syncNow, useSyncStatus } from './sync'

export function AccountSection() {
  const account = useAccount()
  const status = useSyncStatus()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  if (!account) return null

  const when = status.lastSync
    ? new Date(status.lastSync).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
    : 'noch nie'

  const logout = async () => {
    setBusy(true)
    try {
      await syncNow()
      const pending = await countPending()
      if (
        pending > 0 &&
        !confirm(
          `${pending} Änderung(en) sind noch nicht in deinem Konto gesichert (kein Internet?).\n` +
            'Wenn du dich jetzt abmeldest und sich ein anderes Konto anmeldet, gehen sie verloren.\n\nTrotzdem abmelden?',
        )
      )
        return
      await supabase?.auth.signOut()
    } finally {
      setBusy(false)
    }
  }

  const ok = status.state === 'bereit' && status.pending === 0
  return (
    <section className="card mb-4">
      <h2 className="mb-1 text-lg font-bold">Mein Konto</h2>
      <p className="mb-3 text-ink-dim">
        {account.name ? `${account.name} · ` : ''}
        {account.email}
      </p>
      <div className="mb-3 flex items-start gap-3 rounded-xl border border-line p-3">
        {ok || status.state === 'läuft' ? (
          <CloudCheck className="mt-0.5 shrink-0 text-accent" />
        ) : (
          <CloudOff className="mt-0.5 shrink-0 text-ink-dim" />
        )}
        <div className="text-sm">
          <p className="font-semibold">
            {status.state === 'läuft'
              ? 'Wird gerade gesichert…'
              : status.state === 'offline'
                ? 'Offline – wird gesichert, sobald Internet da ist'
                : status.state === 'fehler'
                  ? 'Sicherung fehlgeschlagen'
                  : ok
                    ? 'Alles in deinem Konto gesichert'
                    : 'Bereit'}
          </p>
          <p className="text-ink-dim">Letzter Abgleich: {when}</p>
          {status.pending > 0 && <p className="text-ink-dim">Noch nicht gesichert: {status.pending} Änderung(en)</p>}
          {status.error && <p className="text-red-400">{status.error}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn"
          disabled={status.state === 'läuft'}
          onClick={async () => {
            await syncNow()
            toast('Abgleich beendet', 'success')
          }}
        >
          <RefreshCw /> Jetzt sichern
        </button>
        <button className="btn" disabled={busy} onClick={logout}>
          <LogOut /> Abmelden
        </button>
      </div>
      <p className="mt-3 text-sm text-ink-dim">
        Alles wird sofort auf diesem Gerät gespeichert und automatisch in deinem Konto gesichert. Auf einem anderen Gerät
        einfach mit derselben E-Mail anmelden.
      </p>
    </section>
  )
}
