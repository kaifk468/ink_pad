import type { CodeObject, OpaqueObject } from '../canvasModel'
import { CODE_FONT_FAMILY, codeColors, codeGeometry } from '../codeBlock'
import { ensureCodeHighlighter, getCodeLines } from '../codeHighlight'

/** Canvas drawing for code blocks and for items of a kind this version does not know. Plain style: the sketchy-style toggle does not touch these. */

const charWidthCache = new Map<number, number>()
let measureContext: CanvasRenderingContext2D | null | undefined
/** One monospace character at this font size, measured once per size (also used by the editor overlay so both line up). */
export function codeCharWidth(fontSize: number): number {
  let width = charWidthCache.get(fontSize)
  if (width === undefined) {
    if (measureContext === undefined) measureContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
    if (measureContext) measureContext.font = `${fontSize}px ${CODE_FONT_FAMILY}`
    width = measureContext?.measureText('0').width || fontSize * 0.6
    charWidthCache.set(fontSize, width)
  }
  return width
}

export function drawCode(ctx: CanvasRenderingContext2D, item: CodeObject): void {
  ensureCodeHighlighter() // loads the library once, the first time any block is drawn (a no-op after that)
  const width = Math.max(0, item.width)
  const height = Math.max(0, item.height)
  const colors = codeColors(item)
  const lines = getCodeLines(item)
  const fontSize = codeGeometry(item, lines.length, 1).fontSize
  const geometry = codeGeometry(item, lines.length, codeCharWidth(fontSize))
  // Transparent block: only the line numbers and the code are drawn over the page (the outline shows while selected or edited).
  ctx.save()
  ctx.beginPath()
  ctx.rect(item.x + 1, item.y + 1, Math.max(0, width - 2), Math.max(0, height - 2))
  ctx.clip()
  ctx.font = `${fontSize}px ${CODE_FONT_FAMILY}`
  ctx.textBaseline = 'alphabetic'
  const count = Math.min(lines.length, geometry.visibleLines)
  ctx.fillStyle = colors.gutter
  ctx.textAlign = 'right'
  for (let index = 0; index < count; index += 1) ctx.fillText(String(index + 1), item.x + geometry.gutterRight, item.y + geometry.firstBaseline + index * geometry.lineHeight)
  ctx.textAlign = 'left'
  const advance = codeCharWidth(fontSize)
  for (let index = 0; index < count; index += 1) {
    const baseline = item.y + geometry.firstBaseline + index * geometry.lineHeight
    let x = item.x + geometry.textX
    for (const token of lines[index]) {
      ctx.fillStyle = colors[token.kind]
      ctx.fillText(token.text, x, baseline)
      x += token.text.length * advance
      if (x > item.x + item.width) break
    }
  }
  ctx.restore()
}

/** The placeholder for an unknown kind: a plain grey box and a short label. Nothing when the item had no usable box. */
export function drawOpaque(ctx: CanvasRenderingContext2D, item: OpaqueObject): void {
  if (!item.box) return
  const { x, y, width, height } = item.box
  ctx.save()
  ctx.fillStyle = 'rgba(156, 163, 175, 0.18)'
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = '#9ca3af'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.fillStyle = '#6b7280'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(`Unsupported: ${typeof item.raw.kind === 'string' ? item.raw.kind.slice(0, 24) : 'item'}`, x + 8, y + 18)
  ctx.restore()
}
