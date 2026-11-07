import type { DocumentSummary, FolderRecord } from './documentStore'
import { folderAndDescendantIds, folderPath } from './folderTree'
import type { PageTemplate } from './pageTemplates'

export type LibraryQuery = {
  /** Text to look for in the diagram title or its folder path. */
  query: string
  /** null = every diagram; otherwise that folder and everything below it. */
  folderId: string | null
}

export type LibraryLayout = 'grid' | 'list'

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
export function searchLibrary(library: DocumentSummary[], folders: FolderRecord[], { query, folderId }: LibraryQuery): DocumentSummary[] {
  const inside = folderId ? new Set(folderAndDescendantIds(folders, folderId)) : null
  const known = new Set(folders.map((folder) => folder.id))
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return library
    .filter((entry) => (inside ? entry.folderId !== null && inside.has(entry.folderId) : true))
    .filter((entry) => {
      if (words.length === 0) return true
      const text = `${entry.title || 'Untitled diagram'} ${folderLabel(folders, entry.folderId && known.has(entry.folderId) ? entry.folderId : null)}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
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
