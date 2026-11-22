// Prüfung der Anfrage an die KI-Funktion – ohne Deno-/Netzwerk-Abhängigkeiten (in Vitest getestet).

/** Modelle, die die App wählen darf. Alles andere → Standardmodell des Servers. */
export const ALLOWED_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const
export type KiModel = (typeof ALLOWED_MODELS)[number]

/** Art der Anfrage. „foto“ = handschriftliche Tagebuchseiten lesen (nur diese Aufgabe darf Bilder schicken). */
export const TASKS = ['test', 'status', 'empfehlung', 'chat', 'rueckmeldung', 'foto'] as const
export type KiTask = (typeof TASKS)[number]

export interface KiMessage {
  role: 'user' | 'assistant'
  content: string
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export interface KiImage {
  mediaType: (typeof IMAGE_TYPES)[number]
  /** Base64 ohne „data:…,“-Vorspann */
  data: string
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
  /** Fotos (nur Aufgabe „foto“) – gehen mit der ersten Nachricht an Claude */
  images?: KiImage[]
}

export const LIMITS = { messages: 40, messageChars: 60_000, contextChars: 400_000, images: 6, imageChars: 5_000_000, imagesTotalChars: 16_000_000 }

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
  const imgs = b.images ?? []
  if (!Array.isArray(imgs)) return { ok: false, error: 'Ungültige Bilder' }
  if (imgs.length && b.task !== 'foto') return { ok: false, error: 'Bilder nur beim Foto-Import' }
  if (b.task === 'foto' && !imgs.length) return { ok: false, error: 'Kein Foto' }
  if (imgs.length > LIMITS.images) return { ok: false, error: `Höchstens ${LIMITS.images} Fotos auf einmal` }
  let total = 0
  for (const im of imgs) {
    const { mediaType, data } = (im ?? {}) as Record<string, unknown>
    if (!(IMAGE_TYPES as readonly string[]).includes(mediaType as string)) return { ok: false, error: 'Bildformat nicht erlaubt' }
    if (typeof data !== 'string' || !data || data.length > LIMITS.imageChars || !/^[A-Za-z0-9+/=]+$/.test(data))
      return { ok: false, error: 'Bild ungültig oder zu groß' }
    total += data.length
  }
  if (total > LIMITS.imagesTotalChars) return { ok: false, error: 'Fotos zusammen zu groß' }
  return {
    ok: true,
    req: {
      task: b.task as KiTask,
      consent: true,
      model: b.model as string | undefined,
      context: (b.context as string | undefined) || undefined,
      messages: (msgs as KiMessage[]).map((m) => ({ role: m.role, content: m.content })),
      images: imgs.length ? (imgs as KiImage[]).map((im) => ({ mediaType: im.mediaType, data: im.data })) : undefined,
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
