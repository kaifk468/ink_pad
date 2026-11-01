import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('while a pen stroke is drawn, the ink already on the page is cached instead of redrawn every frame', () => {
  assert.match(app, /historyLayerRef/)
  assert.match(app, /historyCacheRef/)
  // only a plain pen stroke uses the cache; erasers, benchmarks and text editing always redraw everything
  assert.match(app, /const cacheable = !benchmarkBackground && editingTextId === null && liveStroke !== null && liveStroke\.kind === 'stroke' && !liveStroke\.erase/)
  // the cache is only reused for the same items, viewport, pixel density and canvas size
  for (const key of ['cache.items === items', 'cache.count === items.length', 'cache.scale === viewport.scale', 'cache.offsetX === viewport.offsetX', 'cache.offsetY === viewport.offsetY', 'cache.dpr === dpr', 'cache.width === canvas.width', 'cache.height === canvas.height']) {
    assert.ok(app.includes(key), key)
  }
  // outside a pen stroke the cache is dropped
  assert.match(app, /historyCacheRef\.current = null/)
})

test('the minimap is not redrawn on every frame while writing', () => {
  assert.match(app, /MINIMAP_LIVE_REFRESH_MS/)
  assert.match(app, /!activeStrokeRef\.current \|\| minimapNow - minimapRenderedAtRef\.current > MINIMAP_LIVE_REFRESH_MS/)
})
