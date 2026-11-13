// Anmeldung mit E-Mail + Passwort. Solange niemand angemeldet ist, zeigt die App die Anmeldeseite.
// Ohne Supabase-Konfiguration (.env) läuft die App wie bisher nur lokal.
import type { Session } from '@supabase/supabase-js'
import { Cloud, LogIn, UserPlus } from 'lucide-react'
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { startCloudSync } from './sync'
import { cloudEnabled, supabase } from './supabase'

interface Account {
  userId: string
  email: string
  name: string
}

const AccountCtx = createContext<Account | null>(null)
/** Angemeldetes Konto – oder null (keine Cloud konfiguriert) */
export const useAccount = () => useContext(AccountCtx)

function toAccount(s: Session): Account {
  const u = s.user
  return { userId: u.id, email: u.email ?? '', name: (u.user_metadata?.name as string | undefined) ?? '' }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(cloudEnabled ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  // Abgleich läuft, solange jemand angemeldet ist
  useEffect(() => (userId ? startCloudSync(userId) : undefined), [userId])

  if (!cloudEnabled) return <>{children}</>
  if (session === undefined) return <div className="flex h-dvh items-center justify-center text-ink-dim">Lade…</div>
  if (!session) return <LoginPage />
  return <AccountCtx.Provider value={toAccount(session)}>{children}</AccountCtx.Provider>
}

function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    if (!navigator.onLine) return setMsg({ text: 'Für die Anmeldung brauchst du einmal Internet.', error: true })
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        if (password.length < 8) throw new Error('Das Passwort braucht mindestens 8 Zeichen.')
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        })
        if (error) throw error
        if (!data.session) {
          setMsg({ text: 'Konto angelegt. Bitte bestätige den Link in deiner E-Mail und melde dich dann an.', error: false })
          setMode('login')
        }
      }
    } catch (err) {
      setMsg({ text: translate((err as Error).message), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pt-safe pb-safe flex h-dvh items-center justify-center overflow-y-auto bg-bg p-4">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <div className="mb-4 flex items-center gap-3">
          <Cloud className="size-8 text-accent" />
          <div>
            <h1 className="text-xl font-bold">Ansitzplaner</h1>
            <p className="text-sm text-ink-dim">Deine Revierdaten – sicher in deinem Konto</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button type="button" className={`btn ${mode === 'login' ? 'btn-primary' : ''}`} onClick={() => setMode('login')}>
            Anmelden
          </button>
          <button type="button" className={`btn ${mode === 'register' ? 'btn-primary' : ''}`} onClick={() => setMode('register')}>
            Neues Konto
          </button>
        </div>

        {mode === 'register' && (
          <label className="mb-3 block">
            <span className="label">Dein Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label className="mb-3 block">
          <span className="label">E-Mail</span>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="mb-4 block">
          <span className="label">Passwort{mode === 'register' ? ' (mind. 8 Zeichen)' : ''}</span>
          <input
            className="input"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {msg && <p className={`mb-3 text-sm ${msg.error ? 'text-red-400' : 'text-ink-dim'}`}>{msg.text}</p>}

        <button className="btn btn-primary w-full" disabled={busy}>
          {mode === 'login' ? <LogIn /> : <UserPlus />}
          {busy ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : 'Konto anlegen'}
        </button>
        <p className="mt-3 text-sm text-ink-dim">
          Du bleibst angemeldet. Alles, was du einträgst, wird auf dem Gerät gespeichert und – sobald Internet da ist – in
          deinem Konto gesichert.
        </p>
      </form>
    </div>
  )
}

function translate(m: string) {
  if (/Invalid login credentials/i.test(m)) return 'E-Mail oder Passwort ist falsch.'
  if (/already registered|already exists/i.test(m)) return 'Für diese E-Mail gibt es schon ein Konto – bitte anmelden.'
  if (/Email not confirmed/i.test(m)) return 'Die E-Mail ist noch nicht bestätigt – bitte den Link in der E-Mail antippen.'
  if (/Signups not allowed|signup.*disabled/i.test(m)) return 'Neue Konten sind derzeit nicht freigeschaltet.'
  if (/fetch|network|Load failed/i.test(m)) return 'Keine Verbindung zum Server – bitte Internet prüfen.'
  return m
}
