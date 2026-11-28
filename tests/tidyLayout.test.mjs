import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const model = await loadModule('canvasModel.ts')
const route = await loadModule('connectorRoute.ts')
const tidy = await loadModule('tidyLayout.ts')

const p = (x, y) => ({ x, y, pressure: 1 })
const box = (id, x, y, w = 300, h = 200) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 3, classBox: { name: `C${id}`, attributes: '', methods: '' } })
const plain = (id, x, y, w = 300, h = 200) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 3 })
const inkBox = (id, x, y, w = 300, h = 200) => ({
  ...plain(id, x, y, w, h),
  inkBox: { top: y + 40, mid: y + 150, ink: [{ kind: 'stroke', id: 900 + id, points: [p(x + 20, y + 20), p(x + 60, y + 30)], color: '#111', width: 3, erase: false }] },
})
/** Connector from the middle of one box's bottom to the middle of another's top (the exact sides do not matter for most tests). */
const link = (id, from, to, type = 'association', extra = {}) => ({
  ...model.createConnector(
    id,
    p(from.x + from.width / 2, from.y + from.height),
    p(to.x + to.width / 2, to.y),
    '#111', 3,
    { rectangleId: from.id, offsetX: from.width / 2, offsetY: from.height },
    { rectangleId: to.id, offsetX: to.width / 2, offsetY: 0 },
    type,
  ),
  ...extra,
})
const boxes = (items) => items.filter((item) => item.kind === 'rectangle')
const byId = (items, id) => items.find((item) => item.kind === 'rectangle' && item.id === id)
const overlaps = (a, b, margin = 0) => a.x < b.x + b.width + margin && b.x < a.x + a.width + margin && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin
const noOverlap = (items) => {
  const list = boxes(items)
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.ok(!overlaps(list[i], list[j]), `boxes ${list[i].id} and ${list[j].id} overlap`)
}
const centre = (b) => b.x + b.width / 2

test('inheritance: the parent goes above its children, children share a row, parent sits over them', () => {
  // Scribbled sketch: everything on top of each other in a pile.
  const parent = box(1, 500, 500)
  const kids = [box(2, 520, 520), box(3, 540, 480), box(4, 480, 540)]
  // Triangle at the parent end: connector goes child -> parent with the symbol at `end`.
  const connectors = kids.map((kid, i) => link(10 + i, kid, parent, 'inheritance'))
  const out = tidy.tidyItems([parent, ...kids, ...connectors], null)
  const [pp, ...kk] = [byId(out, 1), byId(out, 2), byId(out, 3), byId(out, 4)]
  for (const kid of kk) assert.ok(kid.y >= pp.y + pp.height + tidy.TIDY_V_GAP - 1, 'child is a full gap below the parent')
  assert.equal(new Set(kk.map((kid) => kid.y)).size, 1, 'children share a row')
  const mid = (Math.min(...kk.map((kid) => kid.x)) + Math.max(...kk.map((kid) => kid.x + kid.width))) / 2
  assert.ok(Math.abs(centre(pp) - mid) < 2, 'parent is centred over its children')
  noOverlap(out)
})

test('the symbol end decides who is on top: reversed inheritance flips the order', () => {
  const a = box(1, 0, 0)
  const b = box(2, 0, 0)
  // Not reversed: triangle at the end (b) -> b is the parent. Reversed: triangle at the start (a).
  const normal = tidy.tidyItems([a, b, link(5, a, b, 'inheritance')], null)
  assert.ok(byId(normal, 1).y > byId(normal, 2).y)
  const flipped = tidy.tidyItems([a, b, link(5, a, b, 'inheritance', { reversed: true })], null)
  assert.ok(byId(flipped, 1).y < byId(flipped, 2).y)
})

test('composition puts the whole (the diamond end) above the part', () => {
  const whole = box(1, 0, 0)
  const part = box(2, 0, 0)
  // Composition, not reversed: the diamond is at the start.
  const out = tidy.tidyItems([part, whole, link(5, whole, part, 'composition')], null)
  assert.ok(byId(out, 1).y < byId(out, 2).y)
})

test('a plain association keeps boxes side by side when they were side by side, and above when they were above', () => {
  const left = box(1, 0, 0)
  const right = box(2, 900, 40)
  const side = tidy.tidyItems([left, right, link(5, left, right)], null)
  assert.equal(byId(side, 1).y, byId(side, 2).y, 'same row')
  assert.ok(byId(side, 1).x < byId(side, 2).x)
  const top = box(3, 0, 0)
  const bottom = box(4, 20, 700)
  const stacked = tidy.tidyItems([top, bottom, link(6, top, bottom)], null)
  assert.ok(byId(stacked, 4).y > byId(stacked, 3).y + 200)
})

test('no two boxes overlap, however messy the start (30 boxes, mixed links)', () => {
  const items = []
  for (let i = 0; i < 30; i += 1) items.push(box(i + 1, (i * 37) % 400, (i * 53) % 300, 200 + (i % 4) * 60, 140 + (i % 3) * 50))
  const list = boxes(items)
  const types = ['inheritance', 'association', 'composition', 'realization', 'dependency', 'directed-association', 'aggregation']
  for (let i = 1; i < 30; i += 1) items.push(link(100 + i, list[(i * 7) % i], list[i], types[i % types.length]))
  const out = tidy.tidyItems(items, null)
  noOverlap(out)
})

test('separate groups are packed in rows without overlap and wrap at the page width', () => {
  const items = []
  for (let i = 0; i < 12; i += 1) items.push(box(i + 1, i * 10, i * 10, 400, 200))
  const out = tidy.tidyItems(items, null)
  noOverlap(out)
  const rows = new Set(boxes(out).map((b) => b.y))
  assert.ok(rows.size > 1, 'wrapped into more than one row')
  assert.ok(Math.max(...boxes(out).map((b) => b.x + b.width)) - Math.min(...boxes(out).map((b) => b.x)) <= 1800 + 1)
})

test('a cycle of hierarchy links neither hangs nor overlaps', () => {
  const a = box(1, 0, 0)
  const b = box(2, 10, 10)
  const c = box(3, 20, 20)
  const out = tidy.tidyItems([a, b, c, link(5, a, b, 'inheritance'), link(6, b, c, 'inheritance'), link(7, c, a, 'inheritance')], null)
  noOverlap(out)
})

test('moving carries ink boxes with their writing and attached connector ends with their boxes', () => {
  const a = inkBox(1, 0, 0)
  const b = box(2, 0, 0)
  const conn = link(5, a, b, 'inheritance')
  const out = tidy.tidyItems([a, b, conn], null)
  const movedA = byId(out, 1)
  const dx = movedA.x - a.x
  const dy = movedA.y - a.y
  assert.ok(dx !== 0 || dy !== 0 || byId(out, 2).y !== b.y, 'something moved')
  assert.equal(movedA.inkBox.top, a.inkBox.top + dy)
  assert.equal(movedA.inkBox.mid, a.inkBox.mid + dy)
  assert.equal(movedA.inkBox.ink[0].points[0].x, a.inkBox.ink[0].points[0].x + dx)
  assert.equal(movedA.inkBox.ink[0].points[0].y, a.inkBox.ink[0].points[0].y + dy)
  const c = out.find((item) => item.kind === 'connector')
  const ends = [[c.start, c.startAttachment], [c.end, c.endAttachment]]
  for (const [point, attachment] of ends) {
    const owner = byId(out, attachment.rectangleId)
    assert.equal(point.x, owner.x + attachment.offsetX)
    assert.equal(point.y, owner.y + attachment.offsetY)
  }
})

test('connectors pick the facing sides after a tidy: parent bottom to child top', () => {
  const parent = box(1, 0, 0)
  const child = box(2, 0, 0)
  // Start on the wrong sides on purpose (parent top, child bottom).
  const wrong = model.createConnector(5, p(150, 0), p(150, 200), '#111', 3, { rectangleId: 2, offsetX: 150, offsetY: 0 }, { rectangleId: 1, offsetX: 150, offsetY: 200 }, 'inheritance')
  const out = tidy.tidyItems([parent, child, wrong], null)
  const c = out.find((item) => item.kind === 'connector')
  const p1 = byId(out, 1)
  const c2 = byId(out, 2)
  assert.equal(c.end.y, p1.y + p1.height, 'ends at the parent bottom')
  assert.equal(c.start.y, c2.y, 'starts at the child top')
})

test('Tidy selection moves only the chosen boxes and leaves everything else as it was', () => {
  const a = box(1, 100, 100)
  const b = box(2, 110, 110)
  const other = box(3, 2000, 1000)
  const frame = plain(4, 50, 50, 900, 700)
  const text = { kind: 'text', id: 8, x: 5, y: 5, width: 100, height: 30, text: 'hi', fontSize: 20, color: '#111' }
  const stroke = { kind: 'stroke', id: 9, points: [p(1, 1), p(2, 2)], color: '#111', width: 3, erase: false }
  const items = [a, b, other, frame, text, stroke]
  const out = tidy.tidyItems(items, new Set([1, 2]))
  assert.equal(out[2], other)
  assert.equal(out[3], frame)
  assert.equal(out[4], text)
  assert.equal(out[5], stroke)
  assert.notEqual(out[1], b)
  noOverlap([out[0], out[1]])
  assert.equal(Math.min(out[0].x, out[1].x), 100, 'the group keeps its top-left corner')
  assert.equal(Math.min(out[0].y, out[1].y), 100)
})

test('Tidy all leaves plain rectangles, text and ink alone', () => {
  const a = box(1, 0, 0)
  const b = box(2, 0, 0)
  const frame = plain(4, -50, -50, 900, 700)
  const out = tidy.tidyItems([a, b, frame], null)
  assert.equal(out[2], frame)
})

test('nothing to do: fewer than two boxes, or already tidy, returns the same list', () => {
  const only = [box(1, 0, 0), plain(2, 10, 10)]
  assert.equal(tidy.tidyItems(only, null), only)
  const messy = [box(1, 0, 0), box(2, 5, 5), link(5, box(1, 0, 0), box(2, 5, 5), 'inheritance')]
  const once = tidy.tidyItems(messy, null)
  assert.notEqual(once, messy)
  const twice = tidy.tidyItems(once, null)
  assert.equal(twice, once, 'a second Tidy changes nothing')
})

test('the result stays inside the workspace when it fits', () => {
  const items = [box(1, 2400, 1400), box(2, 2410, 1410), box(3, 2420, 1420)]
  const out = tidy.tidyItems(items, null)
  const b = boxes(out)
  assert.ok(Math.max(...b.map((r) => r.x + r.width)) <= 2625)
  assert.ok(Math.max(...b.map((r) => r.y + r.height)) <= 1575)
  assert.ok(Math.min(...b.map((r) => r.x)) >= -125)
  noOverlap(out)
})

test('tidyScope: two or more selected boxes means selection, otherwise all', () => {
  const items = [box(1, 0, 0), box(2, 0, 0), box(3, 0, 0), plain(4, 0, 0)]
  const none = tidy.tidyScope(items, new Set())
  assert.equal(none.selection, false)
  assert.equal(none.count, 3, 'plain rectangles are not counted')
  assert.equal(tidy.tidyScope(items, new Set(['rectangle:1'])).selection, false)
  const two = tidy.tidyScope(items, new Set(['rectangle:1', 'rectangle:3', 'rectangle:4']))
  assert.equal(two.selection, true)
  assert.equal(two.count, 2)
  assert.deepEqual([...two.ids].sort(), [1, 3])
})

test('elbow connectors still route cleanly after a tidy (no diagonal pieces, no crossing of own boxes)', () => {
  const parent = box(1, 0, 0)
  const kids = [box(2, 0, 0), box(3, 0, 0)]
  const items = [parent, ...kids, ...kids.map((kid, i) => ({ ...link(10 + i, kid, parent, 'inheritance'), routing: 'elbow' }))]
  const out = tidy.tidyItems(items, null)
  for (const item of route.routeConnectors(out)) {
    if (item.kind !== 'connector') continue
    const path = item.routedPath
    assert.ok(path.slice(1).every((q, i) => Math.abs(q.x - path[i].x) < 0.01 || Math.abs(q.y - path[i].y) < 0.01))
  }
})

test('speed: 60 boxes with 80 mixed elbow connectors tidy in well under two seconds', () => {
  const items = []
  for (let i = 0; i < 60; i += 1) items.push(box(i + 1, (i * 131) % 2000, (i * 71) % 1200, 220, 160))
  const list = boxes(items)
  for (let i = 0; i < 80; i += 1) items.push({ ...link(100 + i, list[(i * 5) % 60], list[(i * 11 + 3) % 60], i % 3 === 0 ? 'inheritance' : 'association'), routing: 'elbow' })
  const started = performance.now()
  const out = tidy.tidyItems(items, null)
  const took = performance.now() - started
  noOverlap(out)
  assert.ok(took < 2000, `took ${took.toFixed(0)} ms`)
})

test('wiring: a Tidy button next to Undo/Redo that is one undo step and does nothing when there is nothing to tidy', async () => {
  const source = await readAppSource()
  assert.match(source, /tidyScope\(/)
  assert.match(source, /tidyItems\(strokesRef\.current/)
  assert.match(source, /const tidyDiagram = \(\) => \{[\s\S]*?if \(next === strokesRef\.current\) return[\s\S]*?saveHistory\(\)[\s\S]*?strokesRef\.current = next/)
  assert.match(source, /Tidy selected/)
  assert.match(source, /Tidy all/)
  const more = await readFile(new URL('../src/app/MoreTray.tsx', import.meta.url), 'utf8')
  assert.match(more, /aria-label="More"/)
  assert.match(more, /onTidy\(\)/)
  const dock = await readFile(new URL('../src/app/ToolDock.tsx', import.meta.url), 'utf8')
  assert.match(dock, /<InsertTray[\s\S]*?\/>\s*<MoreTray tidyLabel=\{props\.tidyLabel\} onTidy=\{props\.onTidy\}[^>]*\/>/, 'More sits right after Insert')
  const history = await readFile(new URL('../src/app/HistoryBar.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(history, /Tidy/, 'Tidy is no longer beside Undo/Redo')
})

test('Tidy makes the connectors between the arranged boxes Elbow, and only those', () => {
  const a = box(1, 0, 0)
  const b = box(2, 10, 10)
  const outside = box(3, 3000, 0)
  const between = link(5, a, b)
  const toOutside = link(6, a, outside)
  const free = model.createConnector(7, p(1, 1), p(50, 50), '#111', 3)
  const items = [a, b, outside, between, toOutside, free]
  const all = tidy.tidyItems(items, null)
  assert.equal(all.find((i) => i.id === 5 && i.kind === 'connector').routing, 'elbow')
  assert.equal(all.find((i) => i.id === 6 && i.kind === 'connector').routing, 'elbow', 'both boxes are in Tidy all')
  assert.equal(all.find((i) => i.id === 7 && i.kind === 'connector').routing, undefined, 'a free connector is untouched')
  const part = tidy.tidyItems(items, new Set([1, 2]))
  assert.equal(part.find((i) => i.id === 5 && i.kind === 'connector').routing, 'elbow')
  assert.equal(part.find((i) => i.id === 6 && i.kind === 'connector').routing, undefined, 'a connector to a box outside the selection stays as it was')
  // Boxes already in place still get their connectors switched, as one change.
  const tidyBoxes = tidy.tidyItems([a, b], null)
  const tidyAgain = tidy.tidyItems([...tidyBoxes, link(9, byId(tidyBoxes, 1), byId(tidyBoxes, 2))], null)
  assert.equal(tidyAgain.find((i) => i.kind === 'connector').routing, 'elbow')
  // After that, Tidy changes nothing.
  assert.equal(tidy.tidyItems(tidyAgain, null), tidyAgain)
})

test('round 10 review: Tidy keeps curved connectors curved (routing and bend) and gives converted ones no stale bend', () => {
  const a = box(1, 0, 0)
  const b = box(2, 10, 10)
  const curved = { ...link(5, a, b), routing: 'curved', bend: 40 }
  const straightWithBend = { ...link(6, a, b), bend: 25, routedPath: [p(0, 0), p(5, 5)] }
  const out = tidy.tidyItems([a, b, curved, straightWithBend], null)
  const c = out.find((i) => i.id === 5 && i.kind === 'connector')
  assert.equal(c.routing, 'curved')
  // (a bend is only dropped by reattachConnectorSides when the connector moves to other box sides)
  const s = out.find((i) => i.id === 6 && i.kind === 'connector')
  assert.equal(s.routing, 'elbow')
  assert.equal(s.bend, undefined)
  assert.equal(s.routedPath, undefined)
  // Only curved connectors: nothing is converted.
  const placed = tidy.tidyItems([a, b], null)
  const onlyCurved = [...placed, { ...link(9, placed.find((i) => i.id === 1), placed.find((i) => i.id === 2)), routing: 'curved' }]
  assert.equal(tidy.tidyItems(onlyCurved, null).find((i) => i.kind === 'connector').routing, 'curved')
})
