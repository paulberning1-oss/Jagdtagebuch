// Kompassrose für die Karte (unten rechts). Die Karte ist eingenordet → N zeigt immer nach oben.
// Auf dem Handy zeigt eine Nadel zusätzlich, wohin das Gerät gerade zeigt (Kompass-Sensor).
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { compass16 } from '../lib/geo'

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number }
type PermissionFn = () => Promise<'granted' | 'denied'>

/**
 * Auf dem iPhone muss die Erlaubnis für den Kompass-Sensor bei einem Tipp erfragt werden.
 * Gibt false zurück, wenn sie verweigert wurde.
 */
export async function requestCompassPermission(): Promise<boolean> {
  const req = (globalThis.DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn } | undefined)?.requestPermission
  if (typeof req !== 'function') return true
  try {
    return (await req()) === 'granted'
  } catch {
    return false
  }
}

/** Blickrichtung des Geräts in Grad (0 = Nord) – null, solange kein Sensor liefert */
function useHeading(): number | null {
  const [heading, setHeading] = useState<number | null>(null)
  useEffect(() => {
    const on = (e: Event) => {
      const ev = e as OrientationEvent
      let h: number | null = null
      if (typeof ev.webkitCompassHeading === 'number') h = ev.webkitCompassHeading // iPhone
      else if (ev.absolute && ev.alpha != null) h = 360 - ev.alpha // Android
      if (h == null || Number.isNaN(h)) return
      // Bildschirm gedreht (Querformat)? Dann Drehung ausgleichen
      const screenAngle = (globalThis.screen?.orientation?.angle ?? 0) as number
      const next = Math.round((((h + screenAngle) % 360) + 360) % 360)
      setHeading((old) => (old === next ? old : next))
    }
    window.addEventListener('deviceorientationabsolute', on)
    window.addEventListener('deviceorientation', on)
    return () => {
      window.removeEventListener('deviceorientationabsolute', on)
      window.removeEventListener('deviceorientation', on)
    }
  }, [])
  return heading
}

const SIZE = 120
const C = SIZE / 2

export function CompassRose({ onClose }: { onClose: () => void }) {
  const heading = useHeading()

  const ticks = Array.from({ length: 72 }, (_, i) => i * 5)
  const tick = (deg: number) => {
    const major = deg % 45 === 0
    const r1 = C - 4
    const r2 = r1 - (major ? 10 : deg % 15 === 0 ? 6 : 3)
    const a = ((deg - 90) * Math.PI) / 180
    return { x1: C + r1 * Math.cos(a), y1: C + r1 * Math.sin(a), x2: C + r2 * Math.cos(a), y2: C + r2 * Math.sin(a), major }
  }
  const label = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
  }

  return (
    <div className="pointer-events-auto relative rounded-full border border-line bg-panel/90 shadow-xl backdrop-blur-sm" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Kompass, Norden oben">
        {ticks.map((d) => {
          const t = tick(d)
          return <line key={d} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.major ? '#e7e5dc' : '#a3a89c'} strokeWidth={t.major ? 2 : 1} />
        })}
        {(
          [
            [0, 'N', '#ef6b4a', 15],
            [90, 'O', '#e7e5dc', 13],
            [180, 'S', '#e7e5dc', 13],
            [270, 'W', '#e7e5dc', 13],
          ] as const
        ).map(([d, t, color, size]) => {
          const p = label(d, C - 24)
          return (
            <text key={t} x={p.x} y={p.y} fill={color} fontSize={size} fontWeight={800} textAnchor="middle" dominantBaseline="central">
              {t}
            </text>
          )
        })}
        {[45, 135, 225, 315].map((d) => {
          const p = label(d, C - 24)
          return (
            <text key={d} x={p.x} y={p.y} fill="#a3a89c" fontSize={8.5} fontWeight={700} textAnchor="middle" dominantBaseline="central">
              {compass16(d)}
            </text>
          )
        })}
        {/* Nord-Süd-Raute */}
        <polygon points={`${C},${C - 30} ${C + 6},${C} ${C},${C + 30} ${C - 6},${C}`} fill="#a3a89c" opacity={0.35} />
        <polygon points={`${C},${C - 30} ${C + 6},${C} ${C - 6},${C}`} fill="#ef6b4a" opacity={0.8} />
        {/* Blickrichtung des Handys */}
        {heading != null && (
          <g transform={`rotate(${heading} ${C} ${C})`}>
            <line x1={C} y1={C} x2={C} y2={C - 40} stroke="#d4a72c" strokeWidth={3.5} strokeLinecap="round" />
            <polygon points={`${C},${C - 47} ${C + 6},${C - 35} ${C - 6},${C - 35}`} fill="#d4a72c" />
          </g>
        )}
        <circle cx={C} cy={C} r={4} fill="#e7e5dc" />
      </svg>
      {heading != null && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-panel/90 px-2 py-0.5 text-xs font-bold text-accent">
          Blick {compass16(heading)} · {heading}°
        </span>
      )}
      <button
        className="absolute -left-1 -top-1 flex size-7 items-center justify-center rounded-full border border-line bg-panel text-ink-dim"
        onClick={onClose}
        aria-label="Kompass schließen"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
