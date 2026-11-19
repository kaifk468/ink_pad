import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const input = await loadModule('desktopInput.ts')
const model = await loadModule('canvasModel.ts')
const lasso = await loadModule('lassoSelection.ts')
const doc = await loadModule('documentFormat.ts')
const clip = await loadModule('clipboard.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const { compactAfterErase } = await loadModule('app/eraserCompaction.ts')
const app = await readAppSource()
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
const p = (x, y) => ({ x, y, pressure: 1 })
const box = (id, x, y, extra = {}) => ({ kind: 'rectangle', id, x, y, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2, ...extra })
const label = (id, x, y, extra = {}) => ({ kind: 'text', id, x, y, width: 80, height: 30, text: 'hi', fontSize: 24, color: '#111', ...extra })
const code = (id, x, y, extra = {}) => ({ kind: 'code', id, x, y, width: 80, height: 40, text: 'a', language: 'typescript', ...extra })
const line = (id, x0, y0, x1, y1, extra = {}) => ({ kind: 'stroke', id, points: [p(x0, y0), p(x1, y1)], color: '#000', width: 3, erase: false, ...extra })
const link = (id, x0, y0, x1, y1, extra = {}) => ({ kind: 'connector', id, start: p(x0, y0), end: p(x1, y1), strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false, ...extra })
const state = (extra = {}) => ({ hasSelection: false, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false, ...extra })
const menu = (extra) => input.contextMenuEntries(state(extra))

test('menu entries: sections, shortcut hints, disabled instead of hidden', () => {
  const entries = menu({ hasSelection: true, clipboardHasItems: true, canEditText: true })
  const hints = Object.fromEntries(entries.map((e) => [e.action, e.hint]))
  assert.deepEqual(hints, { cut: 'Ctrl+X', copy: 'Ctrl+C', paste: 'Ctrl+V', duplicate: 'Ctrl+D', delete: 'Del', editText: 'Enter', bringToFront: 'Ctrl+Shift+]', sendToBack: 'Ctrl+Shift+[', zoomSelection: 'Shift+2', lock: 'Ctrl+Shift+L', copyPng: 'Shift+Alt+C', exportPng: '', exportSvg: '', selectAll: 'Ctrl+A' })
  assert.deepEqual([...new Set(entries.map((e) => e.section))], ['clipboard', 'text', 'arrange', 'view', 'lock', 'export', 'select'])
  for (const e of entries) assert.equal(e.disabled, false, e.action)
  const empty = menu({ pageHasItems: false })
  assert.ok(empty.find((e) => e.action === 'paste').disabled)
  assert.ok(empty.find((e) => e.action === 'zoomSelection').disabled)
  assert.ok(!empty.some((e) => e.action === 'editText' || e.action === 'lock'))
})

test('menu entries: Edit text only for one label; Lock, Unlock, Unlock all each in their own case', () => {
  const has = (entries, action) => entries.some((e) => e.action === action)
  assert.ok(!has(menu({}), 'editText'))
  assert.ok(has(menu({ canEditText: true, hasSelection: true }), 'editText'))
  assert.ok(has(menu({ hasSelection: true }), 'lock'))
  const onLocked = menu({ lockedTarget: true, anyLocked: true })
  assert.ok(has(onLocked, 'unlock') && !has(onLocked, 'unlockAll') && !has(onLocked, 'lock'))
  const empty = menu({ anyLocked: true })
  assert.ok(has(empty, 'unlockAll') && !has(empty, 'unlock'))
  assert.ok(!has(menu({}), 'unlockAll'))
  assert.ok(!has(menu({ hasSelection: true, anyLocked: true }), 'unlockAll'))
})

test('menu rows put a separator between sections only, and the height follows the rows', () => {
  const entries = menu({ hasSelection: true })
  const rows = input.contextMenuRows(entries)
  const separators = rows.filter((r) => r.separator).length
  assert.equal(separators, new Set(entries.map((e) => e.section)).size - 1)
  assert.equal(rows.length, entries.length + separators)
  assert.ok(rows[0].entry && rows[rows.length - 1].entry)
  assert.equal(input.contextMenuHeight(entries), 14 + entries.length * 34 + separators * 9 + (rows.length - 1) * 2)
  assert.ok(input.contextMenuHeight(menu({ hasSelection: true })) > input.contextMenuHeight(menu({})))
  assert.equal(input.CONTEXT_MENU_WIDTH, 248)
})

test('keys: Ctrl+Shift+L locks, Shift+Alt+C copies as PNG, Ctrl+Shift+C does nothing', () => {
  assert.deepEqual(input.keyCommand(key('L', { code: 'KeyL', ctrlKey: true, shiftKey: true }), 'desktop'), { kind: 'lock' })
  assert.deepEqual(input.keyCommand(key('l', { code: 'KeyL', metaKey: true, shiftKey: true }), 'desktop'), { kind: 'lock' })
  assert.equal(input.keyCommand(key('L', { code: 'KeyL', ctrlKey: true, shiftKey: true, repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('L', { code: 'KeyL', ctrlKey: true, shiftKey: true }), 'tablet'), null)
  assert.deepEqual(input.keyCommand(key('l'), 'desktop'), { kind: 'tool', tool: 'lasso' })
  assert.deepEqual(input.keyCommand(key('C', { code: 'KeyC', altKey: true, shiftKey: true }), 'desktop'), { kind: 'copyPng' })
  assert.equal(input.keyCommand(key('C', { code: 'KeyC', ctrlKey: true, shiftKey: true }), 'desktop'), null)
  for (const keys of ['Shift+Alt+C', 'Ctrl+Shift+L']) assert.ok(shortcuts.DESKTOP_SHORTCUTS.some((row) => row.keys === keys && row.input), keys)
  assert.ok(!shortcuts.DESKTOP_SHORTCUTS.some((row) => row.keys === 'Ctrl+Shift+C'))
})

test('locked items are skipped by click, hover, edit, shift-click and marquee but found by the menu hit test', () => {
  const items = [box(1, 0, 0, { locked: true }), label(1, 200, 0, { locked: true }), code(2, 400, 0, { locked: true }), line(1, 0, 300, 100, 300, { locked: true }), link(1, 0, 500, 100, 500, { locked: true })]
  for (const [x, y] of [[50, 30], [240, 15], [440, 20], [50, 500]]) {
    assert.equal(input.hitTarget(items, p(x, y), 1), null, `${x},${y}`)
    assert.ok(input.hitTarget(items, p(x, y), 1, false, true), `menu ${x},${y}`)
    assert.equal(input.clickSelectTarget(items, p(x, y), 1, 'pen', false), null)
    assert.equal(input.hoverTarget(items, p(x, y), 1), null)
    assert.equal(input.doubleClickTarget(items, p(x, y), 1), null)
    assert.equal(input.shiftClickTarget(items, p(x, y), 1), null)
  }
  assert.equal(input.shiftClickTarget(items, p(50, 300), 1), null)
  assert.deepEqual(input.marqueeKeys(items, { x: -50, y: -50, width: 900, height: 700 }), [])
  // the same items unlocked behave as before
  const free = items.map(({ locked, ...rest }) => rest)
  assert.ok(input.hitTarget(free, p(50, 30), 1))
  assert.equal(input.marqueeKeys(free, { x: -50, y: -50, width: 900, height: 700 }).length, 5)
  // a locked box does not hide an unlocked one beneath it
  assert.equal(input.hitTarget([box(2, 0, 0), box(3, 0, 0, { locked: true })], p(50, 30), 1).id, 2)
})

test('lasso and select all skip locked items', () => {
  const items = [box(1, 10, 10, { locked: true }), box(2, 10, 100), line(1, 20, 20, 60, 60, { locked: true }), link(1, 20, 30, 60, 30, { locked: true }), label(1, 20, 60, { locked: true })]
  const big = [p(-10, -10), p(300, -10), p(300, 300), p(-10, 300)]
  assert.deepEqual(lasso.selectItemsByLasso(items, big), ['rectangle:2'])
  assert.deepEqual(model.allCanvasItemKeys(items), ['rectangle:2'])
  assert.equal(lasso.selectItemsByLasso(items.map(({ locked, ...r }) => r), big).length, 5)
})

test('the stroke eraser leaves locked ink alone and locked items are drawn after eraser strokes', () => {
  const eraser = line(9, 90, 100, 210, 100, { erase: true, width: 40 })
  const ink = line(1, 100, 100, 200, 100)
  assert.deepEqual(compactAfterErase([ink, eraser], () => 50), [])
  const locked = { ...ink, locked: true }
  const result = compactAfterErase([locked, eraser], () => 50)
  assert.equal(result[0], locked)
  const rendered = model.canvasItemsForRendering([locked, box(1, 0, 0, { locked: true }), eraser])
  assert.deepEqual(rendered.slice(-2), [locked, box(1, 0, 0, { locked: true })])
  assert.equal(model.canvasItemsForRendering([ink, eraser]).length, 2, 'nothing extra when nothing is locked')
  assert.ok(model.appendedItemsForRendering([locked, eraser]).includes(locked))
  assert.equal(model.appendedItemsForRendering([ink, eraser]).length, 1)
})

test('whole-object eraser, rectangle/text/code/connector hit helpers skip locked items (wiring)', () => {
  assert.match(app, /const hitTestObject = [^]*?if \(isItemLocked\(item\)\) continue/)
  assert.match(app, /item\.kind !== 'rectangle' \|\| item\.locked\) continue/)
  assert.match(app, /item\.kind === 'connector' && !item\.locked && itemHitTest/)
  assert.match(app, /item\.kind === 'code' && !item\.locked && itemHitTest/)
  assert.match(app, /item\.kind === 'text' && !item\.locked && itemHitTest/)
})

test('setItemsLocked locks, unlocks, skips eraser marks and returns the same array when nothing changes', () => {
  const items = [box(1, 0, 0), line(2, 0, 0, 1, 1, { erase: true }), label(1, 0, 0, { locked: true })]
  const locked = model.setItemsLocked(items, new Set(['rectangle:1', 'stroke:2']), true)
  assert.equal(locked[0].locked, true)
  assert.equal(locked[1], items[1])
  assert.equal(model.setItemsLocked(locked, new Set(['rectangle:1']), true), locked)
  const unlockedAll = model.setItemsLocked(locked, null, false)
  assert.ok(unlockedAll.every((item) => !('locked' in item)))
  assert.equal(model.setItemsLocked(unlockedAll, null, false), unlockedAll)
  assert.equal(model.isItemLocked(locked[0]), true)
  assert.equal(model.isItemLocked({ kind: 'opaque', id: 1, box: null, raw: { locked: true } }), false)
})

test('format: locked is kept only as true, never on eraser marks, ink inside boxes or unknown items; round trip is exact', () => {
  const items = [
    { ...box(1, 0, 0), locked: true },
    { ...box(2, 0, 0), locked: false },
    { ...box(3, 0, 0), locked: 'yes' },
    { ...label(1, 0, 0), locked: true },
    { ...code(2, 0, 0), locked: true },
    { ...link(1, 0, 0, 5, 5), locked: true },
    { ...line(1, 0, 0, 5, 5), locked: true },
    { ...line(2, 0, 0, 5, 5, { erase: true }), locked: true },
    { ...box(4, 0, 0, { hldShape: 'database', inkBox: { top: 20, mid: 40, ink: [{ ...line(3, 1, 1, 4, 4), locked: true }] } }), locked: true },
    { kind: 'future', id: 7, locked: true },
  ]
  const text = JSON.stringify({ format: 'inkpad-document', version: 1, title: 't', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', page: { template: 'blank', background: 'white' }, items })
  const parsed = doc.parseDocument(text)
  assert.equal(parsed.ok, true)
  const out = parsed.document.items
  assert.deepEqual(out.slice(0, 9).map((item) => item.locked), [true, undefined, undefined, true, true, true, true, undefined, true])
  assert.equal('locked' in out[1], false)
  assert.equal(out[8].inkBox.ink[0].locked, undefined)
  assert.equal(out[9].raw.locked, true)
  const again = doc.parseDocument(doc.stringifyDocument(parsed.document))
  assert.deepEqual(again.document.items, out)
  // a file without any lock saves without the key
  assert.ok(!doc.stringifyDocument(doc.parseDocument(text.replaceAll('"locked"', '"unlocked"')).document).includes('"locked"'))
})

test('paste and duplicate drop the lock; the original keeps it', () => {
  const clipItems = [box(1, 0, 0, { locked: true }), label(1, 0, 0, { locked: true }), line(1, 0, 0, 5, 5, { locked: true }), link(1, 0, 0, 5, 5, { locked: true })]
  const result = clip.pasteItems(clipItems, { stroke: 10, rectangle: 10, connector: 10, text: 10 }, 24, { x: 0, y: 0, width: 5000, height: 5000 })
  assert.equal(result.items.length, 4)
  for (const item of result.items) assert.equal('locked' in item, false, item.kind)
  assert.ok(clipItems.every((item) => item.locked === true))
})

test('wiring: menu, lock actions, key dispatch, keyboard and styles', () => {
  assert.match(app, /case 'lock': return lockSelection\(\)/)
  assert.match(app, /showToast\('Locked'\)/)
  assert.match(app, /showToast\('Unlocked'\)/)
  assert.match(app, /case 'unlock': if \(lockedKey\) unlockItems\(new Set\(\[lockedKey\]\)\)/)
  assert.match(app, /case 'unlockAll': unlockItems\(null\)/)
  assert.match(app, /case 'zoomSelection': zoomToSelection\(\)/)
  assert.match(app, /case 'editText':/)
  assert.match(app, /hitTarget\(routed, point, viewportRef\.current\.scale, false, true\)/)
  assert.match(app, /clampMenuPosition\(contextMenu\.x, contextMenu\.y, CONTEXT_MENU_WIDTH, contextMenuHeight\(entries\)/)
  assert.match(app, /contextMenuRows\(entries\)\.map/)
  assert.match(app, /onKeyDown=\{onContextMenuKeyDown\}/)
  assert.match(app, /ArrowDown', 'ArrowUp', 'Home', 'End'/)
  assert.match(app, /updateSelectedItems\(\[\]\)\n\s*setSelectedRectangle\(null\)\n\s*renderAll\(\)\n\s*showToast\('Locked'\)/)
})
