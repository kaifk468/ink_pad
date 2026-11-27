import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFileSync } from 'node:fs'

// Round 10 #241: drop an existing free box onto a connector.
const { connectorUnderBox, insertExistingBoxIntoConnector } = await loadModule('insertIntoConnector.ts')
const { getConnectorRenderSpec, connectorSecondEndpoint } = await loadModule('canvasModel.ts')
const app = await readAppSource()

const box = (id, x, y, w = 100, h = 60) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 2 })
const pt = (x, y) => ({ x, y, pressure: 1 })
const conn = (id, start, end, extra = {}) => ({ kind: 'connector', id, start: pt(...start), end: pt(...end), strokeColor: '#c0392b', strokeWidth: 4, relationshipType: 'association', reversed: false, ...extra })
const find = (items, kind, id) => items.find((i) => i.kind === kind && i.id === id)
const heads = (c) => { const spec = getConnectorRenderSpec(c); const set = new Set(); if (spec.endpoint) set.add(spec.endpoint); const s = connectorSecondEndpoint(c); if (s) set.add(s); return [...set].sort() }
const horizontal = () => [box(1, 0, 0), box(2, 600, 0), conn(7, [100, 30], [600, 30], { startAttachment: { rectangleId: 1, offsetX: 100, offsetY: 30 }, endAttachment: { rectangleId: 2, offsetX: 0, offsetY: 30 }, relationshipType: 'directed-association', label: 'mid', startLabel: 'S', endLabel: 'E' })]
const free = (x, y, extra = {}) => ({ ...box(20, x, y, 80, 40), ...extra })

test('connectorUnderBox: finds the connector under the box centre within the screen tolerance', () => {
  const items = [...horizontal(), free(310, 60)]
  assert.equal(connectorUnderBox(items, 20, pt(350, 80), 1), null)
  assert.equal(connectorUnderBox(items, 20, pt(350, 40), 1), 7)
  assert.equal(connectorUnderBox(items, 20, pt(350, 46), 1), null) // 16 px away
  assert.equal(connectorUnderBox(items, 20, pt(350, 46), 0.5), 7) // 8 px away on screen
  assert.equal(connectorUnderBox(items, 20, pt(350, 46), 2), null)
})

test('connectorUnderBox: excludes locked connectors, boxes with connectors, locked / class / ink / rotated boxes', () => {
  const lockedConn = horizontal().map((i) => (i.kind === 'connector' ? { ...i, locked: true } : i))
  assert.equal(connectorUnderBox([...lockedConn, free(310, 0)], 20, pt(350, 30), 1), null)
  const attached = [...horizontal(), free(310, 0), conn(8, [0, 200], [350, 20], { endAttachment: { rectangleId: 20, offsetX: 40, offsetY: 20 } })]
  assert.equal(connectorUnderBox(attached, 20, pt(350, 30), 1), null)
  for (const extra of [{ locked: true }, { classBox: { name: 'A', attributes: [], methods: [] } }, { inkBox: { strokes: [] } }, { angle: 0.3 }]) {
    assert.equal(connectorUnderBox([...horizontal(), free(310, 10, extra)], 20, pt(350, 30), 1), null)
  }
  for (const extra of [{}, { hldShape: 'database' }, { fillColor: '#fff3a3' }, { ellipse: true }]) {
    assert.equal(connectorUnderBox([...horizontal(), free(310, 10, extra)], 20, pt(350, 30), 1), 7)
  }
  assert.equal(connectorUnderBox([...horizontal(), free(310, 10)], 99, pt(350, 30), 1), null)
})

test('connectorUnderBox: the nearest of two connectors wins', () => {
  const items = [...horizontal(), conn(9, [0, 300], [700, 300]), free(310, 10)]
  assert.equal(connectorUnderBox(items, 20, pt(350, 296), 1), 9)
})

test('insertExistingBoxIntoConnector: keeps size and props, centres on the path, splits like round 9', () => {
  const items = [...horizontal(), free(300, 50, { fillColor: '#fff3a3', strokeColor: '#0a0' })]
  const r = insertExistingBoxIntoConnector(items, 7, 20, pt(350, 55), { connector: 60 })
  assert.ok(r)
  assert.equal(r.box.id, 20)
  assert.deepEqual([r.box.width, r.box.height, r.box.fillColor, r.box.strokeColor], [80, 40, '#fff3a3', '#0a0'])
  assert.deepEqual([r.box.x + 40, r.box.y + 20], [350, 30])
  assert.equal(r.items.length, items.length + 1)
  assert.equal(r.items.filter((i) => i.kind === 'rectangle' && i.id === 20).length, 1)
  const first = find(r.items, 'connector', 7)
  const second = find(r.items, 'connector', 60)
  assert.deepEqual(first.startAttachment, { rectangleId: 1, offsetX: 100, offsetY: 30 })
  assert.deepEqual(first.endAttachment, { rectangleId: 20, offsetX: 0, offsetY: 20 })
  assert.deepEqual(second.startAttachment, { rectangleId: 20, offsetX: 80, offsetY: 20 })
  assert.deepEqual(second.endAttachment, { rectangleId: 2, offsetX: 0, offsetY: 30 })
  assert.deepEqual([first.end.x, first.end.y], [310, 30])
  assert.deepEqual([second.start.x, second.start.y], [390, 30])
  assert.equal(first.label, 'mid')
  assert.equal(first.startLabel, 'S')
  assert.equal(first.endLabel, undefined)
  assert.equal(second.endLabel, 'E')
  assert.equal(second.label, undefined)
  assert.deepEqual(heads(first), [])
  assert.deepEqual(heads(second), ['end'])
  assert.equal(second.strokeColor, '#c0392b')
  assert.equal(items.length, 4)
})

test('insertExistingBoxIntoConnector: a box earlier in the list keeps one copy, facing sides follow the ends, group is kept', () => {
  const items = [free(300, 50, { group: 3 }), conn(7, [400, 400], [400, 0]), box(1, 0, 0)]
  const r = insertExistingBoxIntoConnector(items, 7, 20, pt(400, 190), { connector: 60 })
  assert.ok(r)
  assert.equal(r.items.filter((i) => i.kind === 'rectangle' && i.id === 20).length, 1)
  assert.equal(r.box.group, 3)
  assert.equal(find(r.items, 'connector', 7).endAttachment.offsetY, 40)
  assert.equal(find(r.items, 'connector', 60).startAttachment.offsetY, 0)
})

test('insertExistingBoxIntoConnector: refuses locked connector, attached / missing box, id clash; workspace keeps the box inside', () => {
  const items = [...horizontal(), free(300, 50)]
  assert.equal(insertExistingBoxIntoConnector(items.map((i) => (i.id === 7 ? { ...i, locked: true } : i)), 7, 20, pt(350, 30), { connector: 60 }), null)
  assert.equal(insertExistingBoxIntoConnector([...items, conn(60, [0, 0], [1, 1])], 7, 20, pt(350, 30), { connector: 60 }), null)
  assert.equal(insertExistingBoxIntoConnector(items, 7, 99, pt(350, 30), { connector: 60 }), null)
  assert.equal(insertExistingBoxIntoConnector(items, 99, 20, pt(350, 30), { connector: 60 }), null)
  const bounded = insertExistingBoxIntoConnector(items, 7, 20, pt(350, 30), { connector: 60 }, { workspace: { x: 320, y: 0, width: 200, height: 200 } })
  assert.equal(bounded.box.x, 320)
})

test('round 10 #241 wiring: highlight, single undo step, desktop mouse only, no duplicate, toast and help', () => {
  assert.match(app, /const dropConnectorRef = useRef<number \| null>\(null\)/)
  assert.match(app, /!drag\.duplicate && inputModeRef\.current === 'desktop' && event\.pointerType === 'mouse'/)
  assert.match(app, /updateConnectorDropTarget\(event, drag, nextItems\)/)
  assert.match(app, /const dropConnectorId = dropConnectorRef\.current\s*\n\s*if \(dropConnectorId !== null\) \{/)
  assert.match(app, /if \(drag\.moved && dropConnectorId !== null\) dropBoxOnConnector\(drag\.itemKey, dropConnectorId\)/)
  const fn = app.slice(app.indexOf('const dropBoxOnConnector'), app.indexOf('// Flip selection (Shift+H'))
  assert.ok(!/saveHistory\(\)/.test(fn))
  assert.match(fn, /showActionToast\('Inserted into the arrow', \{ label: 'Undo'/)
  assert.match(app, /clearSnapGuides\(false\)\s*\n\s*dropConnectorRef\.current = null/)
  const shortcuts = readFileSync(new URL('../src/desktopShortcuts.ts', import.meta.url), 'utf8')
  assert.match(shortcuts, /Drop a box on an arrow to insert it/)
})
