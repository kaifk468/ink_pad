import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { focusSet, fadedKeysOf, pruneFocus, FOCUS_FADE_ALPHA } = await loadModule('focusMode.ts')
const { keyCommand, contextMenuEntries } = await loadModule('desktopInput.ts')
const { DESKTOP_SHORTCUTS } = await loadModule('desktopShortcuts.ts')
const app = await readAppSource()
const renderer = readFileSync(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')

const box = (id, x, y, w = 100, h = 60, extra = {}) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 2, ...extra })
const label = (id, x, y, extra = {}) => ({ kind: 'text', id, x, y, width: 40, height: 20, text: 'hi', fontSize: 16, color: '#111', ...extra })
const conn = (id, from, to, extra = {}) => ({
  kind: 'connector', id, start: { x: 0, y: 0, pressure: 0.5 }, end: { x: 9, y: 9, pressure: 0.5 }, strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false,
  ...(from !== undefined ? { startAttachment: { rectangleId: from, offsetX: 0, offsetY: 0 } } : {}), ...(to !== undefined ? { endAttachment: { rectangleId: to, offsetX: 0, offsetY: 0 } } : {}), ...extra,
})
const sorted = (set) => [...set].sort()

test('a selected box keeps its connectors, the boxes at their other ends and nothing else', () => {
  const items = [box(1, 0, 0), box(2, 300, 0), box(3, 600, 0), box(4, 900, 0), conn(10, 1, 2), conn(11, 2, 3), conn(12, 3, 4)]
  assert.deepEqual(sorted(focusSet(items, new Set(['rectangle:1']))), ['connector:10', 'rectangle:1', 'rectangle:2'])
  assert.deepEqual(sorted(focusSet(items, new Set(['rectangle:2']))), ['connector:10', 'connector:11', 'rectangle:1', 'rectangle:2', 'rectangle:3'])
})

test('a selected connector keeps both end boxes', () => {
  const items = [box(1, 0, 0), box(2, 300, 0), box(3, 600, 0), conn(10, 1, 2), conn(11, 2, 3)]
  assert.deepEqual(sorted(focusSet(items, new Set(['connector:10']))), ['connector:10', 'rectangle:1', 'rectangle:2'])
})

test('labels lying inside a kept box stay, labels in other boxes and loose labels fade', () => {
  const items = [box(1, 0, 0), box(2, 300, 0), box(3, 600, 0), label(20, 10, 10), label(21, 310, 10), label(22, 610, 10), label(23, 450, 300), conn(10, 1, 2)]
  const kept = focusSet(items, new Set(['rectangle:1']))
  assert.ok(kept.has('text:20') && kept.has('text:21'))
  assert.ok(!kept.has('text:22') && !kept.has('text:23'))
})

test('group mates of selected and linked items are kept', () => {
  const items = [box(1, 0, 0), box(2, 300, 0), box(3, 0, 300, 100, 60, { group: 7 }), label(20, 700, 700, { group: 7 }), box(4, 900, 0, 100, 60, { group: 8 }), conn(10, 1, 2), label(21, 1000, 1000, { group: 8 })]
  assert.deepEqual(sorted(focusSet(items, new Set(['rectangle:3']))), ['rectangle:3', 'text:20'])
  const linkedGroup = [box(1, 0, 0), box(2, 300, 0, 100, 60, { group: 5 }), label(20, 700, 700, { group: 5 }), conn(10, 1, 2)]
  assert.ok(focusSet(linkedGroup, new Set(['rectangle:1'])).has('text:20'))
})

test('an empty or stale selection gives an empty set', () => {
  const items = [box(1, 0, 0)]
  assert.equal(focusSet(items, new Set()).size, 0)
  assert.equal(focusSet(items, new Set(['rectangle:99'])).size, 0)
  assert.equal(focusSet([], new Set(['rectangle:1'])).size, 0)
})

test('fadedKeysOf fades everything else except eraser marks, and later items are not faded', () => {
  const eraser = { kind: 'stroke', id: 5, erase: true, points: [], color: '#000', width: 4 }
  const ink = { kind: 'stroke', id: 6, points: [], color: '#000', width: 2 }
  const items = [box(1, 0, 0), box(2, 300, 0), eraser, ink]
  const faded = fadedKeysOf(items, new Set(['rectangle:1']))
  assert.deepEqual(sorted(faded), ['rectangle:2', 'stroke:6'])
  assert.ok(!faded.has('stroke:7'))
})

test('pruneFocus ends the focus when every kept item is gone', () => {
  const items = [box(1, 0, 0), box(2, 300, 0)]
  const kept = new Set(['rectangle:1', 'rectangle:2'])
  assert.equal(pruneFocus(items, kept), kept)
  assert.deepEqual(sorted(pruneFocus([items[1]], kept)), ['rectangle:2'])
  assert.equal(pruneFocus([], kept), null)
  assert.ok(FOCUS_FADE_ALPHA > 0.1 && FOCUS_FADE_ALPHA < 0.3)
})

test('renderer: the fade is only applied behind a null check, so the normal path is unchanged', () => {
  assert.match(renderer, /focusFaded: ReadonlySet<string> \| null = null/)
  assert.match(renderer, /if \(focusFaded !== null && focusFaded\.has\(canvasItemKey\(item\)\)\) \{[\s\S]{0,200}ctx\.globalAlpha \*= FOCUS_FADE_ALPHA/)
})

test('wiring: the page picture is keyed on the focus set and the live stroke is never faded', () => {
  assert.match(app, /cache\.focus === focusRef\.current/)
  assert.match(app, /focus: focusRef\.current \}/)
  assert.match(app, /drawItemToCanvas\(ctx, resolveItemForBoard\(item, palette, strokesRef\.current\), strokeDisplayMode, sketchy, faded\)/)
  assert.match(app, /if \(focusRef\.current !== null\) focusDrawnRef\.current\.clear\(\)/)
  assert.match(app, /fadedKeysOf\(strokesRef\.current, kept\)/)
  assert.match(app, /focusKeptRef\.current !== null && liveStroke === null && focusCheckedItemsRef\.current !== items/)
})

test('wiring: chip, Esc, page switch, palette, menu, panel and shortcut', () => {
  assert.match(app, /\{focusActive && <button className="focus-chip"[^>]*onClick=\{exitFocus\}>Focused · Exit<\/button>\}/)
  assert.match(app, /focusRef\.current !== null && !cancelableGesture && !gestureActive[^\n]*exitFocus\(\)/)
  assert.match(app, /useEffect\(\(\) => \{ exitFocus\(\) \}, \[pageIndex, currentDocId\]\)/)
  assert.match(app, /id: 'view:focus', label: 'Focus on selection'/)
  assert.match(app, /case 'focus': startFocus\(\); break/)
  assert.match(app, /case 'focus': return startFocus\(\)/)
  assert.match(app, /onFocus: \(\) => \{ startFocus\(\) \}/)
  assert.match(panel, /aria-label="Focus on selection"[^>]*onClick=\{props\.boundaryTools\.onFocus\}/)
  const state = { clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }
  const entries = contextMenuEntries({ ...state, hasSelection: true })
  assert.ok(entries.some((e) => e.action === 'focus' && e.chip === 'Focus' && !e.disabled))
  assert.ok(contextMenuEntries({ ...state, hasSelection: false }).find((e) => e.action === 'focus').disabled)
})

test('Shift+F is the focus key and is listed in the shortcut help', () => {
  assert.ok(DESKTOP_SHORTCUTS.find((e) => e.keys === 'Shift+F'))
  const key = { key: 'F', code: 'KeyF', ctrlKey: false, metaKey: false, altKey: false, shiftKey: true, repeat: false }
  assert.deepEqual(keyCommand(key, 'desktop'), { kind: 'focus' })
  assert.equal(keyCommand({ ...key, key: 'f', shiftKey: false }, 'desktop'), null)
  assert.notEqual(keyCommand({ ...key, ctrlKey: true }, 'desktop')?.kind, 'focus')
})
