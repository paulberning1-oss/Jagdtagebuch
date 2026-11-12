// Aufnahmezeit aus EXIF lesen. Wildkameras speichern die Zeit meist OHNE Zeitzone
// ("2026:11:10 18:23:05") – wir lesen sie als Berliner Ortszeit, außer die
// Kamera liefert einen Versatz (OffsetTimeOriginal, z. B. "+01:00").

import { fromBerlinLocal } from './time'

export function parseExifDate(raw: unknown, offset?: unknown): Date | null {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi, s = '00'] = m
  if (+y < 2000 || +mo < 1 || +mo > 12) return null
  if (typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset.trim())) {
    const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${offset.trim()}`)
    return isNaN(dt.getTime()) ? null : dt
  }
  const dt = fromBerlinLocal(`${y}-${mo}-${d}T${h}:${mi}`)
  return new Date(dt.getTime() + +s * 1000)
}

/** Liest die Aufnahmezeit aus einer Bilddatei (oder null, wenn keine vorhanden) */
export async function readCaptureTime(file: Blob): Promise<Date | null> {
  try {
    const { default: exifr } = await import('exifr')
    const tags = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'OffsetTimeOriginal', 'OffsetTime'],
      reviveValues: false,
    })
    if (!tags) return null
    return (
      parseExifDate(tags.DateTimeOriginal, tags.OffsetTimeOriginal) ??
      parseExifDate(tags.CreateDate, tags.OffsetTime) ??
      parseExifDate(tags.ModifyDate, tags.OffsetTime)
    )
  } catch {
    return null
  }
}
