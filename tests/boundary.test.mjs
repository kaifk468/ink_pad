import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { addBoundary, boundaryBounds, BOUNDARY_PADDING } = await loadModule('boundary.ts')
const input = await loadModule('desktopInput.ts')
const app = await readAppSource()

const workspace = { x: 0, y: 0, width: 2000, height: 2000 }
const box = (id, x, y, width = 100, height = 60, extra = {}) => ({ kind: 'rectangle', id, x, y, width, height, strokeColor: '#111', strokeWidth: 2, ...extra })
const keys = (...k) => new Set(k)
const ids = { rectangle: 50, text: 60 }
const menu = (extra = {}) => ({ hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false, ...extra })

test('a dashed grey plain rectangle with padding 32 goes around the selection', () => {
  const items = [box(1, 200, 300), box(2, 500, 400)]
  const result = addBoundary(items, keys('rectangle:1', 'rectangle:2'), ids, workspace)
  const r = result.rectangle
  assert.equal(r.id, 50)
  assert.equal(r.dash, 'dashed')
  assert.equal(r.fillColor, undefined, 'no fill')
  assert.equal(r.strokeColor, '#64748b')
  assert.equal(r.diamond, undefined)
  assert.equal(r.ellipse, undefined)
  assert.equal(r.classBox, undefined)
  assert.equal(BOUNDARY_PADDING, 32)
  const b = boundaryBounds(items, keys('rectangle:1', 'rectangle:2'), workspace)
  assert.equal(r.x, b.x)
  assert.equal(r.y, b.y)
  assert.ok(r.x <= 200 - 32 && r.y <= 300 - 32, 'padding at least 32 on the top-left')
  assert.ok(r.x + r.width >= 600 + 32 && r.y + r.height >= 460 + 32, 'padding at least 32 on the bottom-right')
})

test('the rectangle is behind all items and the label is on top, at the top-left inside', () => {
  const items = [box(1, 200, 300), { kind: 'text', id: 3, x: 220, y: 320, width: 40, height: 20, text: 'a', fontSize: 16, color: '#111' }]
  const result = addBoundary(items, keys('rectangle:1'), ids, workspace)
  assert.equal(result.items.length, 4)
  assert.equal(result.items[0], result.rectangle)
  assert.equal(result.items[3], result.label)
  const t = result.label
  const r = result.rectangle
  assert.equal(t.id, 60)
  assert.equal(t.text, 'Boundary')
  assert.equal(t.fontSize, 16)
  assert.equal(t.align, undefined, 'left aligned')
  assert.ok(t.x >= r.x && t.y >= r.y && t.x + t.width <= r.x + r.width && t.y + t.height <= r.y + r.height, 'inside')
  assert.ok(t.x - r.x < 40 && t.y - r.y < 40, 'near the top-left corner')
  assert.equal(items.length, 2, 'input untouched')
})

test('it never passes an eraser stroke that overlaps it', () => {
  const eraser = { kind: 'stroke', id: 9, points: [{ x: 180, y: 290, pressure: 1 }, { x: 320, y: 360, pressure: 1 }], color: '#fff', width: 20, erase: true }
  const result = addBoundary([box(1, 200, 300), eraser], keys('rectangle:1'), ids, workspace)
  assert.ok(result.items.indexOf(result.rectangle) > result.items.indexOf(eraser))
})

test('clamped to the workspace', () => {
  const small = { x: 0, y: 0, width: 400, height: 300 }
  const result = addBoundary([box(1, 10, 10, 100, 60)], keys('rectangle:1'), ids, small)
  assert.equal(result.rectangle.x, 0)
  assert.equal(result.rectangle.y, 0)
  const far = addBoundary([box(1, 300, 200, 90, 90)], keys('rectangle:1'), ids, small)
  assert.ok(far.rectangle.x + far.rectangle.width <= 400 && far.rectangle.y + far.rectangle.height <= 300)
})

test('no selection gives null', () => {
  assert.equal(addBoundary([box(1, 0, 0)], keys(), ids, workspace), null)
})

test('any kind of item can be enclosed', () => {
  const stroke = { kind: 'stroke', id: 1, points: [{ x: 300, y: 300, pressure: 1 }, { x: 500, y: 380, pressure: 1 }], color: '#111', width: 4 }
  const result = addBoundary([stroke], keys('stroke:1'), ids, workspace)
  assert.ok(result.rectangle.x <= 268 && result.rectangle.x + result.rectangle.width >= 532)
})

test('wiring: chip, palette, panel, one undo step, editor on the label', () => {
  assert.deepEqual(input.contextMenuEntries(menu()).filter((e) => e.action === 'addBoundary').map((e) => [e.chip, e.chipGroup, e.disabled]), [['Boundary', 'Order', false]])
  const fits = input.contextMenuRows(input.contextMenuEntries(menu())).find((r) => r.chips && r.chips[0].chipGroup === 'Order')
  assert.deepEqual(fits.chips.map((c) => c.chip), ['Front', 'Back', 'Boundary'])
  assert.equal(input.chipBlockLayout(fits.chips).inline, true, 'shares the Order chip line: the menu does not grow')
  assert.equal(input.contextMenuEntries(menu({ hasSelection: false })).some((e) => e.action === 'addBoundary'), false)
  assert.match(app, /case 'addBoundary': addBoundaryAroundSelection\(\)/)
  assert.match(app, /id: 'arrange:boundary', label: 'Add boundary'/)
  assert.match(app, /boundaryTools=\{currentSelectionKeys\(\)\.size > 0/)
  assert.match(app, /aria-label="Add boundary"/)
  const start = app.indexOf('const addBoundaryAroundSelection')
  const block = app.slice(start, app.indexOf('const selectAllItems', start))
  assert.equal((block.match(/saveHistory\(\)/g) ?? []).length, 1)
  assert.match(block, /editTextItem\(result\.label, true\)/)
  assert.match(block, /updateSelectedItems\(\[canvasItemKey\(result\.label\)\]\)/)
})

// Container rectangles: only the edge band (or a label) picks them.
const bnd = await loadModule('boundary.ts')
const label = (id, x, y, w = 60, h = 20) => ({ kind: 'text', id, x, y, width: w, height: h, text: 'x', fontSize: 16, color: '#111' })

test('isContainerBox: an unfilled plain rectangle holding another box is a container', () => {
  const outer = box(1, 0, 0, 400, 300)
  assert.equal(bnd.isContainerBox([outer, box(2, 100, 100)], outer), true)
  assert.equal(bnd.isContainerBox([outer, label(3, 300, 220)], outer), true)
})

test('isContainerBox: empty, own-label-only, filled, class, HLD, oval, locked or partly-overlapping contents are not', () => {
  const outer = box(1, 0, 0, 400, 300)
  assert.equal(bnd.isContainerBox([outer], outer), false)
  assert.equal(bnd.isContainerBox([outer, label(2, 12, 8)], outer), false) // the boundary label
  assert.equal(bnd.isContainerBox([outer, label(2, 170, 140)], outer), false) // a centred label
  assert.equal(bnd.isContainerBox([outer, box(2, 350, 100)], outer), false) // sticks out
  assert.equal(bnd.isContainerBox([outer, box(2, 100, 100, 100, 60, { locked: true })], outer), false)
  for (const extra of [{ fillColor: '#b2f2bb' }, { classBox: {} }, { hldShape: 'database' }, { ellipse: true }, { diamond: true }, { inkBox: {} }]) {
    const o = box(1, 0, 0, 400, 300, extra)
    assert.equal(bnd.isContainerBox([o, box(2, 100, 100)], o), false, JSON.stringify(extra))
  }
  const clear = box(1, 0, 0, 400, 300, { fillColor: 'transparent' })
  assert.equal(bnd.isContainerBox([clear, box(2, 100, 100)], clear), true)
})

test('hitTarget: the interior of a container falls through, its edge band and contents still hit', () => {
  const outer = box(1, 0, 0, 400, 300)
  const inner = box(2, 100, 100)
  const items = [outer, inner]
  assert.equal(input.hitTarget(items, { x: 300, y: 250 }, 1), null)
  assert.equal(input.hitTarget(items, { x: 3, y: 150 }, 1)?.id, 1)
  assert.equal(input.hitTarget(items, { x: 150, y: 130 }, 1)?.id, 2)
  assert.equal(input.hitTarget(items, { x: 300, y: 250 }, 1), null)
  // a plain rectangle with nothing inside is unchanged
  assert.equal(input.hitTarget([outer], { x: 300, y: 250 }, 1)?.id, 1)
  // a filled rectangle is unchanged
  const filled = box(1, 0, 0, 400, 300, { fillColor: '#b2f2bb' })
  assert.equal(input.hitTarget([filled, inner], { x: 300, y: 250 }, 1)?.id, 1)
  assert.equal(input.doubleClickTarget(items, { x: 300, y: 250 }, 1), null)
})

test('the select press, right-click and double-click share the container-aware hit test', () => {
  assert.match(app, /rectanglePicked\(strokesRef\.current, item, point, viewportRef\.current\.scale\)/)
  assert.match(app, /hitTarget\(routeConnectors\(strokesRef\.current\), point, viewportRef\.current\.scale, passThroughCode\)/)
  const src = require_src()
  assert.match(src, /isContainerBox\(items, item\)/)
})
function require_src() {
  return readFileSync(new URL('../src/desktopInput.ts', import.meta.url), 'utf8')
}
