// Supabase Edge Function „ki“: einziger Weg der App zur Claude-API (Anthropic).
//
// Sicherheit:
// - Der API-Schlüssel liegt NUR als Supabase-Secret ANTHROPIC_API_KEY auf dem Server – nie in der App/im Repo.
// - Nur angemeldete Nutzer, deren Konto-Kennung in KI_NUTZER steht (sonst wird niemand bedient).
// - Tageslimit je Nutzer (KI_TAGESLIMIT, Standard 30), gezählt in der Tabelle ki_usage (supabase/ki.sql).
// - Modell: KI_MODELL (Standard claude-opus-5-5); die App darf nur Modelle aus ALLOWED_MODELS wählen.
//
// Bereitstellen: GitHub-Workflow .github/workflows/deploy-ki.yml (oder `supabase functions deploy ki --no-verify-jwt`).
// Anleitung: docs/KI-EINRICHTUNG.md
import Anthropic from 'npm:@anthropic-ai/sdk@1.12.0'
import { createClient } from 'npm:@supabase/supabase-js@2.119.2'
import { TASK_SCHEMAS } from './schemas.ts'
import { allowedUsers, checkRequest, dailyLimit, pickModel, type KiRequest, type KiTask } from './validate.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/**
 * Feste Regeln für alle Anfragen (stabiler Teil des Prompts → Prompt-Cache).
 * Nicht mit Datum/Uhrzeit o. Ä. füllen, sonst greift der Cache nicht.
 */
const RULES = `Du bist der Jagdassistent in der App „Ansitzplaner“ eines Jägers in Deutschland (Niedersachsen, flaches Revier).
Leitgedanke: Erfolgreich wird nur, wer kombinieren kann – Wetter, Wind, Mond, Sonne, Sitz und das Verhalten des Wildes.

Regeln:
- Nutze nur das mitgeschickte Wissen und die Daten des Jägers. Erfinde nichts – keine Sitze, Wege, Beobachtungen oder Zahlen, die nicht in den Daten stehen.
- Kennzeichne jede Aussage mit ihrer Herkunft: „aus deinem Tagebuch (n Ansitze)“, „aus dem Jagdwissen“ oder „Vermutung“.
- Sag offen, wenn die Daten für eine Aussage nicht reichen.
- Zu Jagd- und Schonzeiten nur das, was in der mitgeschickten Jagdzeiten-Tabelle des Jägers steht – mit dem Hinweis, dass das Landesjagdrecht maßgeblich ist. Keine eigenen Aussagen zu Recht, Gesetzen oder Waffen; bei Rechts- oder Sicherheitsfragen auf das Jagdgesetz, die Behörde oder erfahrene Jäger verweisen.
- Antworte auf Deutsch, kurz und praxisnah, in der Fachsprache der Jagd (Anblick, Wechsel, Einstand, Witterung, Äsung …).`

/** Aufgabenbezogene Anweisung (kommt nach dem gecachten Teil, ist aber je Aufgabe gleich) */
const TASK_PROMPT: Record<KiTask, string> = {
  test: 'Dies ist ein Verbindungstest der App. Antworte mit genau einem kurzen Satz.',
  status: '',
  empfehlung: `Aufgabe: Ansitzempfehlung für den geplanten Ansitz in der letzten Nachricht.
- Wähle genau einen Sitz aus den Revierdaten (Kennung [id: …] übernehmen) und, wenn sinnvoll, eine Alternative. Erfinde keine Sitze.
- Anmarschweg nur aus den eingezeichneten Wegen dieses Sitzes (Kennung übernehmen); die Wind-Prüfung der Wege bei diesem Wind ist mitgeschickt. Ist keiner eingezeichnet, Feld leer lassen und im Hinweis sagen, wie man bei diesem Wind anlaufen sollte (aus Richtungen/Entfernungen ableiten, als Vermutung kennzeichnen).
- Kombiniere: Wind und Witterungskegel zu Wechseln/Einständen/Kirrung, Schussfeld, Sonne/Licht, Mond, Luftdruck, jagdliche Phase, die eigenen Ansitze unter ähnlichen Bedingungen (mit Fazit und Fehlern) und die Punktbewertung der App. Weiche begründet von der Punktbewertung ab, wenn die Daten es hergeben.
- Erwartung: Wildart und Zeitfenster aus Tagebuch und Jagdwissen; Uhrzeiten an Sonnenauf-/-untergang des Tages ausrichten.
- Jede Aussage mit art und herkunft kennzeichnen. Tagebuch-Aussagen mit Zahl der Ansitze. Bei wenig Daten (z. B. unter 5 passenden Ansitzen) das in „datenlage“ sagen.
- Jagdzeit nur aus der mitgeschickten Tabelle; fehlt sie dort, Feld leer lassen.
- Kurz und praxisnah, kein Fülltext.`,
  chat: 'Aufgabe: Fragen des Jägers zu seinem Revier und seinen Daten beantworten.',
  rueckmeldung: 'Aufgabe: Rückmeldung nach dem Ansitz zu Fazit und Fehlern, mit konkreten Tipps.',
  foto: `Aufgabe: Die Fotos zeigen handschriftliche Seiten aus dem Jagdtagebuch des Jägers. Übertrage sie in Einträge.
- Ein Eintrag je Ansitz bzw. Jagdtag. Nichts erfinden: Was nicht dasteht, bleibt leer bzw. „nicht notiert“.
- Datum immer als JJJJ-MM-TT, Uhrzeiten als HH:MM (24 h).
- Sitz, Wildarten, Klassen, Verhalten und Störungen den mitgeschickten Listen zuordnen, wenn es eindeutig ist (Kennung übernehmen);
  sonst die Kennung leer lassen und den Text so übernehmen, wie er dasteht.
- Fazit, Fehler und Notizen möglichst wörtlich; offensichtliche Abkürzungen ausschreiben.
- Alles, was schwer lesbar ist oder geraten wurde, konkret in „unsicher“ nennen.
- Diese Aufgabe ist reines Abschreiben – keine Bewertung, keine Tipps; die Regeln zur Kennzeichnung von Aussagen gelten hier nicht.`,
}

/** Fotos (Aufgabe „foto“) vor den Text der ersten Nachricht setzen */
function withImages(r: KiRequest): Anthropic.Beta.BetaMessageParam[] {
  return r.messages.map((m, i) =>
    i === 0 && r.images?.length
      ? {
          role: m.role,
          content: [
            ...r.images.map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.mediaType, data: im.data } })),
            { type: 'text' as const, text: m.content },
          ],
        }
      : m,
  )
}

/** Schlüssel ohne versehentliche Leerzeichen, Zeilenumbrüche oder Anführungszeichen (häufiger Kopierfehler) */
const cleanKey = (raw: string | undefined) => (raw ?? '').trim().replace(/^['"„“”]+|['"„“”]+$/g, '').trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method' })

  // ---- Anmeldung prüfen ----
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
  const user = userData.user
  if (!user) return json(401, { error: 'not_logged_in' })
  if (!allowedUsers(Deno.env.get('KI_NUTZER')).has(user.id.toLowerCase())) return json(403, { error: 'not_allowed', userId: user.id })

  // ---- Anfrage prüfen ----
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'bad_request', detail: 'Kein JSON' })
  }
  const checked = checkRequest(body)
  if (!checked.ok) return json(400, { error: checked.error === 'consent_missing' ? 'consent_missing' : 'bad_request', detail: checked.error })
  const r = checked.req
  const limit = dailyLimit(Deno.env.get('KI_TAGESLIMIT'))
  const defaultModel = Deno.env.get('KI_MODELL')?.trim() || 'claude-opus-5-5'

  // Nur Stand abfragen (zählt nicht)
  if (r.task === 'status') {
    const { data, error } = await supabase.rpc('ki_usage_today')
    if (error) return json(500, { error: 'quota_table', detail: error.message })
    const key = cleanKey(Deno.env.get('ANTHROPIC_API_KEY'))
    return json(200, { used: data ?? 0, limit, model: defaultModel, configured: !!key, keyFormatOk: key.startsWith('sk-ant-') })
  }

  const apiKey = cleanKey(Deno.env.get('ANTHROPIC_API_KEY'))
  if (!apiKey) return json(503, { error: 'not_configured' })
  if (!apiKey.startsWith('sk-ant-')) return json(503, { error: 'api_key_format' })

  // ---- Tageslimit: vorher prüfen, nach erfolgreicher Antwort zählen (Fehler kosten keine Anfrage) ----
  const { data: before, error: quotaError } = await supabase.rpc('ki_usage_today')
  if (quotaError) return json(500, { error: 'quota_table', detail: quotaError.message })
  if ((before ?? 0) >= limit) return json(429, { error: 'limit', used: before, limit })
  const count = async () => {
    const { data } = await supabase.rpc('ki_count_use')
    return (data as number | null) ?? (before ?? 0) + 1
  }

  // ---- Claude aufrufen ----
  const model = pickModel(r.model, defaultModel)
  // Reihenfolge = Cache-Präfix: feste Regeln → (stabiler) Kontext mit Cache-Marke → Aufgabe → Nachrichten
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: RULES, ...(r.context ? {} : { cache_control: { type: 'ephemeral' as const } }) },
    ...(r.context ? [{ type: 'text' as const, text: r.context, cache_control: { type: 'ephemeral' as const } }] : []),
    ...(TASK_PROMPT[r.task] ? [{ type: 'text' as const, text: TASK_PROMPT[r.task] }] : []),
  ]
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 })
  try {
    const res = await client.beta.messages.create({
      model,
      max_tokens: r.task === 'test' ? 2000 : r.task === 'foto' ? 16000 : 12000,
      output_config: {
        effort: r.task === 'test' ? 'low' : 'medium',
        // feste Antwortstruktur je Aufgabe (z. B. Empfehlung als JSON)
        ...(TASK_SCHEMAS[r.task] ? { format: { type: 'json_schema' as const, schema: TASK_SCHEMAS[r.task]! } } : {}),
      },
      // Bei einer Ablehnung durch Sicherheitsfilter automatisch ein passendes Ersatzmodell (nicht bei Haiku)
      ...(model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
      system,
      messages: withImages(r),
    })
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    const usage = {
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
      cacheRead: res.usage.cache_read_input_tokens ?? 0,
      cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
    }
    const used = await count()
    if (res.stop_reason === 'refusal') return json(200, { error: 'refusal', model: res.model, used, limit, usage })
    return json(200, { text, model: res.model, stopReason: res.stop_reason, used, limit, usage })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
      return json(502, { error: 'api_key', status: e.status, detail: e.message })
    if (e instanceof Anthropic.RateLimitError) return json(502, { error: 'rate_limit' })
    if (e instanceof Anthropic.BadRequestError && /credit|billing|balance|limit/i.test(e.message)) return json(502, { error: 'billing', detail: e.message })
    if (e instanceof Anthropic.APIError) return json(502, { error: 'api', status: e.status, detail: e.message })
    return json(502, { error: 'api', detail: String(e) })
  }
})
