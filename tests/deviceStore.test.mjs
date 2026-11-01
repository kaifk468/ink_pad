import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { FakeDirectory, treeOf } from './helpers/fakeDirectory.mjs'

const device = await loadModule('deviceStore.ts')
const format = await loadModule('documentFormat.ts')
const bridge = await loadModule('storageBackend.ts')
const doc = (title, items = []) => format.createDocument({ title, template: 'blank', background: 'white', items })
const stroke = (id) => ({ kind: 'stroke', id, color: '#000', width: 2, points: [{ x: 1, y: 1, pressure: 1 }, { x: 5, y: 5, pressure: 1 }], erase: false })

test('names are made safe and numbered copies are recognised', () => {
  assert.equal(device.sanitizeName('A/B:C*D?'), 'A-B-C-D-')
  assert.equal(device.sanitizeName('   '), 'Untitled diagram')
  assert.equal(device.sanitizeName('...hidden'), 'hidden')
  assert.equal(device.sanitizeName('CON'), 'Untitled diagram')
  assert.equal(device.sanitizeName('x'.repeat(200)).length, 80)
  assert.equal(device.stripCopySuffix('Order (3)'), 'Order')
  assert.equal(device.uniqueName('Order', new Set(['order.inkpad', 'Order (2).inkpad']), '.inkpad'), 'Order (3).inkpad')
  assert.equal(device.parentOfPath('LLD/Payments/a.inkpad'), 'LLD/Payments')
  assert.equal(device.parentOfPath('a.inkpad'), null)
  assert.equal(device.joinPath(null, 'a'), 'a')
})

test('folders are real directories and diagrams are .inkpad files in the same hierarchy', async () => {
  const root = new FakeDirectory()
  const store = device.createDeviceBackend(root)
  const lld = await store.createFolder('LLD', null)
  const pay = await store.createFolder('Payments', lld)
  await store.createFolder('HLD', null)
  const id = await store.save(null, doc('Order flow', [stroke(1)]), pay)
  assert.equal(id, 'LLD/Payments/Order flow.inkpad')
  const top = await store.save(null, doc('Notes'), null)
  assert.equal(top, 'Notes.inkpad')
  assert.deepEqual(treeOf(root), ['HLD/', 'LLD/', 'LLD/Payments/', 'LLD/Payments/Order flow.inkpad', 'Notes.inkpad'])
  const listed = await store.list()
  assert.deepEqual(listed.folders.map((f) => [f.id, f.parentId]).sort(), [['HLD', null], ['LLD', null], ['LLD/Payments', 'LLD']])
  const entry = listed.documents.find((d) => d.id === id)
  assert.equal(entry.folderId, 'LLD/Payments')
  assert.equal(entry.itemCount, 1)
  assert.equal(entry.title, 'Order flow')
})

test('saving writes the same document that loads back, and keeps the file when the title is unchanged', async () => {
  const root = new FakeDirectory()
  const store = device.createDeviceBackend(root)
  const id = await store.save(null, doc('A', [stroke(1)]), null)
  const again = await store.save(id, doc('A', [stroke(1), stroke(2)]), null)
  assert.equal(again, id)
  assert.deepEqual(treeOf(root), ['A.inkpad'])
  const loaded = await store.load(id)
  assert.equal(loaded.items.length, 2)
  assert.equal(loaded.title, 'A')
})

test('two diagrams with one title get numbered file names and are not renamed on every save', async () => {
  const root = new FakeDirectory()
  const store = device.createDeviceBackend(root)
  const a = await store.save(null, doc('Untitled diagram'), null)
  const b = await store.save(null, doc('Untitled diagram'), null)
  assert.deepEqual([a, b], ['Untitled diagram.inkpad', 'Untitled diagram (2).inkpad'])
  const b2 = await store.save(b, doc('Untitled diagram'), null)
  assert.equal(b2, b)
  assert.deepEqual(treeOf(root), ['Untitled diagram (2).inkpad', 'Untitled diagram.inkpad'])
})

test('changing the title renames the file inside its folder', async () => {
  const root = new FakeDirectory()
  const store = device.createDeviceBackend(root)
  const folder = await store.createFolder('LLD', null)
  const id = await store.save(null, doc('Old'), folder)
  const next = await store.save(id, doc('New name'), folder)
  assert.equal(next, 'LLD/New name.inkpad')
  assert.deepEqual(treeOf(root), ['LLD/', 'LLD/New name.inkpad'])
})

test('moving a diagram moves the file between real folders and back to the top level', async () => {
  const root = new FakeDirectory()
  const store = device.createDeviceBackend(root)
  const lld = await store.createFolder('LLD', null)
  const hld = await store.createFolder('HLD', null)
  const id = await store.save(null, doc('D', [stroke(1)]), lld)
  const moved = await store.move(id, hld)
  assert.equal(moved, 'HLD/D.inkpad')
  assert.equal((await store.load(moved)).items.length, 1)
  const top = await store.move(moved, null)
  assert.equal(top, 'D.inkpad')
  assert.deepEqual(treeOf(root), ['D.inkpad', 'HLD/', 'LLD/'])
})

test('renaming a folder carries its subfolders and diagrams along', async () => {
  const root = new FakeDirectory()
  const store = device.createDeviceBackend(root)
  const lld = await store.createFolder('LLD', null)
  const pay = await store.createFolder('Payments', lld)
  await store.save(null, doc('Flow', [stroke(1)]), pay)
  const moved = await store.renameFolder(lld, 'LLD docs')
  assert.deepEqual(moved, { from: 'LLD', to: 'LLD docs' })
  assert.deepEqual(treeOf(root), ['LLD docs/', 'LLD docs/Payments/', 'LLD docs/Payments/Flow.inkpad'])
  assert.equal((await store.load('LLD docs/Payments/Flow.inkpad')).items.length, 1)
  await store.createFolder('x', null)
  await assert.rejects(() => store.renameFolder('x', 'LLD docs'), /already exists/)
})

test('deleting a folder removes everything inside and reports the deleted diagrams', async () => {
  const root = new FakeDirectory()
  const store = device.createDeviceBackend(root)
  const lld = await store.createFolder('LLD', null)
  const pay = await store.createFolder('Payments', lld)
  await store.save(null, doc('One', [stroke(1)]), pay)
  await store.save(null, doc('Two'), lld)
  await store.save(null, doc('Keep'), null)
  const deleted = (await store.deleteFolder(lld)).sort()
  assert.deepEqual(deleted, ['LLD/Payments/One.inkpad', 'LLD/Two.inkpad'])
  assert.deepEqual(treeOf(root), ['Keep.inkpad'])
})

test('creating a folder that already exists is an error, but can reuse it', async () => {
  const store = device.createDeviceBackend(new FakeDirectory())
  await store.createFolder('LLD', null)
  await assert.rejects(() => store.createFolder('LLD', null), /already exists/)
  assert.equal(await store.createFolder('LLD', null, true), 'LLD')
})

test('files and folders that are not InkPad diagrams are ignored or left alone', async () => {
  const root = new FakeDirectory()
  const note = await root.getFileHandle('notes.txt', { create: true })
  const w = await note.createWritable(); await w.write('hi'); await w.close()
  const bad = await root.getFileHandle('broken.inkpad', { create: true })
  const bw = await bad.createWritable(); await bw.write('{not json'); await bw.close()
  await root.getDirectoryHandle('.hidden', { create: true })
  const store = device.createDeviceBackend(root)
  const listed = await store.list()
  assert.deepEqual(listed.documents, [])
  assert.deepEqual(listed.folders, [])
  assert.equal(await store.load('broken.inkpad'), null)
  assert.equal(await store.load('missing.inkpad'), null)
})

test('copying browser storage into a device folder keeps the hierarchy identical and keeps the source', async () => {
  const makeMemoryBackend = () => {
    const folders = [{ id: 'f1', name: 'LLD', parentId: null, createdAt: '' }, { id: 'f2', name: 'Payments', parentId: 'f1', createdAt: '' }]
    const docs = [
      { id: 'd1', title: 'Flow', updatedAt: '2026-01-02', itemCount: 1, folderId: 'f2', document: doc('Flow', [stroke(1)]) },
      { id: 'd2', title: 'Top', updatedAt: '2026-01-01', itemCount: 0, folderId: null, document: doc('Top') },
    ]
    return {
      kind: 'browser',
      list: async () => ({ documents: docs.map(({ document, ...rest }) => rest), folders }),
      load: async (id) => docs.find((d) => d.id === id)?.document ?? null,
    }
  }
  const root = new FakeDirectory()
  const target = device.createDeviceBackend(root)
  const result = await bridge.copyAllBetweenBackends(makeMemoryBackend(), target)
  assert.deepEqual(result, { folders: 2, diagrams: 2, failed: 0 })
  assert.deepEqual(treeOf(root), ['LLD/', 'LLD/Payments/', 'LLD/Payments/Flow.inkpad', 'Top.inkpad'])
  const again = await bridge.copyAllBetweenBackends(makeMemoryBackend(), target)
  assert.equal(again.failed, 0)
  assert.ok(treeOf(root).includes('LLD/Payments/Flow (2).inkpad'), 'a second copy never overwrites existing files')
})

test('the Storage panel offers device storage and the app wires the storage actions', async () => {
  const { readFile } = await import('node:fs/promises')
  const panel = await readFile(new URL('../src/StoragePanel.tsx', import.meta.url), 'utf8')
  const hook = await readFile(new URL('../src/app/useDocuments.ts', import.meta.url), 'utf8')
  assert.match(panel, /Use a device folder…/)
  assert.match(panel, /Reconnect folder/)
  assert.match(panel, /Use browser storage/)
  assert.match(panel, /Copy browser diagrams here/)
  assert.match(hook, /showDirectoryPicker|pickDeviceFolder/)
  assert.match(hook, /setSaveStatus\('locked'\)/)
  assert.match(hook, /saveChainRef/)
  const format = await readFile(new URL('../src/documentFormat.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(format, /folderId|deviceStore/)
})
