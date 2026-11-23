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

const menuOf = (hasSelection, clipboardHasItems, pageHasItems, extra = {}) => input.contextMenuEntries({ hasSelection, clipboardHasItems, pageHasItems, canEditText: false, lockedTarget: false, anyLocked: false, ...extra })

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

test('click-select applies to every tool except the eraser, connector and select tools', () => {
  const items = [rect(1, 0, 0, 100, 100)]
  for (const tool of ['pen', 'shape', 'text', 'classBox', 'lasso']) assert.equal(input.clickSelectTarget(items, pt(2, 50), 1, tool, false)?.key, 'rectangle:1', tool)
  // the connector tool never grabs a box: a press on it (inside or on the edge) starts a connector
  for (const point of [pt(50, 50), pt(2, 50), pt(100, 100)]) assert.equal(input.clickSelectTarget(items, point, 1, 'connector', false), null)
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
  // every other tool leaves the inside alone too (text goes into the box) and selects near the edge
  for (const tool of ['text', 'shape', 'lasso', 'classBox']) {
    assert.equal(input.clickSelectTarget(items, pt(100, 100), 1, tool, false), null, tool)
    assert.equal(input.clickSelectTarget(items, pt(100, 5), 1, tool, false)?.key, 'rectangle:1', tool)
  }
  // hover follows the same rule
  assert.equal(input.hoverTarget(items, pt(100, 100), 1), null)
  assert.equal(input.hoverTarget(items, pt(100, 5), 1)?.key, 'rectangle:1')
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
  assert.match(app, /const changed = key !== hoverKeyRef\.current\n\s*hoverKeyRef\.current = key\n\s*applyCanvasCursor\(\)\n\s*if \(changed\) renderAll\(\)/)
  assert.match(app, /event\.pointerType === 'mouse' && event\.buttons === 0 && inputModeRef\.current === 'desktop'\) setMouseHover\(/)
  assert.match(app, /if \(event\.pointerType === 'pen' && !eraser && !buttonErase && !shapeMode && shapeTool === null\) \{\n\s*const edgeBox = edgeBandBox\(/)
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

// ---- Step 9: nudge and cancel ----
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
const model = await loadModule('canvasModel.ts')

test('arrow keys nudge by 1, Shift by 10, in Desktop mode only, and other modifiers are left to the browser', () => {
  assert.deepEqual(input.keyCommand(key('ArrowLeft'), 'desktop'), { kind: 'nudge', dx: -1, dy: 0 })
  assert.deepEqual(input.keyCommand(key('ArrowRight'), 'desktop'), { kind: 'nudge', dx: 1, dy: 0 })
  assert.deepEqual(input.keyCommand(key('ArrowUp'), 'desktop'), { kind: 'nudge', dx: 0, dy: -1 })
  assert.deepEqual(input.keyCommand(key('ArrowDown', { shiftKey: true }), 'desktop'), { kind: 'nudge', dx: 0, dy: 10 })
  assert.deepEqual(input.keyCommand(key('ArrowDown', { repeat: true }), 'desktop'), { kind: 'nudge', dx: 0, dy: 1 })
  assert.equal(input.keyCommand(key('ArrowLeft'), 'tablet'), null)
  assert.deepEqual(input.keyCommand(key('ArrowLeft', { ctrlKey: true }), 'desktop'), { kind: 'quickCreate', direction: 'left' }) // Ctrl+Arrow makes a connected shape (batch C)
  for (const extra of [{ altKey: true }]) assert.equal(input.keyCommand(key('ArrowLeft', extra), 'desktop'), null)
})

test('a burst of nudges is one undo step: only the first press after a 500 ms pause starts a step', () => {
  assert.equal(input.nudgeStartsNewStep(null, 1000), true)
  assert.equal(input.nudgeStartsNewStep(1000, 1100), false)
  assert.equal(input.nudgeStartsNewStep(1000, 1499), false)
  assert.equal(input.nudgeStartsNewStep(1000, 1500), true)
})

test('Escape: cancels a drag/resize/marquee/lasso, deselects when idle, and does nothing during other gestures', () => {
  assert.equal(input.escapeAction({ cancelableGesture: true, anyGesture: true, hasSelection: true }), 'cancelGesture')
  assert.equal(input.escapeAction({ cancelableGesture: false, anyGesture: true, hasSelection: true }), 'none')
  assert.equal(input.escapeAction({ cancelableGesture: false, anyGesture: false, hasSelection: true }), 'deselect')
  assert.equal(input.escapeAction({ cancelableGesture: false, anyGesture: false, hasSelection: false }), 'none')
})

test('nudging moves boxes with their attached connectors and a cancelled drag restores the original items with no history left over', () => {
  const a = rect(1, 100, 100, 50, 50)
  const b = rect(2, 300, 100, 50, 50)
  const link = { ...connector(3, 150, 125, 300, 125), startAttachment: { rectangleId: 1, offsetX: 50, offsetY: 25 }, endAttachment: { rectangleId: 2, offsetX: 0, offsetY: 25 } }
  const items = [a, b, link]
  const moved = model.translateSelectedItems(items, new Set(['rectangle:1', 'rectangle:2', 'connector:3']), 10, 0)
  assert.equal(moved[0].x, 110)
  assert.equal(moved[2].startAttachment.rectangleId, 1)
  const history = new model.CanvasSnapshotHistory()
  history.record(items)
  assert.equal(history.canUndo, true)
  history.discardLast()
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)
})

test('App wiring: nudge and cancel run only through the guarded key handler; Escape cancels before the gesture guard; burst records once', () => {
  assert.match(app, /const cancelActiveGesture = \(\): boolean => \{/)
  assert.match(app, /if \(action === 'cancelGesture'\) return cancelActiveGesture\(\)/)
  const cancelGuard = app.indexOf("if (action === 'cancelGesture')")
  const gestureGuard = app.indexOf('if (gestureActive || activeMarqueeRef.current !== null || touchNav.touchCount() > 0) return false')
  const panelGuard = app.indexOf('if (filePanelOpen || storagePanelOpen')
  assert.ok(panelGuard < cancelGuard && cancelGuard < gestureGuard)
  assert.match(app, /case 'nudge': return nudgeSelection\(command\.dx, command\.dy\)/)
  assert.match(app, /if \(nudgeStartsNewStep\(lastNudgeAtRef\.current, now\)\) saveHistory\(\)\n\s*else scheduleAutosave\(\)/)
  assert.match(app, /translateWithinWorkspace\(strokesRef\.current, keys, dx, dy\)/)
  // a cancelled drag restores the originals and drops the step it recorded
  assert.match(app, /historyRef\.current\.discardLast\(\)/)
  // a press or any other command ends the burst
  assert.match(app, /if \(command\.kind !== 'nudge'\) lastNudgeAtRef\.current = null/)
})

// ---- Step 11: right-click menu, double-click edit, cursors ----
const cls = (id, x, y, extra = {}) => rect(id, x, y, 100, 60, { classBox: { name: 'A', attributes: '', methods: '' }, ...extra })

test('double-click edits a text label or a class box, and nothing else', () => {
  const items = [cls(1, 0, 0), rect(2, 300, 0, 100, 60, { inkBox: inkBox(), classBox: { name: 'x', attributes: '', methods: '' } }), rect(3, 500, 0, 100, 60), rect(4, 700, 0, 100, 60, { classBox: { name: 'o', attributes: '', methods: '' }, ellipse: true }), text(5, 0, 200), connector(6, 0, 400, 100, 400)]
  assert.deepEqual(input.doubleClickTarget(items, pt(50, 30), 1), { kind: 'classBox', id: 1 })
  assert.equal(input.doubleClickTarget(items, pt(350, 30), 1), null)
  assert.equal(input.doubleClickTarget(items, pt(550, 30), 1), null)
  assert.equal(input.doubleClickTarget(items, pt(750, 30), 1), null)
  assert.deepEqual(input.doubleClickTarget(items, pt(30, 210), 1), { kind: 'text', id: 5 })
  assert.deepEqual(input.doubleClickTarget(items, pt(50, 401), 1), { kind: 'connector', id: 6 })
  assert.equal(input.doubleClickTarget(items, pt(900, 900), 1), null)
})

test('Enter edits only a single selected label or class box', () => {
  const items = [cls(1, 0, 0), text(2, 200, 0), rect(3, 400, 0, 100, 60)]
  assert.deepEqual(input.editTargetForSelection(items, new Set(), 1), { kind: 'classBox', id: 1 })
  assert.deepEqual(input.editTargetForSelection(items, new Set(['text:2']), null), { kind: 'text', id: 2 })
  assert.equal(input.editTargetForSelection(items, new Set(['text:2', 'rectangle:1']), null), null)
  assert.equal(input.editTargetForSelection(items, new Set(), 3), null)
  assert.equal(input.editTargetForSelection(items, new Set(), null), null)
  const keyEvent = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
  assert.deepEqual(input.keyCommand(keyEvent('Enter'), 'desktop'), { kind: 'edit' })
  assert.equal(input.keyCommand(keyEvent('Enter'), 'tablet'), null)
  assert.equal(input.keyCommand(keyEvent('Enter', { repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(keyEvent('Enter', { shiftKey: true }), 'desktop'), null)
  assert.equal(input.keyCommand(keyEvent('Enter', { ctrlKey: true }), 'desktop'), null)
})

test('the menu lists the clipboard, arrange, view, export and select entries and disables what does not apply', () => {
  const entries = (...args) => Object.fromEntries(menuOf(...args).map((e) => [e.action, !e.disabled]))
  assert.deepEqual(menuOf(false, false, false).map((e) => e.label), ['Cut', 'Copy', 'Paste', 'Duplicate', 'Delete', 'Copy style', 'Paste style', 'Bring to front', 'Send to back', 'Zoom to selection', 'Copy as PNG', 'Select all'])
  assert.deepEqual(entries(false, false, false), { cut: false, copy: false, paste: false, duplicate: false, delete: false, copyStyle: false, pasteStyle: false, bringToFront: false, sendToBack: false, zoomSelection: false, copyPng: false, selectAll: false })
  assert.deepEqual(entries(true, false, true), { cut: true, copy: true, paste: false, duplicate: true, delete: true, copyStyle: false, pasteStyle: false, bringToFront: true, sendToBack: true, zoomSelection: true, lock: true, copyPng: true, exportPng: true, exportSvg: true, selectAll: true })
  assert.deepEqual(entries(false, true, true), { cut: false, copy: false, paste: true, duplicate: false, delete: false, copyStyle: false, pasteStyle: false, bringToFront: false, sendToBack: false, zoomSelection: false, copyPng: true, selectAll: true })
})

test('the menu stays on screen', () => {
  assert.deepEqual(input.clampMenuPosition(100, 100, 184, 236, 1000, 800), { x: 100, y: 100 })
  assert.deepEqual(input.clampMenuPosition(950, 700, 184, 236, 1000, 800), { x: 816, y: 564 })
  assert.deepEqual(input.clampMenuPosition(-5, -5, 184, 236, 1000, 800), { x: 0, y: 0 })
})

test('cursors: tablet keeps the default; desktop sets one per tool and pan states win', () => {
  const base = { mode: 'desktop', tool: 'pen', hover: 'none', panning: false, spaceHeld: false }
  for (const tool of ['pen', 'shape', 'connector', 'lasso', 'classBox']) assert.equal(input.canvasCursor({ ...base, tool }), 'crosshair', tool)
  assert.equal(input.canvasCursor({ ...base, tool: 'text' }), 'text')
  assert.equal(input.canvasCursor({ ...base, tool: 'select' }), 'default')
  assert.equal(input.canvasCursor({ ...base, tool: 'eraser' }), 'none')
  assert.equal(input.canvasCursor({ ...base, hover: 'item' }), 'pointer')
  assert.equal(input.canvasCursor({ ...base, hover: 'selected' }), 'move')
  assert.equal(input.canvasCursor({ ...base, tool: 'eraser', hover: 'item' }), 'none')
  assert.equal(input.canvasCursor({ ...base, spaceHeld: true, hover: 'item' }), 'grab')
  assert.equal(input.canvasCursor({ ...base, spaceHeld: true, panning: true }), 'grabbing')
  for (const tool of ['pen', 'text', 'eraser', 'select']) assert.equal(input.canvasCursor({ ...base, mode: 'tablet', tool, hover: 'item', spaceHeld: true }), '')
})

test('App wiring: the menu and double-click are Desktop only, touch and pen right-click stay suppressed, Escape closes, tablet keeps preventDefault', () => {
  assert.match(app, /const onCanvasContextMenu = \(event: React\.MouseEvent<HTMLCanvasElement>\) => \{\n\s*event\.preventDefault\(\)\n\s*const native/)
  assert.match(app, /if \(inputModeRef\.current !== 'desktop' \|\| native\.pointerType === 'touch' \|\| native\.pointerType === 'pen'\) return/)
  assert.match(app, /if \(!contextMenuElementRef\.current\?\.contains\(event\.target as Node\)\) setContextMenu\(null\)/)
  assert.match(app, /window\.addEventListener\('wheel', closeOutside, true\)/)
  assert.match(app, /window\.removeEventListener\('wheel', closeOutside, true\)/)
  assert.match(app, /if \(command\.kind === 'deselect'\) \{ closeContextMenu\(\); return true \}/)
  assert.match(app, /if \(inputMode !== 'desktop'\) setContextMenu\(null\)/)
  assert.match(app, /if \(inputModeRef\.current !== 'desktop' \|\| lastPointerTypeRef\.current !== 'mouse' \|\| event\.button !== 0 \|\| textEditorRef\.current \|\| classBoxEditor\) return/)
  assert.match(app, /onContextMenu=\{onCanvasContextMenu\}\n\s*onDoubleClick=\{onCanvasDoubleClick\}/)
  assert.match(app, /\['BUTTON', 'A'\]\.includes\(\(target\?\.tagName \?\? ''\)\.toUpperCase\(\)\)\) return/)
  // the cursor comes from one place and the eraser ring is shown for the mouse in Desktop mode
  assert.match(app, /canvas\.style\.cursor = canvasCursor\(\{ mode: inputModeRef\.current/)
  assert.match(app, /event\.pointerType === 'mouse' && inputModeRef\.current === 'desktop'\)\n\s*if \(\(!eraser && !isPenButtonHeld\(event\)\) \|\| !ringPointer\)/)
  assert.doesNotMatch(app, /style\.cursor = spaceHeldRef/)
})

// ---- Step 13: hardening ----
test('hardening: every new mouse branch is Desktop-only, double-click needs a mouse, a pen ends a mouse marquee, mode change clears hover', () => {
  // every new mouse pointer-down branch checks Desktop mode
  assert.match(app, /if \(event\.pointerType === 'mouse' && inputModeRef\.current === 'desktop'\) \{\n\s*if \(event\.shiftKey && !eraser\)/)
  assert.match(app, /if \(event\.pointerType === 'mouse' && inputModeRef\.current === 'desktop' && !hitTarget\(/)
  assert.match(app, /event\.pointerType === 'mouse' && event\.buttons === 0 && inputModeRef\.current === 'desktop'\) setMouseHover\(/)
  // the edge hold is pen-only and runs in both modes by design (no mode check)
  assert.match(app, /if \(event\.pointerType === 'pen' && !eraser && !buttonErase && !shapeMode && shapeTool === null\) \{\n\s*const edgeBox/)
  assert.match(app, /lastPointerTypeRef\.current !== 'mouse'/)
  assert.match(app, /if \(event\.pointerType === 'pen' && activeMarqueeRef\.current\) \{ activeMarqueeRef\.current = null; renderAll\(\) \}/)
  assert.match(app, /if \(inputMode !== 'desktop'\) setMouseHover\(null\)/)
  // the touch block still returns before any of the new branches
  const touch = app.indexOf("if (event.pointerType === 'touch') {\n      event.preventDefault()")
  const shift = app.indexOf('if (event.shiftKey && !eraser) {')
  assert.ok(touch > 0 && touch < shift)
})

test('hardening: every listener added by the new code is removed, and timers are cleared on unmount', () => {
  for (const name of ['pointerdown', 'wheel', 'scroll', 'blur', 'resize']) {
    assert.ok(app.includes(`window.addEventListener('${name}'`), `adds ${name}`)
    assert.ok(app.includes(`window.removeEventListener('${name}'`), `removes ${name}`)
  }
  assert.match(app, /useEffect\(\(\) => \(\) => \{ cancelEdgeHold\(\); if \(hoverFrameRef\.current !== null\) cancelAnimationFrame\(hoverFrameRef\.current\) \}, \[\]\)/)
})

test('a plain drawn rectangle is written in: the inside is left to the tool, the edge selects; a typed class box selects anywhere', () => {
  const plain = [rect(1, 0, 0, 200, 200)]
  for (const tool of ['pen', 'shape', 'text', 'lasso', 'classBox']) {
    assert.equal(input.clickSelectTarget(plain, pt(100, 100), 1, tool, false), null, tool)
    assert.equal(input.clickSelectTarget(plain, pt(100, 4), 1, tool, false)?.key, 'rectangle:1', tool)
  }
  assert.equal(input.hoverTarget(plain, pt(100, 100), 1), null)
  assert.equal(input.hoverTarget(plain, pt(100, 200), 1)?.key, 'rectangle:1')
  const typed = [rect(2, 0, 0, 200, 200, { classBox: { name: 'A', attributes: '', methods: '' } })]
  assert.equal(input.clickSelectTarget(typed, pt(100, 100), 1, 'pen', false)?.key, 'rectangle:2')
})
