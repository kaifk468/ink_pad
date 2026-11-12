import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const input = await loadModule('desktopInput.ts')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

const rect = (id, x, y, w, h, extra = {}) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#000', strokeWidth: 4, ...extra })
const text = (id, x, y, w = 60, h = 20) => ({ kind: 'text', id, x, y, width: w, height: h, text: 't', fontSize: 16, color: '#000' })
const connector = (id, x1, y1, x2, y2) => ({ kind: 'connector', id, start: { x: x1, y: y1, pressure: 1 }, end: { x: x2, y: y2, pressure: 1 }, strokeColor: '#000', strokeWidth: 3, color: '#000', width: 3, relationshipType: 'association' })
const pt = (x, y) => ({ x, y, pressure: 1 })
const inkBox = () => ({ top: 30, mid: 70, ink: [] })

test('hitTarget picks text, then a box, then a connector, topmost first, and ignores empty space', () => {
  const items = [rect(1, 0, 0, 100, 100), rect(2, 20, 20, 100, 100), text(3, 30, 30), connector(4, 300, 300, 400, 300)]
  assert.deepEqual(input.hitTarget(items, pt(40, 38), 1), { key: 'text:3', kind: 'text', id: 3 })
  assert.equal(input.hitTarget(items, pt(110, 110), 1)?.key, 'rectangle:2')
  assert.equal(input.hitTarget(items, pt(5, 5), 1)?.key, 'rectangle:1')
  assert.equal(input.hitTarget(items, pt(350, 301), 1)?.key, 'connector:4')
  assert.equal(input.hitTarget(items, pt(600, 600), 1), null)
})

test('hitTarget tolerance is in screen pixels: a wider reach when zoomed out', () => {
  const items = [rect(1, 100, 100, 50, 50)]
  assert.equal(input.hitTarget(items, pt(90, 125), 1), null)
  assert.equal(input.hitTarget(items, pt(90, 125), 0.25)?.key, 'rectangle:1')
})

test('hitTarget never returns strokes', () => {
  const stroke = { kind: 'stroke', id: 9, points: [pt(0, 0), pt(100, 0)], color: '#000', width: 4, erase: false }
  assert.equal(input.hitTarget([stroke], pt(50, 0), 1), null)
})

test('click-select applies to every tool except the eraser, and not to the select tool (which selects itself)', () => {
  const items = [rect(1, 0, 0, 100, 100)]
  for (const tool of ['pen', 'shape', 'text', 'connector', 'classBox', 'lasso']) assert.equal(input.clickSelectTarget(items, pt(50, 50), 1, tool, false)?.key, 'rectangle:1', tool)
  assert.equal(input.clickSelectTarget(items, pt(50, 50), 1, 'eraser', false), null)
  assert.equal(input.clickSelectTarget(items, pt(50, 50), 1, 'select', false), null)
  assert.equal(input.clickSelectTarget(items, pt(500, 500), 1, 'pen', false), null)
})

test('the lasso keeps its own move and resize while something is selected', () => {
  const items = [rect(1, 0, 0, 100, 100)]
  assert.equal(input.clickSelectTarget(items, pt(50, 50), 1, 'lasso', true), null)
})

test('in the pen tool the inside of an ink class box stays writable, its edge band selects, and the selected box keeps its own rules', () => {
  const items = [rect(1, 0, 0, 200, 200, { inkBox: inkBox() })]
  assert.equal(input.clickSelectTarget(items, pt(100, 100), 1, 'pen', false), null)
  assert.equal(input.clickSelectTarget(items, pt(100, 5), 1, 'pen', false)?.key, 'rectangle:1')
  assert.equal(input.clickSelectTarget(items, pt(100, 5), 1, 'pen', false, 1), null)
  // other tools select an ink box anywhere
  assert.equal(input.clickSelectTarget(items, pt(100, 100), 1, 'text', false)?.key, 'rectangle:1')
})

test('edge band: within 14 screen px of the outline, scaled by zoom', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 }
  assert.equal(input.pointInEdgeBand(box, pt(105, 150), 14), true)
  assert.equal(input.pointInEdgeBand(box, pt(90, 150), 14), true)
  assert.equal(input.pointInEdgeBand(box, pt(200, 150), 14), false)
  assert.equal(input.pointInEdgeBand(box, pt(80, 150), 14), false)
  const items = [rect(1, 100, 100, 200, 100)]
  assert.equal(input.edgeBandBox(items, pt(110, 150), 1)?.id, 1)
  assert.equal(input.edgeBandBox(items, pt(200, 150), 1), null)
  // zoomed in 2x the band is 7 canvas units, zoomed out to 0.5 it is 28
  assert.equal(input.edgeBandBox(items, pt(110, 150), 2), null)
  assert.equal(input.edgeBandBox(items, pt(120, 150), 0.5)?.id, 1)
  assert.equal(input.edgeBandBox(items, pt(500, 500), 1), null)
})

test('a small box is all edge, and the topmost box decides when boxes overlap', () => {
  assert.equal(input.edgeBandBox([rect(1, 0, 0, 20, 20)], pt(10, 10), 1)?.id, 1)
  const items = [rect(1, 0, 0, 300, 300), rect(2, 50, 50, 100, 100)]
  assert.equal(input.edgeBandBox(items, pt(100, 100), 1), null)
})

test('edge hold: waits, selects after 500 ms of stillness, draws when the pen moves past jitter', () => {
  const s = pt(100, 100)
  assert.equal(input.EDGE_HOLD_MS, 500)
  assert.equal(input.edgeHoldDecision(s, pt(102, 101), 200, 1), 'wait')
  assert.equal(input.edgeHoldDecision(s, pt(102, 101), 500, 1), 'select')
  assert.equal(input.edgeHoldDecision(s, pt(112, 100), 100, 1), 'draw')
  assert.equal(input.edgeHoldDecision(s, pt(112, 100), 600, 1), 'draw')
  // jitter is in screen pixels: 12 canvas units is 24 screen px at 2x (draw) but 3 at 0.25x (still a hold)
  assert.equal(input.edgeHoldDecision(s, pt(107, 100), 600, 2), 'draw')
  assert.equal(input.edgeHoldDecision(s, pt(112, 100), 600, 0.25), 'select')
})

test('App wiring: mouse click-select is Desktop only and before the tool branches; hover redraws only on change; edge hold is pen only', () => {
  const down = app.indexOf('const onPointerDown = (event')
  const clickBranch = app.indexOf("if (event.pointerType === 'mouse' && inputModeRef.current === 'desktop') {\n      // Desktop: a left click selects", down)
  const textBranch = app.indexOf('    if (textMode) {\n      event.currentTarget.setPointerCapture', down)
  assert.ok(clickBranch > down && clickBranch < textBranch)
  assert.match(app, /clickSelectTarget\(routeConnectors\(strokesRef\.current\), point, viewportRef\.current\.scale, clickToolName\(\)/)
  assert.match(app, /if \(key === hoverKeyRef\.current\) return\n\s*hoverKeyRef\.current = key\n\s*renderAll\(\)/)
  assert.match(app, /event\.pointerType === 'mouse' && event\.buttons === 0 && inputModeRef\.current === 'desktop'\) setMouseHover\(/)
  assert.match(app, /if \(event\.pointerType === 'pen' && !eraser && !buttonErase && !shapeMode\) \{\n\s*const edgeBox = edgeBandBox\(/)
  assert.match(app, /window\.setTimeout\(\(\) => fireEdgeHold\(pointerId\), EDGE_HOLD_MS\)/)
  // every end path clears the hold timer
  assert.equal((app.match(/if \(edgeHoldRef\.current\?\.pointerId === event\.pointerId\) cancelEdgeHold\(\)/g) ?? []).length, 2)
  // the hover outline is only drawn for an item that is not already selected
  assert.match(app, /hoverKey !== null && !selectedKeysRef\.current\.has\(hoverKey\)/)
})
