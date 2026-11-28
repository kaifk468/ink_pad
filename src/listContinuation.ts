/** List continuation for the text label editor: Enter on a list line starts the next item; Enter on an empty item ends the list. */

export type ListContinuation = { value: string; caret: number }

const MARKER = /^([ \t]*)(?:([-*•–])|(\d{1,3})([.)]))[ \t]/

export function continueList(value: string, selectionStart: number, selectionEnd: number): ListContinuation | null {
  if (selectionStart !== selectionEnd) return null
  const caret = selectionStart
  if (caret < 0 || caret > value.length) return null
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1
  const nl = value.indexOf('\n', caret)
  const lineEnd = nl === -1 ? value.length : nl
  const line = value.slice(lineStart, lineEnd)
  const match = MARKER.exec(line)
  if (!match) return null
  const indent = match[1]
  const markerLength = match[0].length
  // A caret inside the indentation or the marker keeps the default Enter.
  if (caret < lineStart + markerLength) return null
  if (line.slice(markerLength).trim() === '' && caret === lineEnd) {
    // Empty item: drop the marker (and any trailing blanks) and end the list.
    return { value: value.slice(0, lineStart) + indent + value.slice(lineEnd), caret: lineStart + indent.length }
  }
  const marker = match[2] ?? `${Number(match[3]) + 1}${match[4]}`
  const insert = `\n${indent}${marker} `
  return { value: value.slice(0, caret) + insert + value.slice(caret), caret: caret + insert.length }
}

/** Smallest single replacement turning `before` into `after`, so it can be applied as one undoable edit. */
export function minimalEdit(before: string, after: string): { from: number; to: number; text: string } {
  let start = 0
  const max = Math.min(before.length, after.length)
  while (start < max && before[start] === after[start]) start++
  let endBefore = before.length
  let endAfter = after.length
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) { endBefore--; endAfter-- }
  return { from: start, to: endBefore, text: after.slice(start, endAfter) }
}
