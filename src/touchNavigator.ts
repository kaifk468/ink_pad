import type { Point } from './canvasModel'
import { createTapDetector, type TouchTap } from './touchTap'
import { MAX_ZOOM, MIN_ZOOM, THREE_FINGER_PAN_THRESHOLD, panThreeFingerViewport, zoomTwoFingerViewport, type Viewport } from './viewport'

/** Wait this long after the first finger lands before choosing pan or pinch, so fingers that land a few ms apart are not read as a pinch. */
export const GESTURE_DECIDE_MS = 60
/** A pinch only changes zoom after the finger distance has changed by this share; zoom then starts from that point, without a jump. */
export const PINCH_START_RATIO = 0.06
/** Two touches closer than this (screen px) are not a pinch (a resting palm or knuckle). */
export const MIN_PINCH_DISTANCE = 48
/** One-finger pan starts after the finger has moved this far (screen px). */
export const ONE_FINGER_PAN_START = 8
/** Touch counts as "pen near" for this long after the last pen event (the pen hovers without events when held still). */
export const PEN_NEAR_MS = 1000

export type NavigationSettings = { oneFingerPan: boolean; zoomLocked: boolean }
export type TouchNavigationMode = 'none' | 'undecided' | 'pan' | 'pinch-zoom' | 'blocked'

type Base = { viewport: Viewport; center: Point; distance: number; count: number }

const centerOf = (points: Point[]): Point => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  pressure: 1,
})

/**
 * Decides what a group of touches means, once, and keeps it until every finger has lifted:
 *  - 3 fingers pan; 2 fingers pinch-zoom; 1 finger pans only when the one-finger-pan setting is on and the pen is not near.
 *  - The choice waits GESTURE_DECIDE_MS after the first finger (3 fingers decide at once), then stays locked, so fingers landing or
 *    lifting later never turn a pan into a zoom or the other way round.
 *  - Touch is dropped while the pen touches the screen, and every touch already down is dropped when the pen lands.
 *  - The same holds for a mouse gesture in Desktop mode (mouseDown / mouseUp), except that a mouse leaves no "pen near" window.
 *  - With the zoom lock on, a pinch does nothing; pans still work.
 */
export function createTouchNavigator(getSettings: () => NavigationSettings) {
  const points = new Map<number, Point>()
  const starts = new Map<number, Point>()
  let mode: TouchNavigationMode = 'none'
  let firstDownAt = 0
  let base: Base | null = null
  let pinchActive = false
  let panStarted = false
  let penTouching = false
  let mouseTouching = false
  let penNearUntil = 0
  const tap = createTapDetector()

  const reset = () => {
    points.clear()
    starts.clear()
    mode = 'none'
    base = null
    pinchActive = false
    panStarted = false
  }
  const distanceOf = (list: Point[]) => (list.length >= 2 ? Math.hypot(list[1].x - list[0].x, list[1].y - list[0].y) : 0)
  const rebase = (viewport: Viewport) => {
    const list = [...points.values()]
    base = { viewport, center: centerOf(list), distance: distanceOf(list), count: list.length }
  }
  const penNear = (now: number) => penTouching || now < penNearUntil

  const moveTouch = (id: number, point: Point, now: number, viewport: Viewport): Viewport | null => {
    if (!points.has(id)) return null
    points.set(id, point)
    tap.move(id, point)
    const list = [...points.values()]
    const settings = getSettings()
    if (mode === 'undecided') {
      if (list.length >= 3) mode = 'pan'
      else if (now - firstDownAt >= GESTURE_DECIDE_MS) {
        if (list.length === 2) {
          if (distanceOf(list) < MIN_PINCH_DISTANCE) return null
          mode = settings.zoomLocked ? 'blocked' : 'pinch-zoom'
        } else if (list.length === 1 && settings.oneFingerPan && !penNear(now)) {
          const start = starts.get(id)!
          if (Math.hypot(point.x - start.x, point.y - start.y) < ONE_FINGER_PAN_START) return null
          mode = 'pan'
        }
      }
      if (mode === 'undecided' || mode === 'blocked') return null
      rebase(viewport)
      return null
    }
    if (mode === 'blocked' && list.length >= 3) {
      // a pinch that was blocked by the zoom lock becomes a pan when a third finger lands
      mode = 'pan'
      rebase(viewport)
      return null
    }
    if (!base) return null
    if (mode === 'pan') {
      if (list.length !== base.count) {
        rebase(viewport)
        return null
      }
      const current = centerOf(list)
      if (!panStarted && Math.hypot(current.x - base.center.x, current.y - base.center.y) < THREE_FINGER_PAN_THRESHOLD) return null
      panStarted = true
      return panThreeFingerViewport(base.viewport, base.center, current)
    }
    if (mode === 'pinch-zoom') {
      if (list.length !== 2 || settings.zoomLocked) return null
      const distance = distanceOf(list)
      if (!pinchActive) {
        if (base.distance <= 0 || Math.abs(distance / base.distance - 1) < PINCH_START_RATIO) return null
        pinchActive = true
        base = { ...base, viewport, distance }
        return null
      }
      return zoomTwoFingerViewport(base.viewport, base.center, base.distance, distance, MIN_ZOOM, MAX_ZOOM)
    }
    return null
  }

  return {
    mode: (): TouchNavigationMode => mode,
    touchCount: () => points.size,
    tracks: (id: number) => points.has(id),
    penNear,
    penDown() {
      penTouching = true
      tap.taint()
      reset()
    },
    penUp(now: number) {
      penTouching = false
      penNearUntil = now + PEN_NEAR_MS
    },
    /** A mouse gesture starts: touches already down are dropped and new ones are ignored until it ends. */
    mouseDown() {
      mouseTouching = true
      tap.taint()
      reset()
    },
    mouseUp() {
      mouseTouching = false
    },
    penSeen(now: number) {
      penNearUntil = now + PEN_NEAR_MS
    },
    penGone() {
      penNearUntil = 0
    },
    down(id: number, point: Point, now: number) {
      if (penTouching || mouseTouching) return
      if (points.size === 0) {
        mode = 'undecided'
        firstDownAt = now
        pinchActive = false
        panStarted = false
      }
      points.set(id, point)
      starts.set(id, point)
      tap.down(id, point, now, penNear(now))
    },
    /** The gesture is no longer a tap (pointer cancel, or the app took the touches for something else). */
    cancelTap() {
      tap.taint()
    },
    /** Returns the new viewport when the touches move it, otherwise null. */
    move(id: number, point: Point, now: number, viewport: Viewport): Viewport | null {
      const next = moveTouch(id, point, now, viewport)
      if (next) tap.taint() // the viewport really moved: not a tap
      return next
    },
    /** Pass `now` to get a tap result: { fingers } when the last finger lifts after a qualifying two- or three-finger tap. */
    up(id: number, now?: number): TouchTap | null {
      const tapped = tap.up(id, now ?? Infinity) // without a time a tap can never qualify
      points.delete(id)
      starts.delete(id)
      if (points.size === 0) reset()
      return tapped
    },
  }
}
