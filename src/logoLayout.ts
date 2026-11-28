import { canvasItemKey, isItemLocked } from './canvasModel'
import type { CanvasItem, RectangleObject, TextObject } from './canvasModel'
import { CLASS_BOX_DEFAULT_STROKE_WIDTH } from './classBoxLayout'
import { createTextObject } from './textLayout'
import type { TechLogo } from './techLogoSearch'

/**
 * Tech logo boxes. A logo box is a plain rounded RectangleObject with `logo` (a Simple Icons slug) and optionally `logoColor: 'brand'`.
 * The logo is drawn inside the box (never a separate item); the brand name is an ordinary text label item sitting in the bottom band, as for templates.
 * Everything here is pure, so the canvas, the SVG export and the tests share one geometry.
 */

export const LOGO_BOX_SIZE = 150
export const LOGO_LABEL_FONT_SIZE = 20

export type LogoPlacement = { x: number; y: number; size: number }

/** Where the logo square sits in a logo box: inside a padding, above a bottom band that holds the name label, centred. */
export function logoPlacement(rectangle: { x: number; y: number; width: number; height: number }): LogoPlacement {
  const pad = Math.min(rectangle.width, rectangle.height) * 0.12
  const band = Math.min(rectangle.height * 0.22, 40)
  const areaWidth = Math.max(0, rectangle.width - pad * 2)
  const areaHeight = Math.max(0, rectangle.height - pad * 2 - band)
  const size = Math.min(areaWidth, areaHeight)
  return { x: rectangle.x + pad + (areaWidth - size) / 2, y: rectangle.y + pad + (areaHeight - size) / 2, size }
}

/** Fill colour of a logo: its brand colour for `logoColor: 'brand'` (and a known logo), else the box's own line colour. */
export function logoFillColor(rectangle: Pick<RectangleObject, 'strokeColor' | 'logoColor'>, logo: Pick<TechLogo, 'hex'> | undefined): string {
  return rectangle.logoColor === 'brand' && logo ? logo.hex : rectangle.strokeColor
}

/** SVG `transform` that maps the 24 x 24 logo path onto its placement. */
export function logoSvgTransform(placement: LogoPlacement): string {
  const round = (value: number) => Math.round(value * 100) / 100
  return `translate(${round(placement.x)} ${round(placement.y)}) scale(${round(placement.size / 24 * 1000) / 1000})`
}

/** The neutral stand-in for a logo this build does not have (or has not loaded yet): a rounded square with a question mark. */
export function logoPlaceholderGeometry(placement: LogoPlacement): { x: number; y: number; size: number; radius: number; fontSize: number } {
  return { ...placement, radius: placement.size * 0.2, fontSize: placement.size * 0.62 }
}

/**
 * Builds the items for one inserted logo, with local ids starting at 1 and the top-left at (0, 0), ready for the paste path
 * (which assigns real ids and centres them): the box and, when `showName`, its brand name label centred in the bottom band.
 */
export function buildLogoItems(logo: Pick<TechLogo, 'slug' | 'title'>, strokeColor: string, showName: boolean, size = LOGO_BOX_SIZE): Array<RectangleObject | TextObject> {
  const box: RectangleObject = { kind: 'rectangle', id: 1, x: 0, y: 0, width: size, height: size, strokeColor, strokeWidth: CLASS_BOX_DEFAULT_STROKE_WIDTH, rounded: true, logo: logo.slug }
  if (!showName) return [box]
  let made = createTextObject(1, 0, 0, logo.title, strokeColor, LOGO_LABEL_FONT_SIZE)
  const room = size - 12
  if (made.width > room) made = createTextObject(1, 0, 0, logo.title, strokeColor, Math.max(12, Math.floor(LOGO_LABEL_FONT_SIZE * room / made.width)))
  const pad = Math.min(box.width, box.height) * 0.12
  const band = Math.min(box.height * 0.22, 40)
  const label: TextObject = { ...made, align: 'center', x: box.width / 2 - made.width / 2, y: box.height - pad - band / 2 - made.height / 2 }
  return [box, label]
}

/** A cache of one built object per key (used for Path2D, built once per slug and never per frame). `make` is injected so tests can count constructions. */
export function createPathCache<T>(make: (path: string) => T): { get(slug: string, path: string): T; readonly size: number } {
  const cache = new Map<string, T>()
  return {
    get(slug, path) {
      let built = cache.get(slug)
      if (built === undefined) { built = make(path); cache.set(slug, built) }
      return built
    },
    get size() { return cache.size },
  }
}

/** The selected unlocked rectangles when every selected rectangle is a logo box (otherwise the panel row is not offered); empty when there are none. */
function selectedLogoBoxes(items: readonly CanvasItem[], keys: ReadonlySet<string>): RectangleObject[] {
  const rectangles = items.filter((item): item is RectangleObject => item.kind === 'rectangle' && keys.has(canvasItemKey(item)))
  return rectangles.length > 0 && rectangles.every((box) => box.logo !== undefined && !isItemLocked(box)) ? rectangles : []
}

/** 'brand' when every selected logo box is brand-coloured, 'flat' when any is flat, null when the selection is not only logo boxes. */
export function logoColorChoice(items: readonly CanvasItem[], keys: ReadonlySet<string>): 'flat' | 'brand' | null {
  const boxes = selectedLogoBoxes(items, keys)
  if (boxes.length === 0) return null
  return boxes.every((box) => box.logoColor === 'brand') ? 'brand' : 'flat'
}

/** Sets the logo colour of the selected logo boxes: Brand writes `logoColor: 'brand'`, Flat removes it. Returns the same array when nothing changes. */
export function setLogoColor(items: CanvasItem[], keys: ReadonlySet<string>, brand: boolean): CanvasItem[] {
  const targets = new Set(selectedLogoBoxes(items, keys).map(canvasItemKey))
  let changed = false
  const next = items.map((item) => {
    if (item.kind !== 'rectangle' || !targets.has(canvasItemKey(item)) || (item.logoColor === 'brand') === brand) return item
    changed = true
    if (brand) return { ...item, logoColor: 'brand' as const }
    const { logoColor: _flat, ...rest } = item
    return rest
  })
  return changed ? next : items
}
