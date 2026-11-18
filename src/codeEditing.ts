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

/**
 * Typing help in the code editor, per language: auto-closing brackets and quotes (a selection is wrapped), typing over the closing
 * character, Backspace inside an empty pair removes both, Enter keeps the line's indent (one level more after an opening bracket, or
 * after a colon in Python and YAML; a closing bracket right after the caret goes on its own line), and a closing bracket typed on a
 * blank line outdents it. Plain text only keeps the indent on Enter. Returns null when the browser's own handling is right.
 */
const OPEN_TO_CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }
const CLOSERS = new Set([')', ']', '}'])
const QUOTES = new Set(['"', "'", '`'])

type LanguageRules = { pairs: string; colonIndents: boolean; dedentAfter: RegExp | null }
const NO_RULES: LanguageRules = { pairs: '', colonIndents: false, dedentAfter: null }
const BRACE_PAIRS = `()[]{}"'`
export function codeLanguageRules(language: string): LanguageRules {
  switch (language) {
    case 'plaintext': return NO_RULES
    case 'python': return { pairs: BRACE_PAIRS, colonIndents: true, dedentAfter: /^\s*(return|pass|break|continue|raise)\b/ }
    case 'yaml': return { pairs: BRACE_PAIRS, colonIndents: true, dedentAfter: null }
    case 'javascript': case 'typescript': case 'go': case 'kotlin': case 'bash': return { pairs: BRACE_PAIRS + '`', colonIndents: false, dedentAfter: null }
    default: return { pairs: BRACE_PAIRS, colonIndents: false, dedentAfter: null }
  }
}

const indentOf = (line: string): string => line.match(/^ */)![0]

export function codeKeyEdit(text: string, start: number, end: number, key: string, language: string, width = CODE_TAB_WIDTH): EditResult | null {
  const rules = codeLanguageRules(language)
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const before = text.slice(lineStart, start)
  const next = text[end] ?? ''
  const prev = start > 0 ? text[start - 1] : ''
  const caret = start === end
  const insert = (value: string, caretOffset = value.length): EditResult => ({ text: text.slice(0, start) + value + text.slice(end), start: start + caretOffset, end: start + caretOffset })

  if (key === 'Enter') {
    let indent = indentOf(before)
    const trimmed = before.trimEnd()
    const last = trimmed[trimmed.length - 1] ?? ''
    if (rules.pairs) {
      const opens = last === '{' || last === '[' || last === '('
      if (opens && caret && next === OPEN_TO_CLOSE[last]) {
        const inner = `\n${indent}${' '.repeat(width)}`
        return insert(`${inner}\n${indent}`, inner.length)
      }
      if (opens || (rules.colonIndents && last === ':')) indent += ' '.repeat(width)
      else if (rules.dedentAfter?.test(before)) indent = indent.slice(Math.min(width, indent.length))
    }
    return insert(`\n${indent}`)
  }

  if (!rules.pairs) return null

  if (key === 'Backspace') {
    if (!caret || !prev || !rules.pairs.includes(prev) || OPEN_TO_CLOSE[prev] !== next) return null
    return { text: text.slice(0, start - 1) + text.slice(end + 1), start: start - 1, end: start - 1 }
  }

  if (key.length !== 1 || !rules.pairs.includes(key)) return null

  // Typing the closing character that is already next: step over it.
  if (caret && (CLOSERS.has(key) || QUOTES.has(key)) && next === key) return { text, start: start + 1, end: start + 1 }

  if (CLOSERS.has(key)) {
    // A closing bracket as the first thing on a line goes back one level.
    if (caret && before.length > 0 && before.trim() === '') {
      const outdented = before.slice(Math.min(width, before.length))
      return { text: text.slice(0, lineStart) + outdented + key + text.slice(end), start: lineStart + outdented.length + 1, end: lineStart + outdented.length + 1 }
    }
    return null
  }

  const close = OPEN_TO_CLOSE[key]
  if (!caret) {
    // Wrap the selection in the pair, keeping it selected.
    return { text: text.slice(0, start) + key + text.slice(start, end) + close + text.slice(end), start: start + 1, end: end + 1 }
  }
  const nextAllows = next === '' || /\s/.test(next) || CLOSERS.has(next) || next === ',' || next === ';' || next === ':'
  if (!nextAllows) return null
  // A quote right after a letter or digit is an apostrophe or the end of a word ("don't"), not a new string.
  if (QUOTES.has(key) && /[\w"'`]/.test(prev)) return null
  return insert(key + close, 1)
}

/** The code editor is only open while its block still exists; a block deleted or undone away under the editor closes it. */
export function codeEditorIsLive(items: readonly { kind: string; id: number }[], editor: { id: number } | null): boolean {
  return editor !== null && items.some((item) => item.kind === 'code' && item.id === editor.id)
}
