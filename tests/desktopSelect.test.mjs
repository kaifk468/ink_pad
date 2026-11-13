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
  const clickBranch = app.indexOf('const clicked = clickSelectTarget(', down)
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

// ---- Step 8: multi-select ----
const stroke = (id, pts) => ({ kind: 'stroke', id, points: pts.map(([x, y]) => pt(x, y)), color: '#000', width: 4, erase: false })

test('normalizeSelection: exactly one box is the single-box case, everything else is keys', () => {
  assert.deepEqual(input.normalizeSelection(['rectangle:3']), { keys: [], rectangleId: 3 })
  assert.deepEqual(input.normalizeSelection(['text:1']), { keys: ['text:1'], rectangleId: null })
  assert.deepEqual(input.normalizeSelection(['rectangle:3', 'text:1']), { keys: ['rectangle:3', 'text:1'], rectangleId: null })
  assert.deepEqual(input.normalizeSelection([]), { keys: [], rectangleId: null })
  assert.deepEqual(input.normalizeSelection(['text:1', 'text:1']), { keys: ['text:1'], rectangleId: null })
})

test('shift+click adds then removes an item, keeping the single-box id consistent', () => {
  let state = input.toggleSelectionKey(new Set(), null, 'rectangle:1')
  assert.deepEqual(state, { keys: [], rectangleId: 1 })
  state = input.toggleSelectionKey(new Set(state.keys), state.rectangleId, 'text:2')
  assert.deepEqual(state, { keys: ['rectangle:1', 'text:2'], rectangleId: null })
  state = input.toggleSelectionKey(new Set(state.keys), state.rectangleId, 'connector:3')
  assert.deepEqual(new Set(state.keys), new Set(['rectangle:1', 'text:2', 'connector:3']))
  state = input.toggleSelectionKey(new Set(state.keys), state.rectangleId, 'text:2')
  state = input.toggleSelectionKey(new Set(state.keys), state.rectangleId, 'connector:3')
  assert.deepEqual(state, { keys: [], rectangleId: 1 })
  state = input.toggleSelectionKey(new Set(state.keys), state.rectangleId, 'rectangle:1')
  assert.deepEqual(state, { keys: [], rectangleId: null })
})

test('shift+click can pick a freehand stroke, but a plain hit still prefers boxes and text', () => {
  const items = [stroke(5, [[0, 0], [100, 0]]), rect(1, 300, 300, 50, 50)]
  assert.equal(input.shiftClickTarget(items, pt(50, 2), 1)?.key, 'stroke:5')
  assert.equal(input.shiftClickTarget(items, pt(310, 310), 1)?.key, 'rectangle:1')
  assert.equal(input.shiftClickTarget(items, pt(500, 500), 1), null)
  const erase = { ...stroke(6, [[0, 100], [100, 100]]), erase: true }
  assert.equal(input.shiftClickTarget([erase], pt(50, 100), 1), null)
})

test('marquee selects only items fully inside, and never eraser marks', () => {
  const items = [rect(1, 10, 10, 50, 50), rect(2, 80, 10, 100, 50), text(3, 20, 100), stroke(4, [[15, 150], [40, 160]]), { ...stroke(5, [[15, 150], [40, 160]]), erase: true }, connector(6, 20, 200, 60, 200)]
  const rectArea = input.rectFromPoints(pt(0, 0), pt(100, 210))
  assert.deepEqual(input.marqueeKeys(items, rectArea).sort(), ['connector:6', 'rectangle:1', 'stroke:4', 'text:3'])
  assert.deepEqual(input.rectFromPoints(pt(50, 60), pt(10, 20)), { x: 10, y: 20, width: 40, height: 40 })
})

test('marquee: Shift keeps the old selection, no Shift replaces it, a single box becomes the single-box selection', () => {
  const items = [rect(1, 10, 10, 50, 50), text(2, 200, 10)]
  const area = input.rectFromPoints(pt(0, 0), pt(100, 100))
  assert.deepEqual(input.marqueeSelection(items, area, new Set(['text:2']), true), { keys: ['text:2', 'rectangle:1'], rectangleId: null })
  assert.deepEqual(input.marqueeSelection(items, area, new Set(['text:2']), false), { keys: [], rectangleId: 1 })
  assert.deepEqual(input.marqueeSelection(items, input.rectFromPoints(pt(500, 500), pt(600, 600)), new Set(), false), { keys: [], rectangleId: null })
})

test('App wiring for multi-select: shift-click and marquee are Desktop mouse only, the marquee ref blocks other gestures and clears everywhere', () => {
  assert.match(app, /if \(event\.shiftKey && !eraser\) \{\n\s*\/\/ Shift \+ click adds or removes/)
  assert.match(app, /if \(event\.pointerType === 'mouse' && inputModeRef\.current === 'desktop' && !hitTarget\(routeConnectors\(strokesRef\.current\)/)
  assert.match(app, /const anyGestureActive = penGestureActive[^\n]*activeMarqueeRef\.current !== null/)
  assert.match(app, /if \(gestureActive \|\| activeMarqueeRef\.current !== null \|\| touchNav\.touchCount\(\) > 0\) return false/)
  assert.match(app, /const resetInteractionState = \(\) => \{[\s\S]*?activeMarqueeRef\.current = null/)
  // pointer up and cancel both end it; a click without a real drag selects nothing new
  assert.equal((app.match(/activeMarqueeRef\.current = null/g) ?? []).length >= 3, true)
  assert.match(app, /marqueeSelection\(routeConnectors\(strokesRef\.current\), box, marquee\.base, marquee\.shift\)/)
  // a group member press moves the whole group via the lasso drag
  assert.match(app, /startGroupDrag\(event, point\)/)
})
