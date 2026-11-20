// Textfeld mit Mikrofon-Knopf (Spracheingabe, Deutsch).
// Nutzt die Web Speech API, wo der Browser sie kann. Sonst: Hinweis auf die Diktierfunktion der Tastatur.
// Tippen geht immer.
import { Mic, MicOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// Minimaler Typ – die Web Speech API ist (noch) nicht in den TypeScript-Standardtypen
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechSupported = () => recognitionCtor() !== null

export function SpeechTextarea({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** Für Screenreader: wofür das Diktat ist */
  label: string
}) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const rec = useRef<Recognition | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  // Aktuellen Text merken, damit Diktat-Ergebnisse angehängt werden
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => () => rec.current?.stop(), [])

  const start = () => {
    const Ctor = recognitionCtor()
    if (!Ctor) {
      setHint('Spracheingabe kann dieser Browser nicht. Tippe ins Feld und nutze das Mikrofon 🎤 auf der Tastatur (iPhone: Diktierfunktion).')
      textRef.current?.focus()
      return
    }
    const r = new Ctor()
    r.lang = 'de-DE'
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let finalText = ''
      let temp = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0].transcript
        else temp += res[0].transcript
      }
      if (finalText.trim()) {
        const cur = valueRef.current
        const sep = cur && !/\s$/.test(cur) ? ' ' : ''
        onChange(cur + sep + finalText.trim())
      }
      setInterim(temp)
    }
    r.onerror = (e) => {
      setHint(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Mikrofon nicht erlaubt. Bitte in den Einstellungen freigeben – oder die Diktierfunktion der Tastatur nutzen.'
          : e.error === 'no-speech'
            ? 'Nichts gehört – bitte noch einmal versuchen.'
            : 'Spracheingabe hat nicht geklappt. Tippe ins Feld und nutze die Diktierfunktion der Tastatur.',
      )
    }
    r.onend = () => {
      setListening(false)
      setInterim('')
    }
    rec.current = r
    setHint(null)
    try {
      r.start()
      setListening(true)
    } catch {
      setHint('Spracheingabe konnte nicht starten. Nutze die Diktierfunktion der Tastatur.')
    }
  }

  const stop = () => rec.current?.stop()

  return (
    <div>
      <div className="relative">
        <textarea
          ref={textRef}
          className="input min-h-28 py-3 pr-16"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <button
          type="button"
          className={`btn-round absolute right-2 top-2 !size-12 ${listening ? '!border-warn !bg-warn !text-bg animate-pulse' : ''}`}
          onClick={listening ? stop : start}
          aria-label={listening ? 'Diktat beenden' : `${label} diktieren`}
          aria-pressed={listening}
        >
          {listening ? <MicOff /> : <Mic />}
        </button>
      </div>
      {listening && <p className="mt-1 text-sm text-warn">Ich höre zu … {interim && <span className="text-ink-dim">„{interim}“</span>}</p>}
      {hint && <p className="mt-1 text-sm text-hint">{hint}</p>}
    </div>
  )
}
