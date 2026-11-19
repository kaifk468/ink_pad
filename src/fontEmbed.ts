import excalifontUrl from './assets/fonts/Excalifont-Regular.woff2?url'
import { excalifontFontFaceCss } from './exportOptions'

let cached: Promise<string> | null = null

/** Browser only: the @font-face CSS with the bundled Excalifont inlined as base64, loaded once. A failed load is not cached. */
export function loadExcalifontCss(): Promise<string> {
  if (!cached) {
    cached = fetch(excalifontUrl)
      .then((response) => { if (!response.ok) throw new Error('Font not available.'); return response.arrayBuffer() })
      .then((buffer) => {
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
        return excalifontFontFaceCss(btoa(binary))
      })
    cached.catch(() => { cached = null })
  }
  return cached
}
