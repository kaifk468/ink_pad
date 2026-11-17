import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const fit = await loadModule('textFit.ts')
const layout = await loadModule('textLayout.ts')
const doc = await loadModule('documentFormat.ts')
const svgExport = await loadModule('sheetExport.ts')

// 0.5em per character, so the width scales with the size.
const measureFor = (size) => (line) => line.length * size * 0.5
const box = (over = {}) => ({ kind: 'rectangle', id: 1, x: 0, y: 0, width: 300, height: 120, strokeColor: '#111', strokeWidth: 2, ...over })
const area = { width: 200, height: 80 }

test('sizes: small sizes are desktop only, tablet list unchanged', () => {
  assert.deepEqual(layout.TEXT_FONT_SIZES, [18, 24, 32, 48])
  assert.deepEqual(layout.TEXT_FONT_SIZES_DESKTOP, [10, 12, 14, 16, 18, 24, 32, 48])
  assert.equal(fit.FIT_MIN_SIZE, 10)
})

test('fit: short text keeps the picked size, long text shrinks step by step', () => {
  assert.equal(fit.fitText('Hi', 24, area, undefined, measureFor).fontSize, 24)
  const r = fit.fitText('x'.repeat(30), 24, area, undefined, measureFor) // 30 chars * 0.5 * s <= 200 -> s <= 13.3
  assert.equal(r.fontSize, 12)
  assert.equal(r.wrap, false)
  assert.ok(r.width <= area.width)
})

test('fit: stops at 10 then wraps inside the shape width', () => {
  const r = fit.fitText('word '.repeat(20).trim(), 24, area, undefined, measureFor)
  assert.equal(r.fontSize, 10)
  assert.equal(r.wrap, true)
  assert.equal(r.width, area.width)
  assert.ok(r.height > layout.getTextLineHeight(10))
  const lines = layout.wrapTextLines('word '.repeat(20).trim(), 200, measureFor(10))
  assert.ok(lines.every((line) => measureFor(10)(line) <= 200))
})

test('wrap: long words are broken, newlines kept', () => {
  const lines = layout.wrapTextLines('abcdefghij\nxy', 25, (l) => l.length * 10)
  assert.deepEqual(lines, ['ab', 'cd', 'ef', 'gh', 'ij', 'xy'])
})

test('editor: grows back on delete but never above the picked size', () => {
  const editor = { itemId: null, x: 0, y: 0, fontSize: 24, initialText: '', fitArea: area, pickedSize: 24 }
  assert.equal(fit.editorFit(editor, 'x'.repeat(30), measureFor).fontSize, 12)
  assert.equal(fit.editorFit(editor, 'x'.repeat(20), measureFor).fontSize, 20)
  assert.equal(fit.editorFit(editor, 'ab', measureFor).fontSize, 24)
  const big = { ...editor, pickedSize: 16 }
  assert.equal(fit.editorFit(big, 'a', measureFor).fontSize, 16)
})

test('editor: plain canvas (no area) and hand-picked size do no auto-fit', () => {
  const plain = { itemId: null, x: 0, y: 0, fontSize: 24, initialText: '' }
  assert.equal(fit.editorFit(plain, 'x'.repeat(100), measureFor), null)
  assert.equal(fit.editorFit({ ...plain, fitArea: area, pickedSize: 24, fitOff: true }, 'x'.repeat(100), measureFor), null)
})

test('manual pick turns fit off (saved as fit off); toggle restores it', () => {
  const label = layout.createTextObject(3, 10, 10, 'x'.repeat(30), '#111', 24, (l) => l.length * 12)
  const off = { itemId: 3, x: 10, y: 10, fontSize: 40, initialText: '', fitArea: area, pickedSize: 40, fitOff: true }
  const manual = fit.buildEditedLabel(label, 'x'.repeat(30), off, measureFor)
  assert.equal(manual.fontSize, 40)
  assert.equal(manual.fit, 'off')
  const on = fit.buildEditedLabel(manual, 'x'.repeat(30), { ...off, fitOff: false, pickedSize: 40 }, measureFor)
  assert.equal(on.fontSize, 12)
  assert.equal(on.fit, undefined)
})

test('prepareEditorFit: topmost shape wins, class and ink boxes and plain canvas excluded, tablet off', () => {
  const items = [box({ id: 1 }), box({ id: 2, x: 50, y: 20, width: 100, height: 60, ellipse: true })]
  const centre = { itemId: null, x: 80, y: 30 - 24 * 0.65 + 24 * 0.65, fontSize: 24, initialText: '' }
  const prepared = fit.prepareEditorFit({ ...centre, x: 90, y: 50 - 24 * 0.65 }, items, true)
  assert.ok(Math.abs(prepared.fitArea.width - (100 / Math.SQRT2 - 20)) < 1e-6)
  assert.equal(fit.prepareEditorFit({ ...centre, x: 90, y: 50 - 24 * 0.65 }, items, false).fitArea, undefined)
  assert.equal(fit.prepareEditorFit({ itemId: null, x: 900, y: 900, fontSize: 24, initialText: '' }, items, true).fitArea, undefined)
  const classBox = box({ id: 5, classBox: { name: 'A', attributes: '', methods: '' } })
  const inkClass = box({ id: 6, inkBox: { top: 40, mid: 80, ink: [] } })
  assert.equal(fit.findFitArea([box(), classBox], { x: 100, y: 50 }), null)
  assert.equal(fit.findFitArea([box(), inkClass], { x: 100, y: 50 }), null)
  const db = box({ id: 7, inkBox: { top: 0, mid: 0, ink: [] }, hldShape: 'database' })
  assert.ok(fit.findFitArea([db], { x: 100, y: 50 }))
})

test('inner area: diamond and ellipse use an inscribed rectangle, smaller than the box', () => {
  const plain = fit.shapeInnerArea(box())
  const ellipse = fit.shapeInnerArea(box({ ellipse: true }))
  const diamond = fit.shapeInnerArea(box({ diamond: true }))
  assert.deepEqual(plain, { width: 280, height: 100 })
  assert.ok(Math.abs(ellipse.width - (300 / Math.SQRT2 - 20)) < 1e-9)
  assert.deepEqual(diamond, { width: 130, height: 40 })
  assert.ok(diamond.width < ellipse.width && ellipse.width < plain.width)
  // anchor outside a diamond's corner (inside its bounding box) is not "inside"
  assert.equal(fit.findFitArea([box({ diamond: true })], { x: 10, y: 10 }), null)
})

const roundTrip = (items) => {
  const parsed = doc.parseDocument(doc.stringifyDocument(doc.createDocument({ template: 'blank', background: 'white', items })))
  assert.equal(parsed.ok, true)
  return parsed.document.items
}

test('saved size and fit round trip; invalid fit is dropped; old labels load unchanged', () => {
  const base = { kind: 'text', id: 1, x: 0, y: 0, width: 200, height: 60, text: 'a b c', fontSize: 14, color: '#202124' }
  const wrapped = { ...base, id: 5, fontSize: 10, fit: 'wrap' }
  const off = { ...base, id: 2, fontSize: 40, fit: 'off' }
  assert.deepEqual(roundTrip([base, wrapped, off]), [base, wrapped, off])
  assert.ok(!('fit' in roundTrip([base])[0]))
  assert.ok(!('fit' in roundTrip([{ ...base, fit: 'yes' }])[0]))
  assert.ok(!('fit' in roundTrip([{ ...base, fit: 'wrap', width: 0 }])[0]))
})

test('buildEditedLabel without auto-fit leaves a plain label exactly as before', () => {
  const label = layout.createTextObject(3, 10, 10, 'Hello', '#111', 24, (l) => l.length * 12)
  const editor = { itemId: 3, x: 10, y: 10, fontSize: 24, initialText: 'Hello' }
  const same = fit.buildEditedLabel(label, 'Hello', editor, () => (l) => l.length * 12)
  assert.deepEqual(same, label)
})

test('wrapped label draws and exports its wrapped lines', () => {
  const label = { kind: 'text', id: 1, x: 0, y: 0, width: 40, height: 60, text: 'aaaa bbbb', fontSize: 10, color: '#111', fit: 'wrap' }
  const lines = layout.labelLines(label, (l) => l.length * 10)
  assert.deepEqual(lines, ['aaaa', 'bbbb'])
  assert.deepEqual(layout.labelLines({ ...label, fit: undefined }), ['aaaa bbbb'])
  void svgExport
})
