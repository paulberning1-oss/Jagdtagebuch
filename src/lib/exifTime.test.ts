import { describe, expect, it } from 'vitest'
import { parseExifDate } from './exifTime'

describe('EXIF-Zeit', () => {
  it('ohne Zeitzone = Berliner Ortszeit (Winter)', () => {
    expect(parseExifDate('2026:11:10 18:23:05')?.toISOString()).toBe('2026-11-10T17:23:05.000Z')
  })
  it('ohne Zeitzone = Berliner Ortszeit (Sommer)', () => {
    expect(parseExifDate('2026:07:01 05:10:00')?.toISOString()).toBe('2026-07-01T03:10:00.000Z')
  })
  it('mit Versatz', () => {
    expect(parseExifDate('2026:11:10 18:23:05', '+01:00')?.toISOString()).toBe('2026-11-10T17:23:05.000Z')
  })
  it('ungültige Werte', () => {
    expect(parseExifDate('0000:00:00 00:00:00')).toBeNull()
    expect(parseExifDate(undefined)).toBeNull()
    expect(parseExifDate('Quatsch')).toBeNull()
  })
})
