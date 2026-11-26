import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { moveSelectionToPage, movedToast, movePaletteEntries, moveMenuChips, parseMoveAction, moveRecordUndoable } = await loadModule('moveToPage.ts')
const input = await loadModule('desktopInput.ts')
const app = await readAppSource()

const p = (x, y) => ({ x, y, pressure: 1 })
const box = (id, extra = {}) => ({ kind: 'rectangle', id, x: id * 10, y: 5, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2, ...extra })
const text = (id, extra = {}) => ({ kind: 'text', id, x: 7, y: 9, width: 80, height: 30, text: 't', fontSize: 24, color: '#111', ...extra })
const ink = (id, extra = {}) => ({ kind: 'stroke', id, points: [p(1, 1), p(5, 5)], color: '#111', width: 3, erase: false, ...extra })
const link = (id, a, b, extra = {}) => ({
  kind: 'connector', id, start: p(1, 2), end: p(30, 40), strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false,
  ...(a !== undefined ? { startAttachment: { rectangleId: a, offsetX: 3, offsetY: 4 } } : {}),
  ...(b !== undefined ? { endAttachment: { rectangleId: b, offsetX: 5, offsetY: 6 } } : {}),
  ...extra,
})
const counters = { stroke: 100, rectangle: 100, connector: 100, text: 100 }
const keyset = (...keys) => new Set(keys)

test('moves selected items to the end of the target at the same coordinates; nothing is lost', () => {
  const source = [box(1), text(1), ink(1), box(2)]
  const target = [box(7)]
  const r = moveSelectionToPage(source, target, keyset('rectangle:1', 'text:1', 'stroke:1'), counters)
  assert.deepEqual(r.source.map((i) => `${i.kind}:${i.id}`), ['rectangle:2'])
  assert.deepEqual(r.target.map((i) => `${i.kind}:${i.id}`), ['rectangle:7', 'rectangle:1', 'text:1', 'stroke:1'])
  assert.deepEqual(r.target[1], source[0])
  assert.equal(r.target[1], source[0], 'unchanged items keep their identity and coordinates')
  assert.equal(r.moved, 3)
  assert.equal(r.source.length + r.moved, source.length)
  assert.deepEqual(r.movedKeys, ['rectangle:1', 'text:1', 'stroke:1'])
  assert.equal(source.length, 4, 'input is not changed')
})

test('nothing selected or only locked items: null, and locked items stay', () => {
  const source = [box(1, { locked: true }), box(2)]
  assert.equal(moveSelectionToPage(source, [], keyset(), counters), null)
  assert.equal(moveSelectionToPage(source, [], keyset('rectangle:1'), counters), null)
  const r = moveSelectionToPage(source, [], keyset('rectangle:1', 'rectangle:2'), counters)
  assert.deepEqual(r.source.map((i) => i.id), [1])
  assert.deepEqual(r.target.map((i) => i.id), [2])
  assert.equal(r.lockedSkipped, 1)
  assert.match(movedToast(r.moved, 1, '', r.lockedSkipped), /1 locked stayed/)
})

test('connectors with both ends on moved boxes move along, selected or not', () => {
  const source = [box(1), box(2), link(1, 1, 2)]
  const r = moveSelectionToPage(source, [], keyset('rectangle:1', 'rectangle:2'), counters)
  assert.equal(r.source.length, 0)
  assert.equal(r.target.length, 3)
  const moved = r.target.find((i) => i.kind === 'connector')
  assert.equal(moved.startAttachment.rectangleId, 1)
  assert.equal(moved.endAttachment.rectangleId, 2)
  assert.equal(r.detached, 0)
})

test('a connector left behind is detached from moved boxes and keeps its end points', () => {
  const source = [box(1), box(2), link(1, 1, 2), link(2, 2, undefined, { routing: 'elbow', routedPath: [p(1, 2), p(9, 9), p(30, 40)] })]
  const r = moveSelectionToPage(source, [], keyset('rectangle:1'), counters)
  const [b2, c1, c2] = r.source
  assert.equal(b2.id, 2)
  assert.equal(c1.startAttachment, undefined)
  assert.equal(c1.endAttachment.rectangleId, 2, 'the end on the box that stayed keeps its attachment')
  assert.deepEqual(c1.start, p(1, 2))
  assert.deepEqual(c1.end, p(30, 40))
  assert.equal(c2, source[3], 'a connector that never touched a moved box is the same object')
  assert.equal(r.detached, 1)
  assert.equal(source[2].startAttachment.rectangleId, 1, 'input connector is not mutated')
})

test('a moved connector whose other end is on a staying box is detached there', () => {
  const source = [box(1), box(2), link(1, 1, 2, { routing: 'elbow', routedPath: [p(1, 2), p(9, 9), p(30, 40)] })]
  const r = moveSelectionToPage(source, [], keyset('rectangle:1', 'connector:1'), counters)
  const c = r.target.find((i) => i.kind === 'connector')
  assert.equal(c.startAttachment.rectangleId, 1)
  assert.equal(c.endAttachment, undefined)
  assert.equal(c.routedPath, undefined)
  assert.deepEqual(c.end, p(30, 40))
  assert.equal(r.detached, 1)
})

test('ids already used on the target are renumbered from the counters and attachments follow', () => {
  const source = [box(1), box(2), link(1, 1, 2), text(1), ink(1)]
  const target = [box(1), box(5), link(1, 1, 5), text(1), ink(1)]
  const r = moveSelectionToPage(source, target, keyset('rectangle:1', 'rectangle:2', 'text:1', 'stroke:1'), counters)
  const keys = r.target.map((i) => `${i.kind}:${i.id}`)
  assert.equal(new Set(keys).size, keys.length, 'no key twice on the page')
  const moved = r.target.slice(target.length)
  const rect1 = moved.find((i) => i.kind === 'rectangle' && i.x === 10)
  assert.notEqual(rect1.id, 1)
  const c = moved.find((i) => i.kind === 'connector')
  assert.equal(c.startAttachment.rectangleId, rect1.id)
  assert.equal(c.endAttachment.rectangleId, 2)
  assert.equal(r.target[2].startAttachment.rectangleId, 1, 'target connectors keep pointing at the target boxes')
  assert.ok(r.counters.rectangle > counters.rectangle)
  assert.deepEqual(r.movedKeys, moved.map((i) => `${i.kind}:${i.id}`))
})

test('groups: a moved group keeps its members together and gets a number the target does not use', () => {
  const source = [box(1, { group: 1 }), text(1, { group: 1 }), box(2, { group: 2 })]
  const target = [box(7, { group: 1 }), box(8, { group: 2 })]
  const r = moveSelectionToPage(source, target, keyset('rectangle:1', 'text:1'), counters)
  const [b, t] = r.target.slice(2)
  assert.equal(b.group, t.group)
  assert.ok(![1, 2].includes(b.group))
  assert.equal(r.target[0].group, 1)
  const free = moveSelectionToPage(source, [box(7)], keyset('rectangle:1', 'text:1'), counters)
  assert.equal(free.target[1].group, 1, 'unneeded renumbering is skipped')
})

test('toast, palette rows, menu chips and action parsing', () => {
  assert.equal(movedToast(5, 1), 'Moved 5 items to page 2')
  assert.equal(movedToast(1, 1, 'API'), 'Moved 1 item to page 2 (API)')
  const rows = movePaletteEntries(['', 'API', ''], 0, true)
  assert.deepEqual(rows.map((r) => r.label), ['Move selection to page: 2 — API', 'Move selection to page: 3', 'Move selection to new page'])
  assert.equal(movePaletteEntries(['', ''], 1, false).length, 1)
  const chips = moveMenuChips(['', 'API'], 0, true)
  assert.deepEqual(chips.map((c) => c.action), ['movePage:1', 'movePage:new'])
  assert.equal(moveMenuChips(Array.from({ length: 30 }, () => ''), 0, true).length, 11, 'at most ten page chips plus New')
  assert.equal(parseMoveAction('movePage:3'), 3)
  assert.equal(parseMoveAction('movePage:new'), 'new')
  assert.equal(parseMoveAction('movePage:x'), null)
  assert.equal(parseMoveAction('copy'), null)
})

test('undo record is only valid while both pages are exactly as the move left them', () => {
  const a = []
  const b = []
  const record = { sourceIndex: 0, targetIndex: 1, newPage: false, pageCount: 2, afterSource: a, afterTarget: b, afterSourceLength: 0, afterTargetLength: 0 }
  assert.equal(moveRecordUndoable(record, [a, b]), true)
  assert.equal(moveRecordUndoable(record, [a, b.slice()]), false)
  assert.equal(moveRecordUndoable(record, [a.slice(), b]), false)
  assert.equal(moveRecordUndoable(record, [a, b, []]), false)
})

test('undo record is refused when a label was pushed into the same array after the move', () => {
  const a = []
  const b = [box(1)]
  const record = { sourceIndex: 0, targetIndex: 1, newPage: false, pageCount: 2, afterSource: a, afterTarget: b, afterSourceLength: 0, afterTargetLength: 1 }
  assert.equal(moveRecordUndoable(record, [a, b]), true)
  b.push(text(2))
  assert.equal(moveRecordUndoable(record, [a, b]), false)
})

test('App wiring: bar Undo re-reads the record after the text commit; labels in a moved box go along', () => {
  assert.match(app, /if \(textEditorRef\.current\) commitTextEditor\(\)\n\s*const record = moveUndoRef\.current[^\n]*\n\s*if \(!record\) return/)
  assert.match(app, /afterSourceLength: result\.source\.length, afterTargetLength: result\.target\.length/)
  assert.match(app, /for \(const key of labelsInside\(strokesRef\.current, keys\)\) keys\.add\(key\)[^\n]*\n\s*const from = pageIndexRef\.current/)
})

test('the right-click menu offers Move to page chips only with a selection', () => {
  const state = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false, movePages: moveMenuChips(['', ''], 0, true) }
  const withSel = input.contextMenuEntries(state).filter((e) => e.action.startsWith('movePage:'))
  assert.deepEqual(withSel.map((e) => e.chip), ['2', 'New'])
  assert.equal(withSel[0].chipGroup, 'Move to page')
  assert.equal(input.contextMenuEntries({ ...state, hasSelection: false }).some((e) => e.action.startsWith('movePage:')), false)
})

test('App wiring: one undo step per page, both pages autosaved, bar Undo restores both, palette and menu', () => {
  assert.match(app, /const moveSelectionToPageNow = \(target: MoveTarget\)/)
  assert.match(app, /historyRef\.current\.record\(sourceBefore\)\s*\n\s*targetHistory\.record\(targetBefore\)/)
  assert.match(app, /showPageSlot\(to\)[\s\S]{0,200}updateSelectedItems\(result\.movedKeys\)[\s\S]{0,100}scheduleAutosave\(\)/)
  assert.match(app, /moveRecordUndoable\(record, live\)/)
  assert.match(app, /showTapToast\('A page changed since the move: use Ctrl\+Z on each page instead'\)/)
  assert.match(app, /<MoveUndoBar [^>]*onUndo=\{undoMoveToPage\}/)
  assert.match(app, /movePaletteEntries\(/)
  assert.match(app, /movePages: moveMenuChips\(/)
  assert.match(app, /parseMoveAction\(action\)/)
  assert.match(app, /if \(moveUndoRef\.current\) dismissMoveUndo\(\)/)
})
