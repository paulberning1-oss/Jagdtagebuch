import SunCalc from 'suncalc'
import { fromBerlinLocal, toBerlinDate } from './time'

/** Sonnenzeiten für den Berliner Kalendertag von `day` */
export function sunTimes(day: Date, lat: number, lng: number) {
  // Mittag (Berliner Zeit) als Bezug, damit SunCalc den richtigen Tag nimmt
  const noon = fromBerlinLocal(`${toBerlinDate(day)}T12:00`)
  return SunCalc.getTimes(noon, lat, lng)
}

/** Vorschlag "heute Abend": 1 Stunde vor Sonnenuntergang */
export function eveningStart(lat: number, lng: number, now = new Date()): Date {
  return new Date(sunTimes(now, lat, lng).sunset.getTime() - 60 * 60000)
}

/** Vorschlag "morgen früh": 45 Minuten vor Sonnenaufgang am nächsten Tag */
export function morningStart(lat: number, lng: number, now = new Date()): Date {
  const tomorrow = new Date(now.getTime() + 86400000)
  return new Date(sunTimes(tomorrow, lat, lng).sunrise.getTime() - 45 * 60000)
}
