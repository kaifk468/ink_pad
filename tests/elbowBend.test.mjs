import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const model = await loadModule('canvasModel.ts')
const route = await loadModule('connectorRoute.ts')
const handles = await loadModule('connectorHandles.ts')
const labels = await loadModule('connectorLabel.ts')
const format = await loadModule('documentFormat.ts')
const clip = await loadModule('clipboard.ts')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

const p = (x, y) => ({ x, y, pressure: 1 })
const rect = (id, x, y, w = 200, h = 120) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 3 })
const A = rect(1, 0, 0)
const B = rect(2, 500, 300)
// A's right side to B's left side. The default route's middle segment hugs B's stub (x = 500 - 28 = 472).
const elbow = (extra = {}) => ({
  ...model.createConnector(7, p(200, 60), p(500, 360), '#111', 3, { rectangleId: 1, offsetX: 200, offsetY: 60 }, { rectangleId: 2, offsetX: 0, offsetY: 60 }, 'association'),
  routing: 'elbow', ...extra,
})
const routed = (c, extra = []) => route.routeConnectors([A, B, ...extra, c]).at(-1)
const bound = (c) => routed(c).routedPath

test('no bend: default middle; a bend moves the middle segment sideways', () => {
  const base = bound(elbow())
  assert.equal(base.length, 4)
  assert.equal(base[1].x, 472)
  const bent = bound(elbow({ bend: -100 }))
  assert.equal(bent.length, 4)
  assert.equal(bent[1].x, 372)
  assert.equal(bent[2].x, 372)
  assert.equal(bound(elbow({ bend: -200 }))[1].x, 272)
  // a bend that would push the segment through the end box is vetoed by the own boxes
  assert.deepEqual(bound(elbow({ bend: 80 })), base)
})

test('a bend that would break the exit rules (back through the start box) falls back to the default route', () => {
  assert.deepEqual(bound(elbow({ bend: -700 })), bound(elbow()))
})

test('other boxes do not veto a bend: the user decided', () => {
  const other = rect(9, 340, 100, 60, 100) // sits on the bent middle segment (x = 372)
  assert.equal(routed(elbow({ bend: -100 }), [other]).routedPath[1].x, 372)
})

test('straight connectors and routes without a Z middle ignore the bend', () => {
  const straight = { ...model.createConnector(8, p(0, 0), p(100, 100), '#111', 3), bend: 50 }
  assert.equal(route.routeConnectors([straight])[0], straight)
  const level = { ...model.createConnector(9, p(200, 60), p(500, 60), '#111', 3), routing: 'elbow' }
  const plain = route.routeConnectors([level])[0].routedPath
  assert.deepEqual(route.routeConnectors([{ ...level, bend: 60 }])[0].routedPath, plain)
})

test('the route cache notices a changed bend', () => {
  assert.notEqual(routed(elbow({ bend: -40 })).routedPath[1].x, routed(elbow({ bend: -90 })).routedPath[1].x)
})

test('bendableMiddle: Z yes, L / C / straight no', () => {
  assert.deepEqual(route.bendableMiddle([p(0, 0), p(10, 0), p(10, 20), p(30, 20)]), { index: 1, axis: 'x' })
  assert.deepEqual(route.bendableMiddle([p(0, 0), p(0, 10), p(20, 10), p(20, 30)]), { index: 1, axis: 'y' })
  assert.equal(route.bendableMiddle([p(0, 0), p(10, 0), p(10, 20)]), null)
  assert.equal(route.bendableMiddle([p(0, 0), p(10, 0), p(10, 20), p(0, 20)]), null)
  assert.equal(route.bendableMiddle([p(0, 0), p(10, 0)]), null)
})

test('setConnectorBend and bendForPointer', () => {
  const items = [A, B, elbow()]
  assert.equal(handles.setConnectorBend(items, 7, 0), items)
  const set = handles.setConnectorBend(items, 7, -70)
  assert.equal(set[2].bend, -70)
  assert.equal(handles.setConnectorBend(set, 7, 0)[2].bend, undefined)
  assert.equal(handles.setConnectorBend(items, 7, 99999)[2].bend, 5000)
  assert.equal(handles.setConnectorBend(items, 7, Number.NaN), items)
  // pointer at x = 420; the default middle is 472, whatever bend is already set
  assert.equal(handles.bendForPointer(items, 7, p(420, 200)), -52)
  assert.equal(handles.bendForPointer(set, 7, p(420, 200)), -52)
  const { routing: _routing, ...plain } = elbow()
  assert.equal(handles.bendForPointer([A, B, plain], 7, p(420, 200)), null)
})

test('the middle dot sits on the middle of the middle segment', () => {
  assert.deepEqual(handles.connectorHandlePositions(routed(elbow())).middle, p(472, 210))
  assert.deepEqual(handles.connectorHandlePositions(routed(elbow({ bend: -100 }))).middle, p(372, 210))
})

test('with a label the middle dot sits just outside the label pad, on the path, and is hittable', () => {
  const top = rect(1, 0, 0)
  const low = rect(2, 260, 400)
  const base = { ...model.createConnector(7, p(100, 120), p(360, 400), '#111', 3, { rectangleId: 1, offsetX: 100, offsetY: 120 }, { rectangleId: 2, offsetX: 100, offsetY: 0 }, 'association'), label: 'a rather long connector label text' }
  for (const extra of [{ routing: 'elbow' }, {}]) {
    const c = route.routeConnectors([top, low, { ...base, ...extra }])[2]
    const { box, centre } = labels.connectorLabelLayout(c)
    const dot = handles.connectorHandlePositions(c).middle
    const outside = dot.x < box.x || dot.x > box.x + box.width || dot.y < box.y || dot.y > box.y + box.height
    assert.ok(outside, 'dot is clear of the pad')
    const path = model.connectorPoints(c)
    const onPath = path.slice(1).some((b, i) => {
      const a = path[i]
      return dot.x >= Math.min(a.x, b.x) - 0.01 && dot.x <= Math.max(a.x, b.x) + 0.01 && dot.y >= Math.min(a.y, b.y) - 0.01 && dot.y <= Math.max(a.y, b.y) + 0.01
        && Math.abs((b.x - a.x) * (dot.y - a.y) - (b.y - a.y) * (dot.x - a.x)) < 0.5
    })
    assert.ok(onPath, 'dot stays on the path')
    assert.equal(handles.hitConnectorHandle(c, dot, 1, 'mouse'), 'middle')
    assert.notEqual(handles.hitConnectorHandle(c, centre, 1, 'mouse'), 'middle')
  }
  const plain = route.routeConnectors([top, low, { ...base, label: undefined }])[2]
  assert.deepEqual(handles.connectorHandlePositions(plain).middle, handles.connectorHandlePositions({ ...plain, label: undefined }).middle)
})

test('switching elbow to straight drops the bend; a re-toggle starts clean', () => {
  const items = [A, B, elbow({ bend: -80 })]
  const straight = model.updateConnectorRouting(items, 7, 'straight')
  assert.equal(straight[2].bend, undefined)
  assert.equal(straight[2].routing, undefined)
  const again = handles.toggleConnectorRouting(straight, 7)
  assert.equal(again[2].routing, 'elbow')
  assert.equal(again[2].bend, undefined)
})

test('format: bend round-trips, 0/invalid are dropped, clamped, old files re-save identically', () => {
  const base = { kind: 'connector', id: 7, start: p(200, 60), end: p(500, 360), strokeColor: '#111', strokeWidth: 3, relationshipType: 'association', reversed: false, routing: 'elbow' }
  const out = (connector) => {
    const result = format.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 1, title: 'T', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z', items: [A, B, connector] }))
    assert.equal(result.ok, true)
    return format.stringifyDocument(result.document)
  }
  assert.match(out({ ...base, bend: -75.5 }), /"bend":\s*-75\.5/)
  for (const bad of [0, 'x', null, Infinity]) assert.doesNotMatch(out({ ...base, bend: bad }), /"bend"/)
  assert.match(out({ ...base, bend: 1e9 }), /"bend":\s*5000/)
  assert.match(out({ ...base, bend: -1e9 }), /"bend":\s*-5000/)
  const oldText = out(base)
  assert.doesNotMatch(oldText, /bend/)
  assert.equal(format.stringifyDocument(format.parseDocument(oldText).document), oldText)
  const bentText = out({ ...base, bend: -75.5 })
  assert.equal(format.stringifyDocument(format.parseDocument(bentText).document), bentText)
})

test('clipboard copy keeps the bend and drops only the derived path', () => {
  const items = route.routeConnectors([A, B, elbow({ bend: -60 })])
  const copied = clip.copyItems(items, new Set(['connector:7']))
  assert.equal(copied[0].bend, -60)
  assert.equal(copied[0].routedPath, undefined)
})

test('wiring: dragging the elbow middle dot sets the bend as one undo step; a click still toggles', () => {
  assert.match(app, /bendForDrag\(gesture\.originalItems, gesture\.id/)
  assert.match(app, /setConnectorBend\(gesture\.originalItems, gesture\.id, bend\)/)
  assert.match(app, /if \(gesture\.which === 'middle' && !gesture\.dragged\)/)
})
