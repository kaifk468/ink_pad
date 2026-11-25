import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const appSource = await readAppSource()
const pages = await loadModule('pages.ts')
const format = await loadModule('documentFormat.ts')
const outline = await loadModule('diagramOutline.ts')

const base = { template: 'blank', background: 'white', items: [] }
const parse = (value) => format.parseDocument(typeof value === 'string' ? value : JSON.stringify(value))
const saved = (extra) => ({ format: 'inkpad-document', version: 1, title: 'T', createdAt: 'a', updatedAt: 'b', page: { template: 'blank', background: 'white' }, items: [], ...extra })

test('cleanPageName trims, removes control characters, caps at 40, and ignores non-text', () => {
  assert.equal(format.cleanPageName('  API \n layer\u0007 '), 'API layer')
  assert.equal(format.cleanPageName('x'.repeat(60)).length, 40)
  assert.equal(format.cleanPageName(5), '')
  assert.equal(format.cleanPageName(null), '')
})

test('pageNames is written only when a page has a name, one per page', () => {
  const none = format.createDocument({ ...base, extraPages: [[]], pageNames: ['', ''] })
  assert.equal('pageNames' in none, false)
  assert.equal('pageNames' in format.createDocument(base), false)
  const named = format.createDocument({ ...base, extraPages: [[], []], pageNames: ['', 'API'] })
  assert.deepEqual(named.pageNames, ['', 'API', ''])
  assert.equal(named.version, format.MULTI_PAGE_VERSION)
  const single = format.createDocument({ ...base, pageNames: ['Only'] })
  assert.deepEqual(single.pageNames, ['Only'])
  assert.equal(single.version, format.DOCUMENT_VERSION)
})

test('parse tolerates missing, short, long and junk pageNames', () => {
  const pagesList = [{ items: [] }, { items: [] }]
  assert.equal('pageNames' in parse(saved({ pages: pagesList })).document, false)
  assert.deepEqual(parse(saved({ pages: pagesList, pageNames: ['A'] })).document.pageNames, ['A', '', ''])
  assert.deepEqual(parse(saved({ pages: pagesList, pageNames: ['A', 'B', 'C', 'D', 'E'] })).document.pageNames, ['A', 'B', 'C'])
  assert.equal(parse(saved({ pages: pagesList, pageNames: [1, null, { x: 1 }] })).document.pageNames, undefined)
  assert.deepEqual(parse(saved({ pages: pagesList, pageNames: [1, 'ok', ['z']] })).document.pageNames, ['', 'ok', ''])
  assert.equal('pageNames' in parse(saved({ pageNames: 'nope' })).document, false)
  assert.equal(parse(saved({ pageNames: ['y'.repeat(100)] })).document.pageNames[0].length, 40)
})

test('pageNames is a known key: it does not make the parse lossy', () => {
  const result = parse(saved({ pageNames: ['A'] }))
  assert.equal(format.isLossyParse(result.document), false)
  assert.equal(format.isLossyParse(parse(saved({ somethingNew: 1 })).document), true)
})

test('named documents round trip; old files re-save byte-identical', () => {
  const doc = format.createDocument({ ...base, title: 'N', extraPages: [[]], pageNames: ['Intro', ''] }, '2026-01-01T00:00:00.000Z')
  const text = format.stringifyDocument(doc)
  assert.equal(text, JSON.stringify(doc))
  assert.deepEqual(parse(text).document.pageNames, ['Intro', ''])
  assert.equal(format.stringifyDocument(parse(text).document), text)
  const old = format.stringifyDocument(format.createDocument({ ...base, title: 'Old', extraPages: [[]] }, '2026-01-01T00:00:00.000Z'))
  assert.equal(format.stringifyDocument(parse(old).document), old)
  assert.equal(old.includes('pageNames'), false)
})

test('signature changes when a page is renamed', () => {
  const sig = (pageNames) => ({ title: 'T', template: 'blank', background: 'white', items: [], extraPages: [[]], pageNames })
  assert.equal(format.sameSignature(sig(undefined), sig(['', ''])), true)
  assert.equal(format.sameSignature(sig(['', '']), sig(['', 'API'])), false)
  assert.equal(format.sameSignature(sig(['A', '']), sig(['A', ''])), true)
})

test('page operations keep names with their pages', () => {
  const list = [{ id: 1, name: 'A' }, { id: 2 }, { id: 3, name: 'C' }]
  assert.deepEqual(pages.movePage(list, 2, 0).map((p) => p.name ?? ''), ['C', 'A', ''])
  assert.deepEqual(pages.removePageAt(list, 0).pages.map((p) => p.name ?? ''), ['', 'C'])
  assert.deepEqual(pages.insertPageAfter(list, 0, { id: 4 }).map((p) => p.name ?? ''), ['A', '', '', 'C'])
  assert.deepEqual(pages.insertPageAt(list, 1, { id: 5, name: 'Back' }).map((p) => p.name ?? ''), ['A', 'Back', '', 'C'])
})

test('duplicate names, labels and display names', () => {
  assert.equal(pages.duplicatedPageName('API'), 'API copy')
  assert.equal(pages.duplicatedPageName(''), '')
  assert.equal(pages.duplicatedPageName(undefined), '')
  assert.ok(pages.duplicatedPageName('z'.repeat(40)).length <= 40)
  assert.equal(pages.pageLabel(1, 5), '2 / 5')
  assert.equal(pages.pageLabel(1, 5, 'API'), '2 / 5 · API')
  assert.equal(pages.pageDisplayName(1, ''), 'Page 2')
  assert.equal(pages.pageDisplayName(1, 'API'), 'API')
})

test('outline headings use the page name', () => {
  const box = (id) => ({ kind: 'rectangle', id, x: 0, y: 0, width: 100, height: 50, color: '#000', fill: '#fff', text: `Box${id}` })
  const text = outline.buildDiagramOutline('T', [[box(1)], [box(2)]], ['', 'API'])
  assert.match(text, /## Page 1\n/)
  assert.match(text, /## Page 2 — API\n/)
})

test('wiring: names in slots, saved, indicator, overview input and palette', () => {
  assert.match(appSource, /name\?: string/)
  assert.match(appSource, /getPageNames: \(\) => pagesRef\.current\.map/)
  assert.match(appSource, /normalizePageNames\(loaded\.pageNames/)
  assert.match(appSource, /duplicatedPageName\(/)
  assert.match(appSource, /deleted\.slot\.name/)
  assert.match(appSource, /id: `page:go:\$\{index\}`, label: `Go to page: \$\{slot\.name\}`/)
  assert.match(appSource, /pageNames: hostRef\.current\.getPageNames\(\)/)
  assert.match(appSource, /className="page-tile-name"/)
  assert.match(appSource, /placeholder=\{`Page \$\{index \+ 1\}`\}/)
  assert.match(appSource, /event\.stopPropagation\(\)/)
  assert.match(appSource, /page-indicator-name/)
  assert.match(appSource, /pageLabel\(index, count, name\)/)
})
