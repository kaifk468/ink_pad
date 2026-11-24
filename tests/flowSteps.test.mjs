import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { numberSteps, clearSteps, stepTargets } = await loadModule('flowSteps.ts')
const input = await loadModule('desktopInput.ts')
const app = await readAppSource()

const box = (id, x = 0, y = 0) => ({ kind: 'rectangle', id, x, y, width: 50, height: 40, strokeColor: '#111', strokeWidth: 2 })
const att = (rectangleId) => ({ rectangleId, offsetX: 0, offsetY: 0 })
const conn = (id, from, to, sx = 0, sy = 0, extra = {}) => ({
  kind: 'connector', id, start: { x: sx, y: sy, pressure: 0.5 }, end: { x: sx + 10, y: sy + 10, pressure: 0.5 },
  strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false,
  ...(from ? { startAttachment: att(from) } : {}), ...(to ? { endAttachment: att(to) } : {}), ...extra,
})
const keys = (...k) => new Set(k)
const labels = (items) => Object.fromEntries(items.filter((i) => i.kind === 'connector').map((c) => [c.id, c.label]))

test('chain A to B to C is numbered in flow order, whatever the item order', () => {
  const items = [box(1), box(2), box(3), conn(11, 2, 3, 0, 50), conn(10, 1, 2, 0, 100)]
  const next = numberSteps(items, keys('connector:10', 'connector:11'))
  assert.deepEqual(labels(next), { 10: '1', 11: '2' })
  assert.equal(items[4].label, undefined, 'input is not mutated')
})

test('a branch numbers siblings top to bottom then left to right, then goes on', () => {
  const items = [box(1), box(2), box(3), box(4),
    conn(10, 1, 3, 0, 80), conn(11, 1, 2, 0, 20), conn(12, 2, 4, 0, 200)]
  const next = numberSteps(items, keys('connector:10', 'connector:11', 'connector:12'))
  assert.deepEqual(labels(next), { 11: '1', 10: '2', 12: '3' })
  const tie = [box(1), box(2), box(3), conn(20, 1, 2, 90, 10), conn(21, 1, 3, 30, 10)]
  assert.deepEqual(labels(numberSteps(tie, keys('connector:20', 'connector:21'))), { 21: '1', 20: '2' })
})

test('a cycle ends and numbers each connector once', () => {
  const items = [box(1), box(2), box(3), conn(10, 1, 2, 0, 0), conn(11, 2, 3, 0, 10), conn(12, 3, 1, 0, 20)]
  const next = numberSteps(items, keys('connector:10', 'connector:11', 'connector:12'))
  assert.deepEqual(labels(next), { 10: '1', 11: '2', 12: '3' })
})

test('unattached connectors are ordered by their start point', () => {
  const items = [conn(10, 0, 0, 100, 50), conn(11, 0, 0, 5, 50), conn(12, 0, 0, 100, 0)]
  const next = numberSteps(items, keys('connector:10', 'connector:11', 'connector:12'))
  assert.deepEqual(labels(next), { 12: '1', 11: '2', 10: '3' })
})

test('only the selected connectors are numbered when the selection has boxes too', () => {
  const items = [box(1), box(2), box(3), conn(10, 1, 2, 0, 0), conn(11, 2, 3, 0, 10)]
  const next = numberSteps(items, keys('rectangle:1', 'rectangle:2', 'rectangle:3', 'connector:11'))
  assert.deepEqual(labels(next), { 10: undefined, 11: '1' })
})

test('boxes only: the connectors with both ends on selected boxes are numbered', () => {
  const items = [box(1), box(2), box(3), conn(10, 1, 2, 0, 0), conn(11, 2, 3, 0, 10), conn(12, 3, 4, 0, 20)]
  const next = numberSteps(items, keys('rectangle:1', 'rectangle:2', 'rectangle:3'))
  assert.deepEqual(labels(next), { 10: '1', 11: '2', 12: undefined })
  assert.equal(numberSteps(items, keys('rectangle:1')), null)
  assert.equal(numberSteps(items, keys()), null)
})

test('labels keep their text after the number, old numbers are replaced, empty becomes the number', () => {
  const items = [box(1), box(2), box(3), box(4), conn(10, 1, 2, 0, 0, { label: 'publishes' }), conn(11, 2, 3, 0, 10, { label: '7) reads\nmore' }), conn(12, 3, 4, 0, 20, { label: '9' })]
  const next = numberSteps(items, keys('connector:10', 'connector:11', 'connector:12'))
  assert.deepEqual(labels(next), { 10: '1. publishes', 11: '2. reads\nmore', 12: '3' })
  const again = numberSteps(next, keys('connector:10', 'connector:11', 'connector:12'))
  assert.equal(again, null, 'numbering twice changes nothing')
})

test('a long label stays within the 500 character limit', () => {
  const items = [conn(10, 0, 0, 0, 0, { label: 'x'.repeat(500) })]
  const next = numberSteps(items, keys('connector:10'))
  assert.equal(next[0].label.length, 500)
  assert.ok(next[0].label.startsWith('1. x'))
})

test('clearSteps removes leading numbers and drops a label that was only a number', () => {
  const items = [conn(10, 0, 0, 0, 0, { label: '1. publishes' }), conn(11, 0, 0, 0, 10, { label: '2' }), conn(12, 0, 0, 0, 20, { label: 'plain' }), conn(13, 0, 0, 0, 30, { label: '3 servers' })]
  const next = clearSteps(items, keys('connector:10', 'connector:11', 'connector:12', 'connector:13'))
  assert.deepEqual(labels(next), { 10: 'publishes', 11: undefined, 12: 'plain', 13: '3 servers' })
  assert.ok(!('label' in next[1]))
  assert.equal(clearSteps(next, keys('connector:10')), null)
})

test('locked connectors are skipped', () => {
  const items = [conn(10, 0, 0, 0, 0, { locked: true, label: '5' }), conn(11, 0, 0, 0, 10)]
  const all = keys('connector:10', 'connector:11')
  assert.deepEqual(stepTargets(items, all).map((c) => c.id), [11])
  assert.deepEqual(labels(numberSteps(items, all)), { 10: '5', 11: '1' })
  assert.equal(clearSteps(items, keys('connector:10')), null)
  assert.equal(numberSteps(items, keys('connector:10')), null)
})

test('context menu offers the step entries only when asked', () => {
  const base = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }
  const on = input.contextMenuEntries({ ...base, canNumberSteps: true }).map((e) => e.action)
  assert.ok(on.includes('numberSteps') && on.includes('clearSteps'))
  const off = input.contextMenuEntries(base).map((e) => e.action)
  assert.ok(!off.includes('numberSteps') && !off.includes('clearSteps'))
})

test('App wires Number steps: menu, palette, one undo step, toasts', () => {
  assert.match(app, /case 'numberSteps': numberFlowSteps\(\)/)
  assert.match(app, /case 'clearSteps': clearFlowSteps\(\)/)
  assert.match(app, /id: 'flow:number', label: 'Number steps'/)
  assert.match(app, /id: 'flow:clear', label: 'Clear step numbers'/)
  assert.match(app, /canNumberSteps: stepTargets\(/)
  assert.match(app, /const numberFlowSteps[\s\S]*?saveHistory\(\)[\s\S]*?Numbered \$\{count\}/)
  assert.match(app, /const clearFlowSteps[\s\S]*?saveHistory\(\)[\s\S]*?Cleared step numbers/)
})
