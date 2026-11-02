import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { FakeDrive, tree } from './helpers/fakeDrive.mjs'

const cacheModule = await loadModule('driveCache.ts')
const drive = await loadModule('googleDrive.ts')
const format = await loadModule('documentFormat.ts')
const doc = (title, items = []) => format.createDocument({ title, template: 'blank', background: 'white', items })
const stroke = (id) => ({ kind: 'stroke', id, color: '#000', width: 2, points: [{ x: 1, y: 1, pressure: 1 }, { x: 5, y: 5, pressure: 1 }], erase: false })
const setup = (max = 30, fake = new FakeDrive()) => {
  const cache = cacheModule.createMemoryDriveCache(max)
  const urls = []
  const env = { fetch: (url, init) => { urls.push(`${init?.method ?? 'GET'} ${url}`); return fake.fetch(url, init) }, getToken: async () => 'tok' }
  const store = drive.createDriveBackend(env, { cache })
  return { fake, cache, env, store, urls }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
const downloadsIn = (urls) => urls.filter((url) => url.includes('alt=media')).length

test('eviction drops the least recently used diagrams first and never one with an unsent edit', () => {
  const entries = [
    { id: 'a', usedAt: 1, pending: false },
    { id: 'b', usedAt: 2, pending: true },
    { id: 'c', usedAt: 3, pending: false },
    { id: 'd', usedAt: 4, pending: false },
  ]
  assert.deepEqual(cacheModule.evictionIds(entries, 4), [])
  assert.deepEqual(cacheModule.evictionIds(entries, 3), ['a'])
  assert.deepEqual(cacheModule.evictionIds(entries, 2), ['a', 'c'])
  assert.equal(cacheModule.MAX_CACHED_DIAGRAMS, 30)
})

test('the cache keeps the most recently used diagrams, and opening one counts as use', async () => {
  const cache = cacheModule.createMemoryDriveCache(3)
  for (const id of ['a', 'b', 'c']) await cache.putText(id, id, { modifiedTime: '1', pending: false })
  await cache.get('a') // a is used again, so b is now the oldest
  await cache.putText('d', 'd', { modifiedTime: '1', pending: false })
  assert.equal(await cache.get('b'), null)
  for (const id of ['a', 'c', 'd']) assert.equal((await cache.get(id)).text, id)
  await cache.clear()
  assert.equal(await cache.get('a'), null)
})

test('the first open downloads a diagram and keeps a copy; later opens show the copy without downloading', async () => {
  const { fake, store } = setup()
  const id = await store.save(null, doc('One', [stroke(1)]), null)
  const fresh = setup(30, fake) // a second browser that has never opened it
  const second = fresh.store
  const first = await second.load(id)
  assert.equal(first.items.length, 1)
  assert.equal(downloadsIn(fresh.urls), 1, 'downloaded once')
  const before = fresh.urls.length
  const again = await second.load(id)
  await settle()
  assert.equal(again.items.length, 1)
  const after = fresh.urls.slice(before)
  assert.equal(downloadsIn(after), 0, 'no download')
  assert.equal(after.length, 1, 'only a quick check of the version time in the background')
  assert.match(after[0], /fields=id%2Cname%2Cparents%2CmodifiedTime/)
})

test('a newer version on Drive is fetched in the background and handed over', async () => {
  const { fake, store, cache } = setup()
  const id = await store.save(null, doc('Shared', [stroke(1)]), null)
  fake.editElsewhere(id, JSON.stringify(doc('Shared', [stroke(1), stroke(2), stroke(3)])))
  let fresher = null
  const shown = await store.load(id, (document) => { fresher = document })
  assert.equal(shown.items.length, 1, 'the browser copy is shown first')
  await settle()
  assert.equal(fresher.items.length, 3)
  assert.equal((await store.load(id)).items.length, 3, 'and the browser copy is updated')
  assert.equal((await cache.get(id)).pending, false)
})

test('an unchanged diagram never calls back with a newer version', async () => {
  const { store } = setup()
  const id = await store.save(null, doc('Same', [stroke(1)]), null)
  let calls = 0
  await store.load(id, () => { calls += 1 })
  await settle()
  assert.equal(calls, 0)
})

test('a save lands in the browser copy first and is marked waiting until Drive has it', async () => {
  const { fake, store, cache } = setup()
  const id = await store.save(null, doc('Notes', [stroke(1)]), null)
  assert.equal((await cache.get(id)).pending, false)
  fake.failNextWith = 503 // the upload's version check fails: the network is down or Drive is busy
  await assert.rejects(() => store.save(id, doc('Notes', [stroke(1), stroke(2)]), null))
  const kept = await cache.get(id)
  assert.equal(kept.pending, true)
  assert.equal(format.parseDocument(kept.text).document.items.length, 2, 'the edit is safe in the browser')
  assert.equal(JSON.parse([...fake.files.values()][0].content).items.length, 1, 'Drive still has the old one')
})

test('opening a diagram with an unsent edit shows it and finishes the upload', async () => {
  const { fake, store, cache } = setup()
  const id = await store.save(null, doc('Notes', [stroke(1)]), null)
  fake.failNextWith = 503
  await assert.rejects(() => store.save(id, doc('Notes', [stroke(1), stroke(2)]), null))
  const shown = await store.load(id)
  assert.equal(shown.items.length, 2)
  await settle()
  assert.equal(JSON.parse(fake.files.get(id).content).items.length, 2)
  assert.equal((await cache.get(id)).pending, false)
})

test('an edit made on another device while the browser copy was shown is kept as a copy at the next save', async () => {
  const { fake, store } = setup()
  const id = await store.save(null, doc('Shared', [stroke(1)]), null)
  const second = setup(30, fake).store
  await second.load(id)
  await settle()
  fake.editElsewhere(id, JSON.stringify(doc('Shared', [stroke(1), stroke(2), stroke(3)])))
  await second.load(id) // browser copy shown (the check has not finished yet)
  await second.save(id, doc('Shared', [stroke(1), stroke(9)]), null)
  assert.ok(tree(fake).some((name) => /other device/.test(name)), tree(fake).join(','))
})

test('only opened or saved diagrams are cached, and the list is remembered separately', async () => {
  const { fake, store, cache } = setup()
  const a = await store.save(null, doc('A'), null)
  fake.add({ name: 'Elsewhere.inkpad', appProperties: { itemCount: '0' } }, JSON.stringify(doc('Elsewhere')))
  const listed = await store.list()
  assert.equal(listed.documents.length, 2)
  assert.equal((await store.listCached()).documents.length, 2, 'the list is available instantly next time')
  const other = [...fake.files.values()].find((file) => file.name === 'Elsewhere.inkpad')
  assert.equal(await cache.get(other.id), null, 'listing does not download diagrams')
  assert.ok(await cache.get(a))
})

test('deleting a diagram or a folder removes the browser copies too', async () => {
  const { store, cache } = setup()
  const folder = await store.createFolder('LLD', null)
  const inside = await store.save(null, doc('Inside'), folder)
  const outside = await store.save(null, doc('Outside'), null)
  await store.deleteFolder(folder)
  assert.equal(await cache.get(inside), null)
  await store.remove(outside)
  assert.equal(await cache.get(outside), null)
})

test('a diagram deleted on Drive is not shown from an old browser copy when it is opened fresh', async () => {
  const { fake, store, cache } = setup()
  const id = await store.save(null, doc('Gone', [stroke(1)]), null)
  await cache.remove(id)
  fake.files.delete(id)
  assert.equal(await store.load(id), null)
})

test('a browser that refuses to store copies does not stop Drive from working', async () => {
  const fake = new FakeDrive()
  const failing = { get: async () => { throw new Error('no') }, putText: async () => { throw new Error('no') }, setState: async () => { throw new Error('no') }, remove: async () => { throw new Error('no') }, getListing: async () => { throw new Error('no') }, putListing: async () => { throw new Error('no') }, clear: async () => undefined }
  const store = drive.createDriveBackend({ fetch: fake.fetch, getToken: async () => 't' }, { cache: failing })
  const id = await store.save(null, doc('Works', [stroke(1)]), null)
  await store.save(id, doc('Works', [stroke(1), stroke(2)]), null)
  assert.equal((await store.load(id)).items.length, 2)
  assert.equal((await store.list()).documents.length, 1)
  assert.equal(await store.listCached(), null)
  await store.remove(id)
})

test('the cache holds only the most recent diagrams when many are opened', async () => {
  const { store, cache } = setup(3)
  const ids = []
  for (let n = 0; n < 5; n += 1) ids.push(await store.save(null, doc(`D${n}`), null))
  const held = []
  for (const id of ids) if (await cache.get(id)) held.push(id)
  assert.deepEqual(held, ids.slice(2))
})

test('a newer version that was not used because the diagram was edited meanwhile is still kept as a copy when saving', async () => {
  const { fake, store } = setup()
  const id = await store.save(null, doc('Shared', [stroke(1)]), null)
  const second = setup(30, fake).store
  await second.load(id)
  await settle()
  fake.editElsewhere(id, JSON.stringify(doc('Shared', [stroke(1), stroke(2), stroke(3)])))
  let offered = 0
  await second.load(id, () => { offered += 1; return false }) // the app refuses it: the person already edited
  await settle()
  assert.equal(offered, 1)
  await second.save(id, doc('Shared', [stroke(1), stroke(9)]), null)
  assert.ok(tree(fake).some((name) => /other device/.test(name)), tree(fake).join(','))
})
