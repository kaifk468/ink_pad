import { clampCodeFontSize, cleanCodeLanguage, DEFAULT_CODE_FONT_SIZE, MAX_CODE_LENGTH, normalizeCodeText } from './codeBlock'
import { cleanConnectorLabel, cleanConnectorLabelFontSize, cleanConnectorLabelPosition } from './connectorLabel'
import { MAX_CONNECTOR_BEND } from './canvasModel'
import type { CodeObject, OpaqueObject, TextFontId, HldShape, CanvasItem, ClassBoxContent, ConnectorAttachment, InkBoxContent, ConnectorObject, ConnectorRelationshipType, Point, RectangleObject, Stroke, TextObject } from './canvasModel'

/**
 * Versioned InkPad document (.inkpad file / stored diagram).
 * Coordinates are sheet canvas coordinates, exactly as held in memory.
 * Undo history and viewport are intentionally not part of a document.
 */
export const DOCUMENT_FORMAT = 'inkpad-document'
export const DOCUMENT_VERSION = 1
/** Written only by diagrams with more than one page. An InkPad that only knows v1 refuses these ("update InkPad") instead of opening page 1 and silently dropping the rest on its next save. */
export const MULTI_PAGE_VERSION = 2
/** Mirrors MAX_PAGES in pages.ts (a test checks they agree). */
const MAX_DOCUMENT_PAGES = 50
export const DOCUMENT_FILE_EXTENSION = '.inkpad'
export const DOCUMENT_MIME_TYPE = 'application/json'

export type DocumentPageTemplate = 'blank' | 'lined' | 'dotted'
export type DocumentPageSpacing = 'narrow' | 'standard' | 'wide'
export type DocumentPageBackground = 'white' | 'warm' | 'blue' | 'yellow' | 'green'

export type InkPadDocument = {
  format: typeof DOCUMENT_FORMAT
  version: number
  title: string
  createdAt: string
  updatedAt: string
  /** `spacing` is written only when it is not the standard one; `sheetHeight` only when the page has grown past its first height. */
  page: { template: DocumentPageTemplate; background: DocumentPageBackground; spacing?: DocumentPageSpacing; sheetHeight?: number; sketchy?: true }
  /** Optional page names, one per page ('' = unnamed). Written only when at least one page has a name. */
  pageNames?: string[]
  /** `items` is page 1. Pages 2 and on, only when the diagram has more than one page. */
  items: CanvasItem[]
  pages?: Array<{ items: CanvasItem[] }>
}

export type DocumentInput = {
  title?: string
  createdAt?: string
  updatedAt?: string
  template: DocumentPageTemplate
  background: DocumentPageBackground
  spacing?: DocumentPageSpacing
  /** Page height after it grew (2000, 2500 or 3000); left out for the first height. */
  sheetHeight?: number
  /** Hand-drawn style for the whole diagram; written only when true. */
  sketchy?: boolean
  /** Page 1. */
  items: CanvasItem[]
  /** Pages 2 and on. */
  extraPages?: CanvasItem[][]
  /** One name per page ('' = unnamed); written only when at least one is named. */
  pageNames?: string[]
  /** Reuse finished strokes as they are instead of copying them (committed strokes are never changed afterwards). Used for autosave. */
  shareStrokes?: boolean
}

export type ParseResult =
  | { ok: true; document: InkPadDocument; droppedItems: number; migratedFrom: number | null }
  | { ok: false; error: string }

export type NextIds = { stroke: number; rectangle: number; connector: number; text: number }

/** The grown page heights a document may hold; the first height (1500) is never written. Mirrors SHEET_MIN_HEIGHT, SHEET_GROW_STEP and SHEET_MAX_HEIGHT in viewport.ts (a test checks they agree). */
const GROWN_SHEET_HEIGHTS = [2000, 2500, 3000]
const grownSheetHeight = (value: unknown): { sheetHeight: number } | Record<string, never> =>
  typeof value === 'number' && GROWN_SHEET_HEIGHTS.includes(value) ? { sheetHeight: value } : {}
const TEMPLATES: DocumentPageTemplate[] = ['blank', 'lined', 'dotted']
const BACKGROUNDS: DocumentPageBackground[] = ['white', 'warm', 'blue', 'yellow', 'green']
/** Same kinds as HLD_SHAPES in canvasModel.ts (not imported: this file only takes types from there). */
/** Kept in step with TEXT_FONT_IDS in canvasModel.ts (a test checks it); this module stays free of value imports. */
const TEXT_FONT_KINDS: string[] = ['excalifont', 'sans', 'serif', 'mono']
const HLD_SHAPE_KINDS: string[] = ['database', 'queue', 'service', 'user', 'browser', 'mobile', 'cache', 'loadBalancer', 'cdn']
const RELATIONSHIPS: ConnectorRelationshipType[] = ['association', 'directed-association', 'inheritance', 'realization', 'dependency', 'aggregation', 'composition']
const KNOWN_KINDS = ['stroke', 'rectangle', 'text', 'connector', 'code']
export const MAX_TITLE_LENGTH = 120
const MAX_TEXT_LENGTH = 2000
const MIN_FONT_SIZE = 4
const MAX_FONT_SIZE = 400
export const DEFAULT_DOCUMENT_TITLE = 'Untitled diagram'
export const MAX_PAGE_NAME_LENGTH = 40

/** A page name as stored: control characters removed, spaces collapsed, trimmed, at most 40 characters. Anything that is not text is no name. */
export function cleanPageName(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_NAME_LENGTH).trim() : ''
}

/** One cleaned name per page (padded with '' or cut to `count`). */
export function normalizePageNames(raw: unknown, count: number): string[] {
  const list = Array.isArray(raw) ? raw : []
  return Array.from({ length: count }, (_, index) => cleanPageName(list[index]))
}

/** The names to save: one per page, or undefined when no page has a name (so unnamed diagrams are saved exactly as before). */
export function writablePageNames(raw: unknown, count: number): string[] | undefined {
  const names = normalizePageNames(raw, count)
  return names.some((name) => name !== '') ? names : undefined
}

export function createDocument(input: DocumentInput, now = new Date().toISOString()): InkPadDocument {
  const extraPages = (input.extraPages ?? []).slice(0, MAX_DOCUMENT_PAGES - 1)
  const names = writablePageNames(input.pageNames, 1 + extraPages.length)
  const copy = (item: CanvasItem) => (input.shareStrokes && item.kind === 'stroke' ? item : cloneItem(item))
  return {
    format: DOCUMENT_FORMAT,
    version: extraPages.length > 0 ? MULTI_PAGE_VERSION : DOCUMENT_VERSION,
    title: cleanTitle(input.title),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    page: { template: input.template, background: input.background, ...(input.spacing === 'narrow' || input.spacing === 'wide' ? { spacing: input.spacing } : {}), ...grownSheetHeight(input.sheetHeight), ...(input.sketchy === true ? { sketchy: true as const } : {}) },
    ...(names ? { pageNames: names } : {}),
    items: input.items.map(copy),
    ...(extraPages.length > 0 ? { pages: extraPages.map((items) => ({ items: items.map(copy) })) } : {}),
  }
}

// A finished stroke never changes, so its JSON text is made once and reused by every later save.
const strokeJson = new WeakMap<object, string>()

/** The document as JSON text, identical to JSON.stringify(document) but only serializing strokes it has not seen before. */
export function stringifyDocument(document: InkPadDocument): string {
  const { pages, ...rest } = document
  const head = JSON.stringify({ ...rest, items: [] })
  if (!head.endsWith('"items":[]}')) return JSON.stringify(document)
  const itemsText = (items: CanvasItem[]) => items.map((item) => {
    if (item.kind === 'opaque') return opaqueJson.get(item) ?? JSON.stringify(item)
    if (item.kind !== 'stroke') return JSON.stringify(item)
    let text = strokeJson.get(item)
    if (text === undefined) {
      text = JSON.stringify(item)
      strokeJson.set(item, text)
    }
    return text
  }).join(',')
  const pagesText = pages && pages.length > 0 ? `,"pages":[${pages.map((page) => `{"items":[${itemsText(page.items)}]}`).join(',')}]` : ''
  return `${head.slice(0, -2)}${itemsText(document.items)}]${pagesText}}`
}

/** Number of items in the whole diagram, every page counted. */
export function documentItemCount(document: InkPadDocument): number {
  let count = document.items.length
  for (const page of document.pages ?? []) count += page.items.length
  return count
}

/** Number of pages in the diagram (at least 1). */
export function documentPageCount(document: InkPadDocument): number {
  return 1 + (document.pages?.length ?? 0)
}

/** An open diagram's content for "did anything change since the last save" checks. */
export type DocumentSignature = { title: string; template: DocumentPageTemplate; background: DocumentPageBackground; spacing?: DocumentPageSpacing; sheetHeight?: number; sketchy?: boolean; items: CanvasItem[]; extraPages?: CanvasItem[][]; pageNames?: string[] }

export function sameSignature(a: DocumentSignature | null, b: DocumentSignature | null): boolean {
  if (!a || !b) return false
  if (a.title !== b.title || a.template !== b.template || a.background !== b.background || (a.spacing ?? 'standard') !== (b.spacing ?? 'standard') || (a.sheetHeight ?? 1500) !== (b.sheetHeight ?? 1500) || (a.sketchy === true) !== (b.sketchy === true) || a.items.length !== b.items.length) return false
  for (let index = 0; index < a.items.length; index += 1) if (a.items[index] !== b.items[index]) return false
  const aPages = a.extraPages ?? []
  const bPages = b.extraPages ?? []
  if (aPages.length !== bPages.length) return false
  const aNames = normalizePageNames(a.pageNames, 1 + aPages.length)
  const bNames = normalizePageNames(b.pageNames, 1 + bPages.length)
  for (let index = 0; index < aNames.length; index += 1) if (aNames[index] !== bNames[index]) return false
  for (let page = 0; page < aPages.length; page += 1) {
    if (aPages[page].length !== bPages[page].length) return false
    for (let index = 0; index < aPages[page].length; index += 1) if (aPages[page][index] !== bPages[page][index]) return false
  }
  return true
}

/** Largest used id per kind + 1, so new items never collide with loaded ones. */
export function getNextIds(items: CanvasItem[]): NextIds {
  const next: NextIds = { stroke: 1, rectangle: 1, connector: 1, text: 1 }
  // Code blocks share the text counter (their keys differ by kind, so ids never clash). Unknown items push every counter past their id.
  for (const item of items) {
    if (item.kind === 'opaque') {
      // We never hand out an id of this kind's own, but a saved copy may later be read by a newer InkPad: stay clear of its ids in every counter.
      for (const kind of ['stroke', 'rectangle', 'connector', 'text'] as const) next[kind] = Math.max(next[kind], item.id + 1)
      continue
    }
    const kind = item.kind === 'code' ? 'text' : item.kind
    next[kind] = Math.max(next[kind], item.id + 1)
  }
  return next
}

export function cleanTitle(title: unknown): string {
  const text = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH) : ''
  return text || DEFAULT_DOCUMENT_TITLE
}

/** What to save after the title was edited in place, or null when nothing changed (so no needless save). Empty text means the default title. */
export function titleToCommit(current: string, draft: string): string | null {
  const next = cleanTitle(draft)
  return next === cleanTitle(current) ? null : next
}

export function documentFileName(title: string): string {
  const base = cleanTitle(title).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-') || 'diagram'
  return `${base}${DOCUMENT_FILE_EXTENSION}`
}

/** Version migrations: migrations[n] upgrades a version-n payload to n + 1. */
const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {}

const KNOWN_DOCUMENT_KEYS = new Set(['format', 'version', 'title', 'createdAt', 'updatedAt', 'page', 'items', 'pages', 'pageNames'])
const KNOWN_PAGE_KEYS = new Set(['template', 'background', 'spacing', 'sheetHeight', 'sketchy'])
const lossyParses = new WeakSet<object>()

/** True when the document came from parseDocument and the parse dropped damaged items or fields this version does not know, so saving it again would lose data. */
export function isLossyParse(document: InkPadDocument): boolean {
  return lossyParses.has(document)
}

export function parseDocument(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' }
  }
  if (!isRecord(raw) || raw.format !== DOCUMENT_FORMAT) return { ok: false, error: 'This is not an InkPad document.' }
  const version = raw.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: 'The document has no valid version.' }
  if (version > MULTI_PAGE_VERSION) return { ok: false, error: `This document was saved by a newer InkPad (format v${version}). Update InkPad to open it.` }

  let current: Record<string, unknown> = raw
  for (let v = version; v < DOCUMENT_VERSION; v += 1) {
    const migrate = migrations[v]
    if (!migrate) return { ok: false, error: `No migration from format v${v}.` }
    current = migrate(current)
  }
  if (!Array.isArray(current.items)) return { ok: false, error: 'The document has no items list.' }

  const page = isRecord(current.page) ? current.page : {}
  const first = cleanItems(current.items)
  const finalItems = first.items
  let droppedItems = first.dropped
  const extraPages: Array<{ items: CanvasItem[] }> = []
  if (Array.isArray(current.pages)) {
    for (const rawPage of current.pages.slice(0, MAX_DOCUMENT_PAGES - 1)) {
      // A page that cannot be read stays as an empty page, so the pages after it keep their place.
      const cleaned = isRecord(rawPage) && Array.isArray(rawPage.items) ? cleanItems(rawPage.items) : { items: [], dropped: 0 }
      droppedItems += cleaned.dropped
      extraPages.push({ items: cleaned.items })
    }
    droppedItems += Math.max(0, current.pages.length - (MAX_DOCUMENT_PAGES - 1))
  }

  const names = writablePageNames(current.pageNames, 1 + extraPages.length)
  const now = new Date().toISOString()
  const unknownFields = Object.keys(current).some((key) => !KNOWN_DOCUMENT_KEYS.has(key)) || Object.keys(page).some((key) => !KNOWN_PAGE_KEYS.has(key))
  const parsed: InkPadDocument = {
      format: DOCUMENT_FORMAT,
      version: extraPages.length > 0 ? MULTI_PAGE_VERSION : DOCUMENT_VERSION,
      title: cleanTitle(current.title),
      createdAt: typeof current.createdAt === 'string' ? current.createdAt : now,
      updatedAt: typeof current.updatedAt === 'string' ? current.updatedAt : now,
      page: {
        template: TEMPLATES.includes(page.template as DocumentPageTemplate) ? (page.template as DocumentPageTemplate) : 'blank',
        background: BACKGROUNDS.includes(page.background as DocumentPageBackground) ? (page.background as DocumentPageBackground) : 'white',
        ...(page.spacing === 'narrow' || page.spacing === 'wide' ? { spacing: page.spacing } : {}),
        ...grownSheetHeight(page.sheetHeight),
        ...(page.sketchy === true ? { sketchy: true as const } : {}),
      },
      ...(names ? { pageNames: names } : {}),
      items: finalItems,
      ...(extraPages.length > 0 ? { pages: extraPages } : {}),
  }
  if (droppedItems > 0 || unknownFields) lossyParses.add(parsed)
  return { ok: true, droppedItems, migratedFrom: version < DOCUMENT_VERSION ? version : null, document: parsed }
}

function cleanItems(candidates: unknown[]): { items: CanvasItem[]; dropped: number } {
  const items: CanvasItem[] = []
  let dropped = 0
  for (const candidate of candidates) {
    const item = sanitizeItem(candidate)
    if (item) items.push(item)
    else dropped += 1
  }
  const uniqueItems = dropDuplicateIds(items)
  dropped += items.length - uniqueItems.length
  return { items: repairAttachments(uniqueItems), dropped }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isId = (value: unknown): value is number => isNum(value) && Number.isInteger(value) && value >= 0
const isColor = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64

function sanitizePoint(value: unknown): Point | null {
  if (!isRecord(value) || !isNum(value.x) || !isNum(value.y)) return null
  const pressure = isNum(value.pressure) ? Math.min(1, Math.max(0, value.pressure)) : 0
  return { x: value.x, y: value.y, pressure }
}

/** A rotation angle is kept only when finite and not ~0; it is stored normalised to (-PI, PI]. */
function sanitizeAngle(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  let angle = value % (Math.PI * 2) // same normalisation as normalizeAngle in canvasModel.ts (this module takes no value imports)
  if (angle > Math.PI) angle -= Math.PI * 2
  else if (angle <= -Math.PI) angle += Math.PI * 2
  return Math.abs(angle) < 1e-6 ? undefined : angle
}

/** Only an ink box can carry an HLD shape, and ink boxes never rotate; kept as a guard so a stray hldShape never rotates a box. */
function hldShapeKept(value: Record<string, unknown>): boolean {
  return HLD_SHAPE_KINDS.includes(value.hldShape as string)
}

/** Class box content is optional on a rectangle; if it is malformed the plain rectangle is kept without it. */
function sanitizeClassBox(value: unknown): ClassBoxContent | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.attributes !== 'string' || typeof value.methods !== 'string') return undefined
  const clean = (text: string) => text.replace(/\u0000/g, '').slice(0, MAX_TEXT_LENGTH)
  return { name: clean(value.name), attributes: clean(value.attributes), methods: clean(value.methods) }
}

const MAX_INK_BOX_STROKES = 20000

/** Ink class box content is optional on a rectangle; if it is malformed the plain rectangle is kept without it. */
function sanitizeInkBox(value: unknown, y: number, height: number): InkBoxContent | undefined {
  if (!isRecord(value) || !isNum(value.top) || !isNum(value.mid) || !Array.isArray(value.ink)) return undefined
  const ink: Stroke[] = []
  for (const raw of value.ink.slice(0, MAX_INK_BOX_STROKES)) {
    const item = sanitizeItemFields(raw)
    if (item && item.kind === 'stroke') ink.push(item)
  }
  // Keep both dividers inside the box with room for each section, even if the file was edited by hand (same limits as canvasModel's clampInkBoxDividers).
  const band = 24
  const bottom = y + height
  if (height < 72) return { top: y + height / 3, mid: y + (height * 2) / 3, ink }
  const top = Math.min(Math.max(value.top, y + band), bottom - band * 2)
  const mid = Math.min(Math.max(value.mid, top + band), bottom - band)
  return { top, mid, ink }
}

function sanitizeAttachment(value: unknown): ConnectorAttachment | undefined {
  if (!isRecord(value) || !isId(value.rectangleId) || !isNum(value.offsetX) || !isNum(value.offsetY)) return undefined
  return { rectangleId: value.rectangleId, offsetX: value.offsetX, offsetY: value.offsetY }
}

/** Reads one item; the optional `locked: true` is kept on canvas items only (never on eraser marks or unknown items; any other value is dropped). */
export function sanitizeItem(value: unknown): CanvasItem | null {
  let item = sanitizeItemFields(value)
  if (item && item.kind !== 'opaque' && isRecord(value) && value.locked === true && !(item.kind === 'stroke' && item.erase)) item = { ...item, locked: true }
  // `group`: a positive safe integer only, on canvas items (never eraser marks or unknown items).
  if (item && item.kind !== 'opaque' && isRecord(value) && typeof value.group === 'number' && Number.isSafeInteger(value.group) && value.group > 0 && !(item.kind === 'stroke' && item.erase)) item = { ...item, group: value.group }
  return item
}

function sanitizeItemFields(value: unknown): CanvasItem | null {
  if (!isRecord(value) || !isId(value.id)) return null
  if (value.kind === 'stroke') {
    if (!Array.isArray(value.points) || !isColor(value.color) || !isNum(value.width) || value.width <= 0) return null
    const points: Point[] = []
    for (const raw of value.points) {
      const point = sanitizePoint(raw)
      if (!point) return null
      points.push(point)
    }
    if (!points.length) return null
    const stroke: Stroke = { kind: 'stroke', id: value.id, points, color: value.color, width: value.width, erase: value.erase === true }
    if (value.shape === 'arrow' || value.shape === 'line') {
      stroke.shape = value.shape
      // Line style and arrowheads exist on straight arrow/line strokes only.
      if (value.dash === 'dashed' || value.dash === 'dotted') stroke.dash = value.dash
      if (value.arrowheads === 'none' || value.arrowheads === 'start' || value.arrowheads === 'both' || value.arrowheads === 'end') stroke.arrowheads = value.arrowheads
    }
    return stroke
  }
  if (value.kind === 'rectangle') {
    if (!isNum(value.x) || !isNum(value.y) || !isNum(value.width) || !isNum(value.height) || !isColor(value.strokeColor) || !isNum(value.strokeWidth) || value.strokeWidth <= 0) return null
    const classBox = sanitizeClassBox(value.classBox)
    const inkBox = sanitizeInkBox(value.inkBox, value.y, value.height)
    const rectangle: RectangleObject = { kind: 'rectangle', id: value.id, x: value.x, y: value.y, width: value.width, height: value.height, strokeColor: value.strokeColor, strokeWidth: value.strokeWidth, ...(classBox ? { classBox } : {}), ...(inkBox ? { inkBox } : {}), ...(inkBox && HLD_SHAPE_KINDS.includes(value.hldShape as string) ? { hldShape: value.hldShape as HldShape } : {}), ...(value.ellipse === true && !classBox && !inkBox && value.width > 0 && value.height > 0 ? { ellipse: true as const } : {}), ...(value.diamond === true && value.ellipse !== true && !classBox && !inkBox && value.width > 0 && value.height > 0 ? { diamond: true as const } : {}) }
    const rectAngle = !classBox && !inkBox && !hldShapeKept(value) ? sanitizeAngle(value.angle) : undefined
    if (rectAngle !== undefined) rectangle.angle = rectAngle
    // Hand-drawn style seed and fill colour: only on shapes that can carry them (not service, class boxes or ink class boxes).
    const sketchable = !classBox && (!inkBox || value.hldShape === 'database' || value.hldShape === 'queue')
    if (sketchable && typeof value.seed === 'number' && Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 4294967295) rectangle.seed = value.seed
    if (sketchable && isColor(value.fillColor)) rectangle.fillColor = value.fillColor
    // Line style: plain and HLD shapes only (not class boxes or ink class boxes).
    if (!classBox && (!inkBox || rectangle.hldShape) && (value.dash === 'dashed' || value.dash === 'dotted')) rectangle.dash = value.dash
    return rectangle
  }
  if (value.kind === 'text') {
    if (!isNum(value.x) || !isNum(value.y) || !isNum(value.width) || !isNum(value.height) || value.width < 0 || value.height < 0) return null
    if (typeof value.text !== 'string' || !isColor(value.color) || !isNum(value.fontSize) || value.fontSize < MIN_FONT_SIZE || value.fontSize > MAX_FONT_SIZE) return null
    const text: TextObject = { kind: 'text', id: value.id, x: value.x, y: value.y, width: value.width, height: value.height, text: value.text.replace(/\u0000/g, '').slice(0, MAX_TEXT_LENGTH), fontSize: value.fontSize, color: value.color, ...(TEXT_FONT_KINDS.includes(value.fontFamily as string) ? { fontFamily: value.fontFamily as TextFontId } : {}) }
    const textAngle = sanitizeAngle(value.angle)
    if (textAngle !== undefined) text.angle = textAngle
    if (value.align === 'center' || value.align === 'right') text.align = value.align
    if (value.fit === 'off' || (value.fit === 'wrap' && value.width > 0)) text.fit = value.fit
    return text
  }
  if (value.kind === 'code') {
    if (!isNum(value.x) || !isNum(value.y) || !isNum(value.width) || !isNum(value.height) || value.width < 0 || value.height < 0) return null
    if (typeof value.text !== 'string') return null
    const fontSize = isNum(value.fontSize) && clampCodeFontSize(value.fontSize) !== DEFAULT_CODE_FONT_SIZE ? clampCodeFontSize(value.fontSize) : undefined
    const code: CodeObject = { kind: 'code', id: value.id, x: value.x, y: value.y, width: value.width, height: value.height, text: normalizeCodeText(value.text.slice(0, MAX_CODE_LENGTH * 2)), language: cleanCodeLanguage(value.language), ...(value.theme === 'dark' ? { theme: 'dark' as const } : {}), ...(fontSize !== undefined ? { fontSize } : {}) }
    return code
  }
  if (value.kind === 'connector') {
    const start = sanitizePoint(value.start)
    const end = sanitizePoint(value.end)
    if (!start || !end || !isColor(value.strokeColor) || !isNum(value.strokeWidth) || value.strokeWidth <= 0) return null
    const relationshipType = RELATIONSHIPS.includes(value.relationshipType as ConnectorRelationshipType) ? (value.relationshipType as ConnectorRelationshipType) : 'association'
    const startAttachment = sanitizeAttachment(value.startAttachment)
    const endAttachment = sanitizeAttachment(value.endAttachment)
    const connector: ConnectorObject = {
      kind: 'connector', id: value.id, start, end, strokeColor: value.strokeColor, strokeWidth: value.strokeWidth,
      relationshipType, reversed: value.reversed === true,
      ...(value.routing === 'elbow' ? { routing: 'elbow' as const } : {}),
      ...(isNum(value.bend) && value.bend !== 0 ? { bend: Math.max(-MAX_CONNECTOR_BEND, Math.min(MAX_CONNECTOR_BEND, value.bend)) } : {}),
      ...(value.dash === 'dashed' || value.dash === 'dotted' || value.dash === 'solid' ? { dash: value.dash } : {}),
      ...(startAttachment ? { startAttachment } : {}),
      ...(endAttachment ? { endAttachment } : {}),
      ...(cleanConnectorLabel(value.label) !== undefined ? { label: cleanConnectorLabel(value.label) } : {}),
      ...(cleanConnectorLabelFontSize(value.labelFontSize) !== undefined ? { labelFontSize: cleanConnectorLabelFontSize(value.labelFontSize) } : {}),
      ...(cleanConnectorLabel(value.label) !== undefined && cleanConnectorLabelPosition(value.labelPosition) !== undefined ? { labelPosition: cleanConnectorLabelPosition(value.labelPosition) } : {}),
    }
    return connector
  }
  return opaqueItem(value)
}

/** Largest text an unknown item may take in the file; a bigger or unserialisable one (cycle, absurd nesting) is dropped and counted. */
const MAX_OPAQUE_JSON = 1_000_000
/** The JSON text of each unknown item, made once when it is read (items are never edited), so saving does not serialise it again. */
const opaqueJson = new WeakMap<object, string>()

/** An item of a kind this version does not know (it needs a string kind and the numeric id checked above): kept as it was read, with its box when it has a finite one. */
function opaqueItem(value: Record<string, unknown>): OpaqueObject | null {
  if (typeof value.kind !== 'string' || KNOWN_KINDS.includes(value.kind)) return null
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    return null
  }
  if (typeof text !== 'string' || text.length > MAX_OPAQUE_JSON) return null
  const hasBox = isNum(value.x) && isNum(value.y) && isNum(value.width) && isNum(value.height) && value.width >= 0 && value.height >= 0
  const item: OpaqueObject = { kind: 'opaque', id: value.id as number, box: hasBox ? { x: value.x as number, y: value.y as number, width: value.width as number, height: value.height as number } : null, raw: value }
  opaqueJson.set(item, text)
  // Fallback only: stringifyDocument writes the cached text above. A non-enumerable toJSON keeps JSON.stringify(item) writing the raw data (it would not survive a spread, but items of this kind are never spread: the model shares them as they are).
  Object.defineProperty(item, 'toJSON', { value: () => value, enumerable: false })
  return item
}

function dropDuplicateIds(items: CanvasItem[]): CanvasItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.kind === 'opaque' ? `opaque:${String(item.raw.kind)}:${item.id}` : `${item.kind}:${item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** A connector whose rectangle no longer exists keeps its geometry but loses the dangling attachment. */
function repairAttachments(items: CanvasItem[]): CanvasItem[] {
  const rectangleIds = new Set(items.filter((item) => item.kind === 'rectangle').map((item) => item.id))
  return items.map((item) => {
    if (item.kind !== 'connector') return item
    const startOk = !item.startAttachment || rectangleIds.has(item.startAttachment.rectangleId)
    const endOk = !item.endAttachment || rectangleIds.has(item.endAttachment.rectangleId)
    if (startOk && endOk) return item
    const { startAttachment, endAttachment, ...rest } = item
    return { ...rest, ...(startOk && startAttachment ? { startAttachment } : {}), ...(endOk && endAttachment ? { endAttachment } : {}) }
  })
}

function cloneItem(item: CanvasItem): CanvasItem {
  if (item.kind === 'opaque') return item // never edited, so shared as it is
  if (item.kind === 'stroke') return { ...item, points: item.points.map((point) => ({ ...point })) }
  if (item.kind === 'rectangle' && (item.classBox || item.inkBox)) {
    return {
      ...item,
      ...(item.classBox ? { classBox: { ...item.classBox } } : {}),
      ...(item.inkBox ? { inkBox: { ...item.inkBox, ink: item.inkBox.ink.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })) } } : {}),
    }
  }
  if (item.kind === 'connector') {
    return {
      ...item,
      start: { ...item.start },
      end: { ...item.end },
      ...(item.startAttachment ? { startAttachment: { ...item.startAttachment } } : {}),
      ...(item.endAttachment ? { endAttachment: { ...item.endAttachment } } : {}),
    }
  }
  return { ...item }
}
