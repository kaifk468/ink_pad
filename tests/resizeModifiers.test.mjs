import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const rm = await loadModule('resizeModifiers.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const app = await readAppSource()

const O = { x: 100, y: 100, width: 200, height: 100 }

test('keepAspect: each corner keeps the ratio and stays anchored at the opposite corner', () => {
  // se: pointer moved further on x
  assert.deepEqual(rm.keepAspect(O, { x: 100, y: 100, width: 400, height: 110 }, 'se'), { x: 100, y: 100, width: 400, height: 200 })
  // nw: the anchor is the bottom-right corner (300, 200)
  const nw = rm.keepAspect(O, { x: 0, y: 150, width: 300, height: 50 }, 'nw')
  assert.deepEqual(nw, { x: 0, y: 50, width: 300, height: 150 })
  assert.equal(nw.x + nw.width, 300)
  assert.equal(nw.y + nw.height, 200)
  // ne: anchor bottom-left (100, 200); larger factor comes from height
  const ne = rm.keepAspect(O, { x: 100, y: 0, width: 210, height: 200 }, 'ne')
  assert.deepEqual(ne, { x: 100, y: 0, width: 400, height: 200 })
  // sw: anchor top-right (300, 100)
  const sw = rm.keepAspect(O, { x: 200, y: 100, width: 100, height: 300 }, 'sw')
  assert.equal(sw.x + sw.width, 300)
  assert.equal(sw.y, 100)
  assert.equal(sw.width / sw.height, 2)
})

test('keepAspect: edge handles are unchanged', () => {
  const proposed = { x: 100, y: 100, width: 350, height: 100 }
  for (const handle of ['n', 'e', 's', 'w']) assert.equal(rm.keepAspect(O, proposed, handle), proposed)
})

test('keepAspect: respects the minimum size and keeps the ratio', () => {
  const tiny = rm.keepAspect(O, { x: 280, y: 190, width: 20, height: 10 }, 'nw')
  assert.equal(tiny.height, 32)
  assert.equal(tiny.width, 64)
  assert.equal(tiny.x + tiny.width, 300)
  assert.equal(tiny.y + tiny.height, 200)
  const tall = rm.keepAspect({ x: 0, y: 0, width: 20, height: 200 }, { x: 0, y: 0, width: 5, height: 5 }, 'se')
  assert.equal(tall.width, 32)
  assert.equal(tall.height, 320)
})

test('axisLock keeps the larger axis', () => {
  assert.deepEqual(rm.axisLock(30, 5), { dx: 30, dy: 0 })
  assert.deepEqual(rm.axisLock(-3, -40), { dx: 0, dy: -40 })
  assert.deepEqual(rm.axisLock(10, 10), { dx: 10, dy: 0 })
  assert.deepEqual(rm.axisLock(0, 0), { dx: 0, dy: 0 })
})

test('sizeReadoutText rounds', () => {
  assert.equal(rm.sizeReadoutText(160.4, 99.6), '160 × 100')
})

test('wiring: Shift reads live from the pointer event, desktop mouse only; readout is an overlay, not an item', () => {
  assert.match(app, /event\.shiftKey && event\.pointerType === 'mouse' && inputModeRef\.current === 'desktop' \? \{ \.\.\.axisLock\(dx, dy\), locked: lockedAxis\(dx, dy\) \}/)
  assert.match(app, /const dragSnap = lockSnapped\(lockedAxisName, snapDragDelta\(/)
  assert.match(app, /const lassoSnap = lockSnapped\(lockedAxisName, snapDragDelta\(/)
  assert.match(app, /const keepRatio = event\.shiftKey && event\.pointerType === 'mouse' && inputModeRef\.current === 'desktop' && !activeResize\.created/)
  assert.match(app, /keepAspect\(activeResize\.originalBounds, bounds, activeResize\.handle, undefined, workspaceBoundsRef\.current\)/)
  assert.match(app, /!keepRatio\) \{/)
  assert.match(app, /sizeReadoutRef\.current = \{ x: point\.x, y: point\.y, width: bounds\.width, height: bounds\.height \}/)
  assert.match(app, /if \(readout && activeResizeRef\.current\?\.moved\)/)
  assert.match(app, /sizeReadoutText\(readout\.width, readout\.height\)/)
})

test('help lists the Shift mouse modifiers', () => {
  const labels = shortcuts.DESKTOP_SHORTCUTS.map((row) => row.label)
  assert.ok(labels.some((l) => /Shift while resizing: keep proportions/.test(l)))
  assert.ok(labels.some((l) => /Shift while moving: straight line/.test(l)))
})

test('round 10 review: Shift axis lock zeroes only the locked axis; no Shift keeps the snap', () => {
  assert.equal(rm.lockedAxis(30, 5), 'dy')
  assert.equal(rm.lockedAxis(3, -40), 'dx')
  assert.equal(rm.lockedAxis(0, 0), null)
  // A purely horizontal raw drag without Shift: the snap on dy survives (locked = null).
  assert.deepEqual(rm.keepLockedAxis(null, { dx: 20, dy: 4 }), { dx: 20, dy: 4 })
  assert.deepEqual(rm.keepLockedAxis('dy', { dx: 20, dy: 4 }), { dx: 20, dy: 0 })
  assert.deepEqual(rm.keepLockedAxis('dx', { dx: 20, dy: 4 }), { dx: 0, dy: 4 })
  assert.match(app, /const lockSnapped = \(locked: 'dx' \| 'dy' \| null, snapped/)
  assert.match(app, /: \{ dx, dy, locked: null \}/)
})

test('round 10 review: equal-gap snapping is Desktop mouse only; keep-ratio is for corner handles only', () => {
  assert.match(app, /viewportRef\.current\.scale, !duplicating && inputModeRef\.current === 'desktop' && event\.pointerType === 'mouse'\)/)
  assert.match(app, /!activeResize\.created && isCornerHandle\(activeResize\.handle\)/)
  assert.equal(rm.isCornerHandle('se'), true)
  assert.equal(rm.isCornerHandle('e'), false)
  assert.equal(rm.isCornerHandle('n'), false)
})

test('round 10 review: keepAspect never pushes either side past the bound', () => {
  const limit = { x: 0, y: 0, width: 500, height: 300 }
  // se from (100,100) 200x100: asking for 4x would reach x=900; capped by the room (400 wide, 200 tall -> scale 2).
  const se = rm.keepAspect(O, { x: 100, y: 100, width: 800, height: 120 }, 'se', 32, limit)
  assert.deepEqual(se, { x: 100, y: 100, width: 400, height: 200 })
  assert.ok(se.x + se.width <= 500 && se.y + se.height <= 300)
  // nw anchors at (300,200): room 300 wide, 200 tall -> scale 1.5 at most.
  const nw = rm.keepAspect(O, { x: -500, y: -500, width: 900, height: 700 }, 'nw', 32, limit)
  assert.ok(nw.x >= 0 && nw.y >= 0)
  assert.equal(nw.x + nw.width, 300)
  assert.match(app, /keepAspect\(activeResize\.originalBounds, bounds, activeResize\.handle, undefined, workspaceBoundsRef\.current\)/)
})

test('Shift held before pressing a resize handle resizes instead of toggling the selection (walk fix)', () => {
  assert.match(app, /const shiftHit = shiftPressOnSelectionHandle\(point\) \? null : shiftClickTarget\(/)
  assert.match(app, /const shiftPressOnSelectionHandle = \(point: Point\): boolean => \{[\s\S]{0,700}hitTestRectangleResizeHandle\(box, point, tolerance\)[\s\S]{0,500}hitTestRectangleResizeHandle\(bounds, point, tolerance\)/)
})
