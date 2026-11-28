import type { RectangleObject } from './canvasModel'

/** Pieces shared by the Mermaid importers (flowchart, class, sequence). No imports from the importers, so there are no import cycles. */
export const MAX_MERMAID_NODES = 150
/** Mermaid max input read by the importer (characters). */
export const MAX_MERMAID_TEXT = 50000

/** Unicode spaces (NBSP, en/em spaces, zero-width space, ideographic space ...) become a plain space so they do not end up inside node ids. */
export function normalizeMermaidSpaces(text: string): string {
  return text.replace(/[   -​  　﻿]/g, ' ')
}

/** Drops a leading YAML front matter block (`---` ... `---`), which Mermaid allows before the header. */
export function stripMermaidFrontMatter(text: string): string {
  const lines = text.split(/\r?\n/)
  let first = 0
  while (first < lines.length && lines[first].trim() === '') first += 1
  if (lines[first]?.trim() !== '---') return text
  for (let index = first + 1; index < lines.length; index += 1) if (lines[index].trim() === '---') return lines.slice(index + 1).join('\n')
  return text
}

/** The first line that is not blank, front matter or a %% comment (trimmed), or '' when there is none. */
export function firstMermaidLine(text: string): string {
  for (const raw of stripMermaidFrontMatter(normalizeMermaidSpaces(text).replace(/^﻿/, '')).split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('%%')) continue
    return line
  }
  return ''
}

type Side = 'left' | 'right' | 'top' | 'bottom'
/** The connector sides that face each other: horizontal when the boxes are mostly side by side, otherwise vertical. */
export function facingSides(from: RectangleObject, to: RectangleObject): { fromSide: Side; toSide: Side } {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2)
  const dy = to.y + to.height / 2 - (from.y + from.height / 2)
  const horizontal = Math.abs(dx) * 0.6 > Math.abs(dy)
  return {
    fromSide: horizontal ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top'),
    toSide: horizontal ? (dx >= 0 ? 'left' : 'right') : (dy >= 0 ? 'top' : 'bottom'),
  }
}

/** Mermaid entity codes (`#quot;`, `#lt;`, `#gt;`, `#amp;`, `#35;`) back to characters, in one pass so decoded text is never decoded again. */
export function decodeMermaidEntities(raw: string): string {
  return raw.replace(/#(quot|lt|gt|amp|\d{1,7});/g, (whole, code: string) => {
    if (code === 'quot') return '"'
    if (code === 'lt') return '<'
    if (code === 'gt') return '>'
    if (code === 'amp') return '&'
    const point = Number(code)
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : whole
  })
}

const MAX_NODE_TEXT = 200
/** Node / label text: `<br>` and `\\n` become line breaks, entities decoded, lines trimmed, capped at 200 characters. */
export function cleanMermaidText(raw: string): string {
  return decodeMermaidEntities(raw.replace(/<br\s*\/?>/gi, '\n').replace(/\\n/g, '\n')).split('\n').map((line) => line.trim()).join('\n').trim().slice(0, MAX_NODE_TEXT)
}
