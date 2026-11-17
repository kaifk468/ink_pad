import { CODE_TAB_WIDTH } from './codeBlock'

export type EditResult = { text: string; start: number; end: number }

/**
 * Tab and Shift+Tab in the code editor. With a caret (or a selection inside one line): Tab inserts spaces up to the next tab stop,
 * Shift+Tab removes up to one tab stop of spaces before the line's text. With a selection over several lines, every touched line
 * is indented or outdented and the selection follows.
 */
export function indentSelection(text: string, start: number, end: number, outdent: boolean, width = CODE_TAB_WIDTH): EditResult {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const multiLine = text.slice(start, end).includes('\n')
  if (!multiLine && !outdent) {
    const column = start - lineStart
    const spaces = ' '.repeat(width - (column % width))
    return { text: text.slice(0, start) + spaces + text.slice(end), start: start + spaces.length, end: start + spaces.length }
  }
  const afterEnd = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end)
  const blockEnd = afterEnd === -1 ? text.length : afterEnd
  let firstDelta = 0
  let totalDelta = 0
  const changed = text.slice(lineStart, blockEnd).split('\n').map((line, index) => {
    let delta: number
    let next: string
    if (outdent) {
      delta = -Math.min(line.match(/^ */)![0].length, width)
      next = line.slice(-delta)
    } else {
      delta = line.length === 0 ? 0 : width
      next = ' '.repeat(delta) + line
    }
    if (index === 0) firstDelta = delta
    totalDelta += delta
    return next
  })
  return { text: text.slice(0, lineStart) + changed.join('\n') + text.slice(blockEnd), start: Math.max(lineStart, start + firstDelta), end: Math.max(lineStart, end + totalDelta) }
}

/** The code editor is only open while its block still exists; a block deleted or undone away under the editor closes it. */
export function codeEditorIsLive(items: readonly { kind: string; id: number }[], editor: { id: number } | null): boolean {
  return editor !== null && items.some((item) => item.kind === 'code' && item.id === editor.id)
}
