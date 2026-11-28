import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { connectedKeys, linkedKeys, canSelectConnected } = await loadModule('selectConnected.ts')
const input = await loadModule('desktopInput.ts')
const app = await readAppSource()

const box = (id, extra = {}) => ({ kind: 'rectangle', id, x: id * 100, y: 0, width: 50, height: 40, strokeColor: '#111', strokeWidth: 2, ...extra })
const conn = (id, from, to, extra = {}) => ({
  kind: 'connector', id, start: { x: 0, y: 0, pressure: 0.5 }, end: { x: 10, y: 10, pressure: 0.5 }, strokeColor: '#111', strokeWidth: 2,
  relationshipType: 'association', reversed: false,
  ...(from ? { startAttachment: { rectangleId: from, offsetX: 0, offsetY: 0 } } : {}), ...(to ? { endAttachment: { rectangleId: to, offsetX: 0, offsetY: 0 } } : {}), ...extra,
})
const keys = (...k) => new Set(k)
const sorted = (list) => [...list].sort()
const menu = (extra = {}) => ({ hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false, ...extra })

// 1 - 2 - 3 - 4 chain, 5 separate
const chain = () => [box(1), box(2), box(3), box(4), box(5), conn(10, 1, 2), conn(11, 2, 3), conn(12, 3, 4)]

test('connected: the box, its connectors and the boxes at their other ends', () => {
  assert.deepEqual(sorted(connectedKeys(chain(), keys('rectangle:2'))), ['connector:10', 'connector:11', 'rectangle:1', 'rectangle:2', 'rectangle:3'])
  assert.deepEqual(sorted(connectedKeys(chain(), keys('rectangle:1'))), ['connector:10', 'rectangle:1', 'rectangle:2'])
})

test('linked: everything reachable through connectors, transitively', () => {
  assert.deepEqual(sorted(linkedKeys(chain(), keys('rectangle:1'))), ['connector:10', 'connector:11', 'connector:12', 'rectangle:1', 'rectangle:2', 'rectangle:3', 'rectangle:4'])
  assert.equal(linkedKeys(chain(), keys('rectangle:1')).includes('rectangle:5'), false)
})

test('cycles end', () => {
  const items = [box(1), box(2), box(3), conn(10, 1, 2), conn(11, 2, 3), conn(12, 3, 1)]
  assert.deepEqual(sorted(linkedKeys(items, keys('rectangle:2'))), ['connector:10', 'connector:11', 'connector:12', 'rectangle:1', 'rectangle:2', 'rectangle:3'])
})

test('a connector with one free end is included; a box without connectors adds nothing', () => {
  const items = [box(1), box(2), conn(10, 1, null)]
  assert.deepEqual(sorted(connectedKeys(items, keys('rectangle:1'))), ['connector:10', 'rectangle:1'])
  assert.equal(canSelectConnected(items, keys('rectangle:2')), false)
  assert.equal(canSelectConnected(items, keys('rectangle:1')), true)
})

test('locked boxes and connectors are skipped, and a locked box blocks the way through', () => {
  const items = [box(1), box(2, { locked: true }), box(3), conn(10, 1, 2), conn(11, 2, 3), conn(12, 1, 3, { locked: true })]
  assert.deepEqual(sorted(linkedKeys(items, keys('rectangle:1'))), ['connector:10', 'rectangle:1'])
  assert.deepEqual(connectedKeys(items, keys('rectangle:2')), [], 'a locked start gives nothing')
  assert.equal(canSelectConnected([box(1), box(3), conn(12, 1, 3, { locked: true })], keys('rectangle:1')), false)
})

test('labels are not added and a non-box start gives nothing', () => {
  const items = [...chain(), { kind: 'text', id: 1, x: 210, y: 10, width: 20, height: 10, text: 'x', fontSize: 16, color: '#111' }]
  assert.equal(connectedKeys(items, keys('rectangle:2')).some((k) => k.startsWith('text:')), false)
  assert.deepEqual(connectedKeys(items, keys('text:1')), [])
  assert.deepEqual(connectedKeys(items, keys()), [])
})

test('wiring: chip, palette entries, no history entry', () => {
  const entries = input.contextMenuEntries(menu({ canSelectConnected: true }))
  assert.deepEqual(entries.filter((e) => e.action === 'selectConnected').map((e) => [e.chip, e.chipGroup]), [['Connected', 'Select']])
  const both = input.contextMenuRows(input.contextMenuEntries(menu({ canSelectConnected: true, canSelectSimilar: true }))).find((r) => r.chips && r.chips[0].chipGroup === 'Select')
  assert.deepEqual(both.chips.map((c) => c.chip), ['Similar', 'Connected', 'All'], 'Select all is a chip of the same block')
  assert.equal(input.contextMenuEntries(menu()).some((e) => e.action === 'selectConnected'), false)
  assert.match(app, /case 'selectConnected': selectConnectedItems\(false\)/)
  assert.match(app, /id: 'select:connected', label: 'Select connected'/)
  assert.match(app, /id: 'select:linked', label: 'Select all linked'/)
  const start = app.indexOf('const selectConnectedItems')
  const block = app.slice(start, app.indexOf('const sameSizeSelection', start))
  assert.doesNotMatch(block, /saveHistory/)
  assert.match(app, /boundaryTools=\{[^\n]*onSelectConnected/)
  assert.match(app, /aria-label="Select connected"/)
})
