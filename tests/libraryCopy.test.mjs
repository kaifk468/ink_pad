import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { FakeDirectory } from './helpers/fakeDirectory.mjs'
import { FakeDrive } from './helpers/fakeDrive.mjs'

const copy = await loadModule('libraryCopy.ts')
const format = await loadModule('documentFormat.ts')
const device = await loadModule('deviceStore.ts')
const drive = await loadModule('googleDrive.ts')
const src = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')
const stroke = (id) => ({ kind: 'stroke', id, color: '#000', width: 2, points: [{ x: 1, y: 1, pressure: 1 }, { x: 5, y: 5, pressure: 1 }], erase: false })

/** A document with a second page, sketchy style, spacing and an item kind this version does not know. */
function richDocument(title) {
  const base = format.createDocument({ title, template: 'lined', background: 'warm', spacing: 'wide', sketchy: true, items: [stroke(1)], extraPages: [[stroke(2), stroke(3)]] })
  const raw = JSON.parse(format.stringifyDocument(base))
  raw.items.push({ kind: 'futureWidget', id: 9, nested: { a: [1, 2, 3] } })
  const parsed = format.parseDocument(JSON.stringify(raw))
  assert.equal(parsed.ok, true)
  assert.equal(format.isLossyParse(parsed.document), false, 'an unknown item kind is kept opaque, not lossy')
  return parsed.document
}

test('copyTitle adds the suffix, names untitled diagrams and caps the length', () => {
  assert.equal(copy.copyTitle('Order flow'), 'Order flow (copy)')
  assert.equal(copy.copyTitle('  Order   flow  '), 'Order flow (copy)')
  assert.equal(copy.copyTitle(''), 'Untitled diagram (copy)')
  assert.equal(copy.copyTitle('Untitled diagram'), 'Untitled diagram (copy)')
  const long = copy.copyTitle('x'.repeat(500))
  assert.equal(long.length, format.MAX_TITLE_LENGTH)
  assert.equal(long.endsWith(' (copy)'), true)
})

async function checkCopy(backend, folderId) {
  const id = await backend.save(null, richDocument('Order flow'), folderId)
  const before = format.stringifyDocument(await backend.load(id))
  const made = await copy.copyStoredDiagram(backend, id, folderId)
  assert.notEqual(made.id, id)
  assert.equal(made.title, 'Order flow (copy)')
  const original = await backend.load(id)
  assert.equal(format.stringifyDocument(original), before, 'original is untouched')
  const copied = await backend.load(made.id)
  assert.equal(copied.title, 'Order flow (copy)')
  assert.deepEqual(copied.items.map((i) => i.id), original.items.map((i) => i.id))
  assert.deepEqual((copied.pages ?? []).map((p) => p.items.map((i) => i.id)), [[2, 3]])
  assert.equal(copied.page.template, 'lined')
  assert.equal(copied.page.background, 'warm')
  assert.equal(copied.page.spacing, 'wide')
  assert.equal(copied.page.sketchy, true)
  assert.deepEqual(JSON.parse(format.stringifyDocument(copied)).items[1], { kind: 'futureWidget', id: 9, nested: { a: [1, 2, 3] } })
  const listed = await backend.list()
  assert.equal(listed.documents.find((d) => d.id === made.id).folderId, folderId)
  assert.equal(listed.documents.length, 2)
  return { id, made }
}

test('device folder: the copy sits in the same folder with all pages, the original is untouched', async () => {
  const backend = device.createDeviceBackend(new FakeDirectory())
  const folder = await backend.createFolder('LLD', null)
  const { made } = await checkCopy(backend, folder)
  assert.equal(made.id, 'LLD/Order flow (copy).inkpad')
})

test('Drive: the copy is a new file in the same folder', async () => {
  const fake = new FakeDrive()
  const backend = drive.createDriveBackend({ fetch: fake.fetch, getToken: async () => 'tok' })
  const folder = await backend.createFolder('LLD', null)
  await checkCopy(backend, folder)
})

test('a file the loader only partly understands is refused, nothing is saved', async () => {
  const base = JSON.parse(format.stringifyDocument(format.createDocument({ title: 'Old', template: 'blank', background: 'white', items: [stroke(1)] })))
  const lossy = format.parseDocument(JSON.stringify({ ...base, futureField: 1 })).document
  assert.equal(format.isLossyParse(lossy), true)
  const saves = []
  const backend = { kind: 'browser', load: async () => lossy, save: async (...args) => { saves.push(args); return 'x' } }
  await assert.rejects(() => copy.copyStoredDiagram(backend, 'a', null), /cannot copy safely/)
  const damaged = format.parseDocument(JSON.stringify({ ...base, items: [{ kind: 'nonsense' }] })).document
  await assert.rejects(() => copy.copyStoredDiagram({ ...backend, load: async () => damaged }, 'a', null), /cannot copy safely/)
  await assert.rejects(() => copy.copyStoredDiagram({ ...backend, load: async () => null }, 'a', null), /no longer exists/)
  assert.equal(saves.length, 0)
})

test('device files keep the lossy mark, so copy refuses them', async () => {
  const root = new FakeDirectory()
  const backend = device.createDeviceBackend(root)
  const raw = JSON.parse(format.stringifyDocument(format.createDocument({ title: 'Old', template: 'blank', background: 'white', items: [stroke(1)] })))
  const handle = await root.getFileHandle('Old.inkpad', { create: true })
  const w = await handle.createWritable()
  await w.write(JSON.stringify({ ...raw, futureField: 1 }))
  await w.close()
  const loaded = await backend.load('Old.inkpad')
  assert.equal(loaded.title, 'Old')
  assert.equal(format.isLossyParse(loaded), true)
  await assert.rejects(() => copy.copyStoredDiagram(backend, 'Old.inkpad', null), /cannot copy safely/)
})

test('Make a copy is wired: card button, status toast, busy state, save chain and fresh load', async () => {
  const home = await src('app/HomeScreen.tsx')
  assert.match(home, /aria-label=\{`Make a copy of \$\{entry\.title \|\| 'Untitled diagram'\}`\} title="Make a copy" disabled=\{copyingId !== null\}/)
  assert.match(home, /props\.onMakeCopy\(id\), `Copied to “\$\{copyTitle\(titleOf\(id\)\)\}”`/)
  const app = await src('App.tsx')
  assert.match(app, /onMakeCopy=\{\(id\) => copyStoredDiagram\(id\)\}/)
  const hook = await src('app/useDocuments.ts')
  const body = hook.slice(hook.indexOf('const copyStoredDiagram'), hook.indexOf('const renameDiagram'))
  assert.match(body, /wasOpen = docIdRef\.current === id\n\s+if \(wasOpen\) await persistNow\(\)/)
  assert.match(body, /sameSignature\(currentSignature\(\), savedSignatureRef\.current\)/, 'the open diagram is checked by its saved signature')
  assert.match(body, /sourceId = docIdRef\.current/, 'a device rename on save changes the id')
  assert.match(body, /else if \(await keeper\.recordFor/, 'recordFor only for diagrams that are not open')
  assert.match(body, /saveChainRef\.current\.then\(body, body\)/)
  assert.match(body, /keeper\.recordFor/)
  assert.doesNotMatch(body, /applyDocument|openStoredDiagram/, 'the copy is not opened')
  const lib = await src('libraryCopy.ts')
  assert.match(lib, /backend\.loadFresh \? backend\.loadFresh\(id\) : backend\.load\(id\)/)
  assert.match(lib, /backend\.save\(null, copy, folderId\)/)
})
