// Verbindung zur KI (Claude) – ausschließlich über die Supabase Edge Function „ki“.
// Die App kennt keinen API-Schlüssel; die Funktion prüft Anmeldung, Freischaltung und Tageslimit.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../cloud/supabase'
import { getSetting } from '../db/settings'
import type { KiImage, KiMessage, KiTask } from '../../supabase/functions/ki/validate'

export type { KiImage, KiMessage, KiTask }

/** Version des Zustimmungstextes – bei wesentlichen Änderungen erhöhen (dann wird neu gefragt) */
export const KI_CONSENT_VERSION = 1

export const KI_MODELS = [
  { id: '', label: 'Standard (Claude Opus 5.5)', hint: 'beste Qualität' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'schneller, etwa halb so teuer' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'am schnellsten und günstigsten, einfachere Antworten' },
] as const

export const KI_GUIDE_URL = 'https://github.com/paulberning1-oss/Jagdtagebuch/blob/main/docs/KI-EINRICHTUNG.md'

export interface KiUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface KiAnswer {
  text: string
  model: string
  used: number
  limit: number
  usage: KiUsage
}

export interface KiStatus {
  used: number
  limit: number
  model: string
  configured: boolean
}

/** Fehler mit verständlichem deutschem Text */
export class KiError extends Error {
  constructor(
    public code: string,
    message: string,
    public userId?: string,
  ) {
    super(message)
  }
}

/** Fehlercode der Funktion → Text für den Nutzer */
export function kiErrorText(code: string, info: { used?: number; limit?: number; detail?: string } = {}): string {
  switch (code) {
    case 'no_cloud':
      return 'Die KI geht nur mit Konto (Cloud) – auf diesem Gerät ist keine Cloud eingerichtet.'
    case 'not_logged_in':
      return 'Bitte melde dich an (Mehr → Mein Konto).'
    case 'consent_missing':
      return 'Bitte stimme zuerst der Datenübertragung an die KI zu (Mehr → KI-Assistent).'
    case 'not_allowed':
      return 'Dein Konto ist für die KI noch nicht freigeschaltet. Trage deine Konto-Kennung in Supabase als Secret KI_NUTZER ein (Anleitung Schritt 5).'
    case 'not_configured':
      return 'Auf dem Server fehlt der Claude-API-Schlüssel (Secret ANTHROPIC_API_KEY, Anleitung Schritt 5).'
    case 'not_deployed':
      return 'Die KI-Funktion ist auf dem Server noch nicht bereitgestellt (Anleitung Schritt 6).'
    case 'quota_table':
      return 'Auf dem Server fehlt die Tabelle für das Tageslimit – bitte supabase/ki.sql im SQL-Editor ausführen (Anleitung Schritt 4).'
    case 'limit':
      return `Tageslimit erreicht (${info.used ?? '?'} von ${info.limit ?? '?'} Anfragen heute). Morgen geht es weiter.`
    case 'api_key':
      return `Anthropic lehnt den API-Schlüssel ab (ungültig, gelöscht oder ohne Berechtigung)${info.detail ? ` – Meldung: ${info.detail}` : ''}.`
    case 'api_key_format':
      return 'Der hinterlegte API-Schlüssel beginnt nicht mit „sk-ant-“ – bitte das Secret ANTHROPIC_API_KEY in Supabase prüfen (nur den Schlüssel, ohne Namen davor).'
    case 'billing':
      return 'Anthropic hat die Anfrage abgelehnt: kein Guthaben oder Ausgabenlimit erreicht (console.anthropic.com → Billing/Limits).'
    case 'rate_limit':
      return 'Claude ist gerade ausgelastet – bitte gleich noch einmal versuchen.'
    case 'refusal':
      return 'Claude hat diese Anfrage abgelehnt. Formuliere sie bitte anders.'
    case 'offline':
      return 'Keine Verbindung – die KI braucht Internet.'
    case 'unreachable':
      return 'Die KI-Funktion ist nicht erreichbar – meist ist sie auf dem Server noch nicht bereitgestellt (Anleitung Schritt 6). Sonst bitte die Internetverbindung prüfen.'
    default:
      return `Die KI hat nicht geantwortet${info.detail ? ` (${info.detail})` : ''}.`
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new KiError('no_cloud', kiErrorText('no_cloud'))
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new KiError('offline', kiErrorText('offline'))
  const { data, error } = await supabase.functions.invoke('ki', { body })
  if (error) {
    let info: Record<string, unknown> = {}
    let status = 0
    if (error instanceof FunctionsHttpError) {
      status = error.context.status
      info = await error.context.json().catch(() => ({}))
    }
    // 404 = Funktion nicht bereitgestellt; ohne Antwort (Netzwerkfehler) ist sie meist auch nicht bereitgestellt,
    // weil die Fehlerseite von Supabase dann keine CORS-Kopfzeilen hat
    const code = String(info.error ?? (status === 404 ? 'not_deployed' : status === 0 ? 'unreachable' : 'api'))
    throw new KiError(code, kiErrorText(code, info as { used?: number; limit?: number; detail?: string }), info.userId as string | undefined)
  }
  const d = data as Record<string, unknown>
  if (d?.error) throw new KiError(String(d.error), kiErrorText(String(d.error), d as { detail?: string }))
  return data as T
}

/** Frage an die KI. `context` = stabiler Teil (wird auf dem Server zwischengespeichert); `images` nur für „foto“. */
export async function askKi(task: Exclude<KiTask, 'status'>, messages: KiMessage[], context?: string, images?: KiImage[]): Promise<KiAnswer> {
  const consent = await getSetting('kiConsent')
  if (!consent || consent.version < KI_CONSENT_VERSION) throw new KiError('consent_missing', kiErrorText('consent_missing'))
  const model = await getSetting('kiModel')
  return call<KiAnswer>({ task, consent: true, model: model || undefined, context, messages, images })
}

/** Stand des Tageslimits und Einrichtung (zählt nicht als Anfrage) */
export const kiStatus = () => call<KiStatus>({ task: 'status', consent: true, messages: [] })
