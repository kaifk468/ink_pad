import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFileSync } from 'node:fs'

const { insertBoxIntoConnector, canInsertBoxIntoConnector, INSERT_BOX_WIDTH, INSERT_BOX_HEIGHT } = await loadModule('insertIntoConnector.ts')
const { contextMenuEntries } = await loadModule('desktopInput.ts')
const { getConnectorRenderSpec, connectorSecondEndpoint } = await loadModule('canvasModel.ts')
const app = await readAppSource()

const box = (id, x, y, w = 100, h = 60) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 2 })
const pt = (x, y) => ({ x, y, pressure: 1 })
const conn = (id, start, end, extra = {}) => ({ kind: 'connector', id, start: pt(...start), end: pt(...end), strokeColor: '#c0392b', strokeWidth: 4, relationshipType: 'association', reversed: false, ...extra })
const ids = { rectangle: 50, connector: 60 }
const find = (items, kind, id) => items.find((i) => i.kind === kind && i.id === id)
const heads = (c) => { const spec = getConnectorRenderSpec(c); const set = new Set(); if (spec.endpoint) set.add(spec.endpoint); const s = connectorSecondEndpoint(c); if (s) set.add(s); return [...set].sort() }

test('straight connector between two boxes is split on a centred box', () => {
  const items = [box(1, 0, 0), box(2, 600, 0), conn(7, [100, 30], [600, 30], { startAttachment: { rectangleId: 1, offsetX: 100, offsetY: 30 }, endAttachment: { rectangleId: 2, offsetX: 0, offsetY: 30 }, relationshipType: 'directed-association' })]
  const r = insertBoxIntoConnector(items, 7, ids)
  assert.ok(r)
  assert.equal(r.box.width, INSERT_BOX_WIDTH)
  assert.equal(r.box.height, INSERT_BOX_HEIGHT)
  assert.deepEqual([r.box.x + r.box.width / 2, r.box.y + r.box.height / 2], [350, 30])
  assert.ok(!r.box.ellipse && !r.box.diamond && !r.box.hldShape)
  const first = find(r.items, 'connector', 7)
  const second = find(r.items, 'connector', 60)
  assert.deepEqual(first.startAttachment, { rectangleId: 1, offsetX: 100, offsetY: 30 })
  assert.deepEqual(first.endAttachment, { rectangleId: 50, offsetX: 0, offsetY: 50 })
  assert.deepEqual([first.end.x, first.end.y], [270, 30])
  assert.deepEqual(second.startAttachment, { rectangleId: 50, offsetX: 160, offsetY: 50 })
  assert.deepEqual(second.endAttachment, { rectangleId: 2, offsetX: 0, offsetY: 30 })
  assert.deepEqual([second.end.x, second.end.y], [600, 30])
  assert.equal(second.strokeColor, '#c0392b')
  assert.equal(second.strokeWidth, 4)
  assert.equal(second.relationshipType, 'directed-association')
  assert.equal(r.items.length, items.length + 2)
  assert.equal(items.length, 3)
})

test('heads: a one-way arrow keeps its head on the second part only', () => {
  const r = insertBoxIntoConnector([conn(7, [0, 0], [400, 0], { relationshipType: 'directed-association' })], 7, ids)
  assert.deepEqual(heads(find(r.items, 'connector', 7)), [])
  assert.deepEqual(heads(find(r.items, 'connector', 60)), ['end'])
})

test('heads: a reversed arrow keeps its head on the first part only', () => {
  const r = insertBoxIntoConnector([conn(7, [0, 0], [400, 0], { relationshipType: 'directed-association', reversed: true })], 7, ids)
  assert.deepEqual(heads(find(r.items, 'connector', 7)), ['start'])
  assert.deepEqual(heads(find(r.items, 'connector', 60)), [])
})

test('heads: a two-way arrow gets one head at each outer end', () => {
  const r = insertBoxIntoConnector([conn(7, [0, 0], [400, 0], { relationshipType: 'directed-association', twoWay: true })], 7, ids)
  const first = find(r.items, 'connector', 7)
  const second = find(r.items, 'connector', 60)
  assert.deepEqual(heads(first), ['start'])
  assert.deepEqual(heads(second), ['end'])
  assert.equal(first.twoWay, undefined)
  assert.equal(second.twoWay, undefined)
})

test('a dashed kind that loses its symbol keeps dashing; a kept symbol keeps its kind', () => {
  const r = insertBoxIntoConnector([conn(7, [0, 0], [400, 0], { relationshipType: 'realization' })], 7, ids)
  const first = find(r.items, 'connector', 7)
  assert.equal(first.relationshipType, 'association')
  assert.equal(first.dash, 'dashed')
  assert.equal(find(r.items, 'connector', 60).relationshipType, 'realization')
  const own = insertBoxIntoConnector([conn(7, [0, 0], [400, 0], { relationshipType: 'composition', dash: 'dotted' })], 7, ids)
  assert.equal(find(own.items, 'connector', 7).relationshipType,
    heads(find(own.items, 'connector', 7)).length ? 'composition' : 'association')
  assert.equal(find(own.items, 'connector', 7).dash, 'dotted')
  assert.equal(find(own.items, 'connector', 60).dash, 'dotted')
})

test('labels: start + middle label stay first, end label moves to the second', () => {
  const items = [conn(7, [0, 0], [400, 0], { label: 'calls', labelFontSize: 24, labelPosition: 0.3, startLabel: '1', endLabel: '*' })]
  const r = insertBoxIntoConnector(items, 7, ids)
  const first = find(r.items, 'connector', 7)
  const second = find(r.items, 'connector', 60)
  assert.equal(first.label, 'calls')
  assert.equal(first.labelFontSize, 24)
  assert.equal(first.labelPosition, undefined)
  assert.equal(first.startLabel, '1')
  assert.equal(first.endLabel, undefined)
  assert.equal(second.endLabel, '*')
  assert.equal(second.startLabel, undefined)
  assert.equal(second.label, undefined)
  assert.equal(second.labelFontSize, undefined)
})

test('free ends stay free; box sides face the other ends', () => {
  const r = insertBoxIntoConnector([conn(7, [100, 500], [100, 100])], 7, ids)
  const first = find(r.items, 'connector', 7)
  const second = find(r.items, 'connector', 60)
  assert.equal(first.startAttachment, undefined)
  assert.equal(second.endAttachment, undefined)
  assert.deepEqual(first.start, pt(100, 500))
  assert.deepEqual(second.end, pt(100, 100))
  assert.deepEqual(first.endAttachment, { rectangleId: 50, offsetX: 80, offsetY: 100 })
  assert.deepEqual(second.startAttachment, { rectangleId: 50, offsetX: 80, offsetY: 0 })
  assert.deepEqual([first.end.x, first.end.y], [r.box.x + 80, r.box.y + 100])
})

test('elbow routing is kept on both parts and the box sits on the routed midpoint', () => {
  const items = [box(1, 0, 0, 100, 60), box(2, 500, 400, 100, 60), conn(7, [100, 30], [500, 430], { routing: 'elbow', bend: 40, startAttachment: { rectangleId: 1, offsetX: 100, offsetY: 30 }, endAttachment: { rectangleId: 2, offsetX: 0, offsetY: 30 } })]
  const r = insertBoxIntoConnector(items, 7, ids)
  const first = find(r.items, 'connector', 7)
  const second = find(r.items, 'connector', 60)
  assert.equal(first.routing, 'elbow')
  assert.equal(second.routing, 'elbow')
  assert.equal(first.bend, undefined)
  assert.equal(second.bend, undefined)
  assert.equal(first.routedPath, undefined)
  assert.equal(second.routedPath, undefined)
  const cx = r.box.x + r.box.width / 2
  const cy = r.box.y + r.box.height / 2
  assert.ok(cx > 100 && cx < 500 && cy > 30 && cy < 430)
})

test('locked, missing and id clashes return null; ids are unique', () => {
  assert.equal(insertBoxIntoConnector([conn(7, [0, 0], [400, 0], { locked: true })], 7, ids), null)
  assert.equal(canInsertBoxIntoConnector([conn(7, [0, 0], [400, 0], { locked: true })], 7), false)
  assert.equal(canInsertBoxIntoConnector([conn(7, [0, 0], [400, 0])], 7), true)
  assert.equal(insertBoxIntoConnector([conn(7, [0, 0], [400, 0])], 8, ids), null)
  assert.equal(insertBoxIntoConnector([box(50, 0, 0), conn(7, [0, 0], [400, 0])], 7, ids), null)
  assert.equal(insertBoxIntoConnector([conn(60, [0, 0], [10, 0]), conn(7, [0, 0], [400, 0])], 7, ids), null)
  const r = insertBoxIntoConnector([box(1, 0, 0), conn(7, [0, 0], [400, 0])], 7, ids)
  const keys = r.items.map((i) => `${i.kind}:${i.id}`)
  assert.equal(new Set(keys).size, keys.length)
})

test('default new-shape style and workspace clamp apply to the box', () => {
  const r = insertBoxIntoConnector([conn(7, [0, 0], [40, 0])], 7, ids, { style: { fill: '#ffeeaa', rounded: true, width: 3 }, workspace: { x: 0, y: 0, width: 1000, height: 1000 } })
  assert.equal(r.box.fillColor, '#ffeeaa')
  assert.equal(r.box.strokeWidth, 3)
  assert.ok(r.box.x >= 0 && r.box.y >= 0)
})

test('menu row, panel button, palette entry and wiring', () => {
  const base = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }
  assert.ok(contextMenuEntries({ ...base, canInsertBox: true }).some((e) => e.action === 'insertBox' && e.label === 'Insert box' && !e.disabled))
  assert.ok(!contextMenuEntries({ ...base }).some((e) => e.action === 'insertBox'))
  assert.match(app, /const insertBoxIntoSelectedConnector = \(\): boolean => \{[\s\S]*?insertBoxIntoConnector\([\s\S]*?saveHistory\(\)[\s\S]*?strokesRef\.current = /)
  assert.match(app, /inputModeRef\.current === 'desktop'[\s\S]{0,400}openTextEditor\(\{ itemId: null[\s\S]{0,300}mergeHistory: true/)
  assert.match(app, /case 'insertBox': insertBoxIntoSelectedConnector\(\)/)
  assert.match(app, /canInsertBox: canInsertBoxNow\(\)/)
  assert.match(app, /id: 'connector:insert-box', label: 'Insert box into connector'/)
  assert.match(app, /onInsertBox: \(\) => \{ insertBoxIntoSelectedConnector\(\) \}/)
  const panel = readFileSync(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /aria-label="Insert box"[\s\S]*?disabled=\{!relationship\.canInsertBox\}[\s\S]*?onClick=\{relationship\.onInsertBox\}/)
})
