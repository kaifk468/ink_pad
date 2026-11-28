/**
 * Chalk texture (round 12, #301): a subtle dusty grain on the Chalkboard sheet. Screen only: exports, the minimap,
 * library thumbnails and the benchmark never see it. It is a small tiling image on a `::before` of the sheet layer
 * (see styles.css), so it is composited once with the layer and costs nothing per stroke or per frame.
 *
 * The tile is generated once from a fixed-seed PRNG, so it is identical on every device and run, then cached as a PNG
 * data URL. A canvas tile was chosen over an SVG feTurbulence filter: it needs no filter pass, renders the same in
 * every engine, and the pixel generator is pure and testable.
 */

export const CHALK_TILE_SIZE = 128
export const CHALK_TILE_SEED = 0x5eed301

/** Only the Chalkboard gets the grain (Clean, Sketch and the dark Clean/Sketch board stay flat). */
export function chalkTextureApplies(board: string | undefined): boolean {
  return board === 'chalk'
}

/** Small deterministic PRNG (mulberry32): the same seed always gives the same sequence in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** RGBA pixels of one tile: sparse chalk-dust specks (light) and faint dark pits, soft alpha, no solid fill. */
export function chalkGrainPixels(size = CHALK_TILE_SIZE, seed = CHALK_TILE_SEED): Uint8ClampedArray {
  const random = mulberry32(seed)
  const pixels = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const roll = random()
    const strength = random()
    let value = 255
    let alpha = 0
    if (roll < 0.34) alpha = 18 + strength * 70 // chalk dust
    else if (roll < 0.42) { value = 0; alpha = 14 + strength * 40 } // dark pit
    pixels[i * 4] = value
    pixels[i * 4 + 1] = value
    pixels[i * 4 + 2] = value
    pixels[i * 4 + 3] = Math.round(alpha)
  }
  return pixels
}

let cachedUrl: string | null | undefined

/** The tile as a CSS `url(...)` value, generated on first use and cached. Null where no canvas exists. */
export function chalkGrainCssUrl(): string | null {
  if (cachedUrl !== undefined) return cachedUrl
  cachedUrl = null
  if (typeof document === 'undefined') return cachedUrl
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = CHALK_TILE_SIZE
    const context = canvas.getContext('2d')
    if (!context) return cachedUrl
    const image = context.createImageData(CHALK_TILE_SIZE, CHALK_TILE_SIZE)
    image.data.set(chalkGrainPixels())
    context.putImageData(image, 0, 0)
    cachedUrl = `url(${canvas.toDataURL('image/png')})`
  } catch {
    cachedUrl = null
  }
  return cachedUrl
}
