import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const { buildExcalidrawItems } = await loadModule('excalidrawImport.ts')
const model = await loadModule('canvasModel.ts')
const doc = await loadModule('documentFormat.ts')
const exp = await loadModule('sheetExport.ts')
const sketchy = await loadModule('sketchy.ts')
const lasso = await loadModule('lassoSelection.ts')

const base = { angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roundness: null, isDeleted: false, groupIds: [], boundElements: null }
const el = (id, type, extra) => ({ ...base, id, type, x: 0, y: 0, width: 100, height: 60, ...extra })
const build = (elements) => {
  const r = buildExcalidrawItems(JSON.stringify({ type: 'excalidraw/clipboard', elements, files: {} }))
  assert.equal(r.ok, true, JSON.stringify(r))
  return r.items
}
const bent = (extra) => el('bent', 'arrow', { x: 100, y: 100, points: [[0, 0], [100, 0], [100, 80]], startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: 'arrow', ...extra })
const strokesOf = (items) => items.filter((i) => i.kind === 'stroke')

test('an unbound bent arrow stays one arrow stroke with all points and its end head', () => {
  const strokes = strokesOf(build([bent({})]))
  assert.equal(strokes.length, 1)
  assert.equal(strokes[0].shape, 'arrow')
  assert.equal(strokes[0].points.length, 3)
  assert.equal(model.strokeArrowheads(strokes[0]), 'end')
})

test('the head sits on the last segment (and the first for a start head)', () => {
  const [end] = strokesOf(build([bent({})]))
  const last = end.points[2]
  const [head] = model.strokeHeadGeometry(end)
  assert.deepEqual([head.tip.x, head.tip.y], [last.x, last.y])
  // The last segment points straight down, so both wings sit above the tip.
  assert.ok(head.wingA.y < last.y && head.wingB.y < last.y)
  const [both] = strokesOf(build([bent({ startArrowhead: 'arrow' })]))
  const heads = model.strokeHeadGeometry(both)
  assert.equal(heads.length, 2)
  assert.deepEqual([heads[0].tip.x, heads[0].tip.y], [both.points[0].x, both.points[0].y])
  assert.ok(heads[0].wingA.x > both.points[0].x) // the first segment runs right, so the start head's wings trail to the right
})

test('bent arrow dash and a plain bent line are kept as before', () => {
  const [dashed] = strokesOf(build([bent({ strokeStyle: 'dashed' })]))
  assert.equal(dashed.dash, 'dashed')
  const [line] = strokesOf(build([el('l', 'line', { points: [[0, 0], [50, 20], [100, 50]], startArrowhead: null, endArrowhead: null })]))
  assert.equal(line.shape, undefined)
  assert.equal(line.points.length, 3)
  const [noHead] = strokesOf(build([bent({ endArrowhead: null })]))
  assert.equal(model.strokeHeadGeometry(noHead).length, 0)
})

test('bent arrow round-trips through save and load and draws every segment in exports', () => {
  const [stroke] = strokesOf(build([bent({})]))
  assert.deepEqual(doc.sanitizeItem(JSON.parse(JSON.stringify(stroke))), stroke)
  const svg = exp.buildSheetSvg([stroke], { width: 800, height: 600, template: 'blank', backgroundColor: '#ffffff' })
  assert.match(svg, /M[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+M/) // shaft through three points, then the head
  const parts = sketchy.sketchyStrokeParts(stroke)
  assert.ok(parts && parts.line.length > 0 && parts.heads.length > 0)
})

test('selection can hit the middle segment of a bent arrow', () => {
  const [stroke] = strokesOf(build([bent({})]))
  const middle = { x: stroke.points[1].x, y: (stroke.points[1].y + stroke.points[2].y) / 2 }
  assert.equal(lasso.itemHitTest(stroke, middle), true)
  assert.equal(lasso.itemHitTest(stroke, { x: middle.x - 200, y: middle.y }), false)
})

test('a bent arrow bound to shapes at both ends becomes a connector that keeps its head', () => {
  const route = { x: 100, y: 30, points: [[0, 0], [100, 0], [100, 200], [200, 200]], startBinding: { elementId: 'A', focus: 0, gap: 1 }, endBinding: { elementId: 'B', focus: 0, gap: 1 } }
  const boxes = [el('A', 'rectangle', { x: 0, y: 0 }), el('B', 'rectangle', { x: 300, y: 200 })]
  const items = build([...boxes, bent(route)])
  const connector = items.find((i) => i.kind === 'connector')
  assert.ok(connector)
  assert.equal(connector.relationshipType, 'directed-association')
  assert.equal(strokesOf(items).length, 0)
  const two = build([...boxes, bent({ ...route, startArrowhead: 'arrow' })]).find((i) => i.kind === 'connector')
  assert.equal(two.twoWay, true)
})
