import assert from 'node:assert/strict'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const g = await loadModule('grouping.ts')
const clip = await loadModule('clipboard.ts')
const dup = await loadModule('dragDuplicate.ts')
const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const doc = await loadModule('documentFormat.ts')

const pt = (x, y) => ({ x, y, pressure: 0.5 })
const rect = (id, x = 0, extra = {}) => ({ kind: 'rectangle', id, x, y: 0, width: 50, height: 40, strokeColor: '#111', strokeWidth: 2, ...extra })
const text = (id, x = 0, extra = {}) => ({ kind: 'text', id, x, y: 60, width: 40, height: 20, text: 'a', fontSize: 16, color: '#111', ...extra })
const stroke = (id, extra = {}) => ({ kind: 'stroke', id, points: [pt(0, 0), pt(5, 5)], color: '#111', width: 2, erase: false, ...extra })
const keys = (...k) => new Set(k)
const WS = { x: 0, y: 0, width: 5000, height: 5000 }
const counters = { stroke: 100, rectangle: 100, connector: 100, text: 100 }

test('groupItems gives the selected items one new group number', () => {
  const items = [rect(1), text(1), rect(2, 200, { group: 3 }), text(2, 200, { group: 3 }), stroke(1)]
  const out = g.groupItems(items, keys('rectangle:1', 'text:1'))
  assert.equal(out[0].group, 4)
  assert.equal(out[1].group, 4)
  assert.equal(out[2].group, 3)
  assert.equal(out[4].group, undefined)
  assert.equal(items[0].group, undefined, 'input is not mutated')
})

test('grouping a selection that contains groups merges them into one new group', () => {
  const items = [rect(1, 0, { group: 1 }), text(1, 0, { group: 1 }), rect(2, 200, { group: 2 }), text(2, 200, { group: 2 }), rect(3, 400)]
  const out = g.groupItems(items, keys('rectangle:1', 'rectangle:2', 'rectangle:3'))
  assert.deepEqual(out.map((item) => item.group), [3, 3, 3, 3, 3])
})

test('groupItems needs two selectable items and skips locked, eraser and opaque items', () => {
  const items = [rect(1), text(1, 0, { locked: true }), stroke(2, { erase: true }), { kind: 'opaque', id: 9, box: null, raw: {} }]
  assert.equal(g.groupItems(items, keys('rectangle:1')), items)
  assert.equal(g.groupItems(items, keys('rectangle:1', 'text:1')), items)
  assert.equal(g.canGroup(items, keys('rectangle:1', 'text:1')), false)
  assert.equal(g.canGroup([rect(1), rect(2)], keys('rectangle:1', 'rectangle:2')), true)
})

test('ungroupItems removes the group from the selection and its whole group', () => {
  const items = [rect(1, 0, { group: 2 }), text(1, 0, { group: 2 }), rect(2, 0, { group: 5 }), rect(3)]
  const out = g.ungroupItems(items, keys('rectangle:1'))
  assert.equal(out[0].group, undefined)
  assert.equal(out[1].group, undefined)
  assert.equal(out[2].group, 5)
  assert.equal('group' in out[0], false)
  assert.equal(g.ungroupItems(items, keys('rectangle:3')), items, 'nothing grouped selected: same array')
  assert.equal(g.canUngroup(items, keys('rectangle:1')), true)
  assert.equal(g.canUngroup(items, keys('rectangle:3')), false)
})

test('expandToGroups adds every member of a touched group and is the identity without groups', () => {
  const items = [rect(1, 0, { group: 1 }), text(1, 0, { group: 1 }), stroke(1, { group: 1 }), rect(2, 0, { group: 2 }), rect(3), text(2, 0, { group: 1, locked: true })]
  assert.deepEqual([...g.expandToGroups(items, ['text:1'])].sort(), ['rectangle:1', 'stroke:1', 'text:1'])
  assert.deepEqual([...g.expandToGroups(items, ['rectangle:3'])], ['rectangle:3'])
  const plain = [rect(1), rect(2)]
  assert.deepEqual([...g.expandToGroups(plain, ['rectangle:1'])], ['rectangle:1'])
})

test('toggleGroupKeys adds or removes the whole group', () => {
  const items = [rect(1, 0, { group: 1 }), text(1, 0, { group: 1 }), rect(2)]
  assert.deepEqual([...g.toggleGroupKeys(items, keys('rectangle:2'), 'rectangle:1')].sort(), ['rectangle:1', 'rectangle:2', 'text:1'])
  assert.deepEqual([...g.toggleGroupKeys(items, keys('rectangle:1', 'text:1', 'rectangle:2'), 'text:1')], ['rectangle:2'])
})

test('remapGroupsForPaste gives each pasted group a fresh number after the page groups', () => {
  const existing = [rect(1, 0, { group: 7 })]
  const pasted = [rect(5, 0, { group: 7 }), text(5, 0, { group: 7 }), rect(6, 0, { group: 2 }), text(6, 0, { group: 2 }), rect(7)]
  const out = g.remapGroupsForPaste(pasted, existing)
  assert.deepEqual(out.map((item) => item.group), [8, 8, 9, 9, undefined])
  assert.equal(g.remapGroupsForPaste([rect(1), rect(2)], existing).length, 2)
  // A group with a single pasted member loses its group.
  assert.equal('group' in g.remapGroupsForPaste([rect(5, 0, { group: 7 })], existing)[0], false)
})

test('pasteItems and duplicateForDrag copies are new, independent groups', () => {
  const items = [rect(1, 0, { group: 1 }), text(1, 0, { group: 1 })]
  const all = keys('rectangle:1', 'text:1')
  const pasted = clip.pasteItems(clip.copyItems(items, all), counters, 24, WS, null, items)
  assert.deepEqual(pasted.items.map((item) => item.group), [2, 2])
  const noExisting = clip.pasteItems(clip.copyItems(items, all), counters, 24, WS, null)
  assert.deepEqual(noExisting.items.map((item) => item.group), [1, 1])
  const dragged = dup.duplicateForDrag(items, all, [], counters, WS)
  assert.deepEqual(dragged.items.map((item) => item.group), [1, 1, 2, 2])
})

test('pasting items without groups adds no group field', () => {
  const items = [rect(1), text(1)]
  const pasted = clip.pasteItems(clip.copyItems(items, keys('rectangle:1', 'text:1')), counters, 24, WS, null, items)
  assert.equal(pasted.items.some((item) => 'group' in item), false)
})

test('Ctrl+G groups, Ctrl+Shift+G ungroups (physical key), Cmd works, repeats and plain G do nothing', () => {
  const base = { key: 'g', code: 'KeyG', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false }
  assert.deepEqual(input.keyCommand(base, 'desktop'), { kind: 'group' })
  assert.deepEqual(input.keyCommand({ ...base, ctrlKey: false, metaKey: true }, 'desktop'), { kind: 'group' })
  assert.deepEqual(input.keyCommand({ ...base, key: 'G', shiftKey: true }, 'desktop'), { kind: 'ungroup' })
  assert.equal(input.keyCommand({ ...base, repeat: true }, 'desktop'), null)
  assert.equal(input.keyCommand(base, 'tablet'), null)
  assert.equal(input.keyCommand({ ...base, ctrlKey: false }, 'desktop'), null)
})

test('the right-click menu offers Group / Ungroup only when they apply', () => {
  const state = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }
  const actions = (extra) => input.contextMenuEntries({ ...state, ...extra }).map((entry) => entry.action)
  assert.equal(actions({}).includes('group'), false)
  assert.equal(actions({}).includes('ungroup'), false)
  assert.equal(actions({ canGroup: true }).includes('group'), true)
  assert.equal(actions({ canUngroup: true }).includes('ungroup'), true)
})

test('the shortcut help lists Group and Ungroup under Arrange', () => {
  const rows = shortcuts.DESKTOP_SHORTCUTS.filter((row) => row.group === 'Arrange' && /group/i.test(row.label))
  assert.deepEqual(rows.map((row) => row.keys), ['Ctrl+G', 'Ctrl+Shift+G'])
})

test('saved format: old file unchanged, group round-trips, bad values are dropped', () => {
  const body = (items) => JSON.stringify({ format: 'inkpad-document', version: 1, title: 'T', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', page: { template: 'dotted', background: 'warm', spacing: 'wide', sheetHeight: 2500 }, items })
  const base = [rect(1), text(1), stroke(1)]
  const plain = doc.parseDocument(body(base))
  assert.equal(plain.ok, true)
  assert.equal(JSON.stringify(plain.document).includes('"group"'), false)
  const grouped = doc.parseDocument(body([rect(1, 0, { group: 3 }), text(1, 0, { group: 3 }), stroke(1, { group: 3 })]))
  assert.equal(grouped.ok, true)
  const again = doc.parseDocument(doc.stringifyDocument(grouped.document))
  assert.deepEqual(JSON.parse(doc.stringifyDocument(again.document)), JSON.parse(doc.stringifyDocument(grouped.document)))
  assert.equal(JSON.stringify(grouped.document).match(/"group":3/g).length, 3)
  const bad = doc.parseDocument(body([rect(1, 0, { group: 0 }), rect(2, 0, { group: -1 }), rect(3, 0, { group: 1.5 }), rect(4, 0, { group: '2' }), rect(5, 0, { group: 2 ** 60 })]))
  assert.equal(bad.ok, true)
  assert.equal(JSON.stringify(bad.document).includes('"group"'), false)
})

test('App wires group selection through the selection paths', async () => {
  const source = await readAppSource()
  assert.match(source, /case 'group': return groupSelection\(\)/)
  assert.match(source, /case 'ungroup': return ungroupSelection\(\)/)
  assert.match(source, /showToast\('Grouped'\)/)
  assert.match(source, /showToast\('Ungrouped'\)/)
  assert.match(source, /expandSelectionState\(marqueeSelection\(/)
  assert.match(source, /expandToGroups\(strokesRef\.current, selectItemsByLasso\(/)
  assert.match(source, /toggleGroupKeys\(strokesRef\.current/)
  assert.match(source, /const groupState = expandSelectionState\(/)
})
