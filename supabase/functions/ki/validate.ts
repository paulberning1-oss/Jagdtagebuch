// Prüfung der Anfrage an die KI-Funktion – ohne Deno-/Netzwerk-Abhängigkeiten (in Vitest getestet).

/** Modelle, die die App wählen darf. Alles andere → Standardmodell des Servers. */
export const ALLOWED_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const
export type KiModel = (typeof ALLOWED_MODELS)[number]

/** Art der Anfrage. Schritt 7/8 ergänzen „empfehlung“, „chat“, „rueckmeldung“. */
export const TASKS = ['test', 'status', 'empfehlung', 'chat', 'rueckmeldung'] as const
export type KiTask = (typeof TASKS)[number]

export interface KiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface KiRequest {
  task: KiTask
  /** Zustimmung zur Datenübertragung (in der App einmalig erteilt) */
  consent: boolean
  /** gewünschtes Modell (optional) */
  model?: string
  /** stabiler Kontext (Revier, Jagdwissen, Tagebuch …) – wird im Prompt-Cache gehalten */
  context?: string
  messages: KiMessage[]
}

export const LIMITS = { messages: 40, messageChars: 20_000, contextChars: 400_000 }

export type Checked = { ok: true; req: KiRequest } | { ok: false; error: string }

/** Anfrage-Körper prüfen (Typen, Längen, Rollen abwechselnd, erste und letzte Nachricht vom Nutzer) */
export function checkRequest(body: unknown): Checked {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Ungültige Anfrage' }
  const b = body as Record<string, unknown>
  if (!TASKS.includes(b.task as KiTask)) return { ok: false, error: 'Unbekannte Aufgabe' }
  if (b.consent !== true) return { ok: false, error: 'consent_missing' }
  if (b.model != null && typeof b.model !== 'string') return { ok: false, error: 'Ungültiges Modell' }
  if (b.context != null && (typeof b.context !== 'string' || b.context.length > LIMITS.contextChars))
    return { ok: false, error: 'Kontext zu groß' }
  const msgs = b.messages ?? []
  if (!Array.isArray(msgs) || msgs.length > LIMITS.messages) return { ok: false, error: 'Zu viele Nachrichten' }
  if (b.task !== 'status') {
    if (!msgs.length) return { ok: false, error: 'Keine Nachricht' }
    for (const [i, m] of msgs.entries()) {
      if (!m || typeof m !== 'object') return { ok: false, error: 'Ungültige Nachricht' }
      const { role, content } = m as Record<string, unknown>
      if (role !== (i % 2 === 0 ? 'user' : 'assistant')) return { ok: false, error: 'Nachrichten müssen abwechseln (zuerst Nutzer)' }
      if (typeof content !== 'string' || !content.trim() || content.length > LIMITS.messageChars)
        return { ok: false, error: 'Nachricht leer oder zu lang' }
    }
    if (msgs.length % 2 === 0) return { ok: false, error: 'Letzte Nachricht muss vom Nutzer sein' }
  }
  return {
    ok: true,
    req: {
      task: b.task as KiTask,
      consent: true,
      model: b.model as string | undefined,
      context: (b.context as string | undefined) || undefined,
      messages: (msgs as KiMessage[]).map((m) => ({ role: m.role, content: m.content })),
    },
  }
}

/** Gewünschtes Modell, falls erlaubt – sonst das Standardmodell */
export const pickModel = (wanted: string | undefined, fallback: string): string =>
  wanted && (ALLOWED_MODELS as readonly string[]).includes(wanted) ? wanted : fallback

/** Freigeschaltete Konten aus „KI_NUTZER“ (Kennungen durch Komma/Leerzeichen getrennt). Leer = niemand. */
export const allowedUsers = (raw: string | undefined) =>
  new Set(
    (raw ?? '')
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )

/** Tageslimit aus „KI_TAGESLIMIT“ (Standard 30, mindestens 1) */
export const dailyLimit = (raw: string | undefined) => {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n >= 1 ? n : 30
}
