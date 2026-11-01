/** In-memory stand-in for a File System Access directory, used to test the device-folder backend in Node. */
class NotFound extends Error { constructor(name) { super(`not found: ${name}`); this.name = 'NotFoundError' } }
class Mismatch extends Error { constructor(name) { super(`type mismatch: ${name}`); this.name = 'TypeMismatchError' } }

export class FakeFile {
  constructor(name) { this.kind = 'file'; this.name = name; this.content = new Blob([''], { type: 'text/plain' }); this.modified = Date.now() }
  async getFile() { return new File([this.content], this.name, { lastModified: this.modified }) }
  async createWritable() {
    const chunks = []
    return {
      write: async (data) => { chunks.push(data) },
      close: async () => { this.content = new Blob(chunks); this.modified += 1 },
    }
  }
}

export class FakeDirectory {
  constructor(name = 'root') { this.kind = 'directory'; this.name = name; this.children = new Map() }
  async getDirectoryHandle(name, { create = false } = {}) {
    const existing = this.children.get(name)
    if (existing) { if (existing.kind !== 'directory') throw new Mismatch(name); return existing }
    if (!create) throw new NotFound(name)
    const dir = new FakeDirectory(name); this.children.set(name, dir); return dir
  }
  async getFileHandle(name, { create = false } = {}) {
    const existing = this.children.get(name)
    if (existing) { if (existing.kind !== 'file') throw new Mismatch(name); return existing }
    if (!create) throw new NotFound(name)
    const file = new FakeFile(name); this.children.set(name, file); return file
  }
  async removeEntry(name, { recursive = false } = {}) {
    const existing = this.children.get(name)
    if (!existing) throw new NotFound(name)
    if (existing.kind === 'directory' && existing.children.size > 0 && !recursive) throw new Error('not empty')
    this.children.delete(name)
  }
  async *entries() { for (const entry of [...this.children.entries()]) yield entry }
}

/** Lists the whole tree as sorted relative paths ("LLD/", "LLD/a.inkpad") for easy assertions. */
export function treeOf(dir, prefix = '') {
  const out = []
  for (const [name, handle] of dir.children) {
    if (handle.kind === 'directory') { out.push(`${prefix}${name}/`); out.push(...treeOf(handle, `${prefix}${name}/`)) } else out.push(`${prefix}${name}`)
  }
  return out.sort()
}
