import { canvasItemKey, getCanvasSelectionBounds, type CanvasItem, type RectangleObject, type Stroke } from './canvasModel'
import { sanitizeItem } from './documentFormat'

/**
 * "My templates": groups of items the user saved from a selection, kept in localStorage on this device only (never in a diagram file).
 * Items use the same JSON as the document format and are sanitized on load (a damaged entry is dropped, never a crash).
 * Pure module: the localStorage adapters at the bottom take an optional storage and swallow every storage error.
 */
export const USER_TEMPLATES_KEY = 'inkpad.userTemplates'
export const USER_TEMPLATES_VERSION = 1
export const MAX_TEMPLATE_NAME_LENGTH = 60
export const MAX_USER_TEMPLATES = 30
export const MAX_TEMPLATE_BYTES = 300 * 1024
export const MAX_TEMPLATES_TOTAL_BYTES = 1.5 * 1024 * 1024

export type UserTemplate = { id: string; name: string; createdAt: string; items: CanvasItem[] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const byteLength = (text: string): number => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length)

export function cleanTemplateName(name: unknown): string {
  return typeof name === 'string' ? name.trim() : ''
}

export function serializeUserTemplates(templates: readonly UserTemplate[]): string {
  return JSON.stringify({ version: USER_TEMPLATES_VERSION, templates })
}

export const TEMPLATES_FROM_NEWER_VERSION = 'Templates saved by another InkPad version: update InkPad first'

type StoredTemplates = { templates: UserTemplate[]; /** Stored entries that could not be read here; saving writes them back unchanged. */ unreadable: unknown[]; /** Stored text exists but is not a version 1 template list. */ blocked: boolean }

function readStored(text: string | null | undefined): StoredTemplates {
  if (!text) return { templates: [], unreadable: [], blocked: false }
  let data: unknown
  try { data = JSON.parse(text) } catch { return { templates: [], unreadable: [], blocked: true } }
  if (!isRecord(data) || data.version !== USER_TEMPLATES_VERSION || !Array.isArray(data.templates)) return { templates: [], unreadable: [], blocked: true }
  const templates: UserTemplate[] = []
  const unreadable: unknown[] = []
  const seen = new Set<string>()
  for (const raw of data.templates) {
    if (templates.length >= MAX_USER_TEMPLATES) { unreadable.push(raw); continue }
    if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '' || seen.has(raw.id) || !Array.isArray(raw.items)) { unreadable.push(raw); continue }
    const name = cleanTemplateName(raw.name)
    if (name === '' || name.length > MAX_TEMPLATE_NAME_LENGTH) { unreadable.push(raw); continue }
    let items: CanvasItem[]
    try { items = raw.items.map((item) => sanitizeItem(item)).filter((item): item is CanvasItem => item !== null && item.kind !== 'opaque') } catch { unreadable.push(raw); continue }
    if (items.length === 0) { unreadable.push(raw); continue }
    seen.add(raw.id)
    templates.push({ id: raw.id, name, createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '', items })
  }
  return { templates, unreadable, blocked: false }
}

/** The stored list; anything unreadable gives an empty list, and a damaged template or item is left out of it (saving keeps it in storage). */
export function parseUserTemplates(text: string | null | undefined): UserTemplate[] {
  return readStored(text).templates
}

const shiftStroke = (stroke: Stroke, dx: number, dy: number): Stroke => ({ ...stroke, points: stroke.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })) })

/**
 * Items ready to store: opaque (unknown-kind) items left out and counted, the top-left of the bounding box moved to (0, 0) with relative
 * positions kept, locks removed, connector attachments kept only to boxes inside the set (the end point stays where it was). Group ids are kept.
 */
export function normalizeTemplateItems(items: readonly CanvasItem[]): { items: CanvasItem[]; omitted: number } {
  const usable = items.filter((item): item is Exclude<CanvasItem, { kind: 'opaque' }> => item.kind !== 'opaque')
  const omitted = items.length - usable.length
  if (usable.length === 0) return { items: [], omitted }
  const bounds = getCanvasSelectionBounds([...usable], new Set(usable.map(canvasItemKey)))
  const dx = bounds ? -bounds.x : 0
  const dy = bounds ? -bounds.y : 0
  const rectangleIds = new Set(usable.filter((item): item is RectangleObject => item.kind === 'rectangle').map((item) => item.id))
  const moved = usable.map((item): CanvasItem => {
    const { locked: _locked, ...base } = item
    void _locked
    const plain = base as typeof item
    if (plain.kind === 'rectangle') {
      const copy: RectangleObject = { ...plain, x: plain.x + dx, y: plain.y + dy }
      if (plain.inkBox) copy.inkBox = { top: plain.inkBox.top + dy, mid: plain.inkBox.mid + dy, ink: plain.inkBox.ink.map((stroke) => shiftStroke(stroke, dx, dy)) }
      return copy
    }
    if (plain.kind === 'text' || plain.kind === 'code') return { ...plain, x: plain.x + dx, y: plain.y + dy }
    if (plain.kind === 'connector') {
      const { routedPath: _routed, startAttachment, endAttachment, ...rest } = plain
      void _routed
      const copy = { ...rest, start: { ...plain.start, x: plain.start.x + dx, y: plain.start.y + dy }, end: { ...plain.end, x: plain.end.x + dx, y: plain.end.y + dy } }
      if (startAttachment && rectangleIds.has(startAttachment.rectangleId)) Object.assign(copy, { startAttachment })
      if (endAttachment && rectangleIds.has(endAttachment.rectangleId)) Object.assign(copy, { endAttachment })
      return copy
    }
    return shiftStroke(plain, dx, dy)
  })
  return { items: moved, omitted }
}

export type AddTemplateResult = { ok: true; templates: UserTemplate[]; template: UserTemplate; omitted: number } | { ok: false; message: string }

/** Adds a template to the list (new one first), or says plainly why not (name, count, size limits). */
export function addUserTemplate(templates: readonly UserTemplate[], name: string, items: readonly CanvasItem[], id: string, now: string): AddTemplateResult {
  const clean = cleanTemplateName(name)
  if (clean === '') return { ok: false, message: 'Give the template a name.' }
  if (clean.length > MAX_TEMPLATE_NAME_LENGTH) return { ok: false, message: `The name can have at most ${MAX_TEMPLATE_NAME_LENGTH} characters.` }
  if (templates.length >= MAX_USER_TEMPLATES) return { ok: false, message: `You can keep at most ${MAX_USER_TEMPLATES} templates. Delete one first.` }
  const normalized = normalizeTemplateItems(items)
  if (normalized.items.length === 0) return { ok: false, message: 'Nothing to save: these items cannot be saved in a template.' }
  const template: UserTemplate = { id, name: clean, createdAt: now, items: normalized.items }
  if (byteLength(JSON.stringify(template)) > MAX_TEMPLATE_BYTES) return { ok: false, message: `The selection is too large for a template (limit ${MAX_TEMPLATE_BYTES / 1024} KB). Select less, or fewer pen strokes.` }
  const next = [template, ...templates]
  if (byteLength(serializeUserTemplates(next)) > MAX_TEMPLATES_TOTAL_BYTES) return { ok: false, message: 'Your saved templates would take too much space on this device. Delete one first.' }
  return { ok: true, templates: next, template, omitted: normalized.omitted }
}

export function removeUserTemplate(templates: readonly UserTemplate[], id: string): UserTemplate[] {
  return templates.filter((template) => template.id !== id)
}

export function newTemplateId(now = Date.now(), random = Math.random()): string {
  return `t${now.toString(36)}${Math.floor(random * 36 ** 4).toString(36)}`
}

function defaultStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function loadUserTemplates(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): UserTemplate[] {
  try { return parseUserTemplates(storage?.getItem(USER_TEMPLATES_KEY)) } catch { return [] }
}

/** A message when saving or deleting would overwrite stored templates this version cannot read (another version's format); null when it is safe. */
export function userTemplatesBlockedMessage(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): string | null {
  try { return readStored(storage?.getItem(USER_TEMPLATES_KEY)).blocked ? TEMPLATES_FROM_NEWER_VERSION : null } catch { return null }
}

/** True when the list was stored. Refuses (false) to overwrite a stored list in an unknown format; entries of a readable list that this version could not read are written back unchanged. */
export function saveUserTemplates(templates: readonly UserTemplate[], storage: Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'getItem'>> | null = defaultStorage()): boolean {
  if (!storage) return false
  try {
    const stored = readStored(storage.getItem?.(USER_TEMPLATES_KEY))
    if (stored.blocked) return false
    const text = stored.unreadable.length === 0 ? serializeUserTemplates(templates) : JSON.stringify({ version: USER_TEMPLATES_VERSION, templates: [...templates, ...stored.unreadable] })
    storage.setItem(USER_TEMPLATES_KEY, text)
    return true
  } catch { return false }
}
