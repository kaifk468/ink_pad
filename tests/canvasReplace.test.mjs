import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFile } from 'node:fs/promises'

const { replaceInText, replaceInItems, replaceOne, replaceAcrossPages, replaceToast } = await loadModule('canvasReplace.ts')
const { searchCanvas } = await loadModule('canvasSearch.ts')
const { CanvasSnapshotHistory } = await loadModule('canvasModel.ts')
const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const palette = await loadModule('commandPalette.ts')
const app = await readAppSource()
const p = (x, y) => ({ x, y, pressure: 1 })
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
const text = (id, t, extra = {}) => ({ kind: 'text', id, x: 100, y: 50, width: 80, height: 30, text: t, fontSize: 24, color: '#111', ...extra })
const code = (id, t) => ({ kind: 'code', id, x: 0, y: 0, width: 80, height: 40, text: t, language: 'typescript' })
const box = (id, extra = {}) => ({ kind: 'rectangle', id, x: 0, y: 0, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2, ...extra })
const link = (id, label) => ({ kind: 'connector', id, start: p(0, 0), end: p(10, 10), strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false, ...(label ? { label } : {}) })

test('replaceInText: case-insensitive, all occurrences, literal', () => {
  assert.deepEqual(replaceInText('Redis redis REDIS', 'redis', 'Cache'), { text: 'Cache Cache Cache', count: 3 })
  assert.deepEqual(replaceInText('a.b (a+b) [x] $1', '(a+b)', '$&'), { text: 'a.b $& [x] $1', count: 1 })
  assert.deepEqual(replaceInText('a.b axb', 'a.b', 'Z'), { text: 'Z axb', count: 1 })
  assert.deepEqual(replaceInText('cache', 'cache', ''), { text: '', count: 1 })
  assert.deepEqual(replaceInText('x', '', 'y'), { text: 'x', count: 0 })
})

test('replaceInItems: text, connector and class box; code and locked items are skipped', () => {
  const items = [
    text(1, 'Redis cache, redis'),
    text(2, 'Redis', { locked: true }),
    code(3, 'const redis = 1'),
    link(4, 'to Redis'),
    box(5, { classBox: { name: 'RedisClient', attributes: '- redis: Redis', methods: '+ get()' } }),
    { kind: 'opaque', raw: { kind: 'future', text: 'redis' } },
  ]
  const result = replaceInItems(items, ' redis ', 'Cache')
  assert.equal(result.replacements, 6)
  assert.equal(result.changedItems, 3)
  assert.equal(result.items[0].text, 'Cache cache, Cache')
  assert.equal(result.items[1], items[1])
  assert.equal(result.items[2], items[2])
  assert.equal(result.items[3].label, 'to Cache')
  assert.deepEqual({ ...result.items[4].classBox }, { name: 'CacheClient', attributes: '- Cache: Cache', methods: '+ get()' })
  assert.equal(result.items[5], items[5])
  assert.equal(replaceInItems(items, 'zzz', 'a').items, items)
  assert.equal(replaceInItems(items, '   ', 'a').items, items)
  assert.equal(items[0].text, 'Redis cache, redis')
})

test('replaceInItems: a replacement equal to the match changes nothing', () => {
  const items = [text(1, 'Redis')]
  assert.equal(replaceInItems(items, 'redis', 'Redis').items, items)
})

test('replaceInItems: a label is re-measured and a centred label keeps its centre', () => {
  const label = text(1, 'cat', { x: 100, width: 40, align: 'center' })
  const result = replaceInItems([label], 'cat', 'a much longer name')
  const next = result.items[0]
  assert.ok(next.width > label.width)
  assert.equal(next.x + next.width / 2, label.x + label.width / 2)
  assert.equal(next.y, label.y)
  const left = replaceInItems([text(2, 'cat', { x: 100, width: 40 })], 'cat', 'a much longer name').items[0]
  assert.equal(left.x, 100)
})

test('replaceInItems: a label that becomes empty is removed', () => {
  const result = replaceInItems([text(1, 'gone'), text(2, 'stay')], 'gone', '')
  assert.deepEqual(result.items.map((item) => item.id), [2])
  assert.equal(result.changedItems, 1)
})

test('replaceInItems: a class box grows to fit longer text and attached connectors follow', () => {
  const cls = box(1, { classBox: { name: 'A', attributes: '', methods: '' }, width: 60, height: 40 })
  const attached = { ...link(2), end: p(60, 20), endAttachment: { rectangleId: 1, side: 'right', offsetX: 60, offsetY: 20 } }
  const result = replaceInItems([cls, attached], 'A', 'AVeryLongClassNameForTheBox')
  const grown = result.items[0]
  assert.ok(grown.width > cls.width)
  assert.equal(grown.x, cls.x)
  assert.ok(result.items[1].end.x > 60)
})

test('replaceInItems: a connector label is cleaned (length cap, blank removes it and its size)', () => {
  const long = 'x'.repeat(600)
  const capped = replaceInItems([link(1, 'to cache')], 'cache', long).items[0]
  assert.equal(capped.label.length, 500)
  const blank = replaceInItems([{ ...link(2, 'cache'), labelFontSize: 30, labelPosition: 0.3 }], 'cache', '  ').items[0]
  assert.equal(blank.label, undefined)
  assert.equal(blank.labelFontSize, undefined)
  assert.equal(blank.labelPosition, undefined)
})

test('replaceOne changes only the given item', () => {
  const items = [text(1, 'redis'), text(2, 'redis')]
  const result = replaceOne(items, 'text:2', 'redis', 'cache')
  assert.equal(result.items[0], items[0])
  assert.equal(result.items[1].text, 'cache')
  assert.equal(result.replacements, 1)
  assert.equal(result.changedItems, 1)
})

test('Find after Replace all finds nothing for the old query', () => {
  const items = [text(1, 'Redis'), link(2, 'redis')]
  assert.equal(searchCanvas([replaceInItems(items, 'redis', 'Cache').items], 'redis').length, 0)
})

test('replace across pages: one undo step per changed page, on that page\'s own history', () => {
  const current = [text(1, 'redis one')]
  const second = [text(2, 'redis two'), text(3, 'redis three')]
  const third = [text(4, 'untouched')]
  const existing = new CanvasSnapshotHistory()
  existing.record([])
  const pages = [
    { items: current, history: new CanvasSnapshotHistory() },
    { items: second, history: null },
    { items: third, history: null },
    { items: [text(5, 'redis four')], history: existing },
  ]
  const result = replaceAcrossPages(pages, 0, current, 'redis', 'cache')
  assert.equal(result.replacements, 4)
  assert.equal(result.changedItems, 4)
  assert.equal(result.pagesChanged, 3)
  assert.equal(result.currentItems[0].text, 'cache one')
  assert.equal(pages[0].items, current, 'the current page is left to the caller')
  assert.equal(pages[0].history.canUndo, false)
  assert.deepEqual(pages[1].items.map((item) => item.text), ['cache two', 'cache three'])
  assert.equal(pages[2].history, null)
  assert.equal(pages[2].items, third)
  // One step each: undoing restores the old items, a second undo has nothing.
  const undone = pages[1].history.undo(pages[1].items)
  assert.deepEqual(undone.map((item) => item.text), ['redis two', 'redis three'])
  assert.equal(pages[1].history.undo(undone), null)
  assert.equal(pages[3].items[0].text, 'cache four')
  assert.equal(pages[3].history.capture().undo.length, 2)
  pages[3].history.undo(pages[3].items)
  assert.equal(pages[3].history.undo([]).length, 0, 'the earlier step is still there')
})

test('replace across pages: one item on one page; nothing to replace leaves every page alone', () => {
  const pages = [{ items: [text(1, 'redis')], history: null }, { items: [text(2, 'redis')], history: null }]
  const one = replaceAcrossPages(pages, 0, pages[0].items, 'redis', 'cache', { only: { pageIndex: 1, key: 'text:2' } })
  assert.equal(one.replacements, 1)
  assert.equal(one.currentItems, pages[0].items)
  assert.equal(pages[1].items[0].text, 'cache')
  const none = replaceAcrossPages(pages, 0, pages[0].items, 'absent', 'x')
  assert.equal(none.pagesChanged, 0)
  assert.equal(pages[0].history, null)
})

test('toast text', () => {
  assert.equal(replaceToast(6, 4), 'Replaced 6 in 4 items')
  assert.equal(replaceToast(1, 1), 'Replaced 1 in 1 item')
  assert.equal(replaceToast(0, 0), 'Nothing to replace')
})

test('wiring: Ctrl+H, shortcut help, palette, FindBar replace row, App', async () => {
  assert.deepEqual(input.keyCommand(key('h', { ctrlKey: true }), 'desktop'), { kind: 'findReplace' })
  assert.deepEqual(input.keyCommand(key('f', { ctrlKey: true }), 'desktop'), { kind: 'find' })
  assert.ok(input.ALWAYS_PREVENT_DEFAULT_COMMANDS.has('findReplace'))
  const row = shortcuts.DESKTOP_SHORTCUTS.find((entry) => entry.keys === 'Ctrl+H')
  assert.equal(row?.label, 'Find and replace')
  assert.equal(row.input.key, 'h')
  assert.ok(palette.shortcutPaletteEntries().some((entry) => entry.label === 'Find and replace'))
  const bar = await readFile(new URL('../src/app/FindBar.tsx', import.meta.url), 'utf8')
  assert.match(bar, /Replace \(Ctrl\+H\)/)
  assert.match(bar, /aria-label="Replace with"/)
  assert.match(bar, />Replace all</)
  assert.match(bar, /onClick=\{onReplaceAll\}/)
  assert.match(app, /case 'findReplace': openFind\(true\)/)
  assert.match(app, /replaceAcrossPages\(pagesRef\.current/)
  assert.match(app, /onReplaceAll=\{replaceAllFind\}/)
  assert.match(app, /showToast\(replaceToast\(/)
})
