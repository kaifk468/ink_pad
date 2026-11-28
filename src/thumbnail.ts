/** Library card pictures: a small PNG of each diagram, kept in this browser only (never inside the saved diagram). */
export const THUMBNAIL_MAX_WIDTH = 360
export const THUMBNAIL_MAX_HEIGHT = 220
/** A drawing whose image source is larger than this is not pictured (the work would stall the page); the card keeps its icon or older picture. */
export const THUMBNAIL_MAX_SVG_CHARS = 6_000_000
/** What the page overview's picture loader returns for a page too heavy to draw (a blank page returns null). */
export const PAGE_PREVIEW_TOO_LARGE = 'too-large'

/** Fit a drawing of the given size inside the picture box, keeping its shape. Never enlarges; always at least 1 px. */
export function thumbnailSize(width: number, height: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 1, height: 1 }
  const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / width, THUMBNAIL_MAX_HEIGHT / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Only real PNG pictures made here are shown; anything else in the store is ignored. */
export function isThumbnailDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/png;base64,') && value.length < 400_000
}
