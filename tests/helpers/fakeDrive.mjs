/** In-memory stand-in for the Google Drive v3 REST API (appDataFolder space), enough for the InkPad backend. */
export class FakeDrive {
  constructor() {
    this.files = new Map()
    this.next = 1
    this.clock = 1000
    this.calls = []
    this.tokens = []
    this.failNextWith = null // status code to return once
  }
  tick() { this.clock += 1000; return new Date(this.clock).toISOString() }
  // Real Drive reports the real root id, not the "appDataFolder" alias, as the parent of top-level files.
  parents(list) { return (list ?? ['appDataFolder']).map((p) => (p === 'appDataFolder' ? 'ROOTID' : p)) }
  add(meta, content = '') {
    const id = `id${this.next++}`
    this.files.set(id, { id, name: meta.name, mimeType: meta.mimeType ?? 'application/json', parents: this.parents(meta.parents), modifiedTime: this.tick(), appProperties: meta.appProperties ?? {}, content })
    return this.files.get(id)
  }
  pick(file, fields) {
    const wanted = (fields ?? 'id,name,mimeType,parents,modifiedTime,appProperties').replace(/^nextPageToken,files\((.*)\)$/, '$1').split(',')
    const out = {}
    for (const key of wanted) if (key in file) out[key] = file[key]
    return out
  }
  fetch = async (url, init = {}) => {
    const u = new URL(url)
    const method = init.method ?? 'GET'
    this.calls.push(`${method} ${u.pathname}`)
    this.tokens.push(init.headers?.Authorization)
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
    if (this.failNextWith) { const status = this.failNextWith; this.failNextWith = null; return json({}, status) }
    const upload = u.pathname.startsWith('/upload/drive/v3/files')
    const base = upload ? '/upload/drive/v3/files' : '/drive/v3/files'
    const rest = u.pathname.slice(base.length).replace(/^\//, '')
    const fields = u.searchParams.get('fields')
    if (!rest && method === 'GET') {
      if (u.searchParams.get('spaces') !== 'appDataFolder') return json({}, 400)
      return json({ files: [...this.files.values()].map((f) => this.pick(f, fields)) })
    }
    if (!rest && method === 'POST' && !upload) {
      const meta = JSON.parse(init.body)
      return json(this.pick(this.add(meta), fields))
    }
    if (!rest && method === 'POST' && upload) {
      const { meta, content } = parseMultipart(init)
      return json(this.pick(this.add(meta, content), fields))
    }
    const [id, action] = rest.split('/')
    const file = this.files.get(id)
    if (!file) return json({}, 404)
    if (action === 'copy') {
      const meta = JSON.parse(init.body)
      return json(this.pick(this.add({ ...meta, mimeType: file.mimeType, appProperties: file.appProperties }, file.content), fields))
    }
    if (method === 'GET') {
      if (u.searchParams.get('alt') === 'media') return new Response(file.content, { status: 200 })
      return json(this.pick(file, fields))
    }
    if (method === 'DELETE') { this.files.delete(id); return new Response(null, { status: 204 }) }
    if (method === 'PATCH' && upload) {
      const { meta, content } = parseMultipart(init)
      Object.assign(file, { name: meta.name ?? file.name, appProperties: mergeProperties(file.appProperties, meta.appProperties), content, modifiedTime: this.tick() })
      return json(this.pick(file, fields))
    }
    if (method === 'PATCH') {
      const add = u.searchParams.get('addParents')
      const remove = u.searchParams.get('removeParents')
      if (add) file.parents = [...file.parents.filter((p) => !(remove ?? '').split(',').includes(p)), ...this.parents([add])]
      const meta = init.body ? JSON.parse(init.body) : {}
      if (meta.name) file.name = meta.name
      // like real Drive: app properties merge key by key, null deletes a key; treat it as a change of the file
      if (meta.appProperties) { file.appProperties = mergeProperties(file.appProperties, meta.appProperties); file.modifiedTime = this.tick() }
      return json(this.pick(file, fields))
    }
    return json({}, 400)
  }
  /** Simulates another device editing a file. */
  editElsewhere(id, content) {
    const file = this.files.get(id)
    file.content = content
    file.modifiedTime = this.tick()
  }
}

function mergeProperties(current = {}, changes) {
  if (!changes) return current
  const next = { ...current }
  for (const [key, value] of Object.entries(changes)) { if (value === null) delete next[key]; else next[key] = value }
  return next
}

function parseMultipart(init) {
  const boundary = /boundary=(.+)$/.exec(init.headers['Content-Type'])[1]
  const parts = init.body.split(`--${boundary}`).filter((part) => part.trim() && part.trim() !== '--')
  const body = (part) => part.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '')
  return { meta: JSON.parse(body(parts[0])), content: body(parts[1]) }
}

export function tree(drive) {
  const byId = new Map([...drive.files.values()].map((f) => [f.id, f]))
  const path = (f) => {
    const parent = f.parents.map((p) => byId.get(p)).find(Boolean)
    const prefix = parent ? `${path(parent)}` : ''
    return `${prefix}${f.name}${f.mimeType.includes('folder') ? '/' : ''}`
  }
  return [...byId.values()].map(path).sort()
}
