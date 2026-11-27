import type { DocumentSummary, FolderRecord } from './documentStore'

export const MAX_FOLDER_NAME_LENGTH = 60
export const DEFAULT_FOLDER_NAME = 'New folder'

export function cleanFolderName(name: string): string {
  const cleaned = name.replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME_LENGTH)
  return cleaned || DEFAULT_FOLDER_NAME
}

export function childFolders(folders: FolderRecord[], parentId: string | null): FolderRecord[] {
  return folders
    .filter((folder) => (folder.parentId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** The folder itself plus every folder below it. Tolerates broken parent links and cycles. */
export function folderAndDescendantIds(folders: FolderRecord[], id: string): string[] {
  const result = [id]
  const seen = new Set(result)
  for (let index = 0; index < result.length; index += 1) {
    for (const folder of folders) {
      if (folder.parentId === result[index] && !seen.has(folder.id)) {
        seen.add(folder.id)
        result.push(folder.id)
      }
    }
  }
  return result
}

export function diagramsInFolder(library: DocumentSummary[], folderId: string | null, folders: FolderRecord[]): DocumentSummary[] {
  const known = new Set(folders.map((folder) => folder.id))
  // A diagram whose folder no longer exists is shown at the top level rather than lost.
  return library.filter((entry) => (entry.folderId && known.has(entry.folderId) ? entry.folderId : null) === folderId)
}

/** Root-first path of folders leading to id (empty for the top level or an unknown id). */
export function folderPath(folders: FolderRecord[], id: string | null): FolderRecord[] {
  const path: FolderRecord[] = []
  const seen = new Set<string>()
  let current = id ? folders.find((folder) => folder.id === id) : undefined
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId ? folders.find((folder) => folder.id === current!.parentId) : undefined
  }
  return path
}

/** Every folder in tree order with its depth, for the "Move to" picker. */
export function flattenFolders(folders: FolderRecord[]): Array<{ folder: FolderRecord; depth: number }> {
  const out: Array<{ folder: FolderRecord; depth: number }> = []
  const visit = (parentId: string | null, depth: number, guard: Set<string>) => {
    for (const folder of childFolders(folders, parentId)) {
      if (guard.has(folder.id)) continue
      const next = new Set(guard).add(folder.id)
      out.push({ folder, depth })
      visit(folder.id, depth + 1, next)
    }
  }
  visit(null, 0, new Set())
  return out
}

export type FolderMoveRefusal = 'missing' | 'missing-target' | 'self' | 'inside' | 'same-parent' | 'name-clash'
export type FolderMoveDecision = { ok: true } | { ok: false; reason: FolderMoveRefusal }

/** The folder a folder really sits in: a parent id that is not a known folder counts as the top level. */
function effectiveParent(folders: FolderRecord[], folder: FolderRecord): string | null {
  return folder.parentId && folders.some((entry) => entry.id === folder.parentId) ? folder.parentId : null
}

/**
 * Whether a folder may be moved under parentId (null = top level). Refused: into itself or one of its own subfolders (a cycle),
 * onto the folder it is already in (nothing to do), to a folder that does not exist, and where a sibling of the same name
 * (ignoring case) already exists.
 */
export function canMoveFolder(folders: FolderRecord[], id: string, parentId: string | null): FolderMoveDecision {
  const folder = folders.find((entry) => entry.id === id)
  if (!folder) return { ok: false, reason: 'missing' }
  if (parentId === id) return { ok: false, reason: 'self' }
  if (parentId !== null) {
    if (!folders.some((entry) => entry.id === parentId)) return { ok: false, reason: 'missing-target' }
    if (folderAndDescendantIds(folders, id).includes(parentId)) return { ok: false, reason: 'inside' }
  }
  if (effectiveParent(folders, folder) === parentId) return { ok: false, reason: 'same-parent' }
  const name = folder.name.toLowerCase()
  if (folders.some((entry) => entry.id !== id && effectiveParent(folders, entry) === parentId && entry.name.toLowerCase() === name)) return { ok: false, reason: 'name-clash' }
  return { ok: true }
}

/** Why a move was refused, as a sentence for a notice. */
export function folderMoveRefusalText(reason: FolderMoveRefusal, name: string): string {
  switch (reason) {
    case 'missing': return 'That folder no longer exists.'
    case 'missing-target': return 'The folder to move into no longer exists.'
    case 'self': return 'A folder cannot be moved into itself.'
    case 'inside': return `“${name}” cannot be moved into one of its own subfolders.`
    case 'same-parent': return `“${name}” is already there.`
    case 'name-clash': return `That place already has a folder named “${name}”.`
  }
}

/**
 * Where the "Move to…" picker offers a folder: the top level (folder null, depth 0) and every folder that is not the folder itself,
 * not inside it, and not the one it already sits in. A target where the name would clash is still listed; the move then explains.
 */
export function folderMoveTargets(folders: FolderRecord[], id: string): Array<{ folder: FolderRecord | null; depth: number }> {
  const moving = folders.find((entry) => entry.id === id)
  if (!moving) return []
  const excluded = new Set(folderAndDescendantIds(folders, id))
  const current = effectiveParent(folders, moving)
  const out: Array<{ folder: FolderRecord | null; depth: number }> = []
  if (current !== null) out.push({ folder: null, depth: 0 })
  for (const { folder, depth } of flattenFolders(folders)) {
    if (!excluded.has(folder.id) && folder.id !== current) out.push({ folder, depth })
  }
  return out
}
