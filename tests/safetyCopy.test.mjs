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
  const app = { kind: 'drive', docId: null, folderId: null, n: 0, title: 'Sketch', active: false }
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
  return { keeper, store, storage, app, advance, settle, setClock: (v) => { clock = v } }
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
