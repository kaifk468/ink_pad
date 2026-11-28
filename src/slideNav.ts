/**
 * Present pages as slides: which page a key shows while present mode is on, the "2 / 5" label and when the on-screen control shows.
 * Pure decisions only; App.tsx switches pages through its normal page path (goToPage) and fits the view.
 */

export type SlideKeyEvent = { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; repeat?: boolean }

/** Largest zoom a slide is fitted to, so a tiny drawing is not blown up. */
export const SLIDE_MAX_ZOOM = 2
/** Screen padding around the content of a fitted slide. */
export const SLIDE_PADDING = 48

/**
 * The page a key shows in present mode, or null when the key is not a slide key.
 * Right arrow, PageDown and Space go forward; Left arrow and PageUp go back; Home and End jump to the first and last page.
 * Stops at the ends (no wrap): the result is then the current index, and the caller still swallows the key.
 * Any modifier (Ctrl, Cmd, Alt, Shift) means another shortcut, so the key is not a slide key. Held-down keys repeat only for the arrows.
 */
export function slideKeyTarget(event: SlideKeyEvent, index: number, count: number): number | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null
  const last = Math.max(0, count - 1)
  const here = Math.min(Math.max(0, index), last)
  switch (event.key) {
    case 'ArrowRight': return Math.min(last, here + 1)
    case ' ': case 'PageDown': return event.repeat ? here : Math.min(last, here + 1)
    case 'ArrowLeft': return Math.max(0, here - 1)
    case 'PageUp': return event.repeat ? here : Math.max(0, here - 1)
    case 'Home': return 0
    case 'End': return last
    default: return null
  }
}

/** True for the arrow keys: in present mode they never nudge a selection (they step pages, or do nothing). */
export function isArrowKey(key: string): boolean {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'
}

/** "2 / 5" for the page on screen (index is zero-based). */
export function slideLabel(index: number, count: number): string {
  const total = Math.max(1, count)
  return `${Math.min(total, Math.max(0, index) + 1)} / ${total}`
}

/** The ‹ 2 / 5 › control shows only while presenting a diagram with more than one page. */
export function showSlideControl(presenting: boolean, count: number): boolean {
  return presenting && count > 1
}

/** Whether the previous and next buttons can act (they stop at the ends). */
export function slideStepEnabled(index: number, count: number): { previous: boolean; next: boolean } {
  return { previous: index > 0, next: index < count - 1 }
}
