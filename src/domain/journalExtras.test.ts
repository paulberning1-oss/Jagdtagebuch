import { describe, expect, it } from 'vitest'
import { fromBerlinLocal } from '../lib/time'
import { computeLocalEnv } from './environment'
import { effectiveEnv, type HuntEnv, type WeatherEnv } from './hunt'
import { suggestPhases } from './phases'

const day = (s: string) => fromBerlinLocal(`${s}T19:00`).getTime()

describe('Jagdliche Phasen', () => {
  it('schlägt im August die Blattzeit vor – bei Zielwildart Rehwild zuerst', () => {
    const p = suggestPhases(day('2026-08-01'), ['rehwild'])
    expect(p[0]).toBe('Blattzeit (Rehwild)')
    expect(p).toContain('Getreideernte')
  })

  it('kennt Zeiträume über den Jahreswechsel', () => {
    expect(suggestPhases(day('2026-12-15'))).toContain('Rauschzeit (Schwarzwild)')
    expect(suggestPhases(day('2027-01-20'))).toContain('Rauschzeit (Schwarzwild)')
    expect(suggestPhases(day('2026-06-10'))).not.toContain('Rauschzeit (Schwarzwild)')
  })
})

describe('Handkorrektur der Bedingungen', () => {
  const start = day('2026-05-10')
  const weather: WeatherEnv = {
    temperature: 12, humidity: 70, cloudCover: 40, windDirection: 270, windCompass: 'W', windSpeed: 10,
    windDirectionAvg: 265, windSpeedAvg: 9, gustsMax: 20, pressure: 1015, pressureDelta3h: 0, pressureDelta12h: 0,
    pressureTrend: 'gleichbleibend', precipitation: 0, precipitation24h: 0, snowDepthCm: null, weatherCode: 2, source: 'forecast', fetchedAt: 0,
  }
  const env: HuntEnv = { weather, ...computeLocalEnv(start, start + 7200000, 52.5, 7.2) }

  it('ohne Korrektur bleibt alles unverändert', () => {
    expect(effectiveEnv({ env, overrides: undefined })).toBe(env)
  })

  it('überschreibt nur die korrigierten Werte, Messwerte bleiben erhalten', () => {
    const e = effectiveEnv({ env, overrides: { windDirection: 90, temperature: 8, moonUp: false } })!
    expect(e.weather!.windDirection).toBe(90)
    expect(e.weather!.windDirectionAvg).toBe(90)
    expect(e.weather!.windCompass).toBe('O')
    expect(e.weather!.temperature).toBe(8)
    expect(e.weather!.humidity).toBe(70)
    expect(e.moon.upDuringHunt).toBe(false)
    expect(e.moon.upPercent).toBe(0)
    expect(env.weather!.windDirection).toBe(270)
  })

  it('erlaubt Werte auch, wenn kein Wetter geladen werden konnte', () => {
    const e = effectiveEnv({ env: { ...env, weather: null }, overrides: { windDirection: 180, windSpeed: 5 } })!
    expect(e.weather?.windDirection).toBe(180)
    expect(e.weather?.windSpeed).toBe(5)
  })
})
