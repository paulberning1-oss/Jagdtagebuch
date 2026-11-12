import { describe, expect, it } from 'vitest'
import { fromBerlinLocal } from '../lib/time'
import type { HourlySeries } from '../services/openMeteo'
import {
  circularMean,
  computeCalendar,
  computeMoon,
  computeSun,
  computeWeather,
  moonPhaseName,
  pressureTrend,
  relText,
  weatherDateRange,
} from './environment'

const lat = 52.64
const lng = 10.3

/** Künstliche Stundenreihe für 11.–12.11.2026 */
function series(): HourlySeries {
  const time: string[] = []
  for (const day of ['2026-11-11', '2026-11-12']) for (let h = 0; h < 24; h++) time.push(`${day}T${String(h).padStart(2, '0')}:00`)
  const n = time.length
  return {
    time,
    temperature_2m: time.map((_, i) => 5 + i * 0.1),
    relative_humidity_2m: time.map(() => 80),
    // 1 hPa pro Stunde steigend
    pressure_msl: time.map((_, i) => 1000 + i),
    cloud_cover: time.map(() => 50),
    // Wind dreht um Nord: 350° und 10° im Wechsel
    wind_direction_10m: time.map((_, i) => (i % 2 ? 10 : 350)),
    wind_speed_10m: time.map(() => 12),
    wind_gusts_10m: time.map((_, i) => (i === n - 6 ? 40 : 20)),
    // Am 11.11. von 20–23 Uhr je 1 mm Regen
    precipitation: time.map((t) => (t >= '2026-11-11T20:00' && t <= '2026-11-11T23:00' ? 1 : 0)),
    snow_depth: time.map(() => 0),
    weather_code: time.map(() => 3),
  }
}

describe('Wetter aus Stundenwerten', () => {
  const start = fromBerlinLocal('2026-11-12T16:00').getTime()
  const end = fromBerlinLocal('2026-11-12T18:30').getTime()
  const w = computeWeather(series(), start, end, 'forecast', 0)

  it('Werte bei Beginn', () => {
    expect(w.pressure).toBe(1000 + 24 + 16)
    expect(w.temperature).toBeCloseTo(5 + 4, 5)
    expect(w.windCompass).toBe('N')
  })
  it('Drucktendenz', () => {
    expect(w.pressureDelta3h).toBe(3)
    expect(w.pressureDelta12h).toBe(12)
    expect(w.pressureTrend).toBe('steigend')
  })
  it('Wind wird als Kreismittel gemittelt (nicht 180°!)', () => {
    expect(w.windDirectionAvg === 0 || w.windDirectionAvg === 360).toBe(true)
    expect(w.gustsMax).toBe(40)
  })
  it('Niederschlag der letzten 24 h', () => {
    expect(w.precipitation24h).toBe(4)
    expect(w.precipitation).toBe(0)
    expect(w.snowDepthCm).toBeNull()
  })
  it('Zu ladende Tage', () => {
    expect(weatherDateRange(start, end)).toEqual({ startDate: '2026-11-11', endDate: '2026-11-12' })
  })
})

describe('Hilfsfunktionen', () => {
  it('Kreismittel', () => {
    expect(circularMean([350, 10])).toBe(0)
    expect(circularMean([80, 100])).toBe(90)
    expect(circularMean([])).toBeNull()
  })
  it('Drucktendenz-Einstufung', () => {
    expect(pressureTrend(-2)).toBe('fallend')
    expect(pressureTrend(0.5)).toBe('gleichbleibend')
    expect(pressureTrend(null)).toBeNull()
  })
  it('Texte relativ zur Sonne', () => {
    expect(relText(-45, 'Sonnenuntergang')).toBe('45 min vor Sonnenuntergang')
    expect(relText(130, 'Sonnenaufgang')).toBe('2 h 10 min nach Sonnenaufgang')
  })
})

describe('Sonne', () => {
  it('Abendansitz 1 h vor Sonnenuntergang', () => {
    const ref = computeSun(fromBerlinLocal('2026-11-12T12:00').getTime(), fromBerlinLocal('2026-11-12T12:00').getTime(), lat, lng)
    const start = ref.sunset! - 60 * 60000
    const s = computeSun(start, start + 2 * 3600000, lat, lng)
    expect(s.startMinFromSunset).toBe(-60)
    expect(s.endMinFromSunset).toBe(60)
    expect(s.period).toBe('Abend')
    // Sonnenuntergang Mitte November in Norddeutschland ca. 16:20 Uhr
    const sunsetLocal = new Date(ref.sunset!).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' })
    expect(sunsetLocal >= '16:00' && sunsetLocal <= '16:45').toBe(true)
    expect(s.nauticalDusk! > s.civilDusk!).toBe(true)
  })
  it('Morgenansitz in der Sommerzeit', () => {
    const ref = computeSun(fromBerlinLocal('2026-06-15T12:00').getTime(), fromBerlinLocal('2026-06-15T12:00').getTime(), lat, lng)
    const s = computeSun(ref.sunrise! - 30 * 60000, ref.sunrise! + 90 * 60000, lat, lng)
    expect(s.period).toBe('Morgen')
    expect(s.startMinFromSunrise).toBe(-30)
  })
})

describe('Mond', () => {
  it('Phasennamen', () => {
    expect(moonPhaseName(0)).toBe('Neumond')
    expect(moonPhaseName(0.25)).toBe('Erstes Viertel')
    expect(moonPhaseName(0.5)).toBe('Vollmond')
    expect(moonPhaseName(0.99)).toBe('Neumond')
  })
  it('Vollmond am 3.1.2026', () => {
    const t = fromBerlinLocal('2026-01-03T20:00').getTime()
    const m = computeMoon(t, t + 3 * 3600000, lat, lng)
    expect(m.phaseName).toBe('Vollmond')
    expect(m.illumination).toBeGreaterThan(95)
    // Vollmond steht abends am Himmel
    expect(m.upDuringHunt).toBe(true)
  })
  it('Mondauf-/-untergang des Berliner Tags (auch spät abends)', () => {
    const t = fromBerlinLocal('2026-11-12T22:00').getTime()
    const m = computeMoon(t, t + 3600000, lat, lng)
    // laut SunCalc: Aufgang 11:27, Untergang 17:57 (Berliner Zeit)
    expect(new Date(m.moonrise!).toISOString()).toMatch(/^2026-11-12T10:2/)
    expect(new Date(m.moonset!).toISOString()).toMatch(/^2026-11-12T16:5/)
    expect(m.upDuringHunt).toBe(false)
  })
  it('Neumond am 18.1.2026', () => {
    const t = fromBerlinLocal('2026-01-18T20:00').getTime()
    const m = computeMoon(t, t + 3600000, lat, lng)
    expect(m.phaseName).toBe('Neumond')
    expect(m.illumination).toBeLessThan(3)
  })
})

describe('Kalender', () => {
  it('Wochentag, Monat, Jahreszeit (Berliner Zeit)', () => {
    // 1.12.2026 00:30 Berlin ist in UTC noch der 30.11.
    const c = computeCalendar(fromBerlinLocal('2026-12-01T00:30').getTime())
    expect(c.weekday).toBe('Dienstag')
    expect(c.month).toBe(12)
    expect(c.monthName).toBe('Dezember')
    expect(c.season).toBe('Winter')
  })
})
