import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const dd = await loadModule('dragDuplicate.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const app = await readAppSource()

const box = (id, x, y) => ({ kind: 'rectangle', id, x, y, width: 100, height: 60, strokeColor: '#c00000', strokeWidth: 3 })
const label = (id, x, y) => ({ kind: 'text', id, x, y, width: 40, height: 20, text: 'hi', fontSize: 16, color: '#000' })
const conn = (id, a, b) => ({ kind: 'connector', id, start: { x: 100, y: 30, pressure: 1 }, end: { x: 300, y: 30, pressure: 1 }, strokeColor: '#000', strokeWidth: 3, startAttachment: { rectangleId: a, offsetX: 100, offsetY: 30 }, endAttachment: { rectangleId: b, offsetX: 0, offsetY: 30 } })
const WS = { x: -2000, y: -2000, width: 8000, height: 8000 }
const counters = { stroke: 10, rectangle: 10, connector: 10, text: 10 }

test('isDuplicateDragPress: Ctrl or Cmd, left mouse, Desktop only', () => {
  assert.equal(dd.isDuplicateDragPress('desktop', 'mouse', 0, true, false), true)
  assert.equal(dd.isDuplicateDragPress('desktop', 'mouse', 0, false, true), true)
  assert.equal(dd.isDuplicateDragPress('desktop', 'mouse', 0, false, false), false)
  assert.equal(dd.isDuplicateDragPress('desktop', 'mouse', 2, true, false), false)
  assert.equal(dd.isDuplicateDragPress('desktop', 'pen', 0, true, false), false)
  assert.equal(dd.isDuplicateDragPress('tablet', 'mouse', 0, true, false), false)
})

test('duplicateForDrag: originals untouched, copies get new ids, connector between copied boxes follows', () => {
  const items = [box(1, 0, 0), box(2, 200, 0), conn(5, 1, 2), label(3, 20, 20)]
  const r = dd.duplicateForDrag(items, new Set(['rectangle:1', 'rectangle:2']), ['text:3'], counters, WS)
  assert.equal(r.items.length, 8)
  assert.deepEqual(r.items.slice(0, 4), items)
  const copies = r.items.slice(4)
  const c = copies.find((i) => i.kind === 'connector')
  assert.deepEqual([c.startAttachment.rectangleId, c.endAttachment.rectangleId], [10, 11])
  assert.equal(r.copyKeys.size, 4)
  assert.deepEqual([...r.selectedKeys].sort(), ['rectangle:10', 'rectangle:11'])
  assert.equal(copies.find((i) => i.kind === 'rectangle').x, 0)
})

test('duplicateForDrag: a connector to a box that is not copied is not copied; empty gives null', () => {
  const items = [box(1, 0, 0), box(2, 200, 0), conn(5, 1, 2)]
  const r = dd.duplicateForDrag(items, new Set(['rectangle:1']), [], counters, WS)
  assert.equal(r.items.length, 4)
  assert.equal(dd.duplicateForDrag(items, new Set(['rectangle:9']), [], counters, WS), null)
})

test('shortcut row: Ctrl + drag, no input', () => {
  const row = shortcuts.DESKTOP_SHORTCUTS.find((e) => e.label === 'Duplicate while dragging')
  assert.equal(row.keys, 'Ctrl + drag')
  assert.equal(row.input, undefined)
})

test('wiring: Select tool only, copy at first move, one history step, Escape restores selection', () => {
  assert.match(app, /const duplicatePress = [^\n]*selectionMode && !lassoMode && isDuplicateDragPress\(/)
  assert.equal((app.match(/duplicatePress\(event\) \? \{ duplicate: true \}/g) ?? []).length, 3)
  assert.match(app, /drag\.duplicate \? beginDuplicate\(drag, /)
  assert.match(app, /lassoDrag\.duplicate \? beginDuplicate\(lassoDrag, /)
  assert.match(app, /restoredSelection = drag\.dup\?\.before/)
  assert.match(app, /if \(restoredSelection\) applySelectionState\(restoredSelection\)/)
  assert.match(app, /switchConnectorSides\(drag\.dup \? drag\.dup\.copyKeys/)
})
