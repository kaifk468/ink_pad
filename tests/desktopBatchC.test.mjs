import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const model = await loadModule('canvasModel.ts')
const flow = await loadModule('diagramFlow.ts')
const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const clip = await loadModule('clipboard.ts')
const ink = await loadModule('inkClassBox.ts')
const app = await readAppSource()

const p = (x, y) => ({ x, y, pressure: 0.5 })
const box = (id, x, y, w = 100, h = 60, extra = {}) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#c00000', strokeWidth: 3, ...extra })
const hld = (id, x, y) => box(id, x, y, 120, 80, { hldShape: 'database', inkBox: { top: y + 12, mid: y + 40, ink: [] } })
const klass = (id, x, y) => box(id, x, y, 100, 60, { classBox: { name: 'A', attributes: '', methods: '' } })
const inkClass = (id, x, y) => box(id, x, y, 100, 60, { inkBox: { top: y + 10, mid: y + 30, ink: [] } })
const label = (id, x, y, w = 40, h = 20) => ({ kind: 'text', id, x, y, width: w, height: h, text: 'hi', fontSize: 16, color: '#000' })
const WS = { x: -2000, y: -2000, width: 8000, height: 8000 }
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })

// 11
test('arrowToolCreates: a connector when either end is on a box', () => {
  assert.equal(flow.arrowToolCreates(true, false), 'connector')
  assert.equal(flow.arrowToolCreates(false, true), 'connector')
  assert.equal(flow.arrowToolCreates(true, true), 'connector')
  assert.equal(flow.arrowToolCreates(false, false), 'stroke')
})

test('arrowToolConnector attaches both ends, one end, or returns null', () => {
  const items = [box(1, 0, 0), box(2, 400, 0)]
  const style = { id: 7, color: '#123456', width: 5, dash: 'dashed' }
  const both = flow.arrowToolConnector(items, p(50, 30), p(450, 30), style, 36)
  assert.equal(both.relationshipType, 'directed-association')
  assert.equal(both.startAttachment.rectangleId, 1)
  assert.equal(both.endAttachment.rectangleId, 2)
  assert.equal(both.strokeColor, '#123456')
  assert.equal(both.strokeWidth, 5)
  assert.equal(both.dash, 'dashed')
  assert.equal(both.reversed, false)
  const startOnly = flow.arrowToolConnector(items, p(50, 30), p(250, 300), { id: 8, color: '#000', width: 3, }, 36)
  assert.equal(startOnly.startAttachment.rectangleId, 1)
  assert.equal(startOnly.endAttachment, undefined)
  assert.deepEqual([startOnly.end.x, startOnly.end.y], [250, 300])
  assert.equal(startOnly.dash, undefined)
  assert.equal(flow.arrowToolConnector(items, p(250, 300), p(260, 400), style, 36), null)
})

test('arrowToolConnector ignores class boxes and ink class boxes but takes HLD shapes', () => {
  assert.equal(flow.arrowToolConnector([klass(1, 0, 0)], p(50, 30), p(500, 500), { id: 1, color: '#000', width: 3 }, 36), null)
  assert.equal(flow.arrowToolConnector([inkClass(1, 0, 0)], p(50, 30), p(500, 500), { id: 1, color: '#000', width: 3 }, 36), null)
  assert.equal(flow.arrowToolConnector([hld(1, 0, 0)], p(50, 30), p(500, 500), { id: 1, color: '#000', width: 3 }, 36).startAttachment.rectangleId, 1)
})

test('arrow connector wiring: desktop, mouse, arrow tool only; one undo step; selected', () => {
  assert.match(app, /lineTool === 'arrow' && inputModeRef\.current === 'desktop' && mouseGestureRef\.current/)
  assert.match(app, /arrowToolConnector\(strokesRef\.current/)
  assert.match(app, /selectNewConnectorRef\.current\(canvasItemKey\(arrowConnector\)\)/)
})

// 12
test('Ctrl+Arrow maps to quickCreate in desktop only; plain arrows still nudge', () => {
  assert.deepEqual(input.keyCommand(key('ArrowRight', { ctrlKey: true }), 'desktop'), { kind: 'quickCreate', direction: 'right' })
  assert.deepEqual(input.keyCommand(key('ArrowUp', { metaKey: true }), 'desktop'), { kind: 'quickCreate', direction: 'up' })
  assert.equal(input.keyCommand(key('ArrowRight', { ctrlKey: true }), 'tablet'), null)
  assert.equal(input.keyCommand(key('ArrowDown', { ctrlKey: true, repeat: true }), 'desktop'), null)
  assert.deepEqual(input.keyCommand(key('ArrowRight'), 'desktop'), { kind: 'nudge', dx: 1, dy: 0 })
  assert.deepEqual(input.keyCommand(key('ArrowLeft', { shiftKey: true }), 'desktop'), { kind: 'nudge', dx: -10, dy: 0 })
})

test('quickCreatePlacement: gap 80, centre line, all four directions', () => {
  const s = { x: 100, y: 100, width: 100, height: 60 }
  assert.deepEqual(flow.quickCreatePlacement(s, 'right', [], WS), { x: 280, y: 100 })
  assert.deepEqual(flow.quickCreatePlacement(s, 'left', [], WS), { x: -80, y: 100 })
  assert.deepEqual(flow.quickCreatePlacement(s, 'down', [], WS), { x: 100, y: 240 })
  assert.deepEqual(flow.quickCreatePlacement(s, 'up', [], WS), { x: 100, y: -40 })
})

test('quickCreatePlacement steps sideways around obstacles, caps at 10, and clamps to the workspace', () => {
  const s = { x: 100, y: 100, width: 100, height: 60 }
  const first = { x: 280, y: 100, width: 100, height: 60 }
  assert.deepEqual(flow.quickCreatePlacement(s, 'right', [first], WS), { x: 280, y: 200 })
  const second = { x: 280, y: 200, width: 100, height: 60 }
  assert.deepEqual(flow.quickCreatePlacement(s, 'right', [first, second], WS), { x: 280, y: 0 })
  const wall = { x: 250, y: -5000, width: 500, height: 10000 }
  assert.equal(flow.quickCreatePlacement(s, 'right', [wall], WS), null)
  const tight = { x: 0, y: 0, width: 1000, height: 1000 }
  const placed = flow.quickCreatePlacement({ x: 800, y: 900, width: 100, height: 60 }, 'right', [], tight)
  assert.ok(placed.x + 100 <= 1000 && placed.x >= 0)
})

test('quickCreateConnected: same kind, empty, new ids, attached to facing sides', () => {
  const src = box(1, 100, 100, 100, 60, { diamond: true, fillColor: '#ffeeaa', dash: 'dashed', seed: 5, angle: 0 })
  const made = flow.quickCreateConnected([src], src, 'right', WS, { rectangle: 9, connector: 4 }, ink.newInkBoxContent)
  assert.equal(made.box.id, 9)
  assert.equal(made.box.diamond, true)
  assert.equal(made.box.fillColor, '#ffeeaa')
  assert.equal(made.box.dash, 'dashed')
  assert.equal(made.box.strokeColor, '#c00000')
  assert.equal(made.box.seed, undefined)
  assert.equal(made.box.inkBox, undefined)
  assert.equal(made.box.width, 100)
  assert.equal(made.connector.id, 4)
  assert.equal(made.connector.relationshipType, 'directed-association')
  assert.deepEqual(made.connector.startAttachment, { rectangleId: 1, offsetX: 100, offsetY: 30 })
  assert.deepEqual(made.connector.endAttachment, { rectangleId: 9, offsetX: 0, offsetY: 30 })
  assert.deepEqual([made.connector.start.x, made.connector.start.y, made.connector.end.x, made.connector.end.y], [200, 130, 280, 130])
  const down = flow.quickCreateConnected([src], src, 'down', WS, { rectangle: 9, connector: 4 }, ink.newInkBoxContent)
  assert.deepEqual(down.connector.startAttachment, { rectangleId: 1, offsetX: 50, offsetY: 60 })
  assert.deepEqual(down.connector.endAttachment, { rectangleId: 9, offsetX: 50, offsetY: 0 })
})

test('quickCreateConnected: an HLD shape gets an empty ink box; class boxes are refused', () => {
  const src = hld(1, 0, 0)
  src.inkBox.ink.push({ kind: 'stroke', id: 1, points: [p(1, 1), p(5, 5)], color: '#000', width: 2, erase: false })
  const made = flow.quickCreateConnected([src], src, 'right', WS, { rectangle: 2, connector: 1 }, ink.newInkBoxContent)
  assert.equal(made.box.hldShape, 'database')
  assert.deepEqual(made.box.inkBox.ink, [])
  assert.equal(made.box.inkBox.top > made.box.y, true)
  assert.equal(flow.quickCreateConnected([klass(1, 0, 0)], klass(1, 0, 0), 'right', WS, { rectangle: 2, connector: 1 }, ink.newInkBoxContent), null)
  assert.equal(flow.quickCreateConnected([inkClass(1, 0, 0)], inkClass(1, 0, 0), 'right', WS, { rectangle: 2, connector: 1 }, ink.newInkBoxContent), null)
})

test('quick create: fans out on repeat and ignores existing connectors as obstacles', () => {
  const src = box(1, 100, 100)
  let items = [src]
  const ys = []
  for (let i = 0; i < 3; i += 1) {
    const made = flow.quickCreateConnected(items, src, 'right', WS, { rectangle: 10 + i, connector: i }, ink.newInkBoxContent)
    ys.push(made.box.y)
    items = [...items, made.box, made.connector]
  }
  assert.deepEqual(ys, [100, 200, 0])
})

test('quick create wiring and shortcut rows', () => {
  assert.match(app, /case 'quickCreate': return quickCreateShape\(command\.direction\)/)
  assert.ok(shortcuts.DESKTOP_SHORTCUTS.some((row) => row.input && row.input.key === 'ArrowRight' && row.input.ctrlKey))
})

// 13
test('labelsInside: only labels fully inside a chosen flow box, not already chosen, not class boxes', () => {
  const items = [box(1, 0, 0, 200, 100), label(2, 20, 20), label(3, 190, 20), label(4, 500, 500), hld(5, 1000, 0), label(6, 1010, 20), klass(7, 2000, 0), label(8, 2010, 10)]
  assert.deepEqual(flow.labelsInside(items, new Set(['rectangle:1'])), ['text:2'])
  assert.deepEqual(flow.labelsInside(items, new Set(['rectangle:1', 'text:2'])), [])
  assert.deepEqual(flow.labelsInside(items, new Set(['rectangle:5'])), ['text:6'])
  assert.deepEqual(flow.labelsInside(items, new Set(['rectangle:7'])), [])
  assert.deepEqual(flow.labelsInside(items, new Set()), [])
})

test('labelsInside respects diamond and ellipse outlines', () => {
  const items = [box(1, 0, 0, 200, 200, { diamond: true }), label(2, 5, 5), label(3, 80, 90), box(4, 500, 0, 200, 200, { ellipse: true }), label(5, 505, 5)]
  assert.deepEqual(flow.labelsInside(items, new Set(['rectangle:1'])), ['text:3'])
  assert.deepEqual(flow.labelsInside(items, new Set(['rectangle:4'])), [])
})

test('shapeDoubleClick: new centred label, or edit the label already inside', () => {
  const b = box(1, 0, 0, 200, 100)
  const none = flow.shapeDoubleClick([b], 1)
  assert.equal(none.kind, 'newLabel')
  assert.deepEqual([none.centre.x, none.centre.y], [100, 50])
  assert.deepEqual(flow.shapeDoubleClick([b, label(4, 20, 20)], 1), { kind: 'editLabel', id: 4 })
  assert.equal(flow.shapeDoubleClick([klass(1, 0, 0)], 1), null)
  assert.equal(flow.shapeDoubleClick([inkClass(1, 0, 0)], 1), null)
  assert.equal(flow.shapeDoubleClick([hld(1, 0, 0)], 1).kind, 'newLabel')
})

test('centreLabelOn and wiring for type-in-shape and label carrying', () => {
  const l = flow.centreLabelOn(label(1, 0, 0, 40, 20), { x: 100, y: 50 })
  assert.deepEqual([l.x, l.y], [80, 40])
  assert.match(app, /const shapeAction = shapeHit\?\.kind === 'rectangle' \? shapeDoubleClick/)
  assert.match(app, /selectionMode \? hitTarget/)
  assert.match(app, /inputModeRef\.current !== 'desktop' \|\| event\.pointerType !== 'mouse'\) return keys/)
  assert.match(app, /withCarriedLabels\(event, drag\.originalItems/)
  assert.match(app, /withCarriedLabels\(event, lassoDrag\.originalItems/)
})

// 14
test('duplicate no longer writes the in-app clipboard', () => {
  assert.doesNotMatch(app, /duplicateSelection = \(\): boolean => copySelection\(\)/)
  const dup = app.slice(app.indexOf('const duplicateSelection'), app.indexOf('const duplicateSelection') + 500)
  assert.doesNotMatch(dup, /clipboardRef/)
  assert.match(dup, /pasteItems\(copied/)
  const items = [box(1, 0, 0)]
  const copied = clip.copyItems(items, new Set(['rectangle:1']))
  const r = clip.pasteItems(copied, { stroke: 1, rectangle: 2, connector: 1, text: 1 }, clip.PASTE_OFFSET, WS, null)
  assert.equal(r.items[0].x, 24)
})
