import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { FakeDrive } from './helpers/fakeDrive.mjs'
import { FakeDirectory } from './helpers/fakeDirectory.mjs'

const drive = await loadModule('googleDrive.ts')
const device = await loadModule('deviceStore.ts')
const store = await loadModule('documentStore.ts')
const format = await loadModule('documentFormat.ts')
const stroke = (id) => ({ kind: 'stroke', id, color: '#000', width: 2, points: [{ x: 1, y: 1, pressure: 1 }, { x: 5, y: 5, pressure: 1 }], erase: false })
const pagesDoc = (title, extra) => format.createDocument({ title, template: 'blank', background: 'white', items: [stroke(1)], extraPages: extra })

test('browser records and listings carry the page count only for several pages', () => {
  const one = store.summaryFromRecord(store.toStoredRecord('a', pagesDoc('One', [])), null)
  assert.equal('pageCount' in one, false)
  const many = store.summaryFromRecord(store.toStoredRecord('b', pagesDoc('Many', [[stroke(1)], []])), null)
  assert.equal(many.pageCount, 3)
  assert.equal(many.itemCount, 2)
  assert.equal(store.summaryFromRecord({ id: 'c', document: pagesDoc('Old', [[]]) }, null).pageCount, 2, 'older object records too')
})

test('device folder listings show the page count', async () => {
  const backend = device.createDeviceBackend(new FakeDirectory())
  const id = await backend.save(null, pagesDoc('Deck', [[], [], []]), null)
  const one = await backend.save(null, pagesDoc('Single', []), null)
  const listed = (await backend.list()).documents
  assert.equal(listed.find((d) => d.id === id).pageCount, 4)
  assert.equal('pageCount' in listed.find((d) => d.id === one), false)
})

test('Drive keeps the page count as a tag, and removes it when pages are deleted', async () => {
  const fake = new FakeDrive()
  const backend = drive.createDriveBackend({ fetch: fake.fetch, getToken: async () => 'tok' })
  const id = await backend.save(null, pagesDoc('Deck', [[], []]), null)
  assert.equal(fake.files.get(id).appProperties.pageCount, '3')
  assert.equal((await backend.list()).documents[0].pageCount, 3)
  await backend.save(id, pagesDoc('Deck', []), null)
  assert.equal('pageCount' in fake.files.get(id).appProperties, false, 'back to one page clears the tag')
  assert.equal('pageCount' in (await backend.list()).documents[0], false)
  const single = await backend.save(null, pagesDoc('Single', []), null)
  assert.equal('pageCount' in fake.files.get(single).appProperties, false)
})
