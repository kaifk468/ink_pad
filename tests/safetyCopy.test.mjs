import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const format = await loadModule('documentFormat.ts')
const safety = await loadModule('safetyCopy.ts')

const rect = (id) => ({ kind: 'rectangle', id, x: 1, y: 2, width: 30, height: 40, strokeColor: '#000', strokeWidth: 2 })
const textOf = (title, n) => format.stringifyDocument(format.createDocument({ title, template: 'lined', background: 'warm', items: Array.from({ length: n }, (_, i) => rect(i + 1)) }, '2026-01-01T00:00:00.000Z'))

function fakeStorage() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map }
}

/** A keeper wired to fake timers, a fake clock and a mutable "app" the tests drive. */
function setup(shared = {}) {
  const store = shared.store ?? safety.createMemorySafetyStore()
  const storage = shared.storage ?? fakeStorage()
  const app = { kind: 'drive', docId: null, folderId: null, n: 0, title: 'Sketch', active: false, backend: null }
  let clock = 1000
  const timers = []
  const keeper = safety.createSafetyKeeper({
    store,
    setTimeout: (fn, ms) => { const t = { fn, at: clock + ms, live: true }; timers.push(t); return t },
    clearTimeout: (t) => { if (t) t.live = false },
    now: () => clock,
    pointer: safety.createLocalStoragePointer(storage),
    emergency: safety.createLocalStorageEmergency(storage),
    randomKey: (() => { let i = 0; return () => `r${++i}` })(),
    getKind: () => app.kind,
    getDocId: () => app.docId,
    getFolderId: () => app.folderId,
    hasContent: () => app.n > 0,
    isInputActive: () => app.active,
    signature: () => ({ title: app.title, n: app.n }),
    backendSignature: () => app.backend,
    sameSignature: (a, b) => Boolean(a && b && a.title === b.title && a.n === b.n),
    buildText: () => textOf(app.title, app.n),
  })
  const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setImmediate(r)) }
  const advance = async (ms) => {
    const target = clock + ms
    for (;;) {
      const due = timers.filter((t) => t.live && t.at <= target).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      due.live = false
      clock = Math.max(clock, due.at)
      due.fn()
      await settle()
    }
    clock = target
    await settle()
  }
  return { keeper, store, storage, app, advance, settle, setClock: (v) => { clock = v }, timers }
}

test('a change is stored after the debounce and is dirty', async () => {
  const t = setup()
  t.app.n = 2
  t.keeper.noteChange()
  await t.advance(300)
  assert.equal((await t.store.list()).length, 0)
  await t.advance(200)
  const [record] = await t.store.list()
  assert.equal(record.rev, 1)
  assert.ok(record.rev > record.syncedRev)
  assert.equal(record.docId, null)
  assert.match(record.key, /^drive:new:/)
  assert.equal(format.parseDocument(record.text).ok, true)
})

test('nothing is stored while the pen is down, and it is written once the pen is up', async () => {
  const t = setup()
  t.app.n = 1
  t.app.active = true
  t.keeper.noteChange()
  await t.advance(5000)
  assert.equal((await t.store.list()).length, 0)
  t.app.active = false
  await t.advance(500)
  assert.equal((await t.store.list()).length, 1)
})

test('changes that keep arriving do not postpone the write forever', async () => {
  const t = setup()
  for (let i = 1; i <= 12; i++) {
    t.app.n = i
    t.keeper.noteChange()
    await t.advance(300)
  }
  assert.ok((await t.store.list()).length >= 1)
})

test('reload: a second keeper restores a never-synced diagram with its title and folder', async () => {
  const a = setup()
  a.app.n = 3
  a.app.title = 'Order service'
  a.app.folderId = 'folder-1'
  a.keeper.noteChange()
  await a.advance(500)
  const b = setup({ store: a.store, storage: a.storage })
  const restored = await b.keeper.restore('drive')
  assert.equal(restored.record.docId, null)
  assert.equal(restored.record.folderId, 'folder-1')
  assert.equal(restored.document.title, 'Order service')
  assert.equal(restored.document.items.length, 3)
  assert.equal(await b.keeper.restore('device'), null)
})

test('restore of a diagram with a docId; markSynced makes it clean; an older signature keeps it dirty', async () => {
  const a = setup()
  a.app.docId = 'abc'
  a.app.n = 2
  a.keeper.noteChange()
  await a.advance(500)
  await a.keeper.markSynced({ title: 'Sketch', n: 1 }, 'abc', 'abc')
  assert.equal((await a.keeper.restore('drive')).record.docId, 'abc')
  await a.keeper.markSynced({ title: 'Sketch', n: 2 }, 'abc', 'abc')
  assert.equal(await a.keeper.restore('drive'), null)
  assert.equal(await a.keeper.recordFor('drive', 'abc'), null)
  a.app.n = 3
  a.keeper.noteChange()
  await a.advance(500)
  assert.equal((await a.keeper.recordFor('drive', 'abc')).record.rev, 2)
})

test('a new-key record moves to the real id after the first save', async () => {
  const a = setup()
  a.app.n = 2
  a.keeper.noteChange()
  await a.advance(500)
  a.app.docId = 'file-9'
  await a.keeper.markSynced({ title: 'Sketch', n: 2 }, null, 'file-9')
  const records = await a.store.list()
  assert.equal(records.length, 1)
  assert.equal(records[0].key, 'drive:file-9')
  assert.equal(records[0].docId, 'file-9')
  assert.equal(records[0].syncedRev, records[0].rev)
  assert.equal(a.storage.getItem('inkpad.safety.current.drive'), 'drive:file-9')
  // and a later edit continues from the new key
  a.app.n = 4
  a.keeper.noteChange()
  await a.advance(500)
  assert.equal((await a.store.list()).length, 1)
  assert.equal((await a.store.get('drive:file-9')).rev, 2)
})

test('a device-folder rename moves the record to the new id and keeps it dirty if edited since', async () => {
  const a = setup()
  a.app.kind = 'device'
  a.app.docId = 'Old.inkpad'
  a.app.n = 2
  a.keeper.noteChange()
  await a.advance(500)
  a.app.n = 3
  a.app.docId = 'New.inkpad'
  await a.keeper.markSynced({ title: 'Sketch', n: 2 }, 'Old.inkpad', 'New.inkpad')
  const records = await a.store.list()
  assert.deepEqual(records.map((r) => r.key), ['device:New.inkpad'])
  assert.equal(records[0].docId, 'New.inkpad')
})

test('leftovers are dirty copies other than the current one; forget removes a copy', async () => {
  const a = setup()
  a.app.docId = 'one'
  a.app.n = 1
  await a.keeper.flush()
  await a.keeper.switchTo(null)
  a.app.docId = null
  a.app.n = 2
  await a.keeper.flush()
  const left = await a.keeper.leftovers('drive')
  assert.deepEqual(left.map((l) => l.record.key), ['drive:one'])
  await a.keeper.forget('drive', 'one')
  assert.equal((await a.keeper.leftovers('drive')).length, 0)
  assert.equal(await a.store.get('drive:one'), null)
})

test('an unchanged signature is not rewritten; an empty never-saved sheet is not written', async () => {
  const a = setup()
  a.keeper.noteChange()
  await a.advance(500)
  await a.keeper.flush()
  assert.equal((await a.store.list()).length, 0)
  a.app.n = 1
  await a.keeper.flush()
  await a.keeper.flush()
  a.keeper.noteChange()
  await a.advance(500)
  assert.equal((await a.store.list())[0].rev, 1)
})

test('hasUnstoredChanges', async () => {
  const a = setup()
  assert.equal(a.keeper.hasUnstoredChanges(null), false)
  a.app.n = 1
  assert.equal(a.keeper.hasUnstoredChanges(null), true)
  assert.equal(a.keeper.hasUnstoredChanges({ title: 'Sketch', n: 1 }), false)
  await a.keeper.flush()
  assert.equal(a.keeper.hasUnstoredChanges(null), false)
  a.app.n = 2
  assert.equal(a.keeper.hasUnstoredChanges({ title: 'Sketch', n: 1 }), true)
})

test('an emergency localStorage copy newer than the stored one is restored, and cleared by a newer stored write', async () => {
  const a = setup()
  a.app.n = 1
  await a.keeper.flush()
  a.app.n = 4
  a.keeper.emergencySave()
  assert.ok(a.storage.getItem('inkpad.safety.emergency'))
  const b = setup({ store: a.store, storage: a.storage })
  const restored = await b.keeper.restore('drive')
  assert.equal(restored.document.items.length, 4)
  assert.equal(a.storage.getItem('inkpad.safety.emergency'), null)
  // clearing after a normal write
  const c = setup()
  c.app.n = 2
  c.keeper.emergencySave()
  assert.ok(c.storage.getItem('inkpad.safety.emergency'))
  await c.keeper.flush()
  assert.equal(c.storage.getItem('inkpad.safety.emergency'), null)
})

test('an unparseable record is ignored without throwing', async () => {
  const store = safety.createMemorySafetyStore()
  const storage = fakeStorage()
  await store.put({ key: 'drive:new:x', kind: 'drive', docId: null, folderId: null, text: '{not json', rev: 1, syncedRev: 0, savedAt: '2026-01-01T00:00:00.000Z' })
  storage.setItem('inkpad.safety.current.drive', 'drive:new:x')
  const a = setup({ store, storage })
  assert.equal(await a.keeper.restore('drive'), null)
})

test('fallback without a pointer finds the newest unsaved new diagram', async () => {
  const store = safety.createMemorySafetyStore()
  const base = { kind: 'browser', docId: null, folderId: null, rev: 1, syncedRev: 0 }
  await store.put({ ...base, key: 'browser:new:a', text: textOf('Old', 1), savedAt: '2026-01-01T00:00:00.000Z' })
  await store.put({ ...base, key: 'browser:new:b', text: textOf('Newest', 2), savedAt: '2026-02-01T00:00:00.000Z' })
  const a = setup({ store })
  assert.equal((await a.keeper.restore('browser')).document.title, 'Newest')
})

test('writes wait while held and run after release', async () => {
  const a = setup()
  a.keeper.hold()
  a.app.n = 1
  a.keeper.noteChange()
  await a.advance(1000)
  assert.equal((await a.store.list()).length, 0)
  a.keeper.release()
  await a.settle()
  assert.equal((await a.store.list()).length, 1)
})

const emergencyOf = (storage) => JSON.parse(storage.getItem('inkpad.safety.emergency'))
const putRecord = (store, over) => store.put({ kind: 'drive', docId: null, folderId: null, rev: 1, syncedRev: 0, savedAt: '2026-01-01T00:00:00.000Z', text: textOf('Sketch', 1), key: 'drive:new:x', ...over })

test('a diagram that was only opened (not edited) leaves no dirty record, even after a noteChange', async () => {
  const a = setup()
  a.app.docId = 'abc'
  a.app.n = 2
  a.app.backend = { title: 'Sketch', n: 2 }
  await a.keeper.switchTo('abc')
  a.keeper.noteChange()
  await a.advance(1000)
  await a.keeper.flush()
  a.keeper.emergencySave()
  assert.equal((await a.store.list()).length, 0)
  assert.equal(a.storage.getItem('inkpad.safety.emergency'), null)
  assert.equal(await a.keeper.restore('drive'), null)
  assert.equal((await a.keeper.leftovers('drive')).length, 0)
  assert.equal(a.keeper.hasUnstoredChanges(a.app.backend), false)
})

test('an edit after opening is dirty; editing back to the saved content marks the copy clean', async () => {
  const a = setup()
  a.app.docId = 'abc'
  a.app.n = 2
  a.app.backend = { title: 'Sketch', n: 2 }
  await a.keeper.switchTo('abc')
  a.app.n = 3
  await a.keeper.flush()
  assert.equal((await a.keeper.recordFor('drive', 'abc')).record.rev, 1)
  a.app.n = 2
  await a.keeper.flush()
  assert.equal(await a.keeper.recordFor('drive', 'abc'), null)
  assert.equal((await a.store.get('drive:abc')).syncedRev, 2)
})

test('a never-saved diagram is dirty even when the backend signature happens to match', async () => {
  const a = setup()
  a.app.n = 1
  a.app.backend = { title: 'Sketch', n: 1 }
  await a.keeper.flush()
  assert.equal((await a.store.list())[0].syncedRev, 0)
})

test('a stale emergency copy is cleared by restore and never resurfaces over newer content', async () => {
  const a = setup()
  a.app.docId = 'abc'
  a.app.n = 1
  await a.keeper.flush()
  a.app.n = 2
  a.keeper.emergencySave()
  const old = a.storage.getItem('inkpad.safety.emergency')
  assert.ok(old)
  // the normal write finished later; a new session starts with the leftover emergency text and a newer stored record
  a.setClock(5000)
  a.app.n = 5
  await a.keeper.flush()
  a.storage.setItem('inkpad.safety.emergency', old)
  const b = setup({ store: a.store, storage: a.storage })
  const restored = await b.keeper.restore('drive')
  assert.equal(restored.document.items.length, 5)
  assert.equal(a.storage.getItem('inkpad.safety.emergency'), null)
})

test('a dirty emergency copy of a deleted diagram is not resurrected', async () => {
  const a = setup()
  a.app.docId = 'abc'
  a.app.n = 2
  a.keeper.emergencySave()
  assert.ok(a.storage.getItem('inkpad.safety.emergency'))
  await a.keeper.forget('drive', 'abc')
  assert.equal(a.storage.getItem('inkpad.safety.emergency'), null)
  const b = setup({ store: a.store, storage: a.storage })
  assert.equal(await b.keeper.restore('drive'), null)
})

test('an early-session emergency copy (rev 1) beats a stored rev 5 by save time and continues the revisions', async () => {
  const store = safety.createMemorySafetyStore()
  const storage = fakeStorage()
  await putRecord(store, { key: 'drive:abc', docId: 'abc', rev: 5, syncedRev: 0, savedAt: '2026-01-01T00:00:00.000Z', text: textOf('Sketch', 1) })
  storage.setItem('inkpad.safety.current.drive', 'drive:abc')
  storage.setItem('inkpad.safety.emergency', JSON.stringify({ key: 'drive:abc', kind: 'drive', docId: 'abc', folderId: null, text: textOf('Sketch', 7), rev: 1, syncedRev: 0, savedAt: '2026-03-01T00:00:00.000Z' }))
  const a = setup({ store, storage })
  const restored = await a.keeper.restore('drive')
  assert.equal(restored.document.items.length, 7)
  assert.equal(restored.record.rev, 6)
  assert.equal((await store.get('drive:abc')).rev, 6)
  assert.equal(storage.getItem('inkpad.safety.emergency'), null)
})

test('an emergency copy of another kind is moved into the store and cleared', async () => {
  const store = safety.createMemorySafetyStore()
  const storage = fakeStorage()
  storage.setItem('inkpad.safety.emergency', JSON.stringify({ key: 'device:Foo.inkpad', kind: 'device', docId: 'Foo.inkpad', folderId: null, text: textOf('Foo', 2), rev: 1, syncedRev: 0, savedAt: '2026-03-01T00:00:00.000Z' }))
  const a = setup({ store, storage })
  assert.equal(await a.keeper.restore('drive'), null)
  assert.equal(storage.getItem('inkpad.safety.emergency'), null)
  assert.equal((await store.get('device:Foo.inkpad')).rev, 1)
})

test('an emergency copy older than the stored one is dropped', async () => {
  const store = safety.createMemorySafetyStore()
  const storage = fakeStorage()
  await putRecord(store, { key: 'drive:abc', docId: 'abc', rev: 2, savedAt: '2026-05-01T00:00:00.000Z', text: textOf('Sketch', 3) })
  storage.setItem('inkpad.safety.current.drive', 'drive:abc')
  storage.setItem('inkpad.safety.emergency', JSON.stringify({ key: 'drive:abc', kind: 'drive', docId: 'abc', folderId: null, text: textOf('Sketch', 9), rev: 9, syncedRev: 0, savedAt: '2026-03-01T00:00:00.000Z' }))
  const a = setup({ store, storage })
  assert.equal((await a.keeper.restore('drive')).document.items.length, 3)
  assert.equal(storage.getItem('inkpad.safety.emergency'), null)
})

test('restore gives up (null) when the store never answers', async () => {
  const store = { get: () => new Promise(() => {}), put: async () => undefined, remove: async () => undefined, list: () => new Promise(() => {}) }
  const storage = fakeStorage()
  storage.setItem('inkpad.safety.current.drive', 'drive:abc')
  const a = setup({ store, storage })
  const pending = a.keeper.restore('drive')
  await a.advance(3100)
  assert.equal(await pending, null)
})

test('rekey moves copies to a renamed folder path and a moved diagram, and follows the open diagram', async () => {
  const a = setup()
  a.app.kind = 'device'
  a.app.docId = 'Old/Plan.inkpad'
  a.app.folderId = null
  a.app.n = 2
  await a.keeper.flush()
  await putRecord(a.store, { key: 'device:new:z', kind: 'device', folderId: 'Old/Sub', rev: 1 })
  await putRecord(a.store, { key: 'device:Old/Other.inkpad', kind: 'device', docId: 'Old/Other.inkpad', rev: 1 })
  await putRecord(a.store, { key: 'device:Else/Keep.inkpad', kind: 'device', docId: 'Else/Keep.inkpad', rev: 1 })
  a.app.docId = 'New/Plan.inkpad'
  await a.keeper.rekey('device', 'Old', 'New')
  const keys = (await a.store.list()).map((r) => r.key).sort()
  assert.deepEqual(keys, ['device:Else/Keep.inkpad', 'device:New/Other.inkpad', 'device:New/Plan.inkpad', 'device:new:z'])
  assert.equal((await a.store.get('device:new:z')).folderId, 'New/Sub')
  assert.equal(a.keeper.currentKey(), 'device:New/Plan.inkpad')
  assert.equal(a.storage.getItem('inkpad.safety.current.device'), 'device:New/Plan.inkpad')
  a.app.n = 3
  await a.keeper.flush()
  assert.equal((await a.store.get('device:New/Plan.inkpad')).rev, 2)
  // moving one diagram by exact id
  await a.keeper.rekey('device', 'New/Other.inkpad', 'Else/Other.inkpad')
  assert.ok(await a.store.get('device:Else/Other.inkpad'))
  assert.equal(await a.store.get('device:New/Other.inkpad'), null)
})

test('after the open diagram is deleted its remaining sheet is not stored unless it is edited', async () => {
  const a = setup()
  a.app.docId = 'abc'
  a.app.n = 2
  a.app.backend = { title: 'Sketch', n: 2 }
  await a.keeper.switchTo('abc')
  await a.keeper.forget('drive', 'abc')
  a.app.docId = null
  await a.keeper.switchTo(null)
  a.keeper.markStored()
  a.keeper.noteChange()
  await a.advance(1000)
  a.keeper.emergencySave()
  await a.keeper.flush()
  assert.equal((await a.store.list()).length, 0)
  assert.equal(a.storage.getItem('inkpad.safety.emergency'), null)
  a.app.n = 3
  await a.keeper.flush()
  assert.equal((await a.store.list()).length, 1)
})

test('discardUploaded removes a leftover only when it was not edited since the upload', async () => {
  const a = setup()
  await putRecord(a.store, { key: 'drive:q', docId: 'q', rev: 2 })
  await putRecord(a.store, { key: 'drive:r', docId: 'r', rev: 3 })
  await a.keeper.discardUploaded('drive:q', 2)
  await a.keeper.discardUploaded('drive:r', 2)
  assert.equal(await a.store.get('drive:q'), null)
  assert.equal((await a.store.get('drive:r')).rev, 3)
})

test('dropKind removes every copy of that kind (Drive sign-out / account change) and its pointer and emergency copy', async () => {
  const a = setup()
  a.app.docId = 'abc'
  a.app.n = 2
  await a.keeper.flush()
  await putRecord(a.store, { key: 'device:k', kind: 'device', docId: 'k' })
  a.keeper.emergencySave()
  await a.keeper.dropKind('drive')
  assert.deepEqual((await a.store.list()).map((r) => r.key), ['device:k'])
  assert.equal(a.storage.getItem('inkpad.safety.current.drive'), null)
  assert.equal(a.storage.getItem('inkpad.safety.emergency'), null)
  // the open sheet is not written straight back
  await a.keeper.flush()
  assert.deepEqual((await a.store.list()).map((r) => r.key), ['device:k'])
})

test('a tab lock: only the first tab holds it; without navigator.locks the tab leads', async () => {
  let held = false
  const locks = { request: (name, options, callback) => { assert.equal(name, 'inkpad-safety'); assert.equal(options.ifAvailable, true); if (held) return Promise.resolve(callback(null)); held = true; return Promise.resolve(callback({ name })) } }
  assert.equal(await safety.acquireTabLock(locks), true)
  assert.equal(await safety.acquireTabLock(locks), false)
  assert.equal(await safety.acquireTabLock(undefined), true)
  assert.equal(await safety.acquireTabLock({ request: () => { throw new Error('nope') } }), true)
})

test('wiring: useDocuments restores first, warns on unload and notes changes before the ready check', async () => {
  const source = await readAppSource()
  const start = source.indexOf('Reopen the last diagram of the active storage')
  const effect = source.slice(source.indexOf('useEffect(() => {\n    let cancelled = false', start))
  assert.ok(effect.indexOf('keeper.restore(') > -1)
  assert.ok(effect.indexOf('keeper.restore(') < effect.indexOf('driveAuth.getToken'))
  assert.ok(effect.indexOf('keeper.restore(') < effect.indexOf('queryDevicePermission'))
  assert.match(source, /addEventListener\('beforeunload'/)
  assert.match(source, /const scheduleAutosave = \(\) => \{\n\s*keeper\.noteChange\(\)[^\n]*\n\s*if \(!readyRef\.current\) return/)
})

test('wiring: sign-out and account change drop Drive safety copies before the cache is cleared; second tab and leftovers are guarded', async () => {
  const source = await readAppSource()
  const profile = source.slice(source.indexOf('const loadDriveProfile'), source.indexOf('/** Reopen the last diagram'))
  assert.ok(profile.indexOf("keeper.dropKind('drive')") > -1 && profile.indexOf("keeper.dropKind('drive')") < profile.indexOf('getDriveCache().clear()'))
  const browser = source.slice(source.indexOf('const useBrowserStorage'), source.indexOf('Copies every browser diagram'))
  assert.ok(browser.indexOf("keeper.dropKind('drive')") > -1 && browser.indexOf("keeper.dropKind('drive')") < browser.indexOf('getDriveCache().clear()'))
  assert.match(source, /backendSignature: \(\) => savedSignatureRef\.current/)
  assert.match(source, /leaderRef\.current = await acquireTabLock\(/)
  const leftovers = source.slice(source.indexOf('const uploadLeftovers'), source.indexOf('useEffect(() => {\n    let cancelled = false'))
  assert.match(leftovers, /if \(!leaderRef\.current\) return/)
  assert.match(leftovers, /record\.key === keeper\.currentKey\(\)/)
  assert.match(leftovers, /record\.docId === docIdRef\.current/)
  assert.match(leftovers, /keeper\.discardUploaded\(record\.key, record\.rev\)/)
  assert.match(source, /keeper\.rekey\(backendRef\.current\.kind, moved\.from, moved\.to\)/)
  assert.match(source, /keeper\.rekey\(backendRef\.current\.kind, docId, newId\)/)
  assert.match(source, /forgetCurrentDiagram\(true\)/)
  const persist = source.slice(source.indexOf('const doPersist'), source.indexOf('Saves run one after another'))
  assert.match(persist, /sameSignature\(signature, savedSignatureRef\.current\)\) \{\n\s*void keeper\.markSynced/)
})

test('leaving a diagram never waits forever on the safety copy store', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/app/useDocuments.ts', import.meta.url), 'utf8')
  assert.match(source, /const flushCopy = \(\): Promise<void> => Promise\.race\(\[keeper\.flush\(\)\.catch\(\(\) => undefined\), new Promise<void>\(\(resolve\) => window\.setTimeout\(resolve, SAFETY_FLUSH_WAIT_MS\)\)\]\)/)
  assert.doesNotMatch(source, /await keeper\.flush\(\)/)
})
