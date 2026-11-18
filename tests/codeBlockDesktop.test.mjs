import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const input = await loadModule('desktopInput.ts')
const app = (await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')

const code = (extra = {}) => ({ kind: 'code', id: 3, x: 100, y: 100, width: 300, height: 120, text: 'x = 1\n', language: 'python', ...extra })
const rect = (id, x, y, w, h) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#000', strokeWidth: 2 })
const pt = (x, y) => ({ x, y, pressure: 1 })

test('a code block over a shape is the hit target; skipCode (Alt + click) reaches the shape under it', () => {
  const items = [rect(1, 120, 120, 80, 60), code()]
  assert.deepEqual(input.hitTarget(items, pt(150, 150), 1), { key: 'code:3', kind: 'code', id: 3 })
  assert.equal(input.hitTarget(items, pt(150, 150), 1, true).key, 'rectangle:1')
  assert.equal(input.hitTarget([code()], pt(150, 150), 1, true), null)
  // Pen tool click-select: the block, or with Alt the shape (its edge band) under it.
  assert.equal(input.clickSelectTarget(items, pt(150, 150), 1, 'pen', false).key, 'code:3')
  assert.equal(input.clickSelectTarget(items, pt(121, 150), 1, 'pen', false, null, true).key, 'rectangle:1')
})

test('App: the Select tool press tests code blocks after labels and before boxes, and Alt looks through them', () => {
  const down = app.slice(app.indexOf('const onPointerDown = (event: React.PointerEvent'), app.indexOf('const onPointerMove = (event: React.PointerEvent'))
  assert.match(down, /const codeHit = textHit \|\| passThroughCode \? null : hitTestCode\(point\)/)
  assert.match(down, /const rectangle = textHit \|\| codeHit \? null : hitTestRectangle\(point\)/)
  assert.match(down, /codeHit \? \[canvasItemKey\(codeHit\)\]/)
  assert.match(down, /const selectedItem = textHit \?\? codeHit \?\? rectangle \?\? connector/)
  assert.match(down, /const passThroughCode = event\.altKey && event\.pointerType === 'mouse' && inputModeRef\.current === 'desktop'/)
  assert.match(down, /hitTarget\(routeConnectors\(strokesRef\.current\), point, viewportRef\.current\.scale, passThroughCode\)/)
  assert.match(down, /clickSelectTarget\([^\n]{0,300}selectedRectangleIdRef\.current, event\.altKey\)/)
  assert.match(app, /const hitTestCode = \(point: Point\): CodeObject \| null =>/)
})
