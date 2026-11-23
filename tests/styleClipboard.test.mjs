import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const sc = await loadModule('styleClipboard.ts')
const model = await loadModule('canvasModel.ts')
const input = await loadModule('desktopInput.ts')
const app = await readAppSource()

const p = (x, y) => ({ x, y, pressure: 0.5 })
const box = (id, extra = {}) => ({ kind: 'rectangle', id, x: 0, y: 0, width: 100, height: 60, strokeColor: '#111111', strokeWidth: 2, ...extra })
const arrow = (id, extra = {}) => ({ kind: 'stroke', id, color: '#222222', width: 3, shape: 'arrow', points: [p(0, 0), p(50, 50)], ...extra })
const pen = (id, extra = {}) => ({ kind: 'stroke', id, color: '#333333', width: 4, points: [p(0, 0), p(5, 5)], ...extra })
const label = (id, extra = {}) => ({ kind: 'text', id, x: 0, y: 0, width: 40, height: 20, text: 'hi', fontSize: 16, color: '#000000', ...extra })
const conn = (id, extra = {}) => ({ kind: 'connector', id, start: p(0, 0), end: p(100, 0), strokeColor: '#444444', strokeWidth: 2, relationshipType: 'association', ...extra })
const keys = (...items) => new Set(items.map((i) => model.canvasItemKey(i)))
const key = (k, extra = {}) => ({ key: k, ctrlKey: true, metaKey: false, altKey: true, shiftKey: false, repeat: false, ...extra })

test('captureStyle: shape, arrow, connector, text; null for code, eraser, opaque', () => {
  assert.deepEqual(sc.captureStyle(box(1, { fillColor: '#b2f2bb', dash: 'dashed' })), { color: '#111111', width: 2, dash: 'dashed', fill: '#b2f2bb' })
  assert.deepEqual(sc.captureStyle(box(1)), { color: '#111111', width: 2, dash: 'solid', fill: null })
  assert.deepEqual(sc.captureStyle(arrow(2, { arrowheads: 'both' })), { color: '#222222', width: 3, dash: 'solid', arrowheads: 'both' })
  assert.deepEqual(sc.captureStyle(pen(3)), { color: '#333333', width: 4 })
  assert.deepEqual(sc.captureStyle(conn(4, { dash: 'dotted' })), { color: '#444444', width: 2, dash: 'dotted' })
  assert.deepEqual(sc.captureStyle(label(5, { fontFamily: 'excalifont' })), { color: '#000000', fontSize: 16, fontFamily: 'excalifont' })
  assert.equal(sc.captureStyle({ kind: 'code', id: 1, x: 0, y: 0, width: 10, height: 10, text: '', language: 'ts' }), null)
  assert.equal(sc.captureStyle(pen(6, { erase: true })), null)
  assert.equal(sc.captureStyle({ kind: 'opaque', raw: {} }), null)
})

test('applyStyle: every selected item takes what it can; others keep their reference', () => {
  const style = sc.captureStyle(box(1, { strokeColor: '#ff0000', strokeWidth: 5, fillColor: '#ffec99', dash: 'dotted' }))
  const b = box(10), a = arrow(11), t = label(12), c = conn(13), other = box(14)
  const items = [b, a, t, c, other]
  const out = sc.applyStyle(items, keys(b, a, t, c), style)
  assert.notEqual(out, items)
  assert.equal(out[0].strokeColor, '#ff0000'); assert.equal(out[0].strokeWidth, 5); assert.equal(out[0].fillColor, '#ffec99'); assert.equal(out[0].dash, 'dotted')
  assert.equal(out[1].color, '#ff0000'); assert.equal(out[1].width, 5); assert.equal(out[1].dash, 'dotted')
  assert.equal(out[2].color, '#ff0000'); assert.equal(out[2].fontSize, 16)
  assert.equal(out[3].strokeColor, '#ff0000'); assert.equal(out[3].dash, 'dotted'); assert.equal(out[3].relationshipType, 'association')
  assert.equal(out[4], other)
})

test('applyStyle: arrowheads only on arrow/line strokes; solid clears a dash; no fill clears a fill', () => {
  const style = { arrowheads: 'both', dash: 'solid', fill: null }
  const a = arrow(1, { dash: 'dashed' }), b = box(2, { fillColor: '#ffec99', dash: 'dashed' }), pn = pen(3)
  const out = sc.applyStyle([a, b, pn], keys(a, b, pn), style)
  assert.equal(model.strokeArrowheads(out[0]), 'both'); assert.equal(out[0].dash, undefined)
  assert.equal(out[1].fillColor, undefined); assert.equal(out[1].dash, undefined)
  assert.equal(out[2], pn)
})

test('applyStyle: text takes size and font; ink box writing recolours', () => {
  const t = label(1, { fontFamily: 'sans' })
  const out = sc.applyStyle([t], keys(t), { color: '#00ff00', fontSize: 30, fontFamily: 'excalifont' })
  assert.equal(out[0].fontSize, 30); assert.equal(out[0].fontFamily, 'excalifont'); assert.equal(out[0].color, '#00ff00'); assert.equal(out[0].text, 'hi')
  const ink = box(2, { hldShape: 'database', inkBox: { top: 10, mid: 30, ink: [pen(9, { color: '#000000' })] } })
  const r = sc.applyStyle([ink], keys(ink), { color: '#ff0000' })
  assert.equal(r[0].inkBox.ink[0].color, '#ff0000')
})

test('applyStyle: locked, eraser, code and opaque items are untouched; same array when nothing changes', () => {
  const locked = box(1, { locked: true }), eraser = pen(2, { erase: true }), code = { kind: 'code', id: 3, x: 0, y: 0, width: 10, height: 10, text: '', language: 'ts' }
  const items = [locked, eraser, code]
  assert.equal(sc.applyStyle(items, keys(locked, eraser, code), { color: '#ff0000', width: 9 }), items)
  const same = box(4, { strokeColor: '#ff0000' })
  const arr = [same]
  assert.equal(sc.applyStyle(arr, keys(same), { color: '#ff0000' }), arr)
  assert.equal(sc.applyStyle(arr, new Set(), { color: '#00ff00' }), arr)
})

test('keyCommand: Ctrl/Cmd+Alt+C / V by physical key; wrong code, Shift and repeat do not match', () => {
  assert.deepEqual(input.keyCommand(key('ç', { code: 'KeyC' }), 'desktop'), { kind: 'copyStyle' })
  assert.deepEqual(input.keyCommand(key('√', { code: 'KeyV', ctrlKey: false, metaKey: true }), 'desktop'), { kind: 'pasteStyle' })
  assert.equal(input.keyCommand(key('c', { code: 'KeyX' }), 'desktop'), null)
  assert.equal(input.keyCommand(key('c'), 'desktop'), null)
  assert.equal(input.keyCommand(key('c', { code: 'KeyC', shiftKey: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('c', { code: 'KeyC', repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('c', { code: 'KeyC' }), 'tablet'), null)
  assert.deepEqual(input.keyCommand(key('c', { code: 'KeyC', altKey: false }), 'desktop'), { kind: 'copy' })
})

test('context menu: Copy style / Paste style rows with hints, disabled when they cannot run', () => {
  const state = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }
  const find = (s, a) => input.contextMenuEntries(s).find((e) => e.action === a)
  assert.equal(find(state, 'copyStyle').hint, 'Ctrl+Alt+C'); assert.equal(find(state, 'pasteStyle').hint, 'Ctrl+Alt+V')
  assert.equal(find(state, 'copyStyle').disabled, true); assert.equal(find(state, 'pasteStyle').disabled, true)
  const ready = { ...state, canCopyStyle: true, canPasteStyle: true }
  assert.equal(find(ready, 'copyStyle').disabled, false); assert.equal(find(ready, 'pasteStyle').disabled, false)
})

test('App wiring: toasts, one history step, stored style is a ref', () => {
  assert.match(app, /copiedStyleRef = useRef<StyleSnapshot \| null>\(null\)/)
  assert.match(app, /showToast\('Style copied'\)/)
  assert.match(app, /showToast\('Copy a style first'\)/)
  assert.match(app, /showToast\('Style pasted'\)/)
  assert.match(app, /case 'copyStyle': return copyStyleWithToast\(\)/)
  assert.match(app, /case 'pasteStyle': return pasteStyleWithToast\(\)/)
})
