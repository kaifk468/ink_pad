import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const model = await loadModule('canvasModel.ts')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const text = (id, x, y, w = 100, h = 40, fontSize = 24) => ({ kind: 'text', id, x, y, width: w, height: h, text: 'hello', fontSize, color: '#000' })
const box = (x, y, width, height) => ({ x, y, width, height })

test('dragging the south-east corner outwards scales the label evenly and keeps the top-left fixed', () => {
  const items = [text(1, 100, 100)]
  const [t] = model.resizeTextItem(items, 1, box(100, 100, 100, 40), box(100, 100, 200, 80), 'se')
  assert.equal(t.fontSize, 48)
  assert.equal(t.width, 200)
  assert.equal(t.height, 80)
  assert.equal(t.x, 100)
  assert.equal(t.y, 100)
})

test('dragging the north-west corner keeps the bottom-right fixed', () => {
  const [t] = model.resizeTextItem([text(1, 100, 100)], 1, box(100, 100, 100, 40), box(0, 20, 200, 120), 'nw')
  assert.equal(t.x + t.width, 200)
  assert.equal(t.y + t.height, 140)
  assert.ok(t.fontSize > 24)
})

test('side handles follow their own axis and still scale the whole label evenly', () => {
  const [east] = model.resizeTextItem([text(1, 0, 0)], 1, box(0, 0, 100, 40), box(0, 0, 150, 40), 'e')
  assert.equal(east.fontSize, 36)
  assert.equal(east.width / east.height, 100 / 40)
  const [north] = model.resizeTextItem([text(1, 0, 0)], 1, box(0, 0, 100, 40), box(0, -40, 100, 80), 'n')
  assert.equal(north.fontSize, 48)
  assert.equal(north.y + north.height, 40)
})

test('font size stays between 8 and 300, and a shrink is a smaller label', () => {
  const [tiny] = model.resizeTextItem([text(1, 0, 0)], 1, box(0, 0, 100, 40), box(0, 0, 1, 1), 'se')
  assert.equal(tiny.fontSize, 8)
  const [huge] = model.resizeTextItem([text(1, 0, 0)], 1, box(0, 0, 100, 40), box(0, 0, 100000, 40000), 'se')
  assert.equal(huge.fontSize, 300)
  const [small] = model.resizeTextItem([text(1, 0, 0)], 1, box(0, 0, 100, 40), box(0, 0, 50, 20), 'se')
  assert.equal(small.fontSize, 12)
})

test('only the chosen label changes, and no new field is added to saved text', () => {
  const items = [text(1, 0, 0), text(2, 300, 0), { kind: 'rectangle', id: 1, x: 0, y: 100, width: 50, height: 50, strokeColor: '#000', strokeWidth: 4 }]
  const next = model.resizeTextItem(items, 2, box(300, 0, 100, 40), box(300, 0, 200, 80), 'se')
  assert.equal(next[0], items[0])
  assert.equal(next[2], items[2])
  assert.deepEqual(Object.keys(next[1]).sort(), Object.keys(items[1]).sort())
})

test('App wiring: a single selected label shows handles and resizes in the select and lasso tools, other tools switch to select first', () => {
  assert.match(app, /resizeTextItem\(activeResize\.originalItems, Number\(\[\.\.\.activeResize\.selectedKeys\]\[0\]\.slice\('text:'\.length\)\), original, bounds, activeResize\.handle\)/)
  assert.match(app, /soleTextKey\?\.startsWith\('text:'\)/)
  assert.match(app, /selectedItems\.length === 1 && selectedItems\[0\]\.kind === 'text'/)
  assert.match(app, /if \(item\.kind === 'text' && !selectionMode && !lassoMode\) toggleSelectTool\(\)/)
})
