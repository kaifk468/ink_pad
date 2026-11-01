import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { FakeDrive, tree } from './helpers/fakeDrive.mjs'

const drive = await loadModule('googleDrive.ts')
const format = await loadModule('documentFormat.ts')
const bridge = await loadModule('storageBackend.ts')
const doc = (title, items = []) => format.createDocument({ title, template: 'blank', background: 'white', items })
const stroke = (id) => ({ kind: 'stroke', id, color: '#000', width: 2, points: [{ x: 1, y: 1, pressure: 1 }, { x: 5, y: 5, pressure: 1 }], erase: false })
const setup = () => {
  const fake = new FakeDrive()
  let refreshed = 0
  let current = 'tok'
  const env = { fetch: fake.fetch, getToken: async (force) => { if (force) { refreshed += 1; current = 'fresh' } return current } }
  return { fake, env, store: drive.createDriveBackend(env), refreshes: () => refreshed }
}

test('folders are Drive folders and diagrams are .inkpad files in the same hierarchy', async () => {
  const { fake, store } = setup()
  const lld = await store.createFolder('LLD', null)
  const pay = await store.createFolder('Payments', lld)
  await store.createFolder('HLD', null)
  const id = await store.save(null, doc('Order flow', [stroke(1)]), pay)
  const top = await store.save(null, doc('Notes'), null)
  assert.deepEqual(tree(fake), ['HLD/', 'LLD/', 'LLD/Payments/', 'LLD/Payments/Order flow.inkpad', 'Notes.inkpad'])
  const listed = await store.list()
  const byName = (name) => listed.folders.find((f) => f.name === name)
  assert.equal(byName('LLD').parentId, null)
  assert.equal(byName('Payments').parentId, lld)
  const entry = listed.documents.find((d) => d.id === id)
  assert.deepEqual([entry.title, entry.folderId, entry.itemCount], ['Order flow', pay, 1])
  assert.equal(listed.documents.find((d) => d.id === top).folderId, null)
  const loaded = await store.load(id)
  assert.equal(loaded.items.length, 1)
  assert.equal(await store.load('missing'), null)
})

test('saving again updates the same file, and renaming keeps the same id', async () => {
  const { fake, store } = setup()
  const id = await store.save(null, doc('First'), null)
  const again = await store.save(id, doc('Second', [stroke(1), stroke(2)]), null)
  assert.equal(again, id)
  assert.deepEqual(tree(fake), ['Second.inkpad'])
  assert.equal((await store.list()).documents[0].itemCount, 2)
})

test('moving, renaming folders and deleting folders with their contents', async () => {
  const { fake, store } = setup()
  const a = await store.createFolder('A', null)
  const b = await store.createFolder('B', a)
  const d1 = await store.save(null, doc('One'), b)
  const d2 = await store.save(null, doc('Two'), null)
  assert.equal(await store.move(d2, a), d2)
  assert.equal(await store.move(d2, a), d2)
  assert.deepEqual(tree(fake), ['A/', 'A/B/', 'A/B/One.inkpad', 'A/Two.inkpad'])
  assert.equal(await store.move(d2, null), d2)
  assert.deepEqual(tree(fake), ['A/', 'A/B/', 'A/B/One.inkpad', 'Two.inkpad'])
  assert.equal(await store.renameFolder(a, 'Alpha'), null)
  assert.ok(tree(fake).includes('Alpha/B/One.inkpad'))
  const deleted = await store.deleteFolder(a)
  assert.deepEqual(deleted, [d1])
  assert.deepEqual(tree(fake), ['Two.inkpad'])
  await store.remove(d2)
  await store.remove(d2) // already gone is fine
  assert.deepEqual(tree(fake), [])
})

test('reusing a folder name returns the existing folder', async () => {
  const { store } = setup()
  const a = await store.createFolder('LLD', null)
  assert.equal(await store.createFolder('lld', null, true), a)
  assert.notEqual(await store.createFolder('LLD', null), a)
})

test('a change made on another device is kept as a copy before it is overwritten', async () => {
  const { fake, store } = setup()
  const id = await store.save(null, doc('Shared', [stroke(1)]), null)
  await store.load(id)
  fake.editElsewhere(id, JSON.stringify(doc('Shared', [stroke(1), stroke(2), stroke(3)])))
  await store.save(id, doc('Shared', [stroke(1), stroke(9)]), null)
  const names = tree(fake)
  assert.equal(names.length, 2)
  assert.ok(names.some((n) => /^Shared \(other device .*\)\.inkpad$/.test(n)), names.join(','))
  const copyId = [...fake.files.values()].find((f) => f.name.includes('other device')).id
  assert.equal((await store.load(copyId)).items.length, 3)
  assert.equal((await store.load(id)).items.length, 2)
  // saving again with no outside change makes no further copies
  await store.save(id, doc('Shared', [stroke(1)]), null)
  assert.equal(tree(fake).length, 2)
})

test('a diagram deleted elsewhere is saved again as a new file instead of being lost', async () => {
  const { fake, store } = setup()
  const id = await store.save(null, doc('Gone', [stroke(1)]), null)
  fake.files.delete(id)
  const next = await store.save(id, doc('Gone', [stroke(1)]), null)
  assert.notEqual(next, id)
  assert.deepEqual(tree(fake), ['Gone.inkpad'])
})

test('an expired token is refreshed once; a refused refresh asks for sign-in again', async () => {
  const { fake, store, refreshes } = setup()
  fake.failNextWith = 401
  await store.list()
  assert.equal(refreshes(), 1)
  assert.equal(fake.tokens.at(-1), 'Bearer fresh')
  const failing = drive.createDriveBackend({ fetch: async () => new Response('{}', { status: 401 }), getToken: async () => 'x' })
  await assert.rejects(() => failing.list(), (error) => error instanceof drive.DriveAuthError)
  const down = drive.createDriveBackend({ fetch: async () => new Response('{}', { status: 403 }), getToken: async () => 'x' })
  await assert.rejects(() => down.list(), /Drive API/)
})

test('large libraries are read page by page', async () => {
  const { fake, store } = setup()
  await store.save(null, doc('One'), null)
  const original = fake.fetch
  let page = 0
  const env = { getToken: async () => 't', fetch: async (url, init) => {
    const response = await original(url, init)
    if (new URL(url).pathname === '/drive/v3/files' && !init?.method) {
      const data = await response.json()
      page += 1
      return new Response(JSON.stringify(page === 1 ? { ...data, nextPageToken: 'more' } : { files: [] }), { status: 200 })
    }
    return response
  } }
  const listed = await drive.createDriveBackend(env).list()
  assert.equal(page, 2)
  assert.equal(listed.documents.length, 1)
})

test('copying browser-style content into Drive keeps the hierarchy identical', async () => {
  const { fake, store } = setup()
  const source = (() => {
    const folders = [{ id: 'f1', name: 'LLD', parentId: null, createdAt: '' }, { id: 'f2', name: 'Payments', parentId: 'f1', createdAt: '' }]
    const documents = [{ id: 'd1', title: 'Order', updatedAt: '', itemCount: 1, folderId: 'f2' }, { id: 'd2', title: 'Top', updatedAt: '', itemCount: 0, folderId: null }]
    return { kind: 'browser', list: async () => ({ documents, folders }), load: async (id) => doc(documents.find((d) => d.id === id).title) }
  })()
  const result = await bridge.copyAllBetweenBackends(source, store)
  assert.deepEqual(result, { folders: 2, diagrams: 2, failed: 0 })
  assert.deepEqual(tree(fake), ['LLD/', 'LLD/Payments/', 'LLD/Payments/Order.inkpad', 'Top.inkpad'])
})

test('the app wires Drive in: sign-in button, locked state and token renewal', async () => {
  const { readFile } = await import('node:fs/promises')
  const hook = await readFile(new URL('../src/app/useDocuments.ts', import.meta.url), 'utf8')
  const panel = await readFile(new URL('../src/StoragePanel.tsx', import.meta.url), 'utf8')
  assert.match(hook, /createDriveBackend/)
  assert.match(hook, /instanceof DriveAuthError/)
  assert.match(hook, /readStorageMode\(\) === 'drive'/)
  assert.match(hook, /addEventListener\('pointerup', renew\)/)
  assert.match(panel, /Connect Google Drive/)
  assert.match(panel, /Sign in again/)
})

test('storage lives in the menu and the Folders panel, not in the per-diagram File panel', async () => {
  const { readFile } = await import('node:fs/promises')
  const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')
  const [bar, folders, file, app, hook] = await Promise.all([read('app/TopLeftBar.tsx'), read('app/FoldersSidebar.tsx'), read('FilePanel.tsx'), read('App.tsx'), read('app/useDocuments.ts')])
  assert.match(bar, /Storage…/)
  assert.match(bar, /onOpenStorage\(\)/)
  assert.match(folders, /Saved in:/)
  assert.match(folders, /props\.onChangeStorage/)
  assert.doesNotMatch(file, /Connect Google Drive|Use a device folder|<h3>Storage/)
  assert.match(app, /<StoragePanel/)
  // a locked storage opens the Storage panel, not the per-diagram File panel
  assert.match(hook, /setStoragePanelOpen\(true\)/)
  assert.doesNotMatch(hook, /setFilePanelOpen\(true\)/)
})
