import type { CanvasItem, CodeObject } from './canvasModel'

/**
 * Code block objects: the pure rules (defaults, limits, language list, edits). No canvas and no library here, so the saved-file
 * parser can import it. Highlighting lives in codeHighlight.ts, drawing in app/codeRenderer.ts.
 */
export const DEFAULT_CODE_FONT_SIZE = 13
export const MIN_CODE_FONT_SIZE = 8
export const MAX_CODE_FONT_SIZE = 24
export const MAX_CODE_LENGTH = 20000
export const CODE_TAB_WIDTH = 2
export const MIN_CODE_WIDTH = 96
export const MIN_CODE_HEIGHT = 48
export const DEFAULT_CODE_WIDTH = 360
export const DEFAULT_CODE_HEIGHT = 200
export const DEFAULT_CODE_LANGUAGE = 'plaintext'

/** Id (what is saved), label (the selector). The highlighter library maps `html` to its `xml` grammar. */
export const CODE_LANGUAGES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'plaintext', label: 'Plain text' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'csharp', label: 'C#' },
  { id: 'cpp', label: 'C++' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'sql', label: 'SQL' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'bash', label: 'Shell' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
]

const LANGUAGE_IDS = CODE_LANGUAGES.map((language) => language.id)

/** A saved language that is not in the list is shown as plain text. */
export function cleanCodeLanguage(value: unknown): string {
  return typeof value === 'string' && LANGUAGE_IDS.includes(value) ? value : DEFAULT_CODE_LANGUAGE
}

/** Whole pixels between 8 and 24; anything else is the default. */
export function clampCodeFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CODE_FONT_SIZE
  return Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, Math.round(value)))
}

export const codeFontSize = (item: CodeObject): number => item.fontSize === undefined ? DEFAULT_CODE_FONT_SIZE : clampCodeFontSize(item.fontSize)

/** Text as kept in the file: no NUL, CRLF as LF, tabs as spaces (tab stops of CODE_TAB_WIDTH), at most MAX_CODE_LENGTH characters. */
export function normalizeCodeText(value: string): string {
  const lines = value.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').slice(0, MAX_CODE_LENGTH * 2).split('\n')
  return lines.map((line) => {
    if (!line.includes('\t')) return line
    let out = ''
    for (const ch of line) out += ch === '\t' ? ' '.repeat(CODE_TAB_WIDTH - (out.length % CODE_TAB_WIDTH)) : ch
    return out
  }).join('\n').slice(0, MAX_CODE_LENGTH)
}

export function createCodeObject(id: number, x: number, y: number, language = DEFAULT_CODE_LANGUAGE): CodeObject {
  return { kind: 'code', id, x, y, width: DEFAULT_CODE_WIDTH, height: DEFAULT_CODE_HEIGHT, text: '', language: cleanCodeLanguage(language) }
}

/**
 * Where a new block goes: its top-left corner at the mouse (`atMouse`), or centred on the middle of the view when the mouse is not
 * over the canvas (menu button). Always kept inside the workspace.
 */
export function newCodeBlockOrigin(
  anchor: { x: number; y: number },
  atMouse: boolean,
  workspace: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const x = atMouse ? anchor.x : anchor.x - DEFAULT_CODE_WIDTH / 2
  const y = atMouse ? anchor.y : anchor.y - DEFAULT_CODE_HEIGHT / 2
  return {
    x: Math.max(workspace.x, Math.min(workspace.x + workspace.width - DEFAULT_CODE_WIDTH, x)),
    y: Math.max(workspace.y, Math.min(workspace.y + workspace.height - DEFAULT_CODE_HEIGHT, y)),
  }
}

/** Replaces one code block (never edits in place). Returns the same array when nothing changes. */
function updateCode(items: CanvasItem[], id: number, change: (item: CodeObject) => CodeObject): CanvasItem[] {
  let changed = false
  const next = items.map((item) => {
    if (item.kind !== 'code' || item.id !== id) return item
    const updated = change(item)
    if (updated !== item) changed = true
    return updated
  })
  return changed ? next : items
}

export function setCodeText(items: CanvasItem[], id: number, text: string): CanvasItem[] {
  const clean = normalizeCodeText(text)
  return updateCode(items, id, (item) => (item.text === clean ? item : { ...item, text: clean }))
}

export function setCodeLanguage(items: CanvasItem[], id: number, language: string): CanvasItem[] {
  const clean = cleanCodeLanguage(language)
  return updateCode(items, id, (item) => (item.language === clean ? item : { ...item, language: clean }))
}

export function setCodeTheme(items: CanvasItem[], id: number, theme: 'light' | 'dark'): CanvasItem[] {
  return updateCode(items, id, (item) => {
    if (theme === 'dark') return item.theme === 'dark' ? item : { ...item, theme: 'dark' }
    if (item.theme === undefined) return item
    const { theme: _theme, ...rest } = item
    void _theme
    return rest
  })
}

/** The default size is not written to the file. */
export function setCodeFontSize(items: CanvasItem[], id: number, size: number): CanvasItem[] {
  const clean = clampCodeFontSize(size)
  return updateCode(items, id, (item) => {
    if (codeFontSize(item) === clean) return item
    if (clean === DEFAULT_CODE_FONT_SIZE) {
      const { fontSize: _fontSize, ...rest } = item
      void _fontSize
      return rest
    }
    return { ...item, fontSize: clean }
  })
}

/** The size after pressing plus (+1) or minus (-1). */
export const stepCodeFontSize = (item: CodeObject, direction: 1 | -1): number => clampCodeFontSize(codeFontSize(item) + direction)

/** Space for the line numbers: as many digits as the last line number needs. */
export const codeGutterDigits = (lineCount: number): number => Math.max(2, String(Math.max(1, lineCount)).length)

export const CODE_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
export const CODE_PADDING = 8
export const codeLineHeight = (fontSize: number): number => Math.round(fontSize * 1.5 * 10) / 10

export type CodeColors = { background: string; border: string; gutter: string; plain: string; keyword: string; type: string; function: string; string: string; comment: string; number: string }
export const CODE_LIGHT: CodeColors = { background: '#f6f8fa', border: '#d0d7de', gutter: '#8c959f', plain: '#24292f', keyword: '#cf222e', type: '#953800', function: '#8250df', string: '#0a3069', comment: '#6e7781', number: '#0550ae' }
export const CODE_DARK: CodeColors = { background: '#161b22', border: '#30363d', gutter: '#6e7681', plain: '#e6edf3', keyword: '#ff7b72', type: '#ffa657', function: '#d2a8ff', string: '#a5d6ff', comment: '#8b949e', number: '#79c0ff' }
export const codeColors = (item: CodeObject): CodeColors => (item.theme === 'dark' ? CODE_DARK : CODE_LIGHT)

export type CodeGeometry = { fontSize: number; lineHeight: number; gutterRight: number; textX: number; firstBaseline: number; visibleLines: number }
/** Where things sit inside a block (offsets from its top-left), shared by the canvas and the SVG export. `charWidth` is one monospace character. */
export function codeGeometry(item: CodeObject, lineCount: number, charWidth: number): CodeGeometry {
  const fontSize = codeFontSize(item)
  const lineHeight = codeLineHeight(fontSize)
  const gutterRight = CODE_PADDING + codeGutterDigits(lineCount) * charWidth
  return {
    fontSize,
    lineHeight,
    gutterRight,
    textX: gutterRight + 10,
    firstBaseline: CODE_PADDING + lineHeight / 2 + fontSize * 0.35,
    visibleLines: Math.max(0, Math.ceil((item.height - CODE_PADDING) / lineHeight)),
  }
}
