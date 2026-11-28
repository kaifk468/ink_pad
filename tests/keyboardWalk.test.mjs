import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { walkOrder, walkStep, walkCurrentKey, linkedNeighbour, revealViewport } = await loadModule('keyboardWalk.ts')
const { keyCommand, ALWAYS_PREVENT_DEFAULT_COMMANDS } = await loadModule('desktopInput.ts')
const { DESKTOP_SHORTCUTS } = await loadModule('desktopShortcuts.ts')
const app = await readAppSource()

const box = (id, x, y, w = 100, h = 60, extra = {}) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 2, ...extra })
const text = (id, x, y, extra = {}) => ({ kind: 'text', id, x, y, width: 40, height: 20, text: 'hi', fontSize: 16, color: '#111', ...extra })
const stroke = (id) => ({ kind: 'stroke', id, points: [{ x: 0, y: 0, pressure: 1 }, { x: 5, y: 5, pressure: 1 }], color: '#111', width: 2, erase: false })
const conn = (id, from, to, extra = {}) => ({
  kind: 'connector', id, start: { x: 0, y: 0, pressure: 0.5 }, end: { x: 9, y: 9, pressure: 0.5 }, strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false,
  ...(from !== undefined ? { startAttachment: { rectangleId: from, offsetX: 0, offsetY: 0 } } : {}), ...(to !== undefined ? { endAttachment: { rectangleId: to, offsetX: 0, offsetY: 0 } } : {}), ...extra,
})
const press = (key, extra = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })

test('reading order: rows top to bottom, left to right; ink, locked and erase are not stops', () => {
  const items = [box(3, 400, 5), box(1, 0, 0), box(2, 200, 10), box(4, 0, 200), text(1, 300, 400), stroke(1), box(5, 600, 600, 100, 60, { locked: true })]
  assert.deepEqual(walkOrder(items), ['rectangle:1', 'rectangle:2', 'rectangle:3', 'rectangle:4', 'text:1'])
  assert.deepEqual(walkOrder([]), [])
})

test('Tab / Shift+Tab step without wrapping; nothing selected starts at the first / last; past the ends leaves', () => {
  const items = [box(1, 0, 0), box(2, 200, 0), box(3, 400, 0)]
  assert.deepEqual(walkStep(items, null, 1), { key: 'rectangle:1' })
  assert.deepEqual(walkStep(items, null, -1), { key: 'rectangle:3' })
  assert.deepEqual(walkStep(items, 'rectangle:1', 1), { key: 'rectangle:2' })
  assert.deepEqual(walkStep(items, 'rectangle:3', 1), { leave: true })
  assert.deepEqual(walkStep(items, 'rectangle:1', -1), { leave: true })
  assert.deepEqual(walkStep(items, 'gone:9', 1), { key: 'rectangle:1' })
  assert.equal(walkStep([stroke(1)], null, 1), null)
})

test('walking skips the other members of the current group and continues from the walked key', () => {
  const items = [box(1, 0, 0), box(2, 200, 0, 100, 60, { group: 7 }), box(3, 400, 0, 100, 60, { group: 7 }), box(4, 600, 0)]
  assert.deepEqual(walkStep(items, 'rectangle:2', 1), { key: 'rectangle:4' })
  assert.deepEqual(walkStep(items, 'rectangle:3', -1), { key: 'rectangle:1' })
  assert.deepEqual(walkStep(items, 'rectangle:1', 1), { key: 'rectangle:2' })
  const group = new Set(['rectangle:2', 'rectangle:3'])
  assert.equal(walkCurrentKey(items, group, 'rectangle:2'), 'rectangle:2', 'the selection is the walked key whole group')
  assert.equal(walkCurrentKey(items, group, null), null)
  assert.equal(walkCurrentKey(items, new Set(['rectangle:2']), 'rectangle:2'), 'rectangle:2', 'a lone selected key is the sole key')
  assert.equal(walkCurrentKey(items, new Set(['rectangle:1', 'rectangle:4']), 'rectangle:1'), null)
  assert.equal(walkCurrentKey(items, new Set(['rectangle:4']), 'rectangle:1'), 'rectangle:4', 'a click elsewhere wins over the remembered key')
  assert.equal(walkCurrentKey(items, new Set(['rectangle:1']), 'rectangle:1'), 'rectangle:1')
})

test('walk wiring: the last walked key is tracked, leaving clears the selection and is not handled, Alt+Arrow on a button is prevented', () => {
  assert.match(app, /walkedKeyRef/)
  assert.match(app, /walkCurrentKey\(strokesRef\.current, currentSelectionKeys\(\), walkedKeyRef\.current\)/)
  assert.match(app, /'leave' in result[^\n]*applySelectionState\(\{ keys: \[\], rectangleId: null \}\)[^\n]*return false/)
  assert.match(app, /command\.kind === 'walkLinked'\) event\.preventDefault\(\); return \}/)
})

test('Alt+Arrow picks the linked box nearest the direction by angle', () => {
  const items = [box(1, 0, 0), box(2, 300, 0), box(3, 300, 200), box(4, -300, 0), box(5, 0, 400), box(6, 900, 900), conn(1, 1, 2), conn(2, 3, 1), conn(3, 1, 4), conn(4, 5, 6)]
  assert.equal(linkedNeighbour(items, 'rectangle:1', 'right'), 'rectangle:2')
  assert.equal(linkedNeighbour(items, 'rectangle:1', 'left'), 'rectangle:4')
  assert.equal(linkedNeighbour(items, 'rectangle:1', 'down'), 'rectangle:3', 'box 3 lies down-right, within 90 degrees of down')
  assert.equal(linkedNeighbour(items, 'rectangle:1', 'up'), null)
  assert.equal(linkedNeighbour(items, 'rectangle:5', 'down'), 'rectangle:6')
  assert.equal(linkedNeighbour(items, 'rectangle:2', 'right'), null)
  assert.equal(linkedNeighbour(items, 'connector:1', 'right'), null, 'only from a box')
  assert.equal(linkedNeighbour(items, 'rectangle:99', 'right'), null)
})

test('Alt+Arrow ignores locked boxes and loose connector ends', () => {
  const items = [box(1, 0, 0), box(2, 300, 0, 100, 60, { locked: true }), box(3, 300, 10), conn(1, 1, 2), conn(2, 1, undefined), conn(3, 1, 3)]
  assert.equal(linkedNeighbour(items, 'rectangle:1', 'right'), 'rectangle:3')
})

test('revealViewport leaves a visible item alone and centres an off-screen one', () => {
  const view = { width: 1000, height: 800 }
  const viewport = { scale: 1, offsetX: 0, offsetY: 0 }
  assert.equal(revealViewport(viewport, { x: 100, y: 100, width: 100, height: 60 }, view), viewport)
  const moved = revealViewport(viewport, { x: 3000, y: 2000, width: 100, height: 60 }, view)
  assert.deepEqual(moved, { scale: 1, offsetX: 500 - 3050, offsetY: 400 - 2030 })
  const edge = revealViewport(viewport, { x: 950, y: 100, width: 100, height: 60 }, view)
  assert.notEqual(edge, viewport)
})

test('keys: Tab, Shift+Tab, Alt+Arrow map to commands; the old arrow and Alt+Z keys are unchanged', () => {
  assert.deepEqual(keyCommand(press('Tab'), 'desktop'), { kind: 'walk', step: 1 })
  assert.deepEqual(keyCommand(press('Tab', { shiftKey: true }), 'desktop'), { kind: 'walk', step: -1 })
  assert.equal(keyCommand(press('Tab'), 'tablet'), null)
  assert.equal(keyCommand(press('Tab', { ctrlKey: true }), 'desktop'), null)
  assert.equal(keyCommand(press('Tab', { altKey: true }), 'desktop'), null)
  assert.deepEqual(keyCommand(press('ArrowRight', { altKey: true }), 'desktop'), { kind: 'walkLinked', direction: 'right' })
  assert.deepEqual(keyCommand(press('ArrowUp', { altKey: true }), 'desktop'), { kind: 'walkLinked', direction: 'up' })
  assert.equal(keyCommand(press('ArrowUp', { altKey: true, shiftKey: true }), 'desktop'), null)
  assert.equal(keyCommand(press('ArrowUp', { altKey: true }), 'tablet'), null)
  assert.deepEqual(keyCommand(press('ArrowRight'), 'desktop'), { kind: 'nudge', dx: 1, dy: 0 })
  assert.deepEqual(keyCommand(press('ArrowRight', { ctrlKey: true }), 'desktop'), { kind: 'quickCreate', direction: 'right' })
  assert.deepEqual(keyCommand(press('z', { altKey: true, code: 'KeyZ' }), 'desktop'), { kind: 'presentMode' })
  assert.ok(ALWAYS_PREVENT_DEFAULT_COMMANDS.has('walkLinked'), 'Alt+Left must never leave the page')
  assert.ok(!ALWAYS_PREVENT_DEFAULT_COMMANDS.has('walk'), 'Tab keeps its normal focus move when nothing is walked')
})

test('shortcut help lists both walks', () => {
  assert.ok(DESKTOP_SHORTCUTS.some((entry) => /Tab/.test(entry.keys) && entry.input?.key === 'Tab'))
  assert.ok(DESKTOP_SHORTCUTS.some((entry) => /Alt\+Arrow/.test(entry.keys) && entry.input?.altKey === true))
})

test('App wiring: Select tool only, no history entry, palette entries, Tab left alone in controls', () => {
  assert.match(app, /const walkSelect = \(/)
  assert.match(app, /case 'walk': return walkStep\w*\(|case 'walk': return walkTo\(/)
  assert.match(app, /case 'walkLinked'/)
  assert.match(app, /id: 'select:next'/)
  assert.match(app, /id: `select:linked-\${direction}`/)
  const walkFn = app.slice(app.indexOf('const walkSelect = ('), app.indexOf('// Same size (right-click chips'))
  assert.doesNotMatch(walkFn, /saveHistory\(\)/)
  assert.match(walkFn, /selectionMode/)
  assert.match(app, /command\.kind === 'walk'[\s\S]{0,300}tagName/)
})
