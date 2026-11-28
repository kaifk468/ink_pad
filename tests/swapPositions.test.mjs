import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { swapPositionsItems, canSwapPositions } = await loadModule('swapPositions.ts')
const { contextMenuEntries } = await loadModule('desktopInput.ts')
const app = await readAppSource()

const box = (id, x, y, w = 100, h = 60, extra = {}) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 2, ...extra })
const label = (id, x, y, extra = {}) => ({ kind: 'text', id, x, y, width: 40, height: 20, text: 'hi', fontSize: 16, color: '#111', ...extra })
const conn = (id, from, fromOff, to, toOff) => ({
  kind: 'connector', id, start: { x: 0, y: 0, pressure: 0.5 }, end: { x: 0, y: 0, pressure: 0.5 }, strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false,
  startAttachment: { rectangleId: from, offsetX: fromOff[0], offsetY: fromOff[1] }, endAttachment: { rectangleId: to, offsetX: toOff[0], offsetY: toOff[1] },
})
const keys = (...k) => new Set(k)
const find = (items, kind, id) => items.find((i) => i.kind === kind && i.id === id)

test('swaps centres, keeps sizes, moves inside labels', () => {
  const items = [box(1, 0, 0, 100, 60), box(2, 400, 200, 200, 100), label(1, 30, 20), label(2, 450, 230)]
  const out = swapPositionsItems(items, keys('rectangle:1', 'rectangle:2'))
  const a = find(out, 'rectangle', 1)
  const b = find(out, 'rectangle', 2)
  assert.deepEqual([a.x + a.width / 2, a.y + a.height / 2, a.width, a.height], [500, 250, 100, 60])
  assert.deepEqual([b.x + b.width / 2, b.y + b.height / 2, b.width, b.height], [50, 30, 200, 100])
  const la = find(out, 'text', 1)
  assert.deepEqual([la.x, la.y], [480, 240])
  const lb = find(out, 'text', 2)
  assert.deepEqual([lb.x, lb.y], [0, 10])
  assert.equal(items[0].x, 0, 'input untouched')
})

test('attached connectors follow both ends', () => {
  const items = [box(1, 0, 0), box(2, 400, 0), box(3, 0, 300), conn(1, 1, [100, 30], 2, [0, 30]), { ...conn(2, 3, [50, 0], 1, [50, 60]), start: { x: 50, y: 300, pressure: 0.5 } }]
  const out = swapPositionsItems(items, keys('rectangle:1', 'rectangle:2'))
  const c1 = find(out, 'connector', 1)
  assert.deepEqual([c1.start.x, c1.start.y, c1.end.x, c1.end.y], [500, 30, 0, 30])
  const c2 = find(out, 'connector', 2)
  assert.deepEqual([c2.start.x, c2.start.y, c2.end.x, c2.end.y], [50, 300, 450, 60])
  assert.equal(find(out, 'rectangle', 3), items[2])
})

test('selection must be exactly two eligible boxes', () => {
  const items = [box(1, 0, 0), box(2, 400, 0), box(3, 0, 300), box(4, 400, 300, 100, 60, { locked: true }), box(5, 800, 0, 100, 60, { group: 1 }), box(6, 0, 600, 100, 60, { classBox: { name: 'A', stereotype: 'class', attributes: [], methods: [] } })]
  assert.equal(swapPositionsItems(items, keys('rectangle:1')), null)
  assert.equal(swapPositionsItems(items, keys('rectangle:1', 'rectangle:2', 'rectangle:3')), null)
  assert.equal(swapPositionsItems(items, keys('rectangle:1', 'rectangle:4')), null, 'locked')
  assert.equal(swapPositionsItems(items, keys('rectangle:1', 'rectangle:5')), null, 'grouped')
  assert.equal(swapPositionsItems(items, keys('rectangle:1', 'rectangle:6')), null, 'class box')
  assert.equal(canSwapPositions(items, keys('rectangle:1', 'rectangle:2')), true)
  assert.equal(canSwapPositions(items, keys('rectangle:1')), false)
})

test('a box inside the other is refused; same centres are a no-op; workspace clamps', () => {
  assert.equal(swapPositionsItems([box(1, 0, 0, 500, 500), box(2, 100, 100)], keys('rectangle:1', 'rectangle:2')), null)
  assert.equal(swapPositionsItems([box(1, 0, 0, 100, 60), box(2, 0, 0, 100, 60)], keys('rectangle:1', 'rectangle:2')), null)
  const out = swapPositionsItems([box(1, 0, 0, 100, 60), box(2, 300, 0, 400, 60)], keys('rectangle:1', 'rectangle:2'), { x: 0, y: 0, width: 700, height: 500 })
  assert.equal(find(out, 'rectangle', 2).x, 0)
  assert.equal(find(out, 'rectangle', 1).x, 450)
})

test('menu chip, palette entry and wiring', () => {
  const base = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: null, anyLocked: false }
  assert.ok(contextMenuEntries({ ...base, canSwap: true }).some((e) => e.action === 'swapPositions'))
  assert.ok(!contextMenuEntries({ ...base }).some((e) => e.action === 'swapPositions'))
  assert.match(app, /const swapPositionsSelection = \(\): boolean => \{[\s\S]*?saveHistory\(\)[\s\S]*?strokesRef\.current = result/)
  assert.match(app, /case 'swapPositions': swapPositionsSelection\(\)/)
  assert.match(app, /id: 'arrange:swap'/)
  assert.match(app, /canSwap: canSwapPositions\(/)
})
