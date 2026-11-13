import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const model = await loadModule('canvasModel.ts')
const doc = await loadModule('documentFormat.ts')
const exp = await loadModule('sheetExport.ts')
const clip = await loadModule('clipboard.ts')
const renderer = await readFile(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')

const p = (x, y) => ({ x, y, pressure: 0.5 })
const stroke = (id, color, erase = false) => ({ kind: 'stroke', id, points: [p(0, 0), p(5, 5)], color, width: 3, erase })
const rect = (id, extra = {}) => ({ kind: 'rectangle', id, x: 10, y: 20, width: 100, height: 60, strokeColor: '#111111', strokeWidth: 2, ...extra })
const roundTrip = (items) => {
  const parsed = doc.parseDocument(doc.stringifyDocument(doc.createDocument({ title: 't', template: 'blank', background: 'warm', items })))
  assert.equal(parsed.ok, true)
  return parsed
}
const rectsOf = (parsed) => parsed.document.pages?.[0]?.items ?? parsed.document.items ?? parsed.items

test('createShapeBox builds a plain box with the flag only for diamond and ellipse', () => {
  const r = model.createShapeBox(1, 1, 2, 3, 4, '#222222', 5, 'rectangle')
  assert.deepEqual(r, { kind: 'rectangle', id: 1, x: 1, y: 2, width: 3, height: 4, strokeColor: '#222222', strokeWidth: 5 })
  assert.equal(model.createShapeBox(1, 0, 0, 9, 9, '#222222', 5, 'diamond').diamond, true)
  assert.equal(model.createShapeBox(1, 0, 0, 9, 9, '#222222', 5, 'diamond').ellipse, undefined)
  assert.equal(model.createShapeBox(1, 0, 0, 9, 9, '#222222', 5, 'ellipse').ellipse, true)
})

test('a diamond survives save and load; invalid combinations are cleaned', () => {
  const good = rect(1, { diamond: true })
  const parsed = roundTrip([good, rect(2, { diamond: true, ellipse: true }), rect(3, { diamond: true, classBox: { name: 'A', attributes: '', methods: '' } }),
    rect(4, { diamond: true, inkBox: { top: 30, mid: 50, ink: [] } }), rect(5, { diamond: true, width: 0 }), rect(6, { diamond: 'yes' })])
  const items = rectsOf(parsed)
  const byId = (id) => items.find((i) => i.id === id)
  assert.equal(byId(1).diamond, true)
  assert.equal(doc.createDocument({ title: 't', template: 'blank', background: 'warm', items: [good] }).version, 1)
  assert.equal(byId(2)?.diamond, undefined)
  assert.equal(byId(3)?.diamond, undefined)
  assert.equal(byId(4)?.diamond, undefined)
  assert.equal(byId(5)?.diamond, undefined)
  assert.equal(byId(6)?.diamond, undefined)
})

test('files without a diamond load unchanged and gain no field', () => {
  const items = rectsOf(roundTrip([rect(1), rect(2, { ellipse: true })]))
  assert.equal('diamond' in items[0], false)
  assert.equal(items[1].ellipse, true)
  assert.equal('diamond' in items[1], false)
})

test('resize, translate and paste keep the diamond flag', () => {
  const d = rect(1, { diamond: true })
  const resized = model.resizeRectangleItems([d], 1, { x: 0, y: 0, width: 200, height: 90 })
  assert.equal(resized[0].diamond, true)
  assert.equal(resized[0].width, 200)
  assert.equal(model.translateSelectedItems([d], new Set(['rectangle:1']), 5, 5)[0].diamond, true)
  assert.equal(model.cloneCanvasItems([d])[0].diamond, true)
  const pasted = clip.pasteItems([d], { stroke: 1, rectangle: 5, connector: 1, text: 1 }, 10, 10)
  assert.equal(JSON.stringify(pasted).includes('"diamond":true'), true)
})

test('SVG export draws a diamond polygon with the rectangle stroke', () => {
  const svg = exp.buildSheetSvg([rect(1, { diamond: true, strokeColor: '#abcdef', strokeWidth: 4 })], { width: 400, height: 300, template: 'blank', backgroundColor: '#fff' })
  assert.match(svg, /<polygon points="60,20 110,50 60,80 10,50" fill="none" stroke="#abcdef" stroke-width="4"/)
  assert.doesNotMatch(svg, /<rect x="10"/)
})

test('main canvas and minimap draw the diamond', () => {
  assert.equal((renderer.match(/\.diamond\)/g) ?? []).length, 2)
  assert.match(renderer, /rectangle\.diamond\) \{[\s\S]*?closePath\(\)[\s\S]*?\} else if \(rectangle\.ellipse\)/)
  assert.match(renderer, /item\.diamond\) \{[\s\S]*?toMiniX\(item\.x \+ item\.width \/ 2\)/)
})

const keys = (...k) => new Set(k)
test('itemColor reads the right field per kind', () => {
  assert.equal(model.itemColor(stroke(1, '#010101')), '#010101')
  assert.equal(model.itemColor(rect(1)), '#111111')
  assert.equal(model.itemColor({ kind: 'connector', id: 1, strokeColor: '#222222' }), '#222222')
  assert.equal(model.itemColor({ kind: 'text', id: 1, color: '#333333' }), '#333333')
})

test('selectionColor is the shared colour or null', () => {
  const items = [stroke(1, '#aaaaaa'), rect(2, { strokeColor: '#aaaaaa' }), rect(3)]
  assert.equal(model.selectionColor(items, keys('stroke:1', 'rectangle:2')), '#aaaaaa')
  assert.equal(model.selectionColor(items, keys('stroke:1', 'rectangle:3')), null)
  assert.equal(model.selectionColor(items, keys()), null)
})

test('recolorItems recolours every kind, including ink box writing, and spares erasers', () => {
  const ink = [stroke(10, '#111111'), stroke(11, '#000000', true)]
  const items = [
    stroke(1, '#111111'), stroke(2, '#000000', true),
    rect(3), rect(4, { inkBox: { top: 30, mid: 50, ink } }), rect(5, { classBox: { name: 'A', attributes: '', methods: '' } }),
    { kind: 'connector', id: 6, start: p(0, 0), end: p(1, 1), strokeColor: '#111111', strokeWidth: 2, relationshipType: 'association', reversed: false },
    { kind: 'text', id: 7, x: 0, y: 0, width: 1, height: 1, text: 'a', fontSize: 12, color: '#111111' },
    rect(8),
  ]
  const snapshot = JSON.stringify(items)
  const all = new Set(items.slice(0, 7).map(model.canvasItemKey))
  const out = model.recolorItems(items, all, '#FF0000')
  assert.equal(JSON.stringify(items), snapshot)
  assert.equal(out[0].color, '#FF0000')
  assert.equal(out[1].color, '#000000')
  assert.equal(out[2].strokeColor, '#FF0000')
  assert.equal(out[3].strokeColor, '#FF0000')
  assert.equal(out[3].inkBox.ink[0].color, '#FF0000')
  assert.equal(out[3].inkBox.ink[1].color, '#000000')
  assert.equal(out[3].inkBox.top, 30)
  assert.equal(out[4].strokeColor, '#FF0000')
  assert.deepEqual(out[4].classBox, items[4].classBox)
  assert.equal(out[5].strokeColor, '#FF0000')
  assert.equal(out[6].color, '#FF0000')
  assert.equal(out[7], items[7])
})

test('recolorItems returns the same array when nothing changes or the colour is invalid', () => {
  const items = [stroke(1, '#ff0000'), rect(2, { strokeColor: '#ff0000' })]
  assert.equal(model.recolorItems(items, keys('stroke:1', 'rectangle:2'), '#FF0000'), items)
  assert.equal(model.recolorItems(items, keys(), '#00ff00'), items)
  assert.equal(model.recolorItems(items, keys('stroke:1'), 'red'), items)
  assert.equal(model.recolorItems(items, keys('stroke:1'), '#fff'), items)
  const only = model.recolorItems(items, keys('stroke:1'), '#00ff00')
  assert.notEqual(only, items)
  assert.equal(only[1], items[1])
})

test('an ink box whose frame already has the colour still recolours its writing', () => {
  const box = rect(1, { strokeColor: '#ff0000', inkBox: { top: 30, mid: 50, ink: [stroke(9, '#111111')] } })
  const out = model.recolorItems([box], keys('rectangle:1'), '#ff0000')
  assert.equal(out[0].inkBox.ink[0].color, '#ff0000')
})
