import { db, type Photo } from '../db/db'
import { newId } from './id'

/**
 * Verkleinert ein Foto (längste Seite max. 1600 px) und speichert es als JPEG.
 * Spart Platz auf dem Handy – Wildkamera-Bilder sind oft mehrere MB groß.
 */
export async function resizeImage(file: Blob, maxDim = 1600, quality = 0.82) {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(file)
  }
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Bild kann nicht verarbeitet werden')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht gespeichert werden'))), 'image/jpeg', quality),
  )
  return { blob, width: w, height: h }
}

export async function savePhoto(file: Blob, demo = false): Promise<string> {
  const { blob, width, height } = await resizeImage(file)
  const photo: Photo = { id: newId(), blob, mime: 'image/jpeg', width, height, demo, createdAt: Date.now() }
  await db.photos.add(photo)
  return photo.id
}
