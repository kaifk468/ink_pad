import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const viewport = await loadModule('viewport.ts')
const desktopInput = await loadModule('desktopInput.ts')

test('fit with insets keeps the drawing inside the free area and caps the zoom', () => {
  const insets = viewport.DESKTOP_FIT_INSETS
  const bounds = { x: 100, y: 100, width: 400, height: 200 }
  const v = viewport.fitViewportToBoundsInset(bounds, 1440, 860, insets, 1)
  assert.equal(v.scale, 1)
  const left = bounds.x * v.scale + v.offsetX
  const right = (bounds.x + bounds.width) * v.scale + v.offsetX
  const top = bounds.y * v.scale + v.offsetY
  const bottom = (bounds.y + bounds.height) * v.scale + v.offsetY
  assert.ok(left >= insets.left && right <= 1440 - insets.right)
  assert.ok(top >= insets.top && bottom <= 860 - insets.bottom)
  const big = viewport.fitViewportToBoundsInset({ x: 0, y: 0, width: 5000, height: 3000 }, 1440, 860, insets, 1)
  assert.ok(big.scale < 1)
  assert.ok(5000 * big.scale <= 1440 - insets.left - insets.right + 1e-6)
})

test('fit with insets falls back when the window is tiny', () => {
  const v = viewport.fitViewportToBoundsInset({ x: 0, y: 0, width: 100, height: 100 }, 300, 200, viewport.DESKTOP_FIT_INSETS, 1)
  assert.ok(Number.isFinite(v.scale) && v.scale > 0)
})

test('"?" opens help with or without Shift, never with Ctrl/Alt/Meta', () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false }
  assert.deepEqual(desktopInput.keyCommand({ ...base, key: '?', shiftKey: true }, 'desktop'), { kind: 'help' })
  assert.deepEqual(desktopInput.keyCommand({ ...base, key: '?' }, 'desktop'), { kind: 'help' })
  assert.equal(desktopInput.keyCommand({ ...base, key: '?', ctrlKey: true }, 'desktop'), null)
  assert.equal(desktopInput.keyCommand({ ...base, key: '?' }, 'tablet'), null)
})

test('desktop Shift+1 and Shift+2 use the inset fit', async () => {
  const src = await readAppSource()
  assert.match(src, /case 'zoomFit': zoomToFitDesktop\(\)/)
  assert.match(src, /fitViewportToBoundsInset\(bounds, rect\.width, rect\.height, DESKTOP_FIT_INSETS, 1\)/)
  assert.match(src, /fitViewportToBoundsInset\(bounds, rect\.width, rect\.height, DESKTOP_FIT_INSETS, 2\)/)
})

test('UML toolbox starts on the right in desktop mode only', async () => {
  const src = await readAppSource()
  assert.match(src, /uml-toolbox\$\{umlToolboxMinimized \? ' minimized' : ''\}\$\{inputMode === 'desktop' \? ' desktop' : ''\}/)
})
