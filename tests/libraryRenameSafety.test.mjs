import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { FakeDrive } from './helpers/fakeDrive.mjs'

const format = await loadModule('documentFormat.ts')
const exportOptions = await loadModule('exportOptions.ts')
const drive = await loadModule('googleDrive.ts')
const src = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')
const doc = (title, items = []) => format.createDocument({ title, template: 'blank', background: 'white', items })

test('a clean parse is not lossy; dropped items or unknown fields mark the document lossy', () => {
  const clean = format.parseDocument(format.stringifyDocument(doc('A')))
  assert.equal(format.isLossyParse(clean.document), false)
  const base = JSON.parse(format.stringifyDocument(doc('A')))
  const unknown = format.parseDocument(JSON.stringify({ ...base, futureField: 1 }))
  assert.equal(format.isLossyParse(unknown.document), true)
  const unknownPage = format.parseDocument(JSON.stringify({ ...base, page: { ...base.page, zoom: 2 } }))
  assert.equal(format.isLossyParse(unknownPage.document), true)
  const damaged = format.parseDocument(JSON.stringify({ ...base, items: [{ kind: 'nonsense' }] }))
  assert.equal(damaged.droppedItems, 1)
  assert.equal(format.isLossyParse(damaged.document), true)
  assert.equal(format.isLossyParse({ ...clean.document }), false, 'a copy is not marked')
})

test('connector labels count as Excalifont text for export', () => {
  const connector = (label) => ({ kind: 'connector', id: 1, color: '#000', width: 2, start: { x: 0, y: 0 }, end: { x: 5, y: 5 }, ...(label === undefined ? {} : { label }) })
  assert.equal(exportOptions.usesExcalifont([connector()]), false)
  assert.equal(exportOptions.usesExcalifont([connector('  \n ')]), false)
  assert.equal(exportOptions.usesExcalifont([connector('yes')]), true)
})

test('Drive loadFresh returns the current remote file', async () => {
  const fake = new FakeDrive()
  const env = { fetch: fake.fetch, getToken: async () => 'tok' }
  const store = drive.createDriveBackend(env)
  const id = await store.save(null, doc('Plan'), null)
  assert.equal(typeof store.loadFresh, 'function')
  assert.equal((await store.loadFresh(id)).title, 'Plan')
  assert.equal(await store.loadFresh('missing'), null)
})

test('library rename runs inside the save chain, loads fresh, refuses lossy files and re-checks the open diagram', async () => {
  const s = await src('app/useDocuments.ts')
  const rename = s.slice(s.indexOf('const renameStoredDiagram'), s.indexOf('const renameDiagram'))
  assert.match(rename, /saveChainRef\.current\.then\(body, body\)/)
  assert.match(rename, /backend\.loadFresh \? backend\.loadFresh\(id\) : backend\.load\(id\)/)
  assert.match(rename, /isLossyParse\(stored\)[^\n]*Open this diagram first, then rename it/)
  assert.equal((rename.match(/docIdRef\.current === id/g) ?? []).length >= 3, true)
  assert.match(rename, /await renameDiagram\(title\)\s*\n\s*await refreshLibrary\(\)/)
  assert.match(rename, /'unchanged'/)
})

test('Enter during IME composition does not commit the text editor', async () => {
  const s = await src('TextEditorOverlay.tsx')
  assert.match(s, /event\.key === 'Enter' && !event\.nativeEvent\.isComposing && event\.keyCode !== 229/)
})

test('Library clears its status on navigation and does not count an unchanged rename as success', async () => {
  const s = await src('app/HomeScreen.tsx')
  assert.equal((s.match(/clearStatus\(\) \}/g) ?? []).length, 4)
  assert.match(s, /result !== false && result !== 'unchanged'/)
  const css = await src('styles.css')
  assert.match(css, /\.home-status \{ position: fixed/)
  assert.match(css, /\.home-screen \.home-crumb/)
})
