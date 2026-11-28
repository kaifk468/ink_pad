import { canvasItemKey } from './canvasModel'
import type { CanvasItem, LineDash } from './canvasModel'
import { isFlowBox } from './diagramFlow'
import { applyStyle, captureStyle } from './styleClipboard'

/**
 * "Use as default for new shapes": the fill, line style, outline width and corners new boxes start with. Kept per device
 * (localStorage), never in the diagram. The outline colour is deliberately not part of it: it keeps following the pen colour.
 * Every field is optional; a missing one means the source box had no such property, so new shapes keep their usual value for it.
 *
 * Line style decision: for boxes this default's `dash` wins over the older "Line style for new shapes" default (which still
 * governs new lines, arrows and connectors). Choosing a line style for new shapes while this default exists updates its `dash`,
 * so the newer choice always wins and both controls agree.
 */
export type NewShapeStyle = {
  width?: number
  dash?: LineDash | 'solid'
  /** null = explicitly no fill. */
  fill?: string | null
  /** Plain rectangles only. */
  rounded?: boolean
}

export const NEW_SHAPE_STYLE_KEY = 'inkpad.newShapeStyle'

/** The default taken from one selected box (rectangle, diamond, ellipse or HLD shape), or null when the item is not one. */
export function newShapeStyleFrom(item: CanvasItem | null | undefined): NewShapeStyle | null {
  if (!item || item.kind !== 'rectangle' || !isFlowBox(item)) return null
  const captured = captureStyle(item)
  if (!captured) return null
  const style: NewShapeStyle = {}
  if (captured.width !== undefined) style.width = captured.width
  if (captured.dash === 'solid' || captured.dash === 'dashed' || captured.dash === 'dotted') style.dash = captured.dash
  if (captured.fill !== undefined) style.fill = captured.fill
  if (captured.rounded !== undefined) style.rounded = captured.rounded
  return Object.keys(style).length > 0 ? style : null
}

const HEX = /^#[0-9a-f]{6}$/i

/** Parses a stored value; anything damaged (bad JSON, wrong types, unknown values) is "no default". */
export function parseNewShapeStyle(raw: string | null | undefined): NewShapeStyle | null {
  if (!raw) return null
  let data: unknown
  try { data = JSON.parse(raw) } catch { return null }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const source = data as Record<string, unknown>
  const style: NewShapeStyle = {}
  if (source.width !== undefined) {
    if (typeof source.width !== 'number' || !Number.isFinite(source.width) || source.width <= 0 || source.width > 64) return null
    style.width = source.width
  }
  if (source.dash !== undefined) {
    if (source.dash !== 'solid' && source.dash !== 'dashed' && source.dash !== 'dotted') return null
    style.dash = source.dash
  }
  if (source.fill !== undefined) {
    if (source.fill !== null && (typeof source.fill !== 'string' || !HEX.test(source.fill))) return null
    style.fill = source.fill
  }
  if (source.rounded !== undefined) {
    if (typeof source.rounded !== 'boolean') return null
    style.rounded = source.rounded
  }
  return Object.keys(style).length > 0 ? style : null
}

export function serializeNewShapeStyle(style: NewShapeStyle): string {
  const out: NewShapeStyle = {}
  if (style.width !== undefined) out.width = style.width
  if (style.dash !== undefined) out.dash = style.dash
  if (style.fill !== undefined) out.fill = style.fill
  if (style.rounded !== undefined) out.rounded = style.rounded
  return JSON.stringify(out)
}

export function loadNewShapeStyle(storage?: Pick<Storage, 'getItem'>): NewShapeStyle | null {
  try { return parseNewShapeStyle((storage ?? window.localStorage).getItem(NEW_SHAPE_STYLE_KEY)) } catch { return null }
}

/** Stores the default, or removes it for null. Storage failures are ignored (the default then lasts for the session only). */
export function saveNewShapeStyle(style: NewShapeStyle | null, storage?: Pick<Storage, 'setItem' | 'removeItem'>): void {
  try {
    const target = storage ?? window.localStorage
    if (style) target.setItem(NEW_SHAPE_STYLE_KEY, serializeNewShapeStyle(style))
    else target.removeItem(NEW_SHAPE_STYLE_KEY)
  } catch { /* private mode: nothing to store */ }
}

/** A freshly created box with the default applied (only the properties that kind of box can take). The same item when there is no default or nothing changes. */
export function applyNewShapeStyle<T extends CanvasItem>(item: T, style: NewShapeStyle | null): T {
  if (!style || item.kind !== 'rectangle') return item
  return applyStyle([item], new Set([canvasItemKey(item)]), style)[0] as T
}

/** The default with its line style replaced (the newer "Line style for new shapes" choice wins). */
export function withNewShapeDash(style: NewShapeStyle, dash: LineDash | 'solid'): NewShapeStyle {
  return { ...style, dash }
}
