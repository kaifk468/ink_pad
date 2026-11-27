import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const mod = await loadModule('librarySearchText.ts')
const loader = await loadModule('librarySearchLoad.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

const text = (id, t) => ({ kind: 'text', id, x: 0, y: 0, width: 50, height: 20, text: t, fontSize: 18, color: '#000' })
const doc = (extra = {}) => ({ format: 'inkpad-document', title: 'Orders', items: [], ...extra })

test('text is read from every item kind, every page and the page names', () => {
  const out = mod.documentSearchText(doc({
    pageNames: ['Overview', '', 'Failure modes'],
    items: [
      text(1, 'API Gateway'),
      text(2, 'Boundary'),
      { kind: 'rectangle', id: 3, classBox: { name: 'OrderService', attributes: '- items: List', methods: '+ place()' } },
      { kind: 'connector', id: 4, label: 'publishes', startLabel: '1', endLabel: '0..*' },
      { kind: 'code', id: 5, text: 'consumer.poll()', language: 'js' },
      { kind: 'stroke', id: 6, points: [] },
    ],
    pages: [{ items: [text(7, 'Sticky on page two')] }],
  }))
  for (const word of ['Orders', 'Overview', 'Failure modes', 'API Gateway', 'Boundary', 'OrderService', 'items: List', 'place()', 'publishes', '0..*', 'consumer.poll()', 'Sticky on page two']) assert.ok(out.includes(word), word)
})

test('unknown kinds and malformed documents never throw', () => {
  assert.equal(mod.documentSearchText(null), '')
  assert.equal(mod.documentSearchText('x'), '')
  assert.equal(mod.documentSearchText({ items: 5, pages: [null, 3, { items: 'no' }], pageNames: [1, null] }), '')
  const out = mod.documentSearchText(doc({ items: [null, 4, { kind: 'opaque', raw: { text: 'secret' } }, { kind: 'text', text: 7 }, { kind: 'rectangle', classBox: 'x' }, text(1, 'kept')] }))
  assert.equal(out, 'Orders\nkept')
})

test('all words must match, in any order, case-insensitively', () => {
  const t = 'Orders\nKafka consumer group\nRedis cache'
  assert.ok(mod.matchContent(t, 'consumer kafka'))
  assert.ok(mod.matchContent(t, 'ORDERS redis'))
  assert.equal(mod.matchContent(t, 'kafka postgres'), null)
  assert.equal(mod.matchContent(t, '   '), null)
  assert.equal(mod.matchContent('', 'a'), null)
})

test('snippet is ellipsized around the first match and stays on one line', () => {
  const long = `${'a '.repeat(60)}Kafka consumer${' b'.repeat(60)}`
  const snippet = mod.matchContent(`Title\n${long}`, 'kafka')
  assert.ok(snippet.startsWith('…') && snippet.endsWith('…'))
  assert.ok(snippet.includes('Kafka consumer'))
  assert.ok(snippet.length < 100)
  assert.equal(mod.matchContent('Title\nKafka', 'kafka'), 'Kafka')
  assert.ok(!mod.matchContent('Alpha\nBeta Kafka', 'kafka').includes('Alpha'))
})

test('index caches by id + updatedAt and rebuilds on a new edit time', async () => {
  let loads = 0
  const index = mod.createSearchTextIndex(async (id) => { loads += 1; return id === 'none' ? null : doc({ items: [text(1, `v${loads}`)] }) })
  assert.match(await index.textFor({ id: 'a', updatedAt: '1' }), /v1/)
  assert.match(await index.textFor({ id: 'a', updatedAt: '1' }), /v1/)
  assert.equal(loads, 1)
  assert.match(await index.textFor({ id: 'a', updatedAt: '2' }), /v2/)
  assert.equal(await index.textFor({ id: 'none', updatedAt: '1' }), null)
  const failing = mod.createSearchTextIndex(async () => { throw new Error('boom') })
  assert.equal(await failing.textFor({ id: 'x', updatedAt: '1' }), null)
})

test('search reads local copies only: browser store and Drive cache, never a device folder', async () => {
  const calls = []
  const sources = {
    browserDocument: async (id) => { calls.push(`browser:${id}`); return doc() },
    driveCached: async (id) => { calls.push(`drive:${id}`); return id === 'miss' ? null : { text: JSON.stringify(doc({ title: 'Cached' })) } },
  }
  assert.equal((await loader.loadLocalCopyForSearch('browser', 'a', sources)).title, 'Orders')
  assert.equal((await loader.loadLocalCopyForSearch('drive', 'b', sources)).title, 'Cached')
  assert.equal(await loader.loadLocalCopyForSearch('drive', 'miss', sources), null)
  assert.equal(await loader.loadLocalCopyForSearch('device', 'c', sources), null)
  assert.deepEqual(calls, ['browser:a', 'drive:b', 'drive:miss'])
  assert.equal(await loader.loadLocalCopyForSearch('drive', 'bad', { ...sources, driveCached: async () => ({ text: '{nope' }) }), null)
})

test('wiring: the search path uses only the local loader, and results follow title matches', async () => {
  const hook = await read('app/useDocuments.ts')
  const line = hook.split('\n').find((l) => l.includes('const loadForSearch'))
  assert.ok(line.includes('loadLocalCopyForSearch') && line.includes('loadStoredDocument') && line.includes('getDriveCache().get') && line.includes('useCallback'))
  assert.ok(!/backendRef\.current\.(load|loadFresh|list)\b/.test(line))
  for (const file of ['librarySearchText.ts', 'librarySearchLoad.ts']) {
    const src = await read(file)
    assert.ok(!/fetch\(|googleDrive|deviceStore|requestPermission|queryPermission|saveStoredDocument|\.save\(/.test(src), file)
  }
  const home = await read('app/HomeScreen.tsx')
  assert.match(home, /props\.loadForSearch/)
  assert.match(home, /CONTENT_SEARCH_DELAY_MS = 200/)
  assert.match(home, /\[\.\.\.titleShown, \.\.\.contentShown\]/)
  assert.match(home, /Contains: \{contentSnippets\.get\(entry\.id\)\}/)
  assert.ok(!/\.load(Fresh)?\(/.test(home))
  assert.match(await read('App.tsx'), /loadForSearch=\{loadForSearch\}/)
})
