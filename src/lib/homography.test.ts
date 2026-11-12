import { describe, expect, it } from 'vitest'
import { applyH, cssMatrix3d, homography } from './homography'

describe('Homographie', () => {
  it('bildet die 4 Ecken exakt ab – auch schräg/perspektivisch', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ]
    const dst = [
      { x: 10, y: 20 },
      { x: 380, y: 50 },
      { x: 420, y: 330 },
      { x: -5, y: 280 },
    ]
    const H = homography(src, dst)
    src.forEach((p, i) => {
      const q = applyH(H, p)
      expect(q.x).toBeCloseTo(dst[i].x, 6)
      expect(q.y).toBeCloseTo(dst[i].y, 6)
    })
  })
  it('Identität bei gleichen Punkten', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]
    expect(cssMatrix3d(100, 50, pts)).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)')
  })
})
