/**
 * Desktop input (steps 1 and 2 of the desktop-mode plan).
 *
 * InkPad is pen-first. A user-chosen "Desktop" input mode (a switch in the menu, off by default)
 * lets a mouse draw and edit on the canvas with the existing tools. In Tablet mode, the default,
 * the canvas behaves exactly as before. Nothing here is saved in a diagram: the mode is a
 * per-device preference, like the navigation settings.
 */

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
