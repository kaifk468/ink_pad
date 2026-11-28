import { DEFAULT_DOCUMENT_TITLE } from './documentFormat'
import type { DocumentSummary, FolderRecord } from './documentStore'
import { folderAndDescendantIds, folderPath } from './folderTree'
import type { PageTemplate } from './pageTemplates'

export type LibraryQuery = {
  /** Text to look for in the diagram title or its folder path. */
  query: string
  /** null = every diagram; otherwise that folder and everything below it. */
  folderId: string | null
  /** When given, only these diagrams (the Starred view). */
  onlyIds?: ReadonlySet<string>
}

export type LibraryLayout = 'grid' | 'list'
export type LibrarySort = 'edited' | 'name' | 'created'
export const LIBRARY_SORTS: readonly { id: LibrarySort; label: string }[] = [
  { id: 'edited', label: 'Last edited' },
  { id: 'name', label: 'Name' },
  { id: 'created', label: 'Created' },
]

/** Reads a remembered sort choice; anything unknown means the default (Last edited). */
export function parseLibrarySort(value: unknown): LibrarySort {
  return value === 'name' || value === 'created' ? value : 'edited'
}

export type NewDiagramPreset = { id: string; label: string; hint: string; template: PageTemplate }

/** Starting sheets offered by "+ New diagram". Only the page style changes; sheet colour and line spacing stay as the person set them. */
export const NEW_DIAGRAM_PRESETS: readonly NewDiagramPreset[] = [
  { id: 'dot-grid', label: 'Dot grid', hint: 'Class boxes and connectors for LLD and HLD', template: 'dotted' },
  { id: 'lined', label: 'Lined notes', hint: 'Ruled lines for handwriting', template: 'lined' },
  { id: 'blank', label: 'Blank', hint: 'A plain sheet', template: 'blank' },
]

function time(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : -Infinity
}

/** Folder names from the top down, e.g. "System Design / LLD". Empty for the top level or an unknown folder. */
export function folderLabel(folders: FolderRecord[], folderId: string | null): string {
  return folderPath(folders, folderId).map((folder) => folder.name).join(' / ')
}

/** Diagrams that match the search and the chosen folder, newest edit first. Never changes the input. */
export function searchLibrary(library: DocumentSummary[], folders: FolderRecord[], { query, folderId, onlyIds }: LibraryQuery): DocumentSummary[] {
  const inside = folderId ? new Set(folderAndDescendantIds(folders, folderId)) : null
  const known = new Set(folders.map((folder) => folder.id))
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return library
    .filter((entry) => (inside ? entry.folderId !== null && inside.has(entry.folderId) : true))
    .filter((entry) => (onlyIds ? onlyIds.has(entry.id) : true))
    .filter((entry) => {
      if (words.length === 0) return true
      const text = `${entry.title || 'Untitled diagram'} ${folderLabel(folders, entry.folderId && known.has(entry.folderId) ? entry.folderId : null)}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
}

function isUntitled(entry: DocumentSummary): boolean {
  const title = entry.title.trim()
  return !title || title.toLowerCase() === DEFAULT_DOCUMENT_TITLE.toLowerCase()
}

/**
 * Orders diagrams. 'edited': newest edit first. 'name': A to Z, locale-aware and case-insensitive, untitled diagrams last.
 * 'created': newest first by the created time the storage reports (browser and device storage and Google Drive do); a diagram whose
 * created time is unknown (older browser records not saved since) uses its last-edited time instead. Ties fall back to last edited,
 * so the order is stable. Never changes the input.
 */
export function sortLibrary(entries: DocumentSummary[], sort: LibrarySort): DocumentSummary[] {
  const edited = (a: DocumentSummary, b: DocumentSummary) => time(b.updatedAt) - time(a.updatedAt)
  const created = (entry: DocumentSummary) => {
    const stamp = entry.createdAt ? time(entry.createdAt) : -Infinity
    return stamp === -Infinity ? time(entry.updatedAt) : stamp
  }
  const compare = (a: DocumentSummary, b: DocumentSummary): number => {
    if (sort === 'name') {
      const ua = isUntitled(a)
      const ub = isUntitled(b)
      if (ua !== ub) return ua ? 1 : -1
      if (!ua) {
        const byName = a.title.trim().localeCompare(b.title.trim(), undefined, { sensitivity: 'base', numeric: true })
        if (byName !== 0) return byName
      }
    } else if (sort === 'created') {
      const ca = created(a)
      const cb = created(b)
      if (ca !== cb) return ca === -Infinity ? 1 : cb === -Infinity ? -1 : cb - ca
    }
    return edited(a, b)
  }
  return entries.slice().sort(compare)
}

/** The Recent row appears only when the library has more than this many diagrams. */
export const RECENT_MIN_LIBRARY = 3
export const RECENT_COUNT = 6

/** The n most recently edited diagrams (unknown dates last). Never changes the input. */
export function recentDiagrams(library: DocumentSummary[], n: number = RECENT_COUNT): DocumentSummary[] {
  return library.slice().sort((a, b) => time(b.updatedAt) - time(a.updatedAt)).slice(0, Math.max(0, n))
}

/** How many diagrams are in a folder, counting its subfolders. */
export function countInFolder(library: DocumentSummary[], folders: FolderRecord[], folderId: string): number {
  const ids = new Set(folderAndDescendantIds(folders, folderId))
  return library.filter((entry) => entry.folderId !== null && ids.has(entry.folderId)).length
}

/** "Just now", "12 mins ago", "2 hours ago", "Yesterday", "3 days ago", then a plain date. Empty when the time is unknown. */
export function describeEdited(updatedAt: string, now: number = Date.now()): string {
  const stamp = Date.parse(updatedAt)
  if (!Number.isFinite(stamp)) return ''
  const minutes = Math.floor((now - stamp) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(stamp).toLocaleDateString()
}

/** True when the whole Library holds nothing (top level, no search, not the Starred view): desktop shows the welcoming empty state there. */
export function showLibraryWelcome(input: { shown: number; inFolder: boolean; searching: boolean; starredView: boolean }): boolean {
  return input.shown === 0 && !input.inFolder && !input.searching && !input.starredView
}
