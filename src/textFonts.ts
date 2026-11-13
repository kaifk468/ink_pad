import { TEXT_FONTS } from './textLayout'
import type { TextFontId } from './canvasModel'

/**
 * Makes sure a label font is ready before text is measured or drawn with it. System fonts need nothing; the bundled
 * Excalifont is a web font that loads on first use. Never rejects: when fonts cannot be loaded, the fallback fonts in
 * the stack are used.
 */
export function loadTextFont(id: TextFontId): Promise<void> {
  if (id !== 'excalifont' || typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve()
  const family = TEXT_FONTS.find((font) => font.id === id)?.family ?? 'Excalifont'
  return document.fonts.load(`24px ${family}`).then(() => undefined, () => undefined)
}
