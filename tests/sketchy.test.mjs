import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { loadModule } from './helpers/loadModule.mjs'

const sk = await loadModule('sketchy.ts')
const fill = await loadModule('shapeFill.ts')
const doc = await loadModule('documentFormat.ts')
const shapes = await loadModule('hldShapes.ts')
const model = await loadModule('canvasModel.ts')
const exp = await loadModule('sheetExport.ts')
const box = await loadModule('inkClassBox.ts')

const rect = (extra = {}) => ({ kind: 'rectangle', id: 3, x: 10, y: 20, width: 200, height: 100, strokeColor: '#111', strokeWidth: 3, ...extra })
const p = (x, y) => ({ x, y, pressure: 0.5 })
const sheet = { width: 1000, height: 800, template: 'blank', backgroundColor: '#fff' }

test('same seed gives identical path text, a different seed a different one', () => {
  for (const extra of [{}, { ellipse: true }, { diamond: true }]) {
    const a = sk.sketchyRectangleShape(rect({ seed: 5, ...extra }))
    assert.deepEqual(a, sk.sketchyRectangleShape(rect({ seed: 5, ...extra })))
    assert.notEqual(a.outline, sk.sketchyRectangleShape(rect({ seed: 6, ...extra })).outline)
    assert.ok(a.outline.length > 20 && a.fill.length > 10)
  }
  for (const hld of ['database', 'queue']) {
    const r = { ...shapes.createHldShape(1, 0, 0, 300, 200, '#111', 3, hld), seed: 9 }
    assert.equal(sk.sketchyRectangleShape(r).outline, sk.sketchyRectangleShape({ ...r }).outline)
  }
})

test('a missing seed falls back to one worked out from the id; PRNG is deterministic', () => {
  assert.equal(sk.rectangleSeed(rect()), sk.seedFromId('rectangle', 3))
  assert.notEqual(sk.seedFromId('rectangle', 3), sk.seedFromId('rectangle', 4))
  const a = sk.mulberry32(42)
  const b = sk.mulberry32(42)
  assert.deepEqual([a(), a(), a()], [b(), b(), b()])
})

test('resizing keeps the wobble: same random numbers, only the box changes', () => {
  const small = sk.sketchyRectangleShape(rect({ seed: 7 })).outline.match(/[MC]/g)
  const big = sk.sketchyRectangleShape(rect({ seed: 7, width: 400, height: 300 })).outline.match(/[MC]/g)
  assert.deepEqual(small, big)
})

test('moving a shape moves its outline without changing its shape', () => {
  const a = sk.sketchyRectangleShape(rect({ seed: 7 })).outline
  const b = sk.sketchyRectangleShape(rect({ seed: 7, x: 110 })).outline
  assert.notEqual(a, b)
  assert.equal(a.replace(/[-\d.]+/g, '#'), b.replace(/[-\d.]+/g, '#'))
})

test('the service shape and class boxes are never sketchy and cannot be filled', () => {
  const service = { ...shapes.createHldShape(1, 0, 0, 300, 200, '#111', 3, 'service'), fillColor: '#b2f2bb', seed: 4 }
  assert.equal(sk.isSketchyRectangle(service), false)
  assert.equal(sk.rectangleFill(service), null)
  assert.equal(sk.isSketchyRectangle({ ...box.createInkClassBox(2, 0, 0, 300, 200, '#111', 3) }), false)
  assert.equal(sk.isSketchyRectangle(rect({ classBox: { name: 'A', attributes: '', methods: '' } })), false)
  for (const style of [false, true]) {
    const svg = exp.buildSheetSvg([service], { ...sheet, ...(style ? { sketchy: true } : {}) })
    assert.equal(svg, exp.buildSheetSvg([{ ...service, seed: undefined, fillColor: undefined }], { ...sheet, ...(style ? { sketchy: true } : {}) }))
    assert.ok(!svg.includes('b2f2bb'))
  }
  const keys = new Set(['rectangle:1'])
  assert.equal(fill.setFillColor([service], keys, '#b2f2bb')[0], service)
  assert.equal(fill.selectionHasFillable([service], keys), false)
})

test('seeds are stamped only on shapes lacking one, and never on service', () => {
  const service = shapes.createHldShape(1, 0, 0, 300, 200, '#111', 3, 'service')
  const items = [rect({ id: 1 }), rect({ id: 2, seed: 77 }), service, { kind: 'stroke', id: 1, points: [p(0, 0)], color: '#000', width: 2, erase: false }]
  const out = sk.withSketchSeeds(items, () => 0.5)
  assert.ok(Number.isInteger(out[0].seed) && out[0].seed > 0)
  assert.equal(out[1], items[1])
  assert.equal(out[2], service)
  assert.equal(sk.withSketchSeeds(out), out)
})

test('arrows and lines have deterministic hand-drawn paths; other strokes have none', () => {
  const arrow = { kind: 'stroke', id: 8, points: [p(0, 0), p(200, 50)], color: '#000', width: 3, erase: false, shape: 'arrow' }
  assert.equal(sk.sketchyStrokePath(arrow), sk.sketchyStrokePath({ ...arrow }))
  assert.notEqual(sk.sketchyStrokePath(arrow), sk.sketchyStrokePath({ ...arrow, id: 9 }))
  assert.equal(sk.sketchyStrokePath({ ...arrow, shape: undefined }), null)
  const c = model.createConnector(1, p(0, 0), p(200, 0), '#000', 3)
  assert.equal(sk.sketchyConnectorShape(c).line, sk.sketchyConnectorShape({ ...c }).line)
})

test('fill: presets, selection helpers, one array change, none removes the key', () => {
  const items = [rect({ id: 1 }), rect({ id: 2 })]
  const keys = new Set(['rectangle:1', 'rectangle:2'])
  assert.equal(fill.selectionFillColor(items, keys), 'none')
  const filled = fill.setFillColor(items, keys, '#a5d8ff')
  assert.notEqual(filled, items)
  assert.equal(fill.selectionFillColor(filled, keys), '#a5d8ff')
  assert.equal(fill.setFillColor(filled, keys, '#a5d8ff'), filled)
  assert.equal(fill.selectionFillColor([filled[0], items[1]], keys), null)
  const cleared = fill.setFillColor(filled, keys, null)
  assert.ok(!('fillColor' in cleared[0]))
  assert.equal(fill.setFillColor(items, keys, 'red'), items)
  assert.equal(fill.matchingOutline('#B2F2BB'), '#2f9e44')
  assert.equal(fill.FILL_PRESETS.length, 5)
})

test('saved format: old files round-trip byte-identical, new fields round-trip, invalid ones dropped', () => {
  const input = { template: 'blank', background: 'white', items: [rect({ id: 1 })] }
  const old = doc.createDocument(input, '2026-01-01T00:00:00.000Z')
  const text = doc.stringifyDocument(old)
  assert.ok(!text.includes('sketchy') && !text.includes('seed') && !text.includes('fillColor'))
  const parsed = doc.parseDocument(text)
  assert.equal(doc.stringifyDocument(parsed.document), text)

  const used = doc.createDocument({ ...input, sketchy: true, items: [rect({ id: 1, seed: 123, fillColor: '#ffec99' })] }, '2026-01-01T00:00:00.000Z')
  assert.equal(used.page.sketchy, true)
  const again = doc.parseDocument(doc.stringifyDocument(used))
  assert.equal(again.document.page.sketchy, true)
  assert.equal(again.document.items[0].seed, 123)
  assert.equal(again.document.items[0].fillColor, '#ffec99')
  assert.equal(doc.stringifyDocument(again.document), doc.stringifyDocument(used))

  const bad = JSON.parse(text)
  bad.page.sketchy = 'yes'
  bad.items[0].seed = 1.5
  bad.items[0].fillColor = 42
  const cleaned = doc.parseDocument(JSON.stringify(bad)).document
  assert.equal('sketchy' in cleaned.page, false)
  assert.equal('seed' in cleaned.items[0], false)
  assert.equal('fillColor' in cleaned.items[0], false)
  for (const v of [-1, NaN, 'a', 2 ** 40]) { bad.items[0].seed = v; assert.equal('seed' in doc.parseDocument(JSON.stringify(bad)).document.items[0], false) }
  bad.page.sketchy = false
  assert.equal('sketchy' in doc.parseDocument(JSON.stringify(bad)).document.page, false)
})

test('the signature notices the toggle', () => {
  const a = { title: 't', template: 'blank', background: 'white', items: [] }
  assert.equal(doc.sameSignature(a, { ...a }), true)
  assert.equal(doc.sameSignature(a, { ...a, sketchy: true }), false)
})

test('SVG export: sketchy uses the same path text, plain mode is unchanged by the flag being off, fill goes under the outline', () => {
  const r = rect({ seed: 5, fillColor: '#d0bfff' })
  const plain = exp.buildSheetSvg([r], sheet)
  const sketchy = exp.buildSheetSvg([r], { ...sheet, sketchy: true })
  assert.notEqual(plain, sketchy)
  assert.ok(sketchy.includes(sk.sketchyRectangleShape(r).outline))
  assert.ok(sketchy.indexOf('fill="#d0bfff"') < sketchy.indexOf('stroke="#111"'))
  assert.ok(plain.indexOf('fill="#d0bfff"') >= 0 && plain.includes('<rect'))
  assert.equal(exp.buildSheetSvg([rect()], sheet), exp.buildSheetSvg([rect()], { ...sheet, sketchy: false }))
  const arrow = { kind: 'stroke', id: 8, points: [p(0, 0), p(200, 50)], color: '#000', width: 3, erase: false, shape: 'arrow' }
  assert.ok(exp.buildSheetSvg([arrow], { ...sheet, sketchy: true }).includes(sk.sketchyStrokePath(arrow)))
  // the flag does not leak into the next build
  assert.equal(exp.buildSheetSvg([arrow], sheet), exp.buildSheetSvg([arrow], { ...sheet, sketchy: false }))
})

test('renderer: cache keyed by item (Path2D built once per item), no Math.random, wiring present', async () => {
  globalThis.Path2D = class { constructor(d) { this.d = d } }
  const render = await loadModule('app/sketchyRender.ts')
  const calls = []
  const ctx = { stroke: (p) => calls.push(p), fill: () => {}, save() {}, restore() {}, set fillStyle(_) {} }
  const r = rect({ seed: 5 })
  const before = render.sketchyStats.builds
  render.strokeSketchyRectangle(ctx, r)
  render.strokeSketchyRectangle(ctx, r)
  render.strokeSketchyRectangle(ctx, r)
  assert.equal(render.sketchyStats.builds - before, 1)
  assert.equal(calls[0], calls[2])
  render.strokeSketchyRectangle(ctx, { ...r, width: 300 })
  assert.equal(render.sketchyStats.builds - before, 2)
  const src = await readFile(new URL('../src/app/sketchyRender.ts', import.meta.url), 'utf8')
  const pure = await readFile(new URL('../src/sketchy.ts', import.meta.url), 'utf8')
  assert.ok(!/Math\.random\(/.test(src))
  assert.ok(!/Math\.random/.test(pure.replace(/random: \(\) => number = Math\.random/g, '')))
  const renderer = await readFile(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')
  assert.ok(renderer.includes('strokeSketchyRectangle') && renderer.includes('drawSketchyConnector'))
  const { readAppSource } = await import('./helpers/appSource.mjs')
  const app = await readAppSource()
  assert.ok(app.includes('sketchy: sketchyRef.current') && app.includes('loaded.page.sketchy'))
  assert.ok(/inputMode === 'desktop' && <button[^>]*aria-checked=\{props\.sketchy\}/.test(app))
})
