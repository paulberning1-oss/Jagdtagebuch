// „Mehr → KI-Assistent“: Datenschutz-Zustimmung, Modellwahl, Verbindungstest, Tageslimit.
import { Bot, Check, Copy, ExternalLink, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ask } from '../components/ConfirmDialog'
import { useToast } from '../components/ui'
import { useAccount } from '../cloud/auth'
import { cloudEnabled } from '../cloud/supabase'
import { setSetting, useSetting } from '../db/settings'
import { fmtDateTime } from '../lib/time'
import { askKi, KI_CONSENT_VERSION, KI_GUIDE_URL, KI_MODELS, KiError, kiStatus, type KiAnswer, type KiStatus } from './ki'

/** Datenschutz-Hinweis (Version KI_CONSENT_VERSION) */
export function KiConsentText() {
  return (
    <div className="grid gap-2 text-sm">
      <p>
        Wenn du die KI nutzt, schickt die App deine Anfrage über deinen Supabase-Server an die <b>Claude-API von Anthropic</b> (Anthropic PBC,
        USA). Dort wird die Antwort erzeugt.
      </p>
      <p className="font-semibold">Je nach Funktion werden übertragen:</p>
      <ul className="ml-5 list-disc text-ink-dim">
        <li>deine Frage und der Gesprächsverlauf</li>
        <li>
          <b className="text-ink">Revierdaten</b>: Sitze mit Schussfeld, Anmarschwege, eigene Objekte, Wechsel, Flächen – mit Lage und Entfernungen
          (daraus lässt sich erkennen, wo dein Revier liegt)
        </li>
        <li>
          <b className="text-ink">Tagebuch</b>: Ansitze mit Datum, Wetter, Anblick, Erfolg, Fazit und Fehlern
        </li>
        <li>geprüftes Jagdwissen, deine Jagdzeiten-Tabelle, Wettervorhersage, Sonne und Mond</li>
      </ul>
      <p className="text-ink-dim">
        <b className="text-ink">Nicht übertragen:</b> E-Mail-Adresse, Passwort, Fotos. Testdaten nur, wenn du es ausdrücklich einschaltest.
      </p>
      <p className="text-ink-dim">
        Für die Nutzung der API gelten die Bedingungen und die Datenschutzerklärung von Anthropic (
        <a className="text-accent underline" href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noreferrer">
          anthropic.com/legal/privacy
        </a>
        ). Die Kosten trägt das Anthropic-Konto, dessen Schlüssel auf deinem Server hinterlegt ist.
      </p>
      <p className="text-ink-dim">
        Die Zustimmung gilt für dein Konto (alle Geräte) und lässt sich hier jederzeit widerrufen. Ohne Zustimmung funktioniert die App wie
        bisher – nur ohne KI.
      </p>
    </div>
  )
}

export function KiSection() {
  const toast = useToast()
  const account = useAccount()
  const consent = useSetting('kiConsent')
  const model = useSetting('kiModel')
  const [showText, setShowText] = useState(false)
  const [status, setStatus] = useState<KiStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<KiAnswer | null>(null)
  const [error, setError] = useState<KiError | null>(null)
  const agreed = !!consent && consent.version >= KI_CONSENT_VERSION

  // Stand des Tageslimits laden (zählt nicht)
  useEffect(() => {
    if (!agreed || !account) return
    kiStatus()
      .then(setStatus)
      .catch((e: unknown) => setError(e instanceof KiError ? e : null))
  }, [agreed, account])

  const agree = async () => {
    await setSetting('kiConsent', { at: Date.now(), version: KI_CONSENT_VERSION })
    setShowText(false)
    toast('Zustimmung gespeichert', 'success')
  }
  const revoke = async () => {
    if (!(await ask('Zustimmung zur KI widerrufen?\n\nDanach schickt die App keine Daten mehr an die KI, bis du erneut zustimmst.', { ok: 'Widerrufen', danger: true })))
      return
    await setSetting('kiConsent', null)
    setStatus(null)
    setAnswer(null)
  }
  const test = async () => {
    setBusy(true)
    setError(null)
    setAnswer(null)
    try {
      const a = await askKi('test', [{ role: 'user', content: 'Kurzer Verbindungstest: Bist du bereit? Antworte mit einem Satz und einem Waidmannsheil.' }])
      setAnswer(a)
      setStatus((s) => (s ? { ...s, used: a.used, limit: a.limit } : s))
    } catch (e) {
      setError(e instanceof KiError ? e : new KiError('api', String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card mb-4">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
        <Bot className="text-accent" /> KI-Assistent (Claude)
      </h2>
      <p className="mb-3 text-sm text-ink-dim">
        Grundlage für Ansitzempfehlung, Chat und Rückmeldung nach dem Ansitz. Läuft über deinen Supabase-Server – der API-Schlüssel liegt nur
        dort.{' '}
        <a className="inline-flex items-center gap-1 text-accent underline" href={KI_GUIDE_URL} target="_blank" rel="noreferrer">
          Einrichtung <ExternalLink className="size-3.5" />
        </a>
      </p>

      {!cloudEnabled || !account ? (
        <p className="text-ink-dim">Die KI geht nur mit Konto – bitte unter „Mein Konto“ anmelden.</p>
      ) : !agreed ? (
        <div className="rounded-xl border-2 border-hint/60 p-3">
          <p className="mb-2 flex items-center gap-2 font-bold text-hint">
            <ShieldCheck className="size-5" /> Datenschutz: einmalige Zustimmung nötig
          </p>
          {showText ? (
            <>
              <KiConsentText />
              <div className="mt-3 flex gap-2">
                <button className="btn flex-1" onClick={() => setShowText(false)}>
                  Nicht jetzt
                </button>
                <button className="btn btn-primary flex-1" onClick={agree}>
                  <Check /> Zustimmen
                </button>
              </div>
            </>
          ) : (
            <button className="btn w-full" onClick={() => setShowText(true)}>
              Lesen und zustimmen
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-x-2 text-sm text-ink-dim">
            <span className="badge border-good/60 text-good">
              <Check className="size-3.5" /> Zustimmung erteilt
            </span>
            am {fmtDateTime(new Date(consent!.at))}
            <button className="text-accent underline" onClick={() => setShowText((x) => !x)}>
              {showText ? 'Text ausblenden' : 'Text ansehen'}
            </button>
            <button className="text-warn underline" onClick={revoke}>
              Widerrufen
            </button>
          </p>
          {showText && (
            <div className="mb-3 rounded-xl border border-line p-3">
              <KiConsentText />
            </div>
          )}

          <label className="mb-3 block">
            <span className="label">Modell</span>
            <select className="input" value={model ?? ''} onChange={(e) => setSetting('kiModel', e.target.value)}>
              {KI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} – {m.hint}
                </option>
              ))}
            </select>
          </label>

          {status && (
            <p className="mb-3 text-sm text-ink-dim">
              Heute {status.used} von {status.limit} Anfragen genutzt.
              {!status.configured && <span className="text-warn"> API-Schlüssel auf dem Server fehlt noch.</span>}
            </p>
          )}

          <button className="btn w-full" onClick={test} disabled={busy}>
            {busy ? 'Frage Claude …' : 'Verbindung testen'}
          </button>
          <p className="mt-1 text-xs text-ink-dim">Ein Test zählt als eine Anfrage (wenige Cent bei Opus, weniger bei Sonnet/Haiku).</p>

          {answer && (
            <div className="mt-3 rounded-xl border border-good/60 p-3">
              <p className="mb-1 font-semibold text-good">✓ Verbindung steht</p>
              <p className="whitespace-pre-line">{answer.text}</p>
              <p className="mt-2 text-xs text-ink-dim">
                {answer.model} · heute {answer.used}/{answer.limit} · {answer.usage.input + answer.usage.cacheRead + answer.usage.cacheWrite} Token
                rein ({answer.usage.cacheRead} aus dem Cache), {answer.usage.output} raus
              </p>
            </div>
          )}
          {error && <KiErrorBox error={error} />}
          <div className="mt-3 border-t border-line pt-3 text-xs text-ink-dim">
            Deine Konto-Kennung (für die Freischaltung, Secret KI_NUTZER):
            <CopyId id={account.userId} />
          </div>
        </>
      )}
    </section>
  )
}

export function KiErrorBox({ error }: { error: KiError }) {
  return (
    <div className="mt-3 rounded-xl border border-warn/60 p-3 text-sm">
      <p className="text-warn">{error.message}</p>
      {error.userId && <CopyId id={error.userId} />}
    </div>
  )
}

function CopyId({ id }: { id: string }) {
  const toast = useToast()
  return (
    <button
      className="mt-1 flex max-w-full items-center gap-1 rounded-lg border border-line px-2 py-1 text-left font-mono text-xs break-all text-ink"
      onClick={() =>
        navigator.clipboard
          ?.writeText(id)
          .then(() => toast('Kennung kopiert', 'success'))
          .catch(() => toast('Kopieren ging nicht – bitte abschreiben', 'error'))
      }
    >
      <Copy className="size-3.5 shrink-0" /> {id}
    </button>
  )
}
