import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const h = await loadModule('connectorHandles.ts')
const m = await loadModule('canvasModel.ts')
const route = await loadModule('connectorRoute.ts')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const pt = (x, y) => ({ x, y, pressure: 1 })
const box = (id, x, y, w = 100, hh = 60) => ({ kind: 'rectangle', id, x, y, width: w, height: hh, strokeColor: '#111', strokeWidth: 2 })
const conn = (id, s, e, extra = {}) => ({ kind: 'connector', id, start: s, end: e, strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false, ...extra })

test('handles: ends and a middle dot on the drawn path', () => {
  const c = conn(1, pt(0, 0), pt(100, 0))
  const p = h.connectorHandlePositions(c)
  assert.deepEqual([p.start.x, p.end.x, p.middle.x, p.middle.y], [0, 100, 50, 0])
  assert.equal(h.hitConnectorHandle(c, pt(2, 3), 1), 'start')
  assert.equal(h.hitConnectorHandle(c, pt(98, 0), 1), 'end')
  assert.equal(h.hitConnectorHandle(c, pt(50, 4), 1), 'middle')
  assert.equal(h.hitConnectorHandle(c, pt(30, 0), 1), null)
})

test('hit radius is larger for pen and touch and shrinks with zoom (screen pixels / scale)', () => {
  const c = conn(1, pt(0, 0), pt(100, 0))
  assert.equal(h.hitConnectorHandle(c, pt(12, 0), 1, 'mouse'), null)
  assert.equal(h.hitConnectorHandle(c, pt(12, 0), 1, 'pen'), 'start')
  assert.equal(h.hitConnectorHandle(c, pt(12, 0), 1, 'touch'), 'start')
  assert.equal(h.hitConnectorHandle(c, pt(12, 0), 2, 'pen'), null)
  assert.equal(h.hitConnectorHandle(c, pt(12, 0), 0.5, 'mouse'), 'start')
})

test('elbow connector: the middle dot is halfway along the routed path', () => {
  const a = box(1, 0, 0), b = box(2, 300, 200)
  const c = conn(3, pt(100, 30), pt(300, 230), { routing: 'elbow', startAttachment: { rectangleId: 1, offsetX: 100, offsetY: 30 }, endAttachment: { rectangleId: 2, offsetX: 0, offsetY: 30 } })
  const routed = route.routeConnectors([a, b, c])[2]
  const pts = routed.routedPath
  assert.ok(pts.length > 2)
  const mid = h.connectorHandlePositions(routed).middle
  const seg = (p, q) => Math.hypot(q.x - p.x, q.y - p.y)
  const total = pts.slice(1).reduce((s, q, i) => s + seg(pts[i], q), 0)
  // Walk to the middle dot along the path: the distance covered must be half the length.
  let covered = 0
  let found = false
  for (let i = 1; i < pts.length && !found; i += 1) {
    const onSegment = Math.abs(seg(pts[i - 1], mid) + seg(mid, pts[i]) - seg(pts[i - 1], pts[i])) < 1e-6
    if (onSegment) { covered += seg(pts[i - 1], mid); found = true } else covered += seg(pts[i - 1], pts[i])
  }
  assert.ok(found, 'the dot lies on the routed path')
  assert.ok(Math.abs(covered - total / 2) < 1e-6)
})

test('only one unlocked selected connector has handles', () => {
  const c = conn(1, pt(0, 0), pt(10, 10))
  const items = [box(2, 0, 0), c]
  assert.equal(h.soleSelectedConnector(items, new Set(['connector:1'])), c)
  assert.equal(h.soleSelectedConnector(items, new Set(['connector:1', 'rectangle:2'])), null)
  assert.equal(h.soleSelectedConnector(items, new Set(['rectangle:2'])), null)
  assert.equal(h.soleSelectedConnector(items, new Set()), null)
  assert.equal(h.soleSelectedConnector([{ ...c, locked: true }], new Set(['connector:1'])), null)
})

test('dragging an end onto a box attaches it on the outline; onto empty canvas detaches it', () => {
  const b = box(2, 200, 0)
  const c = conn(1, pt(0, 30), pt(150, 30))
  const items = [b, c]
  const snapped = h.snapEndpointTarget(pt(250, 30), items, 0)
  assert.equal(snapped.attachment.rectangleId, 2)
  const attached = h.moveConnectorEndpoint(items, 1, 'end', pt(250, 30), snapped)
  assert.equal(attached[0], b)
  assert.deepEqual([attached[1].end.x, attached[1].end.y], [250, 0], 'sits on the nearest outline (top edge), not inside')
  assert.deepEqual(attached[1].endAttachment, snapped.attachment)
  assert.equal(attached[1].startAttachment, undefined)
  // The attached end follows the box afterwards.
  const before = attached[1].end.x
  const moved = m.translateSelectedItems(attached, new Set(['rectangle:2']), 50, 0)
  assert.equal(moved[1].end.x, before + 50)
  // Drop on empty canvas: free, attachment gone.
  assert.equal(h.snapEndpointTarget(pt(600, 400), items, 0), null)
  const freed = h.moveConnectorEndpoint(attached, 1, 'end', pt(600, 400), null)
  assert.deepEqual([freed[1].end.x, freed[1].end.y], [600, 400])
  assert.equal('endAttachment' in freed[1], false)
})

test('moving one end keeps the other end and its attachment; originals are not mutated', () => {
  const start = { rectangleId: 1, offsetX: 100, offsetY: 30 }
  const c = conn(3, pt(100, 30), pt(300, 30), { startAttachment: start, routing: 'elbow' })
  const items = [box(1, 0, 0), c]
  const out = h.moveConnectorEndpoint(items, 3, 'end', pt(400, 90), null)
  assert.deepEqual(out[1].startAttachment, start)
  assert.equal(out[1].routing, 'elbow')
  assert.deepEqual(items[1].end, pt(300, 30))
  const startMoved = h.moveConnectorEndpoint(items, 3, 'start', pt(5, 5), null)
  assert.equal('startAttachment' in startMoved[1], false)
})

test('middle click toggles routing straight <-> elbow', () => {
  const items = [conn(1, pt(0, 0), pt(50, 50))]
  const elbow = h.toggleConnectorRouting(items, 1)
  assert.equal(elbow[0].routing, 'elbow')
  const back = h.toggleConnectorRouting(elbow, 1)
  assert.equal('routing' in back[0], false)
  assert.equal(h.toggleConnectorRouting(items, 99), items)
})

test('App wiring: handle gesture ref, one history step, cancel restores, busy checks, drawing', () => {
  assert.match(app, /from '\.\/connectorHandles'/)
  assert.match(app, /const activeEndpointRef = useRef</)
  assert.match(app, /startConnectorHandleGesture\(event, point\)/)
  assert.match(app, /startConnectorHandleGesture\(event, getPoint\(event\)\)/, 'touch can start it too')
  assert.match(app, /activeEndpointRef\.current\?\.pointerId === event\.pointerId\) \{ moveConnectorHandleGesture/)
  assert.match(app, /finishConnectorHandleGesture\(\); return/)
  assert.match(app, /cancelConnectorHandleGesture\(\); return/, 'pointercancel')
  assert.match(app, /if \(activeEndpointRef\.current\) \{ cancelConnectorHandleGesture\(\); handled = true \}/, 'Escape')
  const busy = app.match(/activeRotateRef\.current !== null/g).length
  assert.equal(app.match(/activeRotateRef\.current !== null \|\| activeEndpointRef\.current !== null/g).length, busy, 'every busy check lists it')
  assert.match(app, /connectorHandlePositions\(handleConnector\)/)
  assert.match(app, /toggleConnectorRouting\(gesture\.originalItems/)
})
