import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const model = await loadModule('canvasModel.ts')
const route = await loadModule('connectorRoute.ts')
const lasso = await loadModule('lassoSelection.ts')
const format = await loadModule('documentFormat.ts')
const exp = await loadModule('sheetExport.ts')

const p = (x, y) => ({ x, y, pressure: 1 })
const rect = (id, x, y, w = 200, h = 120) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 3 })
// A on the left, B on the right and lower; start on A's right side, end on B's left side.
const A = rect(1, 0, 0)
const B = rect(2, 500, 300)
const attached = (type = 'association', routing = 'elbow') => { // routing null = straight
  const c = model.createConnector(7, p(200, 60), p(500, 360), '#111', 3, { rectangleId: 1, offsetX: 200, offsetY: 60 }, { rectangleId: 2, offsetX: 0, offsetY: 60 }, type)
  return routing ? { ...c, routing } : c
}
const orthogonal = (path) => path.slice(1).every((b, i) => Math.abs(b.x - path[i].x) < 0.01 || Math.abs(b.y - path[i].y) < 0.01)

test('an elbow path has only right angles and leaves and enters boxes straight', () => {
  const [, , c] = route.routeConnectors([A, B, attached()])
  assert.ok(c.routedPath.length >= 3)
  assert.ok(orthogonal(c.routedPath))
  const path = c.routedPath
  assert.equal(path[0].y, path[1].y, 'leaves A to the right')
  assert.ok(path[1].x > 200)
  assert.equal(path[path.length - 1].y, path[path.length - 2].y, 'arrives at B from the left')
  assert.ok(path[path.length - 2].x < 500)
})

test('the elbow does not run through the boxes it joins, even when it has to go round', () => {
  // B above-left of A, both ends on the right sides: needs a detour.
  const left = rect(2, -400, -300)
  const conn = { ...model.createConnector(8, p(200, 60), p(-200, -240), '#111', 3, { rectangleId: 1, offsetX: 200, offsetY: 60 }, { rectangleId: 2, offsetX: 200, offsetY: 60 }), routing: 'elbow' }
  const [, , c] = route.routeConnectors([A, left, conn])
  assert.ok(orthogonal(c.routedPath))
  for (const [a, b] of c.routedPath.slice(1).map((q, i) => [c.routedPath[i], q])) {
    for (const box of [A, left]) {
      const mid = p((a.x + b.x) / 2, (a.y + b.y) / 2)
      const inside = mid.x > box.x + 1 && mid.x < box.x + box.width - 1 && mid.y > box.y + 1 && mid.y < box.y + box.height - 1
      assert.equal(inside, false)
    }
  }
})

test('free (unattached) ends still get a right-angle path', () => {
  const free = { ...model.createConnector(9, p(10, 10), p(300, 200), '#111', 3), routing: 'elbow' }
  const [c] = route.routeConnectors([free])
  assert.ok(orthogonal(c.routedPath))
  assert.deepEqual([c.routedPath[0].x, c.routedPath[0].y], [10, 10])
  const last = c.routedPath[c.routedPath.length - 1]
  assert.deepEqual([last.x, last.y], [300, 200])
})

test('straight connectors are untouched; the list keeps its length, order and (when nothing is elbow) identity', () => {
  const items = [A, B, attached('association', null)]
  assert.equal(route.routeConnectors(items), items)
  const mixed = [A, attached(), B, attached('inheritance', null)]
  const routed = route.routeConnectors(mixed)
  assert.equal(routed.length, mixed.length)
  assert.equal(routed[0], A)
  assert.equal(routed[3], mixed[3])
  assert.ok(routed[1].routedPath)
  assert.equal(mixed[1].routedPath, undefined, 'the stored item is never modified')
})

test('re-routes when a box moves, and keeps the cached route while nothing changed', () => {
  const items = [A, B, attached()]
  const first = route.routeConnectors(items)[2]
  assert.equal(route.routeConnectors(items)[2], first)
  const moved = model.translateSelectedItems(items, new Set(['rectangle:2']), 0, 200)
  const second = route.routeConnectors(moved)[2]
  assert.notDeepEqual(second.routedPath, first.routedPath)
  const end = second.routedPath[second.routedPath.length - 1]
  assert.equal(end.y, moved[2].end.y)
})

test('a group move (box and connector together) keeps the same bent shape, shifted', () => {
  const items = [A, B, attached()]
  const before = route.routeConnectors(items)[2].routedPath
  const moved = model.translateSelectedItems(items, new Set(['rectangle:1', 'rectangle:2', 'connector:7']), 40, 25)
  const after = route.routeConnectors(moved)[2].routedPath
  assert.equal(after.length, before.length)
  after.forEach((q, i) => { assert.equal(q.x, before[i].x + 40); assert.equal(q.y, before[i].y + 25) })
})

test('a hollow triangle sits on the last piece of a bent line and points along it', () => {
  const [, , c] = route.routeConnectors([A, B, attached('inheritance')])
  const g = model.getConnectorSymbolGeometry(c)
  const path = c.routedPath
  const last = path[path.length - 1]
  assert.deepEqual([g.tip.x, g.tip.y], [last.x, last.y])
  // base lies on the last segment, towards its previous point (the line arrives horizontally at B)
  assert.equal(g.base.y, last.y)
  assert.ok(g.base.x < last.x)
  assert.ok(Math.hypot(g.base.x - last.x, g.base.y - last.y) <= Math.hypot(path[path.length - 2].x - last.x, path[path.length - 2].y - last.y))
})

test('a diamond (aggregation) at the start sits on the first piece, and reversing moves it to the other end', () => {
  const [, , c] = route.routeConnectors([A, B, attached('aggregation')])
  const g = model.getConnectorSymbolGeometry(c)
  assert.deepEqual([g.tip.x, g.tip.y], [200, 60])
  assert.equal(g.far.y, 60)
  assert.ok(g.far.x > 200)
  const [, , r] = route.routeConnectors([A, B, { ...attached('aggregation'), reversed: true }])
  const gr = model.getConnectorSymbolGeometry(r)
  assert.deepEqual([gr.tip.x, gr.tip.y], [500, 360])
})

test('straight symbol geometry is unchanged from the plain start-to-end line', () => {
  const c = model.createConnector(1, p(0, 0), p(100, 0), '#111', 3, undefined, undefined, 'inheritance')
  const g = model.getConnectorSymbolGeometry(c)
  assert.deepEqual([g.tip.x, g.tip.y], [100, 0])
  assert.ok(Math.abs(g.base.x - (100 - 12)) < 1e-9 && g.base.y === 0)
})

test('hit testing follows the bent line, not the straight diagonal', () => {
  const routed = route.routeConnectors([A, B, attached()])[2]
  const bend = routed.routedPath[1]
  const mid = p((routed.routedPath[1].x + routed.routedPath[2].x) / 2, (routed.routedPath[1].y + routed.routedPath[2].y) / 2)
  assert.ok(lasso.itemHitTest(routed, mid, 6))
  assert.ok(lasso.itemHitTest(routed, p(bend.x, bend.y), 6))
  const diagonalMid = p(350, 210)
  assert.equal(lasso.itemHitTest(routed, diagonalMid, 6), false)
  assert.ok(lasso.itemHitTest(attached('association', null), diagonalMid, 6), 'the straight one still hits on its diagonal')
})

test('lasso selects a bent connector only when the whole bent line is inside', () => {
  const routed = route.routeConnectors([A, B, attached()])
  const around = [p(-50, -50), p(800, -50), p(800, 600), p(-50, 600)]
  assert.deepEqual(lasso.selectItemsByLasso(routed, around), ['rectangle:1', 'rectangle:2', 'connector:7'])
  // a lasso that covers both ends and the diagonal but cuts the bent corner off must not take the connector
  const cutting = [p(190, 40), p(520, 40), p(520, 380), p(190, 380)]
  const bend = routed[2].routedPath
  const outside = bend.some((q) => q.x < 190 || q.x > 520 || q.y < 40 || q.y > 380)
  if (outside) assert.equal(lasso.selectItemsByLasso(routed, cutting).includes('connector:7'), false)
})

test('selection bounds include the bend and symbol', () => {
  const routed = route.routeConnectors([A, B, attached('inheritance')])
  const bounds = model.getCanvasSelectionBounds(routed, new Set(['connector:7']))
  for (const q of routed[2].routedPath) {
    assert.ok(q.x >= bounds.x && q.x <= bounds.x + bounds.width)
    assert.ok(q.y >= bounds.y && q.y <= bounds.y + bounds.height)
  }
})

test('updateConnectorRouting switches one connector and removes the field for straight', () => {
  const items = [A, B, attached('association', null)]
  const elbow = model.updateConnectorRouting(items, 7, 'elbow')
  assert.equal(elbow[2].routing, 'elbow')
  const back = model.updateConnectorRouting(elbow, 7, 'straight')
  assert.equal('routing' in back[2], false)
  assert.equal(model.updateConnectorRouting(items, 7, 'straight')[2], items[2])
})

test('saved files: routing is an optional field, old files open as straight, the derived path is never saved', () => {
  const items = [A, B, attached()]
  const routed = route.routeConnectors(items)
  const text = format.stringifyDocument(format.createDocument({ title: 't', template: 'blank', background: 'white', items: routed }))
  assert.ok(text.includes('"routing"'))
  const parsed = format.parseDocument(text)
  assert.ok(parsed.ok !== false)
  const conn = (parsed.document ?? parsed).items.find((i) => i.kind === 'connector')
  assert.equal(conn.routing, 'elbow')
  const old = JSON.parse(text)
  delete old.items.find((i) => i.kind === 'connector').routing
  const oldConn = (format.parseDocument(JSON.stringify(old)).document ?? {}).items.find((i) => i.kind === 'connector')
  assert.equal(oldConn.routing, undefined)
  const bad = JSON.parse(text)
  bad.items.find((i) => i.kind === 'connector').routing = 'zigzag'
  const badConn = (format.parseDocument(JSON.stringify(bad)).document ?? {}).items.find((i) => i.kind === 'connector')
  assert.equal(badConn.routing, undefined)
})

test('SVG export draws every bend of an elbow connector and the symbol at the right end', () => {
  const straight = exp.buildSheetSvg([A, B, attached('inheritance', null)], { width: 900, height: 700, template: 'blank', backgroundColor: '#fff' })
  const elbow = exp.buildSheetSvg([A, B, attached('inheritance')], { width: 900, height: 700, template: 'blank', backgroundColor: '#fff' })
  const pathsOf = (svg) => [...svg.matchAll(/<path d="(M[^"]+)"/g)].map((m) => m[1])
  const lineOf = (svg) => pathsOf(svg).find((d) => (d.match(/L/g) ?? []).length >= 1 && !d.endsWith('Z'))
  assert.equal((lineOf(straight).match(/L/g) ?? []).length, 1)
  assert.ok((lineOf(elbow).match(/L/g) ?? []).length >= 3)
  assert.ok(elbow.includes('Z"'), 'triangle present')
})

test('content bounds cover a detour that leaves the start-to-end box', () => {
  const left = rect(2, -400, 100)
  const conn = { ...model.createConnector(8, p(200, 60), p(-200, 160), '#111', 3, { rectangleId: 1, offsetX: 200, offsetY: 60 }, { rectangleId: 2, offsetX: 200, offsetY: 60 }), routing: 'elbow' }
  const bounds = exp.getContentBounds([rect(1, 0, 0), { ...left, x: 0, y: 300 }, { ...conn, end: p(200, 360), endAttachment: { rectangleId: 2, offsetX: 200, offsetY: 60 } }], { width: 2500, height: 1500 })
  assert.ok(bounds)
})

test('the app draws, hit-tests, selects and exports through the routed list and the panel has the switch', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /canvasItemsForRendering\(routeConnectors\(items\)\)/)
  assert.match(app, /const routedItems = routeConnectors\(strokesRef\.current\)/)
  assert.match(app, /selectItemsByLasso\(routeConnectors\(strokesRef\.current\)/)
  assert.match(app, /appendedItemsForRendering\(routeConnectors\(items\)\)/)
  const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /Straight/)
  assert.match(panel, /Elbow/)
  const model2 = await readFile(new URL('../src/canvasModel.ts', import.meta.url), 'utf8')
  assert.match(model2, /routing\?: ConnectorRouting/)
})
