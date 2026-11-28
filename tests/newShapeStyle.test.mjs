import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const ns = await loadModule('newShapeStyle.ts')
const input = await loadModule('desktopInput.ts')
const app = await readAppSource()

const box = (id, extra = {}) => ({ kind: 'rectangle', id, x: 0, y: 0, width: 100, height: 60, strokeColor: '#111111', strokeWidth: 2, ...extra })
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: (k) => { m.delete(k) }, m } }

test('newShapeStyleFrom: fill, dash, width, corners; never the outline colour', () => {
  const style = ns.newShapeStyleFrom(box(1, { fillColor: '#ffe9a8', dash: 'dashed', strokeWidth: 4, rounded: true, strokeColor: '#ff0000' }))
  assert.deepEqual(style, { width: 4, dash: 'dashed', fill: '#ffe9a8', rounded: true })
  assert.equal('color' in style, false)
  assert.equal(ns.newShapeStyleFrom(box(2, { classBox: true })), null)
  assert.equal(ns.newShapeStyleFrom({ kind: 'text', id: 3, x: 0, y: 0, width: 1, height: 1, text: 'a', fontSize: 16, color: '#000000' }), null)
  assert.equal(ns.newShapeStyleFrom(null), null)
})

test('parse / serialize round-trip; damaged values mean no default', () => {
  const style = { width: 3, dash: 'dotted', fill: null, rounded: false }
  assert.deepEqual(ns.parseNewShapeStyle(ns.serializeNewShapeStyle(style)), style)
  for (const bad of [null, '', 'not json', '[]', '5', '{}', '{"width":"3"}', '{"width":-1}', '{"width":999}', '{"dash":"wavy"}', '{"fill":"red"}', '{"fill":5}', '{"rounded":"yes"}']) {
    assert.equal(ns.parseNewShapeStyle(bad), null, String(bad))
  }
  assert.deepEqual(ns.parseNewShapeStyle('{"dash":"solid","extra":1}'), { dash: 'solid' })
})

test('load / save / clear use inkpad.newShapeStyle and survive a broken storage', () => {
  const store = memory()
  assert.equal(ns.loadNewShapeStyle(store), null)
  ns.saveNewShapeStyle({ fill: '#aabbcc' }, store)
  assert.equal(ns.NEW_SHAPE_STYLE_KEY, 'inkpad.newShapeStyle')
  assert.deepEqual(ns.loadNewShapeStyle(store), { fill: '#aabbcc' })
  ns.saveNewShapeStyle(null, store)
  assert.equal(store.m.has('inkpad.newShapeStyle'), false)
  const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
  assert.equal(ns.loadNewShapeStyle(broken), null)
  assert.doesNotThrow(() => ns.saveNewShapeStyle({ width: 2 }, broken))
})

test('applyNewShapeStyle: keeps the outline colour, applies what the kind can take', () => {
  const style = { width: 5, dash: 'dashed', fill: '#ffe9a8', rounded: true }
  const plain = ns.applyNewShapeStyle(box(1, { strokeColor: '#00aa00' }), style)
  assert.equal(plain.strokeColor, '#00aa00'); assert.equal(plain.strokeWidth, 5); assert.equal(plain.dash, 'dashed'); assert.equal(plain.fillColor, '#ffe9a8'); assert.equal(plain.rounded, true)
  const ellipse = ns.applyNewShapeStyle(box(2, { ellipse: true }), style)
  assert.equal(ellipse.fillColor, '#ffe9a8'); assert.equal(ellipse.rounded, undefined)
  const diamond = ns.applyNewShapeStyle(box(3, { diamond: true }), style)
  assert.equal(diamond.dash, 'dashed'); assert.equal(diamond.rounded, undefined)
  const same = box(4)
  assert.equal(ns.applyNewShapeStyle(same, null), same)
  const line = { kind: 'stroke', id: 5, color: '#000000', width: 2, points: [] }
  assert.equal(ns.applyNewShapeStyle(line, style), line)
  assert.equal(ns.applyNewShapeStyle(box(6, { dash: 'dotted' }), { dash: 'solid' }).dash, undefined)
})

test('line style choice for new shapes updates the stored default (newer wins)', () => {
  assert.deepEqual(ns.withNewShapeDash({ fill: '#aabbcc', dash: 'dashed' }, 'dotted'), { fill: '#aabbcc', dash: 'dotted' })
})

test('context menu offers the Default chip only when one shape is selected', () => {
  const base = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }
  assert.equal(input.contextMenuEntries(base).some((e) => e.action === 'useAsDefaultStyle'), false)
  const entry = input.contextMenuEntries({ ...base, canSetDefaultStyle: true }).find((e) => e.action === 'useAsDefaultStyle')
  assert.equal(entry.label, 'Use as default for new shapes'); assert.equal(entry.chip, 'Default'); assert.equal(entry.chipGroup, 'Style')
})

test('wiring: creation paths, menu, panel, palette and toast Reset', () => {
  assert.match(app, /const styledBox = styleNewShape\(dashedBox\)/)
  assert.match(app, /styleNewShape\(createHldShape\(/)
  assert.match(app, /\n\s+stroke = styleNewShape\(stroke\)\n/)
  assert.match(app, /case 'useAsDefaultStyle': useAsDefaultShapeStyle\(\)/)
  assert.match(app, /id: 'style:use-as-default', label: 'Use as default for new shapes'/)
  assert.match(app, /id: 'style:reset-default', label: 'Reset default shape style'/)
  assert.match(app, /showActionToast\('New shapes use this style', \{ label: 'Reset'/)
  assert.match(app, /storeNewShapeStyle\(withNewShapeDash\(/)
  assert.match(app, /aria-label="Use as default for new shapes"/)
  assert.match(app, /aria-label="Reset default shape style"/)
})
