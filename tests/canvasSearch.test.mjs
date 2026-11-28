import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFile } from 'node:fs/promises'

const { searchCanvas, searchFingerprint, sameSearchFingerprint } = await loadModule('canvasSearch.ts')
const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const app = await readAppSource()
const p = (x, y) => ({ x, y, pressure: 1 })
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
const text = (id, t, extra = {}) => ({ kind: 'text', id, x: 0, y: 0, width: 80, height: 30, text: t, fontSize: 24, color: '#111', ...extra })
const code = (id, t, extra = {}) => ({ kind: 'code', id, x: 0, y: 0, width: 80, height: 40, text: t, language: 'typescript', ...extra })
const box = (id, extra = {}) => ({ kind: 'rectangle', id, x: 0, y: 0, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2, ...extra })
const link = (id, label) => ({ kind: 'connector', id, start: p(0, 0), end: p(10, 10), strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false, ...(label ? { label } : {}) })
const stroke = (id) => ({ kind: 'stroke', id, points: [p(0, 0), p(5, 5)], color: '#000', width: 3, erase: false })

test('search fingerprint changes with an in-place label edit that keeps arrays, item count and text length', () => {
  const page = [text(1, 'cat'), stroke(2)]
  const before = searchFingerprint([page])
  assert.ok(sameSearchFingerprint(before, searchFingerprint([page])))
  page[0].text = 'car'
  assert.equal(sameSearchFingerprint(before, searchFingerprint([page])), false)
  assert.equal(sameSearchFingerprint(searchFingerprint([[text(1, 'a')], []]), searchFingerprint([[text(1, 'a'), text(2, 'b')]])), false)
  assert.match(app, /sameSearchFingerprint\(cache\.fingerprint, fingerprint\)/)
})

test('empty or blank query finds nothing', () => {
  const pages = [[text(1, 'Redis cache')]]
  assert.deepEqual(searchCanvas(pages, ''), [])
  assert.deepEqual(searchCanvas(pages, '   '), [])
  assert.deepEqual(searchCanvas([], 'x'), [])
})

test('finds text, connector labels, class box parts and code blocks, case-insensitive, trimmed', () => {
  const pages = [[
    text(1, 'Redis cache'),
    link(2, 'reads from REDIS'),
    box(3, { classBox: { name: 'UserService', attributes: '- redisClient: Redis', methods: '+ get(id)' } }),
    code(4, 'const redis = new Redis()'),
    stroke(5),
    box(6),
    link(7),
  ]]
  const found = searchCanvas(pages, '  Redis ')
  assert.deepEqual(found.map((m) => [m.pageIndex, m.key, m.kind]), [
    [0, 'text:1', 'text'],
    [0, 'connector:2', 'connector'],
    [0, 'rectangle:3', 'classBox'],
    [0, 'code:4', 'code'],
  ])
  for (const m of found) assert.ok(m.snippet.toLowerCase().includes('redis'), m.snippet)
  assert.deepEqual(searchCanvas(pages, 'userservice').map((m) => m.key), ['rectangle:3'])
  assert.deepEqual(searchCanvas(pages, 'get(id)').map((m) => m.key), ['rectangle:3'])
  assert.deepEqual(searchCanvas(pages, 'zzz'), [])
})

test('results are in page order, then item order; locked items are found, opaque ones skipped', () => {
  const pages = [
    [text(1, 'api gateway'), text(2, 'other')],
    [],
    [text(3, 'API v2', { locked: true }), { kind: 'opaque', id: 9, box: null, raw: { text: 'api' } }, code(4, 'GET /api')],
  ]
  assert.deepEqual(searchCanvas(pages, 'api').map((m) => [m.pageIndex, m.key]), [[0, 'text:1'], [2, 'text:3'], [2, 'code:4']])
})

test('a long text gives a short one-line snippet around the match', () => {
  const long = `${'lorem ipsum '.repeat(30)}NEEDLE${' dolor sit'.repeat(30)}`
  const [match] = searchCanvas([[text(1, long)]], 'needle')
  assert.ok(match.snippet.includes('NEEDLE'))
  assert.ok(match.snippet.length < 90, String(match.snippet.length))
  const [multi] = searchCanvas([[text(1, 'first line\nsecond line')]], 'second')
  assert.ok(!multi.snippet.includes('\n'))
})

test('Ctrl/Cmd+F is the find command: no Shift, no Alt, no repeat, desktop only, never left to the browser', () => {
  assert.deepEqual(input.keyCommand(key('f', { ctrlKey: true }), 'desktop'), { kind: 'find' })
  assert.deepEqual(input.keyCommand(key('F', { metaKey: true }), 'desktop'), { kind: 'find' })
  assert.equal(input.keyCommand(key('f', { ctrlKey: true, shiftKey: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('f', { ctrlKey: true, repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('f', { ctrlKey: true }), 'tablet'), null)
  assert.equal(input.keyCommand(key('f'), 'desktop'), null)
  assert.ok(input.alwaysPreventsDefault({ kind: 'find' }, 'desktop'))
  assert.ok(shortcuts.DESKTOP_SHORTCUTS.some((row) => row.keys === 'Ctrl+F' && row.input?.key === 'f'))
})

test('App wiring: Find works without keys (More menu), searches every page incl. the live one, selects with the Select tool', async () => {
  assert.match(app, /case 'find': openFind\(\); return true/)
  assert.match(app, /onFind=\{openFind\}/)
  assert.match(app, /index === pageIndexRef\.current \? strokesRef\.current : slot\.items/)
  assert.match(app, /goToPage\(match\.pageIndex\)/)
  assert.match(app, /if \(isItemLocked\(item\)\) \{ renderAll\(\); return true \}/)
  assert.match(app, /if \(!selectionMode && !lassoMode\) toggleSelectTool\(\)\n    applySelectionState\(normalizeSelection\(expandToGroups\(strokesRef\.current, new Set\(\[match\.key\]\)\)\)\)/)
  assert.match(app, /\{findOpen && <FindBar /)
  const more = await readFile(new URL('../src/app/MoreTray.tsx', import.meta.url), 'utf8')
  assert.match(more, /aria-label="Find"/)
  const dock = await readFile(new URL('../src/app/ToolDock.tsx', import.meta.url), 'utf8')
  assert.equal((dock.match(/onFind=\{props\.onFind\}/g) ?? []).length, 2, 'More menu in both modes')
})
