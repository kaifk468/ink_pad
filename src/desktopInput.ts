/**
 * Desktop input (steps 1 to 5 of the desktop-mode plan).
 *
 * InkPad is pen-first. A user-chosen "Desktop" input mode (a switch in the menu, off by default)
 * lets a mouse draw and edit on the canvas with the existing tools. In Tablet mode, the default,
 * the canvas behaves exactly as before. Nothing here is saved in a diagram: the mode is a
 * per-device preference, like the navigation settings.
 */

import { canvasItemKey, type CanvasItem, type Point, type RectangleBounds, type RectangleObject } from './canvasModel'
import { itemHitTest } from './lassoSelection'
import { MAX_ZOOM, MIN_ZOOM, panViewport, zoomViewportAt, type Viewport } from './viewport'

export type InputMode = 'tablet' | 'desktop'

export const DEFAULT_INPUT_MODE: InputMode = 'tablet'

const INPUT_MODE_KEY = 'inkpad.inputMode'

export function loadInputMode(storage?: Pick<Storage, 'getItem'>): InputMode {
  try {
    const source = storage ?? window.localStorage
    return source.getItem(INPUT_MODE_KEY) === 'desktop' ? 'desktop' : DEFAULT_INPUT_MODE
  } catch {
    return DEFAULT_INPUT_MODE
  }
}

export function saveInputMode(mode: InputMode, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const target = storage ?? window.localStorage
    target.setItem(INPUT_MODE_KEY, mode)
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}

/**
 * The pressure stored for every point of a mouse stroke. A mouse reports no real pressure (browsers give
 * 0.5 while a button is down, 0 otherwise), so mouse points get one fixed value: 0.5 draws at 0.8 of the
 * pen's base width (see strokeWidthFor in app/canvasRenderer.ts), close to ordinary pen ink, whereas 0 means
 * "no pressure information" and would draw wider. It is an ordinary saved pressure value: no format change.
 */
export const MOUSE_PRESSURE = 0.5

/** The pressure to store for a sample: the pen and touch keep what the device reports; a mouse gets MOUSE_PRESSURE. */
export function pointerPressure(pointerType: string, pressure: number): number {
  return pointerType === 'mouse' ? MOUSE_PRESSURE : pressure
}

/**
 * Whether a pointer may start drawing or editing on the canvas.
 * - The pen always may, with any button: the barrel and eraser buttons are read later (penButton.ts).
 * - Touch never draws or edits; it only navigates (it is handled before this check).
 * - A mouse may only in Desktop mode, and only with the main (left) button.
 */
export function acceptsPointer(pointerType: string, button: number, mode: InputMode): boolean {
  if (pointerType === 'pen') return true
  if (pointerType === 'mouse') return mode === 'desktop' && button === 0
  return false
}

/**
 * The full "may this press start a canvas gesture" rule used by the canvas pointer-down gate.
 * - Pen: exactly the check InkPad has always used (only the original pen gestures block it), so
 *   a finger dragging the minimap or the UML toolbox never stops the pen.
 * - Anything else that is accepted (a mouse): any gesture in progress blocks it, including the
 *   text and class taps, the object eraser, and the minimap and UML toolbox drags. Otherwise a
 *   second pointer could overwrite a pen gesture's state. A mouse press is also refused while a
 *   finger is down, so a pinch or pan in progress is never turned into a stroke (the pen, by
 *   contrast, cancels the touches: it always wins).
 */
export function canStartCanvasGesture(
  pointerType: string,
  button: number,
  mode: InputMode,
  penGestureActive: boolean,
  anyGestureActive: boolean,
  touchActive = false,
): boolean {
  if (!acceptsPointer(pointerType, button, mode)) return false
  return pointerType === 'pen' ? !penGestureActive : !anyGestureActive && !touchActive
}

/**
 * Step 3: moving around with a mouse or trackpad (Desktop mode only).
 * - A wheel or two-finger trackpad scroll pans the view; Shift turns a vertical wheel into a sideways pan.
 * - Ctrl + wheel (and a trackpad pinch, which browsers report as Ctrl + wheel) zooms toward the pointer.
 * - A middle-button drag, or a left-button drag while Space is held, pans.
 */

/** Browsers report wheel distances in pixels, lines or pages (WheelEvent.deltaMode 0, 1, 2). */
export function wheelDeltaPixels(delta: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === 1) return delta * 16
  if (deltaMode === 2) return delta * pageHeight
  return delta
}

/** The most a single wheel event may zoom by: keeps one notch of a mouse wheel to about a 1.35x step. */
export const WHEEL_ZOOM_MAX_DELTA = 30
export const WHEEL_ZOOM_SENSITIVITY = 0.01

export type WheelInput = { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; shiftKey: boolean }

/** The view after one wheel event. `point` is the pointer's position inside the canvas, in screen units. */
export function wheelViewport(viewport: Viewport, wheel: WheelInput, point: { x: number; y: number }, pageHeight: number, canZoom = true): Viewport {
  const dx = wheelDeltaPixels(wheel.deltaX, wheel.deltaMode, pageHeight)
  const dy = wheelDeltaPixels(wheel.deltaY, wheel.deltaMode, pageHeight)
  if (wheel.ctrlKey) {
    if (!canZoom) return viewport
    const clamped = Math.max(-WHEEL_ZOOM_MAX_DELTA, Math.min(WHEEL_ZOOM_MAX_DELTA, dy))
    const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.scale * Math.exp(-clamped * WHEEL_ZOOM_SENSITIVITY)))
    return zoomViewportAt(viewport, scale, { x: point.x, y: point.y, pressure: 1 })
  }
  // Shift + a plain vertical wheel pans sideways (trackpads already send deltaX themselves).
  if (wheel.shiftKey && dx === 0) return panViewport(viewport, -dy, 0)
  return panViewport(viewport, -dx, -dy)
}

/** Whether a mouse press starts a pan instead of a tool gesture: middle button, or left button with Space held. */
export function startsMousePan(pointerType: string, button: number, mode: InputMode, spaceHeld: boolean): boolean {
  if (pointerType !== 'mouse' || mode !== 'desktop') return false
  return button === 1 || (button === 0 && spaceHeld)
}

/** Whether a key press should be read as "Space held for panning": only when nothing that types or clicks has focus. */
export function spaceIsPanKey(key: string, targetTag: string, isEditable: boolean, mode: InputMode): boolean {
  if (mode !== 'desktop' || key !== ' ') return false
  if (isEditable) return false
  return !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(targetTag.toUpperCase())
}

/**
 * Step 4: keyboard shortcuts (Desktop mode only).
 * - Ctrl/Cmd + Z undoes; Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y redoes.
 * - Ctrl/Cmd + "+" / "-" / 0 zoom in, zoom out and reset the view.
 * - Escape deselects (it never cancels a stroke or closes anything).
 * - Delete or Backspace deletes the selection; Ctrl/Cmd + A selects everything on the page (step 5).
 * - A plain letter picks a tool, and picking the tool already active leaves it active ("set", not "toggle"):
 *   P pen, V select, E eraser, T text, L lasso, C connector, B class box.
 */
export type KeyTool = 'pen' | 'select' | 'eraser' | 'text' | 'lasso' | 'connector' | 'classBox'
export type KeyCommand =
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'zoomIn' }
  | { kind: 'zoomOut' }
  | { kind: 'zoomReset' }
  | { kind: 'deselect' }
  | { kind: 'deleteSelection' }
  | { kind: 'selectAll' }
  | { kind: 'tool'; tool: KeyTool }

export const TOOL_KEYS: Record<string, KeyTool> = { p: 'pen', v: 'select', e: 'eraser', t: 'text', l: 'lasso', c: 'connector', b: 'classBox' }

export type KeyInput = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean }

export function keyCommand(event: KeyInput, mode: InputMode): KeyCommand | null {
  if (mode !== 'desktop') return null
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const command = event.ctrlKey || event.metaKey
  if (command && !event.altKey) {
    if (key === 'z') return event.shiftKey ? { kind: 'redo' } : { kind: 'undo' }
    if (key === 'y' && !event.shiftKey) return { kind: 'redo' }
    if (key === '=' || key === '+') return { kind: 'zoomIn' }
    if (key === '-' || key === '_') return { kind: 'zoomOut' }
    if (key === '0') return { kind: 'zoomReset' }
    if (key === 'a' && !event.shiftKey) return { kind: 'selectAll' }
    return null
  }
  // Everything below is a bare key: any modifier means the person meant something else (a browser shortcut, say).
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null
  if (key === 'Escape') return event.repeat ? null : { kind: 'deselect' }
  if (key === 'Delete' || key === 'Backspace') return event.repeat ? null : { kind: 'deleteSelection' }
  if (event.repeat) return null
  const tool = TOOL_KEYS[key]
  return tool ? { kind: 'tool', tool } : null
}

/** True when a key press is going into something that types (so shortcuts must not take it). */
export function isTypingTarget(tag: string, isEditable: boolean): boolean {
  return isEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag.toUpperCase())
}

/**
 * Step 7: hover and click-to-select (Desktop mode), and the pen's edge hold (Tablet and Desktop).
 * `hitTarget` is the one rule that decides which box, connector or text label is under a point, with the same
 * order (text, then box, then connector; the topmost of each) and the same tolerances as the select tool.
 * Pass the connector-routed items so elbow connectors are hit where they are drawn.
 */
export type HitTarget = { key: string; kind: 'rectangle' | 'connector' | 'text'; id: number }

export function hitTarget(routedItems: readonly CanvasItem[], point: Point, scale: number): HitTarget | null {
  const pick = (kind: HitTarget['kind'], test: (item: CanvasItem) => boolean): HitTarget | null => {
    for (let index = routedItems.length - 1; index >= 0; index -= 1) {
      const item = routedItems[index]
      if (item.kind === kind && test(item)) return { key: canvasItemKey(item), kind, id: item.id }
    }
    return null
  }
  return pick('text', (item) => itemHitTest(item, point, 8 / scale))
    ?? pick('rectangle', (item) => {
      if (item.kind !== 'rectangle') return false
      const pad = Math.max(8 / scale, item.strokeWidth * 2)
      return point.x >= item.x - pad && point.x <= item.x + item.width + pad && point.y >= item.y - pad && point.y <= item.y + item.height + pad
    })
    ?? pick('connector', (item) => item.kind === 'connector' && itemHitTest(item, point, Math.max(12 / scale, item.strokeWidth * 2)))
}

export type ClickTool = 'pen' | 'shape' | 'text' | 'connector' | 'lasso' | 'classBox' | 'select' | 'eraser'

/**
 * What a mouse press selects and drags, before the active tool sees it. Any tool except the eraser; the select tool
 * already selects by itself, and the lasso tool keeps its own move and resize while something is selected.
 * In the pen tool the inside of an ink class box stays writable: only its edge band is taken, and never the already
 * selected box, whose handles and border have their own rules.
 */
export function clickSelectTarget(
  routedItems: readonly CanvasItem[],
  point: Point,
  scale: number,
  tool: ClickTool,
  hasSelection: boolean,
  selectedRectangleId: number | null = null,
): HitTarget | null {
  if (tool === 'eraser' || tool === 'select') return null
  if (tool === 'lasso' && hasSelection) return null
  const target = hitTarget(routedItems, point, scale)
  if (!target || target.kind !== 'rectangle' || tool !== 'pen') return target
  const box = routedItems.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === target.id)
  if (!box?.inkBox) return target
  // The selected ink box keeps its own handles, grip, dividers and border rules in the pen tool.
  if (box.id === selectedRectangleId) return null
  return pointInEdgeBand(box, point, EDGE_BAND_PX / scale) ? target : null
}

/** How close to a box's outline (screen px, divided by the zoom scale) counts as its edge: the same idea as the resize handles. */
export const EDGE_BAND_PX = 14
export const EDGE_HOLD_MS = 500
/** A pen that wanders further than this (screen px) while holding is writing, not holding. */
export const EDGE_HOLD_JITTER_PX = 7

/** True when the point is within `band` of the box outline (outside or inside); the middle of a big box is not. */
export function pointInEdgeBand(box: RectangleBounds, point: Point, band: number): boolean {
  if (point.x < box.x - band || point.x > box.x + box.width + band || point.y < box.y - band || point.y > box.y + box.height + band) return false
  const inner = point.x > box.x + band && point.x < box.x + box.width - band && point.y > box.y + band && point.y < box.y + box.height - band
  return !inner
}

/** The topmost box under the point when the point is in its edge band; null in its interior or off every box. */
export function edgeBandBox(items: readonly CanvasItem[], point: Point, scale: number): RectangleObject | null {
  const band = EDGE_BAND_PX / scale
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.kind !== 'rectangle') continue
    if (point.x < item.x - band || point.x > item.x + item.width + band || point.y < item.y - band || point.y > item.y + item.height + band) continue
    return pointInEdgeBand(item, point, band) ? item : null
  }
  return null
}

/** What a held pen does at a check: keep waiting, select the box (held still for 500 ms), or give up and draw (moved too far). */
export function edgeHoldDecision(start: Point, current: Point, elapsedMs: number, scale: number): 'wait' | 'select' | 'draw' {
  if (Math.hypot(current.x - start.x, current.y - start.y) > EDGE_HOLD_JITTER_PX / scale) return 'draw'
  return elapsedMs >= EDGE_HOLD_MS ? 'select' : 'wait'
}
