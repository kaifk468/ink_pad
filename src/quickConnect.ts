import type { Point } from './canvasModel'

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

/** Button centres in canvas coordinates (radius too), a constant size on screen whatever the zoom. */
export function quickConnectButtons(box: Box, scale: number, inside?: (point: Point) => boolean, tablet = false): QuickConnectButton[] {
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
  // `inside` hides the buttons whose centre is off the page (a press there is dropped before it reaches the buttons).
  return inside ? all.filter((button) => inside(button.center)) : all
}

/** The button under `point` (canvas coordinates), or null. */
export function hitQuickConnect(box: Box, point: Point, scale: number, inside?: (point: Point) => boolean, tablet = false): QuickConnectDirection | null {
  if (!quickConnectFits(box, scale, tablet)) return null
  for (const button of quickConnectButtons(box, scale, inside, tablet)) {
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
