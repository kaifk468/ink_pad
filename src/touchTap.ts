import type { Point } from './canvasModel'

/** Every finger must be down and lifted within this long after the first finger landed. */
export const TAP_MAX_MS = 300
/** Fingers of one tap must land within this long of the first finger. */
export const TAP_LAND_SPREAD_MS = 150
/** A finger that moves this far (screen px) from where it landed is not part of a tap. */
export const TAP_MAX_MOVE = 12
/** Touches closer than this (screen px) are a resting palm, not a tap (same value as the pinch minimum). */
export const TAP_MIN_FINGER_DISTANCE = 48
/** A gesture that never ended (a lost pointer-up) is forgotten when a new finger lands this long after it began. */
const STALE_MS = 2000

export type TouchTap = { fingers: 2 | 3 }

/**
 * Recognises a quick two- or three-finger tap. It only observes: it never changes what the touches do.
 * A gesture stops being a tap for good (until every finger has lifted) as soon as anything disqualifies it.
 */
export function createTapDetector() {
  const starts = new Map<number, Point>()
  let startedAt = 0
  let maxFingers = 0
  let anyLifted = false
  let tainted = false

  const clear = () => {
    starts.clear()
    maxFingers = 0
    anyLifted = false
    tainted = false
  }

  return {
    active: () => starts.size > 0,
    /** A finger landed. `penNear` is true while the pen touches or hovered a moment ago. */
    down(id: number, point: Point, now: number, penNear: boolean) {
      if (starts.size > 0 && now - startedAt > STALE_MS) clear()
      if (starts.size === 0) {
        startedAt = now
        tainted = penNear
      } else if (anyLifted || now - startedAt > TAP_LAND_SPREAD_MS) tainted = true
      starts.set(id, point)
      maxFingers = Math.max(maxFingers, starts.size)
      if (maxFingers > 3) tainted = true
      for (const [otherId, other] of starts) {
        if (otherId !== id && Math.hypot(other.x - point.x, other.y - point.y) < TAP_MIN_FINGER_DISTANCE) tainted = true
      }
    },
    /** A finger moved: moving it far disqualifies the tap. */
    move(id: number, point: Point) {
      const start = starts.get(id)
      if (start && Math.hypot(point.x - start.x, point.y - start.y) >= TAP_MAX_MOVE) tainted = true
    },
    /** The touches panned or zoomed the viewport, or the gesture is otherwise not a tap (pen, mouse, cancel). */
    taint() {
      if (starts.size > 0) tainted = true
    },
    /** A finger lifted. Returns the tap when this was the last finger of a qualifying gesture. */
    up(id: number, now: number): TouchTap | null {
      if (!starts.has(id)) return null
      starts.delete(id)
      anyLifted = true
      if (now - startedAt > TAP_MAX_MS) tainted = true
      if (starts.size > 0) return null
      const fingers = maxFingers
      const ok = !tainted && (fingers === 2 || fingers === 3)
      clear()
      return ok ? { fingers: fingers as 2 | 3 } : null
    },
  }
}
