/**
 * Desktop paste: which clipboard wins. InkPad's own item copy never writes the system clipboard, but "Copy Mermaid" and "Copy outline" do.
 * Structured system text (Excalidraw JSON, Mermaid) copied elsewhere beats the in-app items; text InkPad wrote itself does not
 * (otherwise copying a shape after "Copy Mermaid" would paste the diagram instead of the shape).
 */
const normalize = (text: string): string => text.replace(/\r\n?/g, '\n').trim()

/** True when `text` is exactly what InkPad last wrote to the system clipboard. */
export function isOwnClipboardText(text: string, written: string | null): boolean {
  return written !== null && normalize(text) !== '' && normalize(text) === normalize(written)
}
