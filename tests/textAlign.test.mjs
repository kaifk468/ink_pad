import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFileSync } from 'node:fs'

const layout = await loadModule('textLayout.ts')
const doc = await loadModule('documentFormat.ts')
const exporter = await loadModule('sheetExport.ts')
const app = await readAppSource()
const panel = readFileSync(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
const renderer = readFileSync(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')
const overlay = readFileSync(new URL('../src/TextEditorOverlay.tsx', import.meta.url), 'utf8')

const text = (extra = {}) => ({ kind: 'text', id: 1, x: 100, y: 50, width: 120, height: 60, text: 'abc\nabcdef', fontSize: 24, color: '#000000', ...extra })
const file = (items) => JSON.stringify({ format: 'inkpad-document', version: 1, title: 't', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', sheet: { width: 1000, height: 800 }, items })
const rt = (extra) => doc.stringifyDocument(doc.parseDocument(file([text(extra)])).document)

test('alignedLineX: left at x, centre and right inside the box, never left of it', () => {
  assert.equal(layout.alignedLineX(100, 120, 40), 100)
  assert.equal(layout.alignedLineX(100, 120, 40, 'center'), 140)
  assert.equal(layout.alignedLineX(100, 120, 40, 'right'), 180)
  assert.equal(layout.alignedLineX(100, 120, 200, 'center'), 100)
  assert.equal(layout.alignedLineX(100, 120, 200, 'right'), 100)
})

test('align: round-trips, left omitted, invalid dropped', () => {
  for (const align of ['center', 'right']) {
    const saved = rt({ align })
    assert.equal(doc.parseDocument(saved).document.items[0].align, align)
    assert.equal(doc.stringifyDocument(doc.parseDocument(saved).document), saved)
  }
  for (const bad of ['left', 'justify', 3, null]) assert.equal(rt({ align: bad }).includes('"align"'), false)
  assert.equal(rt({}).includes('"align"'), false)
})

test('setTextAlign: one pass over selected unlocked labels, left removes the field, same array when unchanged', () => {
  const items = [text({ id: 1 }), text({ id: 2, align: 'right' }), text({ id: 3, locked: true })]
  const keys = new Set(['text:1', 'text:2', 'text:3'])
  const centred = layout.setTextAlign(items, keys, 'center')
  assert.deepEqual(centred.map((i) => i.align), ['center', 'center', undefined])
  assert.equal(layout.setTextAlign(centred, keys, 'center'), centred)
  const left = layout.setTextAlign(centred, keys, 'left')
  assert.equal('align' in left[0], false)
  assert.equal(layout.setTextAlign(items, new Set(), 'right'), items)
})

test('SVG export anchors aligned lines inside the box', () => {
  const sheet = { width: 400, height: 300, template: 'blank', backgroundColor: '#fff' }
  const centre = exporter.buildSheetSvg([text({ align: 'center' })], sheet)
  assert.match(centre, /<text x="160" [^>]*text-anchor="middle"/)
  const right = exporter.buildSheetSvg([text({ align: 'right' })], sheet)
  assert.match(right, /<text x="220" [^>]*text-anchor="end"/)
  const plain = exporter.buildSheetSvg([text()], sheet)
  assert.match(plain, /<text x="100" /)
  assert.doesNotMatch(plain, /text-anchor/)
})

test('align is wired: renderer, editor overlay, panel buttons, palette, new labels in shapes', () => {
  assert.match(renderer, /getCachedTextMeasure\(text\.fontSize, text\.fontFamily\)/)
  assert.match(renderer, /textLineX\(text, /)
  assert.match(overlay, /editor\.align/)
  assert.match(panel, /aria-label=\{`Align text \$\{option\.label\}`\}/)
  assert.match(app, /textAlign=\{textAlignPanel\}/)
  assert.match(app, /id: `align:\$\{align\}`/)
  assert.match(app, /\{ \.\.\.centreLabelOn\(label, editor\.centerOn\), align: 'center' as const \}/)
  assert.match(app, /\.\.\.\(item\.align \? \{ align: item\.align \} : \{\}\)/)
  const pick = app.slice(app.indexOf('const pickTextAlign'), app.indexOf('const textAlignPanel'))
  assert.equal((pick.match(/saveHistory\(\)/g) ?? []).length, 1)
})

test('textLineX clamps a line wider than the box to its left edge, like the SVG export', () => {
  const box = { x: 100, width: 120 }
  assert.equal(layout.textLineX({ ...box }, 200), 100)
  assert.equal(layout.textLineX({ ...box, align: 'center' }, 40), 140)
  assert.equal(layout.textLineX({ ...box, align: 'center' }, 200), 100)
  assert.equal(layout.textLineX({ ...box, align: 'right' }, 200), 100)
  assert.equal(layout.textLineX({ ...box, align: 'right' }, 40), 180)
  const sheet = readFileSync(new URL('../src/sheetExport.ts', import.meta.url), 'utf8')
  assert.match(sheet, /textLineX\(text, measure\(line\)\)/)
})

test('keepAlignAnchor: a re-edited centred label keeps its centre, a right one its right edge, a left one its x', () => {
  const before = { x: 100, width: 120 }
  const after = text({ x: 100, width: 60 })
  assert.equal(layout.keepAlignAnchor({ ...before, align: 'center' }, after).x, 130)
  assert.equal(layout.keepAlignAnchor({ ...before, align: 'right' }, after).x, 160)
  assert.equal(layout.keepAlignAnchor({ ...before }, after).x, 100)
  assert.match(app, /keepAlignAnchor\(existing, updated\)/)
  assert.match(app, /centerOn: \{ x: item\.x \+ item\.width \/ 2, y: item\.y \+ item\.height \/ 2 \}/)
  assert.match(overlay, /editor\.anchorRight \* scale/)
})
