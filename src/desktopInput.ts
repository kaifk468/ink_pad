/**
 * Desktop input (steps 1 to 5 of the desktop-mode plan).
 *
 * InkPad is pen-first. A user-chosen "Desktop" input mode (a switch in the menu, off by default)
 * lets a mouse draw and edit on the canvas with the existing tools. In Tablet mode, the default,
 * the canvas behaves exactly as before. Nothing here is saved in a diagram: the mode is a
 * per-device preference, like the navigation settings.
 */

import { canvasItemKey, getCanvasSelectionBounds, isItemLocked, toItemFrame, type CanvasItem, type Point, type RectangleBounds, type RectangleObject } from './canvasModel'
import { hitInkBoxDivider, hitInkBoxMoveGrip } from './inkClassBox'
import { itemHitTest } from './lassoSelection'
import { connectorLabelFontSize, pointOnConnectorLabel } from './connectorLabel'
import { DEFAULT_TEXT_FONT, getCachedTextMeasure } from './textLayout'
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

const LINE_DASH_KEY = 'inkpad.lineDash'

/** The line style new shapes, lines and arrows get from the Desktop shape tools ('solid' when never chosen). */
export function loadLineDashDefault(storage?: Pick<Storage, 'getItem'>): 'solid' | 'dashed' | 'dotted' {
  try {
    const value = (storage ?? window.localStorage).getItem(LINE_DASH_KEY)
    return value === 'dashed' || value === 'dotted' ? value : 'solid'
  } catch {
    return 'solid'
  }
}

export const TOOL_LOCK_KEY = 'inkpad.toolLock'

/** Tool lock: keep the shape/arrow/line tool after drawing one (off by default; remembered on this device). */
export function loadToolLock(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    return (storage ?? window.localStorage).getItem(TOOL_LOCK_KEY) === '1'
  } catch {
    return false
  }
}

export function saveToolLock(value: boolean, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? window.localStorage).setItem(TOOL_LOCK_KEY, value ? '1' : '0')
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}

export function saveLineDashDefault(value: 'solid' | 'dashed' | 'dotted', storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? window.localStorage).setItem(LINE_DASH_KEY, value)
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
 * - Ctrl/Cmd + "+" / "-" / 0 zoom in, zoom out and go to 100%; Shift+1 fits the drawing, Shift+2 the selection; PageUp/PageDown change page; "?" opens the shortcut help.
 * - Escape deselects (it never cancels a stroke or closes anything).
 * - Delete or Backspace deletes the selection; Ctrl/Cmd + A selects everything on the page (step 5).
 * - A plain letter picks a tool, and picking the tool already active leaves it active ("set", not "toggle"):
 *   P pen, V select, E eraser, T text, L lasso, C connector, B class box, and the shapes R rectangle, D diamond, O ellipse, A arrow, I line.
 */
export type KeyTool = 'pen' | 'select' | 'eraser' | 'text' | 'code' | 'sticky' | 'lasso' | 'connector' | 'classBox' | 'rectangle' | 'diamond' | 'ellipse' | 'arrow' | 'line' | 'laser'
export type KeyCommand =
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'library' }
  | { kind: 'palette' }
  | { kind: 'find' }
  | { kind: 'zoomIn' }
  | { kind: 'zoomOut' }
  | { kind: 'zoomReset' }
  | { kind: 'zoomFit' }
  | { kind: 'zoomSelection' }
  | { kind: 'pagePrev' }
  | { kind: 'pageNext' }
  | { kind: 'help' }
  | { kind: 'presentMode' }
  | { kind: 'deselect' }
  | { kind: 'deleteSelection' }
  | { kind: 'selectAll' }
  | { kind: 'nudge'; dx: number; dy: number }
  | { kind: 'copy' }
  | { kind: 'cut' }
  | { kind: 'paste' }
  | { kind: 'duplicate' }
  | { kind: 'copyPng' }
  | { kind: 'copyStyle' }
  | { kind: 'pasteStyle' }
  | { kind: 'lock' }
  | { kind: 'group' }
  | { kind: 'ungroup' }
  | { kind: 'edit' }
  | { kind: 'quickCreate'; direction: 'right' | 'left' | 'up' | 'down' }
  | { kind: 'layer'; move: 'forward' | 'backward' | 'front' | 'back' }
  | { kind: 'toolLock' }
  | { kind: 'fontSize'; direction: 1 | -1 }
  | { kind: 'tool'; tool: KeyTool }

export const TOOL_KEYS: Record<string, KeyTool> = { p: 'pen', v: 'select', e: 'eraser', t: 'text', k: 'code', n: 'sticky', l: 'lasso', c: 'connector', b: 'classBox', r: 'rectangle', d: 'diamond', o: 'ellipse', a: 'arrow', i: 'line', x: 'laser' }

/** Excalidraw-style number keys (bare digits, also on the numpad). Lasso, HLD shapes, class box and code keep letters only. */
export const NUMBER_TOOL_KEYS: Record<string, KeyTool> = { '1': 'select', '2': 'rectangle', '3': 'diamond', '4': 'ellipse', '5': 'arrow', '6': 'line', '7': 'pen', '8': 'text', '9': 'connector', '0': 'eraser' }

const QUICK_CREATE_KEYS: Record<string, 'right' | 'left' | 'up' | 'down'> = { ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down' }
const ARROW_KEYS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

export type KeyInput = { key: string; /** Physical key (KeyboardEvent.code); Shift+1 and Shift+2 use it because their `key` depends on the layout. */ code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean }

export function keyCommand(event: KeyInput, mode: InputMode): KeyCommand | null {
  if (mode !== 'desktop') return null
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const command = event.ctrlKey || event.metaKey
  // Ctrl/Cmd+Alt+C copies the style of the selected item, Ctrl/Cmd+Alt+V pastes it (Excalidraw's bindings). The physical key decides: Alt changes `key` on a Mac,
  // and AltGr sends ctrl+alt on some layouts, so only the matching `code` counts (and never with Shift).
  if (command && event.altKey && !event.shiftKey && (event.code === 'KeyC' || event.code === 'KeyV')) {
    if (event.repeat) return null
    return { kind: event.code === 'KeyC' ? 'copyStyle' : 'pasteStyle' }
  }
  if (command && !event.altKey) {
    // Layer order: Ctrl+] / Ctrl+[ one step, with Shift all the way. The physical key decides (Shift changes `key` to } or {).
    // Zoom keys are checked by `key` first: on a German layout Ctrl+'+' is the physical BracketRight key. The bracket `code` counts only when `key` is a bracket or not a single printable character.
    const zoomKey = key === '=' || key === '+' || key === '-' || key === '_'
    const bracketKey = event.key === '[' || event.key === ']' || event.key === '{' || event.key === '}' || event.key.length !== 1
    if (!zoomKey && bracketKey && (event.code === 'BracketRight' || event.code === 'BracketLeft')) {
      if (event.repeat) return null
      const forward = event.code === 'BracketRight'
      return { kind: 'layer', move: event.shiftKey ? (forward ? 'front' : 'back') : (forward ? 'forward' : 'backward') }
    }
    // Ctrl+Arrow: a new connected shape next to the selected shape (Ctrl+Shift+Arrow and held repeats do nothing).
    const flow = QUICK_CREATE_KEYS[key]
    if (flow) return event.shiftKey || event.repeat ? null : { kind: 'quickCreate', direction: flow }
    if (key === 'z') return event.shiftKey ? { kind: 'redo' } : { kind: 'undo' }
    if (key === 'y' && !event.shiftKey) return { kind: 'redo' }
    if (key === '=' || key === '+') return { kind: 'zoomIn' }
    if (key === '-' || key === '_') return { kind: 'zoomOut' }
    if (key === '0') return { kind: 'zoomReset' }
    if (key === 'a' && !event.shiftKey) return { kind: 'selectAll' }
    // Ctrl+G groups the selection, Ctrl+Shift+G ungroups it (the physical key decides, as Shift changes `key`).
    if (event.shiftKey ? event.code === 'KeyG' : (event.code ? event.code === 'KeyG' : key === 'g')) return event.repeat ? null : { kind: event.shiftKey ? 'ungroup' : 'group' }
    // Ctrl/Cmd+Shift+. makes the selected label's text one step larger, Ctrl/Cmd+Shift+, one step smaller (the key is > and < on a US layout; the physical key covers the others).
    if (event.shiftKey && (key === '.' || key === '>' || key === ',' || key === '<' || event.code === 'Period' || event.code === 'Comma')) {
      if (event.repeat) return null
      const larger = key === '.' || key === '>' ? true : key === ',' || key === '<' ? false : event.code === 'Period'
      return { kind: 'fontSize', direction: larger ? 1 : -1 }
    }
    // Ctrl+Shift+L locks the selection. The physical key decides, as Shift changes `key`.
    if (event.code === 'KeyL' && event.shiftKey) return event.repeat ? null : { kind: 'lock' }
    if (key === 'o' && !event.shiftKey && !event.repeat) return { kind: 'library' }
    // Ctrl/Cmd+K opens the command palette (Chrome would focus its search bar).
    if (key === 'k' && !event.shiftKey && !event.repeat) return { kind: 'palette' }
    // Ctrl/Cmd+F opens the find bar (never Chrome's own).
    if (key === 'f' && !event.shiftKey && !event.repeat) return { kind: 'find' }
    if (!event.shiftKey && !event.repeat) {
      if (key === 'c') return { kind: 'copy' }
      if (key === 'x') return { kind: 'cut' }
      if (key === 'v') return { kind: 'paste' }
      if (key === 'd') return { kind: 'duplicate' }
    }
    return null
  }
  // Shift+Alt+C copies the selection (or the page) as a PNG (Excalidraw's binding; Ctrl+Shift+C is Chrome's inspector). The physical key decides: Alt changes `key` on a Mac.
  if (event.shiftKey && event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyC') return event.repeat ? null : { kind: 'copyPng' }
  // Shift+1 fits the drawing, Shift+2 zooms to the selection. `key` is "!" or "@" on a US layout and something else elsewhere, so the physical key decides.
  if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.code === 'Digit1' || event.code === 'Numpad1') return event.repeat ? null : { kind: 'zoomFit' }
    if (event.code === 'Digit2' || event.code === 'Numpad2') return event.repeat ? null : { kind: 'zoomSelection' }
  }
  // Alt+Z hides or shows the toolbars (present mode). The physical key decides: Alt changes `key` on a Mac.
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.code === 'KeyZ' || (!event.code && key === 'z'))) return event.repeat ? null : { kind: 'presentMode' }
  // "?" opens the shortcut help (Shift + / on most layouts; some keyboards send "?" without Shift).
  if (key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) return event.repeat ? null : { kind: 'help' }
  // Arrow keys nudge the selection (Shift = 10 units); holding the key repeats on purpose. Other modifiers belong to the browser.
  const arrow = ARROW_KEYS[key]
  if (arrow && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const step = event.shiftKey ? NUDGE_BIG : NUDGE_SMALL
    return { kind: 'nudge', dx: arrow[0] * step, dy: arrow[1] * step }
  }
  // Everything below is a bare key: any modifier means the person meant something else (a browser shortcut, say).
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null
  if (key === 'Escape') return event.repeat ? null : { kind: 'deselect' }
  if (key === 'Delete' || key === 'Backspace') return event.repeat ? null : { kind: 'deleteSelection' }
  if (key === 'Enter') return event.repeat ? null : { kind: 'edit' }
  if (key === 'PageUp') return event.repeat ? null : { kind: 'pagePrev' }
  if (key === 'PageDown') return event.repeat ? null : { kind: 'pageNext' }
  if (event.repeat) return null
  if (key === 'q') return { kind: 'toolLock' }
  const tool = TOOL_KEYS[key] ?? NUMBER_TOOL_KEYS[key]
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
export type HitTarget = { key: string; kind: 'rectangle' | 'connector' | 'text' | 'code' | 'stroke'; id: number }

/** `skipCode`: look through code blocks (Alt + click reaches what lies under a block). */
export function hitTarget(routedItems: readonly CanvasItem[], point: Point, scale: number, skipCode = false, includeLocked = false): HitTarget | null {
  const pick = (kind: 'rectangle' | 'connector' | 'text' | 'code', test: (item: CanvasItem) => boolean): HitTarget | null => {
    for (let index = routedItems.length - 1; index >= 0; index -= 1) {
      const item = routedItems[index]
      if (!includeLocked && isItemLocked(item)) continue // locked items are drawn but never picked (the right-click menu looks through the lock)
      if (item.kind === kind && test(item)) return { key: canvasItemKey(item), kind, id: item.id }
    }
    return null
  }
  return pick('text', (item) => itemHitTest(item, point, 8 / scale))
    ?? (skipCode ? null : pick('code', (item) => itemHitTest(item, point, 8 / scale)))
    ?? pick('rectangle', (item) => {
      if (item.kind !== 'rectangle') return false
      const pad = Math.max(8 / scale, item.strokeWidth * 2)
      const local = toItemFrame(item, point)
      return local.x >= item.x - pad && local.x <= item.x + item.width + pad && local.y >= item.y - pad && local.y <= item.y + item.height + pad
    })
    ?? pick('connector', (item) => item.kind === 'connector' && (itemHitTest(item, point, Math.max(12 / scale, item.strokeWidth * 2)) || pointOnConnectorLabel(item, point, getCachedTextMeasure(connectorLabelFontSize(item), DEFAULT_TEXT_FONT))))
}

export type ClickTool = 'laser' | 'pen' | 'shape' | 'shapeDraw' | 'text' | 'connector' | 'lasso' | 'classBox' | 'select' | 'eraser'

/**
 * What a mouse press selects and drags, before the active tool sees it. Any tool except the eraser; the select tool
 * already selects by itself, and the lasso tool keeps its own move and resize while something is selected.
 * The inside of an ink class box stays writable with every tool (ink, text, ...): only its edge band is taken, and in the
 * pen tool never the already selected box, whose handles and border have their own rules.
 */
export function clickSelectTarget(
  routedItems: readonly CanvasItem[],
  point: Point,
  scale: number,
  tool: ClickTool,
  hasSelection: boolean,
  selectedRectangleId: number | null = null,
  skipCode = false,
): HitTarget | null {
  if (tool === 'eraser' || tool === 'select') return null
  // The connector tool's press starts a connector (from the box edge or inside it); it must never grab the box instead.
  if (tool === 'connector' || tool === 'shapeDraw') return null
  if (tool === 'lasso' && hasSelection) return null
  return edgeOnlyForInkBoxes(routedItems, hitTarget(routedItems, point, scale, skipCode), point, scale, tool === 'pen' ? selectedRectangleId : null)
}

/**
 * An ink class box is written in, so only its edge band (or near it) selects it, with every tool and for hover; the inside
 * is left to the active tool (ink, text, ...). `selectedId` is a box that keeps its own handle and border rules (pen tool).
 */
function edgeOnlyForInkBoxes(routedItems: readonly CanvasItem[], target: HitTarget | null, point: Point, scale: number, selectedId: number | null): HitTarget | null {
  if (!target || target.kind !== 'rectangle') return target
  const box = routedItems.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === target.id)
  // Boxes you write in (ink class boxes, HLD shapes) and plain drawn rectangles: only the edge selects. A typed class box selects anywhere.
  if (!box || box.classBox) return target
  if (box.id === selectedId) return null
  return pointInEdgeBand(box, toItemFrame(box, point), EDGE_BAND_PX / scale) ? target : null
}

/** The item the mouse hovers over: like a click target, so the inside of an ink class box is not highlighted. */
export function hoverTarget(routedItems: readonly CanvasItem[], point: Point, scale: number): HitTarget | null {
  return edgeOnlyForInkBoxes(routedItems, hitTarget(routedItems, point, scale), point, scale, null)
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

/**
 * Step 8: multi-select (Desktop mode).
 * - Shift + click adds or removes one item (box, connector, text or stroke).
 * - With the select tool, dragging from empty space draws a marquee; on release every item fully inside is selected,
 *   and Shift keeps the old selection.
 * The selection lives in two places that must agree: `keys` (the group selection) and `rectangleId` (the single-box
 * logic with handles). `normalizeSelection` is the one place that decides which: exactly one box and nothing else
 * is the single-box case; every other selection is keys.
 */
export type SelectionState = { keys: string[]; rectangleId: number | null }

export function normalizeSelection(keys: Iterable<string>): SelectionState {
  const list = [...new Set(keys)]
  if (list.length === 1 && list[0].startsWith('rectangle:')) return { keys: [], rectangleId: Number(list[0].slice('rectangle:'.length)) }
  return { keys: list, rectangleId: null }
}

/** The selection after Shift + click on `key`: removed when it was selected, added otherwise. */
export function toggleSelectionKey(keys: ReadonlySet<string>, rectangleId: number | null, key: string): SelectionState {
  const next = new Set(keys)
  if (rectangleId !== null) next.add(`rectangle:${rectangleId}`)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return normalizeSelection(next)
}

/** Shift + click may also pick a freehand stroke (plain clicks never do); boxes, text and connectors come first. */
export function shiftClickTarget(routedItems: readonly CanvasItem[], point: Point, scale: number): HitTarget | null {
  const target = hitTarget(routedItems, point, scale)
  if (target) return target
  for (let index = routedItems.length - 1; index >= 0; index -= 1) {
    const item = routedItems[index]
    if (item.kind === 'stroke' && !item.erase && !item.locked && itemHitTest(item, point, 12 / scale)) return { key: canvasItemKey(item), kind: 'stroke', id: item.id }
  }
  return null
}

export function rectFromPoints(a: Point, b: Point): RectangleBounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

/** Keys of every item whose whole extent lies inside the marquee. Eraser marks have no extent of their own and are never picked. */
export function marqueeKeys(routedItems: readonly CanvasItem[], rect: RectangleBounds): string[] {
  const keys: string[] = []
  for (const item of routedItems) {
    if (item.kind === 'opaque' || isItemLocked(item)) continue // unknown and locked items are never selected
    const key = canvasItemKey(item)
    const bounds = getCanvasSelectionBounds([item], new Set([key]))
    if (!bounds) continue
    if (bounds.x >= rect.x && bounds.y >= rect.y && bounds.x + bounds.width <= rect.x + rect.width && bounds.y + bounds.height <= rect.y + rect.height) keys.push(key)
  }
  return keys
}

/** The selection after releasing a marquee. Shift keeps what was selected before (`base`, which includes a single selected box). */
export function marqueeSelection(routedItems: readonly CanvasItem[], rect: RectangleBounds, base: ReadonlySet<string>, shift: boolean): SelectionState {
  const picked = marqueeKeys(routedItems, rect)
  return normalizeSelection(shift ? [...base, ...picked] : picked)
}

/**
 * Step 9: nudging and cancelling (Desktop mode).
 * - Arrow keys move the selection 1 canvas unit, Shift + arrow 10. A burst of presses is one undo step: the first press
 *   after a 500 ms pause records history, the rest of the burst does not.
 * - Escape during a drag, resize, marquee or lasso cancels it and puts the original items back; with nothing in progress it
 *   keeps deselecting, and during any other gesture (ink, text tap, eraser) it does nothing, as before.
 */
export const NUDGE_SMALL = 1
export const NUDGE_BIG = 10
export const NUDGE_PAUSE_MS = 500

/** Whether a nudge starts a new undo step: the first one, or the first after a pause of NUDGE_PAUSE_MS or more. */
export function nudgeStartsNewStep(lastNudgeAt: number | null, now: number): boolean {
  return lastNudgeAt === null || now - lastNudgeAt >= NUDGE_PAUSE_MS
}

export type EscapeAction = 'cancelGesture' | 'deselect' | 'none'

export function escapeAction(state: { cancelableGesture: boolean; anyGesture: boolean; hasSelection: boolean }): EscapeAction {
  if (state.cancelableGesture) return 'cancelGesture'
  if (state.anyGesture) return 'none'
  return state.hasSelection ? 'deselect' : 'none'
}

/**
 * Step 11: right-click menu, double-click and Enter to edit, and the cursor per tool (Desktop mode only).
 */
export type EditTarget = { kind: 'text' | 'classBox' | 'code' | 'connector'; id: number }

/** What a double-click on the target edits: a text label, or a class box (not an ink box, which is written in, nor an oval). */
export function doubleClickTarget(routedItems: readonly CanvasItem[], point: Point, scale: number): EditTarget | null {
  const target = hitTarget(routedItems, point, scale)
  if (!target) return null
  if (target.kind === 'text' || target.kind === 'code' || target.kind === 'connector') return { kind: target.kind, id: target.id }
  if (target.kind !== 'rectangle') return null
  const box = routedItems.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === target.id)
  return box?.classBox && !box.inkBox && !box.ellipse && !box.diamond ? { kind: 'classBox', id: box.id } : null
}

/** Enter edits the one selected label or class box; any other selection (none, several, a connector, an ink box) does nothing. */
export function editTargetForSelection(items: readonly CanvasItem[], keys: ReadonlySet<string>, rectangleId: number | null): EditTarget | null {
  const all = new Set(keys)
  if (rectangleId !== null) all.add(`rectangle:${rectangleId}`)
  if (all.size !== 1) return null
  const [key] = [...all]
  const item = items.find((candidate) => canvasItemKey(candidate) === key)
  if (!item) return null
  if (item.kind === 'text' || item.kind === 'code' || item.kind === 'connector') return { kind: item.kind, id: item.id }
  return item.kind === 'rectangle' && item.classBox && !item.inkBox && !item.ellipse && !item.diamond ? { kind: 'classBox', id: item.id } : null
}

export type ContextMenuAction = 'cut' | 'copy' | 'paste' | 'duplicate' | 'delete' | 'selectAll' | 'bringToFront' | 'sendToBack' | 'copyPng' | 'copyStyle' | 'pasteStyle' | 'exportPng' | 'exportSvg'
  | 'editText' | 'zoomSelection' | 'lock' | 'unlock' | 'unlockAll' | 'group' | 'ungroup' | 'selectSimilar' | 'numberSteps' | 'clearSteps' | 'saveTemplate'
  | 'sameWidth' | 'sameHeight' | 'sameSize' | 'addBoundary' | 'selectConnected'
  | `shape:${string}`
export type ContextMenuSection = 'clipboard' | 'text' | 'style' | 'shape' | 'arrange' | 'view' | 'lock' | 'export' | 'select' | 'flow'
/** One row of the right-click menu. `hint` is the shortcut shown right-aligned ('' for none); a disabled row is greyed, not hidden. */
export type ContextMenuEntry = { action: ContextMenuAction; label: string; hint: string; section: ContextMenuSection; disabled: boolean; /** Chip entries only: the short text of the chip (the label is its tooltip and aria-label). */ chip?: string; /** Chip entries only: the caption over the chip block; consecutive chips with the same caption share one block. */ chipGroup?: string }

/** Short chip text for a shape name (the full name stays in the tooltip). */
export function shortShapeLabel(label: string): string {
  return label === 'Rectangle' ? 'Rect' : label === 'Load balancer' ? 'Load bal.' : label
}

/** What the menu needs to know about the page when it opens. */
export type ContextMenuState = {
  hasSelection: boolean
  clipboardHasItems: boolean
  pageHasItems: boolean
  /** Exactly one item is selected and it has a style to copy. */
  canCopyStyle?: boolean
  /** A style is stored and something is selected. */
  canPasteStyle?: boolean
  /** Exactly one text label, code block or class box is selected (Enter would edit it). */
  canEditText: boolean
  /** The right-click landed on a locked item (it cannot be selected, so the menu offers Unlock for it). */
  lockedTarget: boolean
  /** Some item on the page is locked. */
  anyLocked: boolean
  /** Two or more items are selected (Group is offered). */
  canGroup?: boolean
  /** A selected item belongs to a group (Ungroup is offered). */
  canUngroup?: boolean
  /** Exactly one selectable item is selected (Select similar is offered). */
  canSelectSimilar?: boolean
  /** Change shape: the shapes the selected boxes can change to (id is the shape name; the action is `shape:<id>`). */
  changeShapes?: ReadonlyArray<{ id: string; label: string }>
  /** The selection holds connectors (or boxes joined by them): Number steps / Clear step numbers are offered. */
  canNumberSteps?: boolean
  /** Two or more unlocked boxes Same size can change are selected (the Same size chips are offered). */
  canSameSize?: boolean
  /** One selected box has connectors attached (the Connected chip is offered). */
  canSelectConnected?: boolean
}

/**
 * The right-click menu as data, in display order; entries of one section are shown together with a separator between sections.
 * Entries that do not apply are disabled, never hidden, except: Edit text (only for one label), Lock / Unlock / Unlock all (only when they apply:
 * Lock with a selection, Unlock on a locked item, Unlock all on empty canvas when something is locked) and the export entries (selection only).
 */
export function contextMenuEntries(state: ContextMenuState): ContextMenuEntry[] {
  const { canCopyStyle = false, canPasteStyle = false, hasSelection, clipboardHasItems, pageHasItems, canEditText, lockedTarget, anyLocked, canGroup = false, canUngroup = false, canSelectSimilar = false, changeShapes = [], canNumberSteps = false, canSameSize = false, canSelectConnected = false } = state
  const entry = (action: ContextMenuAction, label: string, hint: string, section: ContextMenuSection, enabled: boolean, chip?: string, chipGroup?: string): ContextMenuEntry => ({ action, label, hint, section, disabled: !enabled, ...(chip !== undefined ? { chip, chipGroup: chipGroup ?? 'Change shape' } : {}) })
  return [
    entry('cut', 'Cut', 'Ctrl+X', 'clipboard', hasSelection),
    entry('copy', 'Copy', 'Ctrl+C', 'clipboard', hasSelection),
    entry('paste', 'Paste', 'Ctrl+V', 'clipboard', clipboardHasItems),
    entry('duplicate', 'Duplicate', 'Ctrl+D', 'clipboard', hasSelection),
    entry('delete', 'Delete', 'Del', 'clipboard', hasSelection),
    ...(canEditText ? [entry('editText', 'Edit text', 'Enter', 'text', true)] : []),
    entry('copyStyle', 'Copy style', 'Ctrl+Alt+C', 'shape', canCopyStyle, 'Copy', 'Style'),
    entry('pasteStyle', 'Paste style', 'Ctrl+Alt+V', 'shape', canPasteStyle, 'Paste', 'Style'),
    ...changeShapes.map((choice) => entry(`shape:${choice.id}`, `Change shape to ${choice.label}`, '', 'shape', true, shortShapeLabel(choice.label))),
    ...(canNumberSteps ? [entry('numberSteps', 'Number steps', '', 'shape', true, 'Number', 'Step numbers'), entry('clearSteps', 'Clear step numbers', '', 'shape', true, 'Clear', 'Step numbers')] : []),
    entry('bringToFront', 'Bring to front', 'Ctrl+Shift+]', 'arrange', hasSelection, 'Front', 'Order'),
    entry('sendToBack', 'Send to back', 'Ctrl+Shift+[', 'arrange', hasSelection, 'Back', 'Order'),
    ...(hasSelection ? [entry('addBoundary', 'Add boundary', '', 'arrange', true, 'Boundary', 'Order')] : []),
    ...(canSameSize ? [entry('sameWidth', 'Same width', '', 'arrange', true, 'Width', 'Size'), entry('sameHeight', 'Same height', '', 'arrange', true, 'Height', 'Size'), entry('sameSize', 'Same width and height', '', 'arrange', true, 'Both', 'Size')] : []),
    ...(canGroup ? [entry('group', 'Group', 'Ctrl+G', 'arrange', true)] : []),
    ...(canUngroup ? [entry('ungroup', 'Ungroup', 'Ctrl+Shift+G', 'arrange', true)] : []),
    entry('zoomSelection', 'Zoom to selection', 'Shift+2', 'arrange', hasSelection),
    ...(hasSelection && !lockedTarget ? [entry('lock', 'Lock', 'Ctrl+Shift+L', 'arrange', true)] : []),
    ...(lockedTarget ? [entry('unlock', 'Unlock', '', 'arrange', true)] : []),
    ...(!hasSelection && !lockedTarget && anyLocked ? [entry('unlockAll', 'Unlock all', '', 'arrange', true)] : []),
    entry('copyPng', 'Copy as PNG', 'Shift+Alt+C', 'export', hasSelection || pageHasItems),
    // Only offered when something is selected.
    ...(hasSelection ? [entry('exportPng', 'Export selection as PNG', '', 'export', true, 'PNG', 'Save selection as'), entry('exportSvg', 'Export selection as SVG', '', 'export', true, 'SVG', 'Save selection as'), entry('saveTemplate', 'Save selection as template…', '', 'export', true, 'Template…', 'Save selection as')] : []),
    ...(canSelectSimilar ? [entry('selectSimilar', 'Select similar', '', 'select', true, 'Similar', 'Select')] : []),
    ...(canSelectConnected ? [entry('selectConnected', 'Select connected', '', 'select', true, 'Connected', 'Select')] : []),
    entry('selectAll', 'Select all', 'Ctrl+A', 'select', pageHasItems),
  ]
}

/** The menu rows with a separator wherever the section changes; the rendered menu maps this one list. Change shape choices form ONE `chips` row. */
export type ContextMenuRow = { separator: true } | { separator?: false; entry: ContextMenuEntry; chips?: undefined } | { separator?: false; chips: ContextMenuEntry[]; entry?: undefined }

export function contextMenuRows(entries: readonly ContextMenuEntry[]): ContextMenuRow[] {
  const rows: ContextMenuRow[] = []
  let chips: ContextMenuEntry[] | null = null
  entries.forEach((entry, index) => {
    if (index > 0 && entries[index - 1].section !== entry.section) rows.push({ separator: true })
    if (entry.chip !== undefined) {
      if (chips === null || chips[0].chipGroup !== entry.chipGroup) { chips = []; rows.push({ chips }) }
      chips.push(entry)
      return
    }
    chips = null
    rows.push({ entry })
  })
  return rows
}

/** Menu geometry in px; the stylesheet uses the same numbers (.canvas-context-menu). */
export const CONTEXT_MENU_WIDTH = 248
const MENU_PADDING = 6 + 1 // vertical padding plus border, per side
const MENU_ENTRY_HEIGHT = 34
const MENU_GAP = 2
const MENU_SEPARATOR_HEIGHT = 1 + 4 + 4 // line plus its vertical margin
const CHIP_CAPTION_HEIGHT = 16
const CHIP_HEIGHT = 26
const CHIP_GAP = 4
const CHIP_ROW_PADDING = 2 + 4 // top and bottom padding of the chip block
const CHIP_AREA_WIDTH = CONTEXT_MENU_WIDTH - 2 * MENU_PADDING - 12 // inside the menu padding and the chip block's side padding

const CAPTION_GAP = 6

/** Chip block layout: the caption sits at the left of the first chip line when every chip still fits on that one line, else over the chips. */
export function chipBlockLayout(chips: readonly ContextMenuEntry[]): { inline: boolean; lines: number } {
  const widths = chips.map((chip) => Math.ceil((chip.chip ?? chip.label).length * 6.8) + 18)
  const flow = (start: number) => {
    let lines = 1
    let used = start
    for (const width of widths) {
      if (used > 0 && used + CHIP_GAP + width > CHIP_AREA_WIDTH) { lines += 1; used = width } else used += (used > 0 ? CHIP_GAP : 0) + width
    }
    return lines
  }
  const caption = Math.ceil((chips[0]?.chipGroup ?? '').length * 6.4) + CAPTION_GAP
  const inlineLines = flow(caption)
  return inlineLines === 1 ? { inline: true, lines: 1 } : { inline: false, lines: flow(0) }
}

/** Height of a chip block: one chip line with the caption beside it, or the caption row plus as many chip lines as the (slightly overestimated) chip widths need. */
export function chipBlockHeight(chips: readonly ContextMenuEntry[]): number {
  const { inline, lines } = chipBlockLayout(chips)
  return CHIP_ROW_PADDING + (inline ? 0 : CHIP_CAPTION_HEIGHT) + lines * CHIP_HEIGHT + (lines - 1) * CHIP_GAP
}

/** Height of the right-click menu, worked out from its rows (entries, the chip block and separators), for clampMenuPosition. */
export function contextMenuHeight(entries: readonly ContextMenuEntry[]): number {
  const rows = contextMenuRows(entries)
  let height = MENU_PADDING * 2 + Math.max(0, rows.length - 1) * MENU_GAP
  for (const row of rows) height += row.separator ? MENU_SEPARATOR_HEIGHT : row.chips ? chipBlockHeight(row.chips) : MENU_ENTRY_HEIGHT
  return height
}

/** Keeps the menu fully on screen: opens at the pointer, shifted back when it would run past the right or bottom edge. */
export function clampMenuPosition(x: number, y: number, width: number, height: number, viewWidth: number, viewHeight: number): { x: number; y: number } {
  const clampedX = Math.max(0, Math.min(x, viewWidth - width))
  // A menu taller than the window (the CSS caps it to the window minus 8px each side and scrolls) sits at the top margin.
  if (height > viewHeight - 16) return { x: clampedX, y: 8 }
  return { x: clampedX, y: Math.max(0, Math.min(y, viewHeight - height)) }
}

/** Commands whose browser default (Chrome's find bar for Ctrl+G, the open-file dialog, Ctrl+Alt shortcuts) is always cancelled in Desktop mode, even when the action does nothing. */
export const ALWAYS_PREVENT_DEFAULT_COMMANDS: ReadonlySet<KeyCommand['kind']> = new Set(['group', 'ungroup', 'library', 'palette', 'find', 'copyStyle', 'pasteStyle'])
export function alwaysPreventsDefault(command: KeyCommand, mode: InputMode): boolean {
  return mode === 'desktop' && ALWAYS_PREVENT_DEFAULT_COMMANDS.has(command.kind)
}

export type CursorState = { mode: InputMode; tool: ClickTool; hover: 'none' | 'item' | 'selected'; panning: boolean; spaceHeld: boolean }

/**
 * The canvas cursor. Tablet mode keeps the default. In Desktop mode panning wins (grabbing, then grab while Space is held), then a
 * hovered item (move when it is already selected, pointer otherwise; never with the eraser), then the tool: crosshair for the pen,
 * shapes, connector, lasso and class box, a text cursor for text, the default arrow for select, and none for the eraser (its ring is drawn instead).
 */
export function canvasCursor(state: CursorState): string {
  if (state.mode !== 'desktop') return ''
  if (state.panning) return 'grabbing'
  if (state.spaceHeld) return 'grab'
  if (state.tool === 'eraser') return 'none'
  if (state.tool === 'laser') return 'crosshair'
  if (state.hover === 'selected') return 'move'
  if (state.hover === 'item') return 'pointer'
  if (state.tool === 'text') return 'text'
  if (state.tool === 'select') return 'default'
  return 'crosshair'
}

/**
 * Double-click on empty canvas makes a text label (Desktop mouse, any tool).
 * The two single clicks run through the active tool first (a pen click leaves a dot, a shape tool a tiny shape, ...), so the
 * app remembers the items and history from before the first click and puts them back when the pair turns out to be a label
 * double-click. The pair only counts when both clicks were plain: left button, no modifier, no movement beyond the click
 * tolerance, same tool, view and page, and nothing else (key, wheel, pan, other pointer) in between.
 */
export const CLICK_TOLERANCE_PX = 4
export const DOUBLE_CLICK_WINDOW_MS = 1000

export type ClickPair = { phase: 'down1' | 'up1' | 'down2' | 'up2'; x: number; y: number; upAt: number; moved: boolean; context: string }

export function clickPairOnDown(prev: ClickPair | null, down: { x: number; y: number; at: number; context: string }): { pair: ClickPair; continued: boolean } {
  if (prev && prev.phase === 'up1' && !prev.moved && prev.context === down.context && down.at - prev.upAt <= DOUBLE_CLICK_WINDOW_MS
    && Math.hypot(down.x - prev.x, down.y - prev.y) <= CLICK_TOLERANCE_PX) {
    return { pair: { ...prev, phase: 'down2' }, continued: true }
  }
  return { pair: { phase: 'down1', x: down.x, y: down.y, upAt: 0, moved: false, context: down.context }, continued: false }
}

/** Marks the pair as moved once the pointer, with a button down, leaves the click tolerance; returns the same object otherwise. */
export function clickPairOnMove(pair: ClickPair, x: number, y: number): ClickPair {
  if (pair.moved || (pair.phase !== 'down1' && pair.phase !== 'down2')) return pair
  return Math.hypot(x - pair.x, y - pair.y) > CLICK_TOLERANCE_PX ? { ...pair, moved: true } : pair
}

export function clickPairOnUp(pair: ClickPair, at: number): ClickPair {
  if (pair.phase === 'down1') return { ...pair, phase: 'up1', upAt: at }
  if (pair.phase === 'down2') return { ...pair, phase: 'up2', upAt: at }
  return pair
}

/**
 * The click pair after a pointercancel or lostpointercapture. The browser fires lostpointercapture right after every
 * pointerup of a captured pointer, so a capture lost once the button is up keeps the pair; a cancel, or a capture lost while
 * the button is still down, ends it.
 */
export function clickPairOnEnd(pair: ClickPair | null, eventType: string): ClickPair | null {
  if (!pair) return null
  if (eventType === 'lostpointercapture' && (pair.phase === 'up1' || pair.phase === 'up2')) return pair
  return null
}

/** True when both items lists hold exactly the same items (same objects, same order). */
export function clickItemsUnchanged(a: readonly CanvasItem[], b: readonly CanvasItem[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

/**
 * Whether the point is empty canvas for a new label: nothing a click would select or grab there. The inside of a plain
 * box, ink box or HLD shape is left to the active tool by the click rules, so it counts as empty (but not with the select
 * tool, which selects the box); their edge band does not. Typed class boxes, text and connectors are never empty. A selected
 * box keeps its handles, dividers and border band, and a selection kept by the select or lasso tool its bounds.
 */
export function emptyForLabel(
  routedItems: readonly CanvasItem[],
  point: Point,
  scale: number,
  tool: ClickTool,
  selectedKeys: ReadonlySet<string>,
  selectedRectangleId: number | null,
): boolean {
  const hit = hitTarget(routedItems, point, scale)
  if (hit) {
    if (tool === 'select' || hit.kind !== 'rectangle') return false
    const box = routedItems.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === hit.id)
    if (!box || box.classBox || pointInEdgeBand(box, toItemFrame(box, point), EDGE_BAND_PX / scale)) return false
  }
  const selectedBox = selectedRectangleId === null ? null : routedItems.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === selectedRectangleId) ?? null
  if (selectedBox) {
    if (pointInEdgeBand(selectedBox, toItemFrame(selectedBox, point), 26 / scale)) return false
    if (selectedBox.inkBox && (hitInkBoxMoveGrip(selectedBox, point, scale) || hitInkBoxDivider(selectedBox, point, 14 / scale))) return false
  }
  if ((tool === 'select' || tool === 'lasso') && selectedKeys.size > 0) {
    const bounds = getCanvasSelectionBounds(routedItems as CanvasItem[], selectedKeys)
    const pad = 14 / scale
    if (bounds && point.x >= bounds.x - pad && point.x <= bounds.x + bounds.width + pad && point.y >= bounds.y - pad && point.y <= bounds.y + bounds.height + pad) return false
  }
  return true
}

/** What a finished click pair does: nothing, or make a label (`revert`: put the items from before the first click back first). */
export type LabelDecision = { create: false } | { create: true; revert: boolean }

export function labelDoubleClickDecision(input: {
  pair: ClickPair | null
  routedItems: readonly CanvasItem[]
  point: Point
  scale: number
  tool: ClickTool
  /** The tool's own click already opens an editor (Text, class box dialog). */
  toolOpensEditor: boolean
  selectedKeys: ReadonlySet<string>
  selectedRectangleId: number | null
  /** Whether the two clicks changed the items. */
  itemsChanged: boolean
}): LabelDecision {
  const { pair } = input
  if (!pair || pair.phase !== 'up2' || pair.moved || input.toolOpensEditor) return { create: false }
  if (!emptyForLabel(input.routedItems, input.point, input.scale, input.tool, input.selectedKeys, input.selectedRectangleId)) return { create: false }
  // The eraser really erased something: the user was erasing, not asking for a label.
  if (input.tool === 'eraser' && input.itemsChanged) return { create: false }
  return { create: true, revert: input.itemsChanged }
}
