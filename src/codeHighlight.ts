import type { CodeObject } from './canvasModel'
import { cleanCodeLanguage } from './codeBlock'

/**
 * Syntax colouring for code blocks. highlight.js is loaded by dynamic import, only once a code block is on screen (its own chunk).
 * Until then, and for plain text, lines come back as one uncoloured piece. Token lines are cached per code object (items are never
 * edited in place) and, because a drag makes a new object with the same text, also by language + text, so panning, zooming and
 * dragging never highlight again.
 */
export type CodeTokenKind = 'plain' | 'keyword' | 'type' | 'function' | 'string' | 'comment' | 'number'
export type CodeToken = { text: string; kind: CodeTokenKind }
export type CodeLines = CodeToken[][]
/** Returns highlight.js style HTML (class names hljs-*) for the code, or null to draw it plain. */
export type CodeHighlighter = (code: string, language: string) => string | null

let highlighter: CodeHighlighter | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

type Entry = { lines: CodeLines; colored: boolean }
const byItem = new WeakMap<object, Entry & { text: string; language: string }>()
const byText = new Map<string, Entry>()
const MAX_CACHED_TEXTS = 64

export function plainCodeLines(text: string): CodeLines {
  return text.split('\n').map((line) => (line === '' ? [] : [{ text: line, kind: 'plain' as const }]))
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" }
const unescapeHtml = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (match) => ENTITIES[match])

/** The colour group of one hljs class list, or null when it has none (the surrounding group then applies). */
export function kindOfClasses(classes: string): CodeTokenKind | null {
  const names = classes.split(/\s+/)
  const has = (...wanted: string[]) => wanted.some((name) => names.includes(name))
  if (has('hljs-comment', 'hljs-quote', 'hljs-doctag')) return 'comment'
  if (has('hljs-string', 'hljs-regexp', 'hljs-char', 'hljs-meta-string', 'hljs-template-variable')) return 'string'
  if (has('hljs-number', 'hljs-literal')) return 'number'
  if (has('class_', 'hljs-type', 'hljs-built_in', 'hljs-class')) return 'type'
  if (has('function_')) return 'function'
  if (has('hljs-keyword', 'hljs-selector-tag', 'hljs-doctype', 'hljs-meta', 'hljs-name', 'hljs-tag')) return 'keyword'
  if (has('hljs-title')) return 'function'
  return null
}

/** Splits highlight.js HTML into coloured pieces per source line. Nested spans use their own group, or the enclosing one when they have none. */
export function parseHighlightHtml(html: string): CodeLines {
  const lines: CodeLines = [[]]
  const stack: CodeTokenKind[] = ['plain']
  const push = (text: string) => {
    const parts = text.split('\n')
    parts.forEach((part, index) => {
      if (index > 0) lines.push([])
      if (part === '') return
      const line = lines[lines.length - 1]
      const kind = stack[stack.length - 1]
      const last = line[line.length - 1]
      if (last && last.kind === kind) last.text += part
      else line.push({ text: part, kind })
    })
  }
  const pattern = /<span class="([^"]*)">|<\/span>|[^<]+|</g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    const piece = match[0]
    if (match[1] !== undefined) stack.push(kindOfClasses(match[1]) ?? stack[stack.length - 1])
    else if (piece === '</span>') { if (stack.length > 1) stack.pop() }
    else push(unescapeHtml(piece))
  }
  return lines
}

function build(text: string, language: string): Entry {
  if (highlighter && language !== 'plaintext') {
    try {
      const html = highlighter(text, language)
      if (html !== null) return { lines: parseHighlightHtml(html), colored: true }
    } catch {
      // A grammar that fails leaves the block plain; it must never break drawing.
    }
  }
  return { lines: plainCodeLines(text), colored: highlighter !== null }
}

/** The coloured lines of a block. Cheap for a block seen before; never throws. */
export function getCodeLines(item: CodeObject): CodeLines {
  const language = cleanCodeLanguage(item.language)
  const own = byItem.get(item)
  if (own && own.colored === (highlighter !== null)) return own.lines
  const key = `${language}\u0000${item.text}`
  let entry = byText.get(key)
  if (!entry || entry.colored !== (highlighter !== null)) {
    entry = build(item.text, language)
    byText.delete(key)
    byText.set(key, entry)
    if (byText.size > MAX_CACHED_TEXTS) byText.delete(byText.keys().next().value as string)
  }
  byItem.set(item, { ...entry, text: item.text, language })
  return entry.lines
}

export function setCodeHighlighter(next: CodeHighlighter | null): void {
  highlighter = next
  byText.clear()
  for (const listener of listeners) listener()
}

export const isCodeHighlighterReady = (): boolean => highlighter !== null

/** Called when the library has loaded (the canvas redraws then). Returns the unsubscribe function. */
export function onCodeHighlighterReady(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Starts loading the library once. Safe to call every frame; a failed load leaves blocks plain and is not retried until the page is reloaded. */
export function ensureCodeHighlighter(): void {
  if (highlighter || loading) return
  loading = import('./codeHighlightLib').then((module) => setCodeHighlighter(module.highlightWithLibrary)).catch(() => undefined)
}

/** Test hook. */
export function resetCodeHighlightForTests(): void {
  highlighter = null
  loading = null
  byText.clear()
}
