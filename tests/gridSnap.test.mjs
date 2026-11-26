import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const grid = await loadModule('gridSnap.ts')
const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const app = await readAppSource()
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
const memory = (data = {}) => ({ data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v) } })
const throwing = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }

test('snapToGrid rounds to the nearest line, including negatives and never -0', () => {
  assert.equal(grid.snapToGrid(29, 20), 20)
  assert.equal(grid.snapToGrid(31, 20), 40)
  assert.equal(grid.snapToGrid(-29, 20), -20)
  assert.equal(grid.snapToGrid(-31, 20), -40)
  assert.ok(!Object.is(grid.snapToGrid(-3, 20), -0))
  assert.equal(grid.snapToGrid(7, 0), 7)
})

test('snapMoveDelta puts the top-left on the grid and moves everything by the same delta', () => {
  assert.deepEqual(grid.snapMoveDelta({ x: 13, y: 47 }, 10, -2, 20), { dx: 7, dy: -7 })
  assert.deepEqual(grid.snapMoveDelta({ x: -13, y: -47 }, -10, -1, 20), { dx: -7, dy: 7 })
  assert.deepEqual(grid.snapMoveDelta({ x: 100, y: 100 }, 4, -4, 20), { dx: 0, dy: 0 })
})

test('snapResizeBounds snaps only the moved edges and keeps a minimum size', () => {
  const b = { x: 20, y: 20, width: 113, height: 87 }
  assert.deepEqual(grid.snapResizeBounds(b, 'se', 20), { x: 20, y: 20, width: 120, height: 80 })
  assert.deepEqual(grid.snapResizeBounds({ x: 13, y: 21, width: 107, height: 80 }, 'nw', 20), { x: 20, y: 20, width: 100, height: 81 })
  assert.deepEqual(grid.snapResizeBounds(b, 'e', 20), { x: 20, y: 20, width: 120, height: 87 })
  assert.deepEqual(grid.snapResizeBounds({ x: 20, y: 20, width: 33, height: 40 }, 'w', 20), { x: 20, y: 20, width: 33, height: 40 }, 'would drop below the minimum: unchanged')
  assert.deepEqual(grid.snapResizeBounds({ x: -33, y: 0, width: 50, height: 50 }, 'w', 20), { x: -40, y: 0, width: 57, height: 50 })
})

test('grid spacing: 20 by default, the dotted page spacing when dotted', () => {
  assert.equal(grid.gridSpacingFor('blank', 'standard'), 20)
  assert.equal(grid.gridSpacingFor('lined', 'wide'), 20)
  assert.equal(grid.gridSpacingFor('dotted', 'standard'), 32)
  assert.equal(grid.gridSpacingFor('dotted', 'narrow'), 25.6)
})

test('gridSnapApplies: desktop mouse only', () => {
  assert.equal(grid.gridSnapApplies(true, 'desktop', 'mouse'), true)
  assert.equal(grid.gridSnapApplies(true, 'desktop', 'pen'), false)
  assert.equal(grid.gridSnapApplies(true, 'desktop', 'touch'), false)
  assert.equal(grid.gridSnapApplies(true, 'tablet', 'mouse'), false)
  assert.equal(grid.gridSnapApplies(false, 'desktop', 'mouse'), false)
})

test('gridDots covers the view and is capped', () => {
  const dots = grid.gridDots({ x: -10, y: -10, width: 50, height: 30 }, 20)
  assert.deepEqual(dots.map((d) => [d.x, d.y]), [[0, 0], [20, 0], [40, 0], [0, 20], [20, 20], [40, 20]])
  assert.equal(grid.gridDots({ x: 0, y: 0, width: 100000, height: 100000 }, 20).length, 0)
})

test('setting: off by default, saved per device, safe with throwing storage', () => {
  assert.equal(grid.loadGridSnap(memory()), false)
  assert.equal(grid.loadGridSnap(memory({ 'inkpad.snapToGrid': 'junk' })), false)
  const store = memory()
  grid.saveGridSnap(true, store)
  assert.deepEqual(store.data, { 'inkpad.snapToGrid': '1' })
  assert.equal(grid.loadGridSnap(store), true)
  assert.equal(grid.loadGridSnap(throwing), false)
  assert.doesNotThrow(() => grid.saveGridSnap(true, throwing))
})

test("Ctrl+' toggles snap to grid in desktop mode only, by code or key", () => {
  assert.deepEqual(input.keyCommand(key("'", { ctrlKey: true, code: 'Quote' }), 'desktop'), { kind: 'gridSnap' })
  assert.deepEqual(input.keyCommand(key("'", { metaKey: true }), 'desktop'), { kind: 'gridSnap' })
  assert.deepEqual(input.keyCommand(key('é', { ctrlKey: true, code: 'Quote' }), 'desktop'), { kind: 'gridSnap' })
  assert.equal(input.keyCommand(key("'", { ctrlKey: true, code: 'Quote', repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key("'", { ctrlKey: true, code: 'Quote' }), 'tablet'), null)
  assert.equal(input.keyCommand(key("'", { code: 'Quote' }), 'desktop'), null, 'bare quote does nothing')
  const row = shortcuts.DESKTOP_SHORTCUTS.find((entry) => entry.keys === "Ctrl+'")
  assert.ok(row)
  assert.deepEqual(input.keyCommand(shortcuts.shortcutKeyInput(row), 'desktop'), { kind: 'gridSnap' })
})

test('wiring: palette, menu, toast, guides skipped, gated to desktop mouse', () => {
  assert.match(app, /label: gridSnap \? 'Snap to grid: off' : 'Snap to grid: on'/)
  assert.match(app, /showToast\(on \? 'Snap to grid on' : 'Snap to grid off'\)/)
  assert.match(app, /case 'gridSnap': updateGridSnap\(!gridSnapRef\.current\); return true/)
  assert.match(app, /gridSnapApplies\(gridSnapRef\.current, inputModeRef\.current, event\.pointerType\)/)
  const dragStart = app.indexOf('const snapDragDelta')
  const gridBranch = app.indexOf('if (grid !== null)', dragStart)
  const guideSnap = app.indexOf('snapForDrag(true', dragStart)
  assert.ok(dragStart > 0 && gridBranch > dragStart && gridBranch < guideSnap, 'grid branch returns before smart guides')
  assert.match(app, /snapResizeBounds\(bounds, activeResize\.handle, resizeGrid\)/)
  assert.match(app, /snapToGrid\(point\.x, createGrid\)/)
  assert.match(app, /gridSize !== null && pageTemplateRef\.current === 'blank'/)
})
