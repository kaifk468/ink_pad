import { canvasItemKey } from './canvasModel'
import type { CanvasItem } from './canvasModel'
import { isFillableRectangle } from './sketchy'

/** Pastel fills for the hand-drawn look, each with the darker outline colour that goes with it. */
export const FILL_PRESETS: Array<{ name: string; fill: string; outline: string }> = [
  { name: 'Green', fill: '#b2f2bb', outline: '#2f9e44' },
  { name: 'Yellow', fill: '#ffec99', outline: '#e08c00' },
  { name: 'Blue', fill: '#a5d8ff', outline: '#1971c2' },
  { name: 'Purple', fill: '#d0bfff', outline: '#6741d9' },
  { name: 'Pink', fill: '#fcc2d7', outline: '#c2255c' },
]

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** True when the selection holds at least one shape that can carry a fill colour. */
export function selectionHasFillable(items: readonly CanvasItem[], keys: ReadonlySet<string>): boolean {
  return items.some((item) => item.kind === 'rectangle' && keys.has(canvasItemKey(item)) && isFillableRectangle(item))
}

/** The fill the selected fillable shapes share: a colour, 'none', or null when they differ. */
export function selectionFillColor(items: readonly CanvasItem[], keys: ReadonlySet<string>): string | 'none' | null {
  let found: string | null = null
  for (const item of items) {
    if (item.kind !== 'rectangle' || !keys.has(canvasItemKey(item)) || !isFillableRectangle(item)) continue
    const fill = item.fillColor?.toLowerCase() ?? 'none'
    if (found === null) found = fill
    else if (found !== fill) return null
  }
  return found
}

/** Items with the selected fillable shapes given this fill (null removes it). Same array when nothing changes or the colour is not #rrggbb. */
export function setFillColor(items: CanvasItem[], keys: ReadonlySet<string>, fill: string | null): CanvasItem[] {
  if (keys.size === 0 || (fill !== null && !HEX_COLOR.test(fill))) return items
  let changed = false
  const next = items.map((item): CanvasItem => {
    if (item.kind !== 'rectangle' || !keys.has(canvasItemKey(item)) || !isFillableRectangle(item)) return item
    if ((item.fillColor?.toLowerCase() ?? null) === (fill?.toLowerCase() ?? null)) return item
    changed = true
    if (fill === null) {
      const { fillColor: _removed, ...rest } = item
      return rest
    }
    return { ...item, fillColor: fill }
  })
  return changed ? next : items
}

/** The darker outline that goes with a preset fill, or null for any other colour. */
export function matchingOutline(fill: string | null): string | null {
  return FILL_PRESETS.find((preset) => preset.fill.toLowerCase() === fill?.toLowerCase())?.outline ?? null
}
