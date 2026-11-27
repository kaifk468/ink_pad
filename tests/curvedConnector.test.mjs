import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const model = await loadModule('canvasModel.ts')
const route = await loadModule('connectorRoute.ts')
const handles = await loadModule('connectorHandles.ts')
const format = await loadModule('documentFormat.ts')
const input = await loadModule('desktopInput.ts')
const flip = await loadModule('flipSelection.ts')
const exp = await loadModule('excalidrawExport.ts')
const insert = await loadModule('insertIntoConnector.ts')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')

const p = (x, y) => ({ x, y, pressure: 1 })
const rect = (id, x, y, w = 200, h = 120) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 3 })
const A = rect(1, 0, 0)
const B = rect(2, 500, 300)
const curved = (extra = {}) => ({
  ...model.createConnector(7, p(200, 60), p(500, 360), '#111', 3, { rectangleId: 1, offsetX: 200, offsetY: 60 }, { rectangleId: 2, offsetX: 0, offsetY: 60 }, 'directed-association'),
  routing: 'curved', ...extra,
})
const routed = (c) => route.routeConnectors([A, B, c]).at(-1)
const path = (c) => routed(c).routedPath

test('curve: exact end points, dense, leaves A to the right and enters B from the left', () => {
  const pts = path(curved())
  assert.equal(pts.length, route.CURVE_SEGMENTS + 1)
  assert.ok(pts.length >= 24)
  assert.deepEqual([pts[0].x, pts[0].y], [200, 60])
  assert.deepEqual([pts.at(-1).x, pts.at(-1).y], [500, 360])
  assert.ok(pts[1].x > pts[0].x && Math.abs(pts[1].y - pts[0].y) < (pts[1].x - pts[0].x) * 0.2)
  assert.ok(pts.at(-1).x > pts.at(-2).x && Math.abs(pts.at(-1).y - pts.at(-2).y) < (pts.at(-1).x - pts.at(-2).x) * 0.2)
})

test('curve: top/bottom sides use vertical normals; free ends aim at each other', () => {
  const top = { ...model.createConnector(8, p(100, 120), p(600, 300), '#111', 3, { rectangleId: 1, offsetX: 100, offsetY: 120 }, { rectangleId: 2, offsetX: 100, offsetY: 0 }, 'association'), routing: 'curved' }
  const pts = route.routeConnectors([A, B, top]).at(-1).routedPath
  assert.ok(pts[1].y > pts[0].y && Math.abs(pts[1].x - pts[0].x) < Math.abs(pts[1].y - pts[0].y) * 0.3)
  const free = { ...model.createConnector(9, p(0, 500), p(300, 500), '#111', 3), routing: 'curved' }
  const fp = route.routeConnectors([free]).at(-1).routedPath
  assert.ok(fp.every((q) => Math.abs(q.y - 500) < 0.001))
  assert.equal(route.curvedPath(p(5, 5), p(5, 5)).length, 2)
})

test('bend moves the middle sideways by exactly the bend; ends stay', () => {
  const base = path(curved())
  const bent = path(curved({ bend: 60 }))
  const mid = (pts) => pts[route.CURVE_SEGMENTS / 2]
  const normal = route.curveNormal(p(200, 60), p(500, 360))
  const moved = { x: mid(bent).x - mid(base).x, y: mid(bent).y - mid(base).y }
  assert.ok(Math.abs(moved.x - normal.x * 60) < 1e-9 && Math.abs(moved.y - normal.y * 60) < 1e-9)
  assert.deepEqual([bent[0].x, bent.at(-1).y], [200, 360])
})

test('arrowhead has a usable size and follows the curve end', () => {
  const geometry = model.getConnectorSymbolGeometry(routed(curved()))
  assert.ok(geometry)
  const length = Math.hypot(geometry.base.x - geometry.tip.x, geometry.base.y - geometry.tip.y)
  assert.ok(length >= 11, `head length ${length}`)
  assert.ok(geometry.towardOther.x < -0.8)
})

test('routing switches: curved <-> straight <-> elbow drop the bend', () => {
  const items = [A, B, curved({ bend: 40 })]
  const toElbow = model.updateConnectorRouting(items, 7, 'elbow')
  assert.equal(toElbow[2].routing, 'elbow')
  assert.equal(toElbow[2].bend, undefined)
  const toCurved = model.updateConnectorRouting(toElbow, 7, 'curved')
  assert.equal(toCurved[2].routing, 'curved')
  assert.equal('routing' in model.updateConnectorRouting(items, 7, 'straight')[2], false)
  assert.equal(model.updateConnectorRouting(items, 7, 'curved')[2], items[2])
})

test('handles: middle dot on the curve middle; drag sets bend; click makes it straight', () => {
  const items = [A, B, curved()]
  const r = route.routeConnectors(items).at(-1)
  const dot = handles.connectorHandlePositions(r).middle
  const middle = r.routedPath[route.CURVE_SEGMENTS / 2]
  assert.ok(Math.hypot(dot.x - middle.x, dot.y - middle.y) < 10)
  const normal = route.curveNormal(r.start, r.end)
  const target = p(dot.x + normal.x * 80, dot.y + normal.y * 80)
  const bend = handles.bendForDrag(items, 7, dot, target, 0)
  assert.ok(Math.abs(bend - 80) < 2, `bend ${bend}`)
  const next = handles.setConnectorBend(items, 7, bend)
  assert.equal(next[2].bend, bend)
  assert.equal(handles.bendForDrag(items, 7, dot, p(dot.x + normal.x * 1e6, dot.y + normal.y * 1e6), 0), model.MAX_CONNECTOR_BEND)
  const clicked = handles.toggleConnectorRouting(next, 7)
  assert.equal(clicked[2].routing, undefined)
  assert.equal(clicked[2].bend, undefined)
  assert.equal(handles.toggleConnectorRouting([A, B, { ...curved(), routing: undefined }], 7)[2].routing, 'elbow')
})

test('format: curved (and bend) round-trip unchanged; old straight / elbow files unchanged; junk dropped', () => {
  const doc = (connector) => {
    const result = format.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 1, title: 'T', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z', items: [A, B, connector] }))
    assert.equal(result.ok, true)
    return format.stringifyDocument(result.document)
  }
  const base = { kind: 'connector', id: 7, start: p(200, 60), end: p(500, 360), strokeColor: '#111', strokeWidth: 3, relationshipType: 'association', reversed: false }
  for (const extra of [{ routing: 'curved' }, { routing: 'curved', bend: -42 }, { routing: 'elbow' }, {}]) {
    const text = doc({ ...base, ...extra })
    assert.equal(format.stringifyDocument(format.parseDocument(text).document), text)
  }
  assert.match(doc({ ...base, routing: 'curved', bend: -42 }), /"routing":\s*"curved"/)
  assert.match(doc({ ...base, routing: 'curved', bend: -42 }), /"bend":\s*-42/)
  assert.doesNotMatch(doc({ ...base, routing: 'wavy' }), /routing/)
  assert.doesNotMatch(doc({ ...base, routing: 'curved', routedPath: [p(0, 0), p(1, 1)] }), /routedPath/)
})

test('flip mirrors a curved bend; insert box keeps curved routing; Excalidraw export is a rounded arrow', () => {
  const items = [A, B, curved({ bend: 50 })]
  const flipped = flip.flipSelectionItems(items, new Set(['rectangle:1', 'rectangle:2', 'connector:7']), 'horizontal')
  assert.equal(flipped.find((i) => i.kind === 'connector').bend, -50)
  const result = insert.insertBoxIntoConnector(items, 7, { rectangle: 20, connector: 21 })
  assert.equal(result.first.routing, 'curved')
  assert.equal(result.second.routing, 'curved')
  assert.equal(result.first.bend, undefined)
  const arrow = exp.buildExcalidrawElements(items).elements.find((el) => el.type === 'arrow')
  assert.deepEqual(arrow.roundness, { type: 2 })
  assert.ok(arrow.points.length >= 5 && arrow.points.length < route.CURVE_SEGMENTS)
})

test('desktop right-click: line shape chips, current one disabled', () => {
  const state = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }
  const chips = input.contextMenuEntries({ ...state, lineShape: 'curved' }).filter((e) => e.chipGroup === 'Line shape')
  assert.deepEqual(chips.map((e) => [e.action, e.disabled]), [['lineStraight', false], ['lineElbow', false], ['lineCurved', true]])
  assert.equal(input.contextMenuEntries(state).some((e) => e.chipGroup === 'Line shape'), false)
})

test('wiring: panel offers Straight / Elbow / Curved; palette entry; handler cases', () => {
  assert.match(panel, />Straight<\/button>[\s\S]*>Elbow<\/button>[\s\S]*>Curved<\/button>/)
  assert.match(panel, /onRouting\('curved'\)/)
  assert.match(app, /id: 'connector:curved', label: 'Curved connector'/)
  assert.match(app, /case 'lineCurved': changeSelectedConnectorRouting\('curved'\)/)
  assert.match(app, /updateConnectorRouting\(strokesRef\.current, selectedConnectorId, routing\)/)
})

test('a free diagonal curved connector bows away from the straight line (walk fix)', () => {
  const start = { x: 0, y: 0, pressure: 0.5 }
  const end = { x: 600, y: 250, pressure: 0.5 }
  const path = route.curvedPath(start, end)
  const len = Math.hypot(600, 250)
  const off = Math.max(...path.map((p) => Math.abs((p.x * 250 - p.y * 600) / len)))
  assert.ok(off > 20, `curve should leave the straight line, max offset ${off}`)
  assert.deepEqual([path[0].x, path[0].y, path.at(-1).x, path.at(-1).y], [0, 0, 600, 250])
  // A free horizontal connector stays straight.
  const flat = route.curvedPath(start, { x: 500, y: 0, pressure: 0.5 })
  assert.ok(flat.every((p) => Math.abs(p.y) < 1e-6))
})
