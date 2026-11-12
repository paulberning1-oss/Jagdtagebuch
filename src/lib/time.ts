// Alle Zeiten werden in der Zeitzone Europe/Berlin angezeigt und eingegeben –
// auch wenn das Handy (z. B. im Urlaub) auf eine andere Zone eingestellt ist.

export const TZ = 'Europe/Berlin'

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export function berlinParts(d: Date) {
  const o: Record<string, string> = {}
  for (const p of partsFmt.formatToParts(d)) o[p.type] = p.value
  return {
    year: +o.year,
    month: +o.month,
    day: +o.day,
    hour: +o.hour,
    minute: +o.minute,
    second: +o.second,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Date → "YYYY-MM-DDTHH:mm" in Berliner Ortszeit (für <input type="datetime-local">) */
export function toBerlinLocal(d: Date): string {
  const p = berlinParts(d)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** Date → "YYYY-MM-DD" (Berliner Datum) */
export function toBerlinDate(d: Date): string {
  return toBerlinLocal(d).slice(0, 10)
}

/** Versatz Berlin gegenüber UTC in Minuten zum Zeitpunkt d (60 oder 120) */
function berlinOffsetMinutes(d: Date): number {
  const p = berlinParts(d)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000)
}

/** "YYYY-MM-DDTHH:mm" (Berliner Ortszeit) → Date */
export function fromBerlinLocal(s: string): Date {
  const [date, time = '00:00'] = s.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  // Zweimal korrigieren, damit auch die Umstellung Sommer/Winterzeit stimmt.
  let t = guess - berlinOffsetMinutes(new Date(guess)) * 60000
  t = guess - berlinOffsetMinutes(new Date(t)) * 60000
  return new Date(t)
}

const timeFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('de-DE', {
  timeZone: TZ,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export const fmtTime = (d: Date) => timeFmt.format(d)
export const fmtDate = (d: Date) => dateFmt.format(d)
export const fmtDateTime = (d: Date) => dateTimeFmt.format(d)
