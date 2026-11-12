// Perspektivische Entzerrung (Homographie) für das Revier-Foto.
// Aus 4 Bildecken und 4 Zielpunkten wird eine 3x3-Matrix berechnet, mit der
// das Bild per CSS (matrix3d) verzerrt über die Karte gelegt wird.

export type Pt = { x: number; y: number }

/** Löst A·x = b (Gauß mit Pivotsuche) */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('Punkte liegen ungünstig (z. B. auf einer Linie)')
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

/** Homographie H (zeilenweise, 9 Werte, h33 = 1), die src[i] auf dst[i] abbildet */
export function homography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  return [...solve(A, b), 1]
}

export function applyH(H: number[], p: Pt): Pt {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

/** CSS matrix3d (spaltenweise) für ein Bild der Größe w×h auf die 4 Zielecken (oben links, oben rechts, unten rechts, unten links) */
export function cssMatrix3d(w: number, h: number, corners: Pt[]): string {
  const H = homography(
    [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
    corners,
  )
  const m = [H[0], H[3], 0, H[6], H[1], H[4], 0, H[7], 0, 0, 1, 0, H[2], H[5], 0, H[8]]
  return `matrix3d(${m.map((x) => +x.toFixed(10)).join(',')})`
}
