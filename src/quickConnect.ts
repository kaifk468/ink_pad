import { connectorSecondEndpoint, getConnectorRenderSpec, type CanvasItem, type Point } from './canvasModel'

/** Desktop quick-connect: four round buttons just outside the sides of the one selected plain or HLD box (Ctrl+Arrow made clickable). */
export type QuickConnectDirection = 'right' | 'left' | 'up' | 'down'
export type QuickConnectButton = { direction: QuickConnectDirection; center: Point; radius: number; hitRadius: number }
type Box = { x: number; y: number; width: number; height: number }

/** Screen-pixel sizes. The gap keeps each button's hit circle clear of the 14 px resize-handle hit circle on the side's middle. */
export const QUICK_CONNECT_RADIUS_PX = 10
export const QUICK_CONNECT_OFFSET_PX = 26
/** The rotate handle sits 24 px above the top middle, so the up button is moved sideways by this much. */
export const QUICK_CONNECT_UP_SHIFT_PX = 26
/** The buttons are hidden when the box is smaller than this on screen. */
export const QUICK_CONNECT_MIN_BOX_PX = 24

/**
 * Tablet (pen or finger tap): bigger buttons, drawn 14 px and hit within 18 px, kept clear of the 14 px resize-handle hit circles
 * (offset >= hit + 14) and of the 12 px rotate-handle hit circle 24 px above the top middle (the up button is moved sideways), and of the ink box move grip (26 px above the top middle, 24 px hit; the shift is >= 42 px away).
 */
export const TABLET_QUICK_CONNECT_RADIUS_PX = 14
export const TABLET_QUICK_CONNECT_HIT_RADIUS_PX = 18
export const TABLET_QUICK_CONNECT_OFFSET_PX = 40
export const TABLET_QUICK_CONNECT_UP_SHIFT_PX = 52
export const TABLET_QUICK_CONNECT_MIN_BOX_PX = 40
/** A tablet press that moves this far (screen px) is a drag, not a tap: it does nothing. */
export const TABLET_QUICK_CONNECT_TAP_SLOP_PX = 10

export const QUICK_CONNECT_DIRECTIONS: readonly QuickConnectDirection[] = ['right', 'left', 'up', 'down']
export const QUICK_CONNECT_ARROWS: Record<QuickConnectDirection, string> = { right: '→', left: '←', up: '↑', down: '↓' }

/** Whether the box is big enough on screen for the buttons to show. */
export function quickConnectFits(box: Box, scale: number, tablet = false): boolean {
  return scale > 0 && Math.min(box.width, box.height) * scale >= (tablet ? TABLET_QUICK_CONNECT_MIN_BOX_PX : QUICK_CONNECT_MIN_BOX_PX)
}

/** Round 10: half the screen width an arrowhead needs; a button's centre keeps this plus its radius away from a head's tip along the side. */
export const QUICK_CONNECT_HEAD_CLEAR_PX = 14

/** The end points of the connectors that have an arrowhead on `box` (attached there), in canvas coordinates. Used to keep the buttons off the heads. */
export function quickConnectHeadEnds(items: readonly CanvasItem[], boxId: number): Point[] {
  const ends: Point[] = []
  for (const item of items) {
    if (item.kind !== 'connector') continue
    const atStart = item.startAttachment?.rectangleId === boxId
    const atEnd = item.endAttachment?.rectangleId === boxId
    if (!atStart && !atEnd) continue
    const heads = new Set<'start' | 'end'>()
    const spec = getConnectorRenderSpec(item)
    if (spec.endpoint) heads.add(spec.endpoint)
    const second = connectorSecondEndpoint(item)
    if (second) heads.add(second)
    if (atStart && heads.has('start')) ends.push(item.start)
    if (atEnd && heads.has('end')) ends.push(item.end)
  }
  return ends
}

/**
 * Moves a button along its side so it clears the arrowheads in `ends` that touch that side: any head whose tip is on the side and within
 * `clear` of the button's position along it pushes the button away (towards the larger side coordinate when exactly level).
 */
function clearOfHeads(box: Box, direction: QuickConnectDirection, center: Point, ends: readonly Point[], clear: number, sideTolerance: number): Point {
  const horizontalSide = direction === 'left' || direction === 'right' // buttons on the left / right sides slide vertically
  const sideCoord = direction === 'left' ? box.x : direction === 'right' ? box.x + box.width : direction === 'up' ? box.y : box.y + box.height
  const onSide = ends.filter((end) => Math.abs((horizontalSide ? end.x : end.y) - sideCoord) <= sideTolerance)
  let along = horizontalSide ? center.y : center.x
  for (let pass = 0; pass <= onSide.length; pass += 1) {
    let moved = false
    for (const end of onSide) {
      const e = horizontalSide ? end.y : end.x
      if (Math.abs(along - e) < clear) { along = along >= e ? e + clear : e - clear; moved = true }
    }
    if (!moved) break
  }
  return horizontalSide ? { ...center, y: along } : { ...center, x: along }
}

/**
 * Button centres in canvas coordinates (radius too), a constant size on screen whatever the zoom.
 * `headEnds` (round 10, from quickConnectHeadEnds) are the arrowhead tips on the box: a button slides along its side to stay clear of them.
 */
export function quickConnectButtons(box: Box, scale: number, inside?: (point: Point) => boolean, tablet = false, headEnds: readonly Point[] = []): QuickConnectButton[] {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const gap = (tablet ? TABLET_QUICK_CONNECT_OFFSET_PX : QUICK_CONNECT_OFFSET_PX) / scale
  const radius = (tablet ? TABLET_QUICK_CONNECT_RADIUS_PX : QUICK_CONNECT_RADIUS_PX) / scale
  const hitRadius = (tablet ? TABLET_QUICK_CONNECT_HIT_RADIUS_PX : QUICK_CONNECT_RADIUS_PX) / scale
  const upShift = (tablet ? TABLET_QUICK_CONNECT_UP_SHIFT_PX : QUICK_CONNECT_UP_SHIFT_PX) / scale
  const at = (x: number, y: number): Point => ({ x, y, pressure: 1 })
  const all: QuickConnectButton[] = [
    { direction: 'right', center: at(box.x + box.width + gap, cy), radius, hitRadius },
    { direction: 'left', center: at(box.x - gap, cy), radius, hitRadius },
    { direction: 'up', center: at(cx + upShift, box.y - gap), radius, hitRadius },
    { direction: 'down', center: at(cx, box.y + box.height + gap), radius, hitRadius },
  ]
  if (headEnds.length > 0) {
    const clear = radius + QUICK_CONNECT_HEAD_CLEAR_PX / scale
    for (const button of all) button.center = clearOfHeads(box, button.direction, button.center, headEnds, clear, 8 / scale)
  }
  // `inside` hides the buttons whose centre is off the page (a press there is dropped before it reaches the buttons).
  return inside ? all.filter((button) => inside(button.center)) : all
}

/** The button under `point` (canvas coordinates), or null. */
export function hitQuickConnect(box: Box, point: Point, scale: number, inside?: (point: Point) => boolean, tablet = false, headEnds: readonly Point[] = []): QuickConnectDirection | null {
  if (!quickConnectFits(box, scale, tablet)) return null
  for (const button of quickConnectButtons(box, scale, inside, tablet, headEnds)) {
    if (Math.hypot(point.x - button.center.x, point.y - button.center.y) <= button.hitRadius) return button.direction
  }
  return null
}

/** Hint shown beside the hovered button. */
export function quickConnectHint(direction: QuickConnectDirection): string {
  return `New connected shape (Ctrl+${QUICK_CONNECT_ARROWS[direction]})`
}

/** A double-click event within this long of a quick-connect click is ignored (the shape is already made). */
export const QUICK_CONNECT_DOUBLE_CLICK_MS = 500
