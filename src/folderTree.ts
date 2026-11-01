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
