/** Bits of PointerEvent.buttons: 2 = pen barrel button (the S Pen button), 32 = pen eraser end / eraser button. */
const BARREL_OR_ERASER_BUTTONS = 2 | 32

export type PenButtonEvent = { pointerType: string; buttons: number; button?: number }

/** True while the S Pen button (or the eraser end of a pen) is held. Chrome may report it as the barrel button or as the eraser button, so both count. */
export function isPenButtonHeld(event: PenButtonEvent): boolean {
  return event.pointerType === 'pen' && ((event.buttons & BARREL_OR_ERASER_BUTTONS) !== 0 || event.button === 5)
}

/** One line for the on-screen debug note (?penbutton=show): what the tablet sends for the pen button. */
export function describePenEvent(type: string, event: PenButtonEvent): string {
  return `${type} · ${event.pointerType} · buttons=${event.buttons} button=${event.button ?? '-'} · ${isPenButtonHeld(event) ? 'BUTTON HELD' : 'no button'}`
}

const ERASER_KEY = 'inkpad.eraser'
export const ERASER_SIZE_MIN = 8
export const ERASER_SIZE_MAX = 96
export const DEFAULT_ERASER_PREFS = { whole: false, size: 28 }
export type EraserPrefs = { whole: boolean; size: number }

/** The eraser mode and size used last, so the pen button erases the way the person last chose even after a reload. */
export function loadEraserPrefs(storage?: Pick<Storage, 'getItem'>): EraserPrefs {
  try {
    const source = storage ?? window.localStorage
    const raw = JSON.parse(source.getItem(ERASER_KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      const size = typeof raw.size === 'number' && Number.isFinite(raw.size) ? Math.min(ERASER_SIZE_MAX, Math.max(ERASER_SIZE_MIN, Math.round(raw.size))) : DEFAULT_ERASER_PREFS.size
      return { whole: raw.whole === true, size }
    }
  } catch {
    /* storage unavailable or damaged: use the defaults */
  }
  return { ...DEFAULT_ERASER_PREFS }
}

export function saveEraserPrefs(prefs: EraserPrefs, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const target = storage ?? window.localStorage
    target.setItem(ERASER_KEY, JSON.stringify(prefs))
  } catch {
    /* the choice lasts for this session only */
  }
}
