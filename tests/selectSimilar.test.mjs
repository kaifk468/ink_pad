import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { similarItemKeys } = await loadModule('selectSimilar.ts')
const input = await loadModule('desktopInput.ts')
const app = await readAppSource()
const p = (x, y) => ({ x, y, pressure: 1 })
const box = (id, extra = {}) => ({ kind: 'rectangle', id, x: 0, y: 0, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2, ...extra })
const pen = (id, extra = {}) => ({ kind: 'stroke', id, points: [p(0, 0), p(5, 5)], color: '#000', width: 3, erase: false, ...extra })
const link = (id, extra = {}) => ({ kind: 'connector', id, start: p(0, 0), end: p(9, 9), strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false, ...extra })
const label = (id, extra = {}) => ({ kind: 'text', id, x: 0, y: 0, width: 80, height: 30, text: 'hi', fontSize: 24, color: '#111', ...extra })
const code = (id, extra = {}) => ({ kind: 'code', id, x: 0, y: 0, width: 80, height: 40, text: 'a', language: 'typescript', ...extra })
const base = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }

test('connectors, labels and code blocks match by kind; locked ones are skipped', () => {
  const items = [link(1), link(2, { locked: true }), link(3), label(1), label(2), code(1), code(2), box(1)]
  assert.deepEqual(similarItemKeys(items, 'connector:1'), ['connector:1', 'connector:3'])
  assert.deepEqual(similarItemKeys(items, 'text:2'), ['text:1', 'text:2'])
  assert.deepEqual(similarItemKeys(items, 'code:1'), ['code:1', 'code:2'])
  assert.deepEqual(similarItemKeys(items, 'connector:2'), [])
})

test('rectangles match by shape variant', () => {
  const items = [box(1), box(2), box(3, { diamond: true }), box(4, { diamond: true }), box(5, { ellipse: true }), box(6, { hldShape: 'database' }), box(7, { hldShape: 'database' }), box(8, { hldShape: 'queue' }),
    box(9, { classBox: { name: 'A', attributes: '', methods: '' } }), box(10, { classBox: { name: 'B', attributes: '', methods: '' } }), box(11, { inkBox: { top: 10, mid: 20, ink: [] } })]
  assert.deepEqual(similarItemKeys(items, 'rectangle:1'), ['rectangle:1', 'rectangle:2'])
  assert.deepEqual(similarItemKeys(items, 'rectangle:3'), ['rectangle:3', 'rectangle:4'])
  assert.deepEqual(similarItemKeys(items, 'rectangle:5'), ['rectangle:5'])
  assert.deepEqual(similarItemKeys(items, 'rectangle:6'), ['rectangle:6', 'rectangle:7'])
  assert.deepEqual(similarItemKeys(items, 'rectangle:9'), ['rectangle:9', 'rectangle:10'])
  assert.deepEqual(similarItemKeys(items, 'rectangle:11'), ['rectangle:11'])
})

test('strokes match by shape; eraser strokes are excluded; groups are not expanded', () => {
  const items = [pen(1), pen(2), pen(3, { shape: 'arrow' }), pen(4, { shape: 'arrow', group: 1 }), pen(5, { shape: 'line' }), pen(6, { erase: true })]
  assert.deepEqual(similarItemKeys(items, 'stroke:1'), ['stroke:1', 'stroke:2'])
  assert.deepEqual(similarItemKeys(items, 'stroke:3'), ['stroke:3', 'stroke:4'])
  assert.deepEqual(similarItemKeys(items, 'stroke:6'), [])
  assert.deepEqual(similarItemKeys(items, 'missing:1'), [])
})

test('menu entry and App wiring: select tool, no history, toast', () => {
  assert.ok(input.contextMenuEntries({ ...base, canSelectSimilar: true }).some((e) => e.action === 'selectSimilar' && !e.disabled))
  assert.ok(!input.contextMenuEntries(base).some((e) => e.action === 'selectSimilar'))
  const start = app.indexOf('const selectSimilarItems')
  const body = app.slice(start, start + 700)
  assert.match(body, /similarItemKeys/)
  assert.match(body, /toggleSelectTool/)
  assert.doesNotMatch(body, /saveHistory/)
  assert.match(app, /case 'selectSimilar': selectSimilarItems\(\)/)
})
