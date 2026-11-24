import type { Point } from './canvasModel'

/** Desktop quick-connect: four round buttons just outside the sides of the one selected plain or HLD box (Ctrl+Arrow made clickable). */
export type QuickConnectDirection = 'right' | 'left' | 'up' | 'down'
export type QuickConnectButton = { direction: QuickConnectDirection; center: Point; radius: number }
type Box = { x: number; y: number; width: number; height: number }

/** Screen-pixel sizes. The gap keeps each button's hit circle clear of the 14 px resize-handle hit circle on the side's middle. */
export const QUICK_CONNECT_RADIUS_PX = 10
export const QUICK_CONNECT_OFFSET_PX = 26
/** The rotate handle sits 24 px above the top middle, so the up button is moved sideways by this much. */
export const QUICK_CONNECT_UP_SHIFT_PX = 26
/** The buttons are hidden when the box is smaller than this on screen. */
export const QUICK_CONNECT_MIN_BOX_PX = 24

export const QUICK_CONNECT_DIRECTIONS: readonly QuickConnectDirection[] = ['right', 'left', 'up', 'down']
export const QUICK_CONNECT_ARROWS: Record<QuickConnectDirection, string> = { right: '→', left: '←', up: '↑', down: '↓' }

/** Whether the box is big enough on screen for the buttons to show. */
export function quickConnectFits(box: Box, scale: number): boolean {
  return scale > 0 && Math.min(box.width, box.height) * scale >= QUICK_CONNECT_MIN_BOX_PX
}

/** Button centres in canvas coordinates (radius too), a constant size on screen whatever the zoom. */
export function quickConnectButtons(box: Box, scale: number, inside?: (point: Point) => boolean): QuickConnectButton[] {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const gap = QUICK_CONNECT_OFFSET_PX / scale
  const radius = QUICK_CONNECT_RADIUS_PX / scale
  const at = (x: number, y: number): Point => ({ x, y, pressure: 1 })
  const all: QuickConnectButton[] = [
    { direction: 'right', center: at(box.x + box.width + gap, cy), radius },
    { direction: 'left', center: at(box.x - gap, cy), radius },
    { direction: 'up', center: at(cx + QUICK_CONNECT_UP_SHIFT_PX / scale, box.y - gap), radius },
    { direction: 'down', center: at(cx, box.y + box.height + gap), radius },
  ]
  // `inside` hides the buttons whose centre is off the page (a press there is dropped before it reaches the buttons).
  return inside ? all.filter((button) => inside(button.center)) : all
}

/** The button under `point` (canvas coordinates), or null. */
export function hitQuickConnect(box: Box, point: Point, scale: number, inside?: (point: Point) => boolean): QuickConnectDirection | null {
  if (!quickConnectFits(box, scale)) return null
  for (const button of quickConnectButtons(box, scale, inside)) {
    if (Math.hypot(point.x - button.center.x, point.y - button.center.y) <= button.radius) return button.direction
  }
  return null
}

/** Hint shown beside the hovered button. */
export function quickConnectHint(direction: QuickConnectDirection): string {
  return `New connected shape (Ctrl+${QUICK_CONNECT_ARROWS[direction]})`
}

/** A double-click event within this long of a quick-connect click is ignored (the shape is already made). */
export const QUICK_CONNECT_DOUBLE_CLICK_MS = 500
