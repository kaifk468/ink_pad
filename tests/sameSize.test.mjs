import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { sameSizeItems, canSameSize, sameSizeBoxes } = await loadModule('sameSize.ts')
const input = await loadModule('desktopInput.ts')
const app = await readAppSource()

const box = (id, x, y, width, height, extra = {}) => ({ kind: 'rectangle', id, x, y, width, height, strokeColor: '#111', strokeWidth: 2, ...extra })
const label = (id, x, y, width = 40, height = 20) => ({ kind: 'text', id, x, y, width, height, text: 'hi', fontSize: 16, color: '#111' })
const conn = (id, rectangleId, offsetX, offsetY, x, y) => ({
  kind: 'connector', id, start: { x, y, pressure: 0.5 }, end: { x: 900, y: 900, pressure: 0.5 }, strokeColor: '#111', strokeWidth: 2,
  relationshipType: 'association', reversed: false, startAttachment: { rectangleId, offsetX, offsetY },
})
const keys = (...k) => new Set(k)
const find = (items, kind, id) => items.find((i) => i.kind === kind && i.id === id)
const menu = (extra = {}) => ({ hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false, ...extra })

test('both: every box takes the largest width and height and keeps its centre', () => {
  const items = [box(1, 0, 0, 100, 40), box(2, 300, 100, 60, 80), box(3, 600, 0, 80, 50, { diamond: true })]
  const result = sameSizeItems(items, keys('rectangle:1', 'rectangle:2', 'rectangle:3'), 'both')
  assert.equal(result.count, 3)
  for (const [id, cx, cy] of [[1, 50, 20], [2, 330, 140], [3, 640, 25]]) {
    const b = find(result.items, 'rectangle', id)
    assert.equal(b.width, 100)
    assert.equal(b.height, 80)
    assert.equal(b.x + b.width / 2, cx)
    assert.equal(b.y + b.height / 2, cy)
  }
  assert.equal(find(result.items, 'rectangle', 3).diamond, true, 'shape kept')
  assert.equal(items[1].width, 60, 'input untouched')
})

test('width only and height only change one dimension', () => {
  const items = [box(1, 0, 0, 100, 40), box(2, 300, 0, 60, 80)]
  const dims = (list, id) => [find(list, 'rectangle', id).width, find(list, 'rectangle', id).height]
  const w = sameSizeItems(items, keys('rectangle:1', 'rectangle:2'), 'width').items
  assert.deepEqual([dims(w, 1), dims(w, 2)], [[100, 40], [100, 80]])
  const h = sameSizeItems(items, keys('rectangle:1', 'rectangle:2'), 'height').items
  assert.deepEqual([dims(h, 1), dims(h, 2)], [[100, 80], [60, 80]])
})

test('locked boxes, class boxes and unselected boxes are left out; fewer than two gives null', () => {
  const items = [box(1, 0, 0, 100, 40), box(2, 200, 0, 60, 80, { locked: true }), box(3, 400, 0, 30, 30, { classBox: { name: 'A', attributes: [], methods: [] } }), box(4, 600, 0, 50, 50)]
  const all = keys('rectangle:1', 'rectangle:2', 'rectangle:3', 'rectangle:4')
  assert.deepEqual(sameSizeBoxes(items, all).map((b) => b.id), [1, 4])
  const result = sameSizeItems(items, all, 'both')
  assert.equal(find(result.items, 'rectangle', 2).width, 60)
  assert.equal(find(result.items, 'rectangle', 3).width, 30)
  assert.equal(find(result.items, 'rectangle', 4).width, 100)
  assert.equal(find(result.items, 'rectangle', 1).height, 50, 'taller than box 1, so box 1 grows (box 2 is locked and ignored)')
  assert.equal(sameSizeItems(items, keys('rectangle:1'), 'both'), null)
  assert.equal(canSameSize(items, keys('rectangle:1', 'rectangle:2')), false)
})

test('boxes that already match give null', () => {
  const items = [box(1, 0, 0, 80, 40), box(2, 200, 0, 80, 40)]
  assert.equal(sameSizeItems(items, keys('rectangle:1', 'rectangle:2'), 'both'), null)
})

test('attached connectors follow the resized box', () => {
  const items = [box(1, 0, 0, 100, 100), box(2, 300, 0, 50, 50), conn(10, 2, 50, 25, 350, 25)]
  const result = sameSizeItems(items, keys('rectangle:1', 'rectangle:2'), 'both')
  const b = find(result.items, 'rectangle', 2)
  const c = find(result.items, 'connector', 10)
  assert.deepEqual([b.x, b.y, b.width, b.height], [275, -25, 100, 100])
  assert.equal(c.start.x, b.x + c.startAttachment.offsetX)
  assert.equal(c.start.y, b.y + c.startAttachment.offsetY)
  assert.deepEqual([c.startAttachment.offsetX, c.startAttachment.offsetY], [100, 50], 'still on the right edge, middle')
})

test('a label inside a box keeps its relative position', () => {
  const items = [box(1, 0, 0, 200, 100), box(2, 400, 0, 100, 50), label(5, 430, 10, 40, 20)]
  const result = sameSizeItems(items, keys('rectangle:1', 'rectangle:2'), 'both')
  const b = find(result.items, 'rectangle', 2)
  const t = find(result.items, 'text', 5)
  assert.deepEqual([b.x, b.y, b.width, b.height], [350, -25, 200, 100])
  assert.equal(t.x + t.width / 2, b.x + 0.5 * b.width)
  assert.equal(t.y + t.height / 2, b.y + 0.4 * b.height)
})

test('the new bounds stay inside the workspace', () => {
  const items = [box(1, 0, 0, 200, 100), box(2, 0, 0, 40, 40)]
  const result = sameSizeItems(items, keys('rectangle:1', 'rectangle:2'), 'both', { x: 0, y: 0, width: 1000, height: 1000 })
  const b = find(result.items, 'rectangle', 2)
  assert.deepEqual([b.x, b.y, b.width, b.height], [0, 0, 200, 100])
})

test('wiring: chips, panel, palette, one undo step', () => {
  const entries = input.contextMenuEntries(menu({ canSameSize: true }))
  assert.deepEqual(entries.filter((e) => e.chipGroup === 'Size').map((e) => [e.action, e.chip]), [['sameWidth', 'Width'], ['sameHeight', 'Height'], ['sameSize', 'Both']])
  assert.equal(input.contextMenuRows(entries).filter((r) => r.chips && r.chips[0].chipGroup === 'Size').length, 1, 'one chip row')
  assert.equal(input.contextMenuEntries(menu()).some((e) => e.chipGroup === 'Size'), false)
  assert.match(app, /case 'sameWidth': sameSizeSelection\('width'\)/)
  assert.match(app, /case 'sameSize': sameSizeSelection\('both'\)/)
  assert.match(app, /id: 'arrange:same-width', label: 'Same width'/)
  assert.match(app, /id: 'arrange:same-size', label: 'Same size'/)
  assert.match(app, /sameSize=\{canSameSize\(/)
  assert.match(app, /aria-label="Same width and height"/)
  const start = app.indexOf('const sameSizeSelection')
  const block = app.slice(start, app.indexOf('Add boundary (right-click chip', start))
  assert.equal((block.match(/saveHistory\(\)/g) ?? []).length, 1)
  assert.match(block, /Made \$\{result\.count\} boxes the same/)
})
