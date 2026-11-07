import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('the ink already on the page is kept as a picture between frames and between strokes', () => {
  assert.match(app, /historyLayerRef/)
  assert.match(app, /historyCacheRef/)
  // never used for benchmark runs or while a text label is being edited
  assert.match(app, /const cacheAllowed = !benchmarkBackground && editingTextId === null && PAGE_CACHE_ENABLED/)
  // reused only for the same items (same objects, same order), display mode, pixel density and canvas size
  for (const key of ['sameItems(cache!.snapshot, items, items.length)', 'cache.mode === strokeDisplayMode', 'cache.dpr === dpr', 'cache.width === canvas.width', 'cache.height === canvas.height', 'cache!.scale === viewport.scale', 'cache!.offsetX === viewport.offsetX', 'cache!.offsetY === viewport.offsetY']) {
    assert.ok(app.includes(key), key)
  }
  // a finished pen stroke is drawn onto the picture instead of redrawing the whole page
  assert.match(app, /items\.length === cache!\.snapshot\.length \+ 1 && sameItems\(cache!\.snapshot, items, cache!\.snapshot\.length\)/)
  assert.match(app, /for \(const added of appendedItemsForRendering\(items\)\) drawItem\(historyContext, added\)/)
  // no longer thrown away when the stroke ends
  assert.doesNotMatch(app, /cacheable/)
})

test('the minimap is not redrawn on every frame while writing', () => {
  assert.match(app, /MINIMAP_LIVE_REFRESH_MS/)
  assert.match(app, /MINIMAP_LIVE_REFRESH_MS = 1000/)
  assert.match(app, /if \(!activeStrokeRef\.current && \(!gestureFrame \|\| minimapNow - minimapRenderedAtRef\.current > MINIMAP_LIVE_REFRESH_MS\)\) \{/)
  // the piece-by-piece live path no longer touches the minimap
  assert.doesNotMatch(app, /drawLiveFrame\(\)\s*const minimapNow/)
})

test('a growing pen stroke only repaints the area around it', () => {
  assert.match(app, /function getDirtyRect\(/)
  assert.match(app, /const dirtyRect = DIRTY_RECT_ENABLED && penStrokeFrame && sameViewport && !gestureFrame/)
  // shapes and held-shape previews, erasers and gestures always repaint everything
  assert.match(app, /!liveStroke\.shape && shapePreviewRef\.current === null/)
  assert.match(app, /ctx\.rect\(dirty\.x, dirty\.y, dirty\.width, dirty\.height\)/)
  assert.match(app, /if \(dirty\) ctx\.restore\(\)/)
  assert.match(app, /if \(!oneLayer && dirty\) inkContext\.restore\(\)/)
})

test('pinch and three-finger pan move a saved picture of the page and redraw sharply when they settle', () => {
  assert.match(app, /GESTURE_SETTLE_MS/)
  assert.match(app, /zoomTwoFingerViewport\(gesture\.viewport, gesture\.center, gesture\.distance, distance, MIN_ZOOM, MAX_ZOOM\), true\)/)
  assert.match(app, /panThreeFingerViewport\(gesture\.viewport, gesture\.center, center\), true\)/)
  assert.match(app, /const directGesture = cacheUsable && gestureFrame && !sameViewport/)
  assert.match(app, /viewportGestureRef\.current = false\n\s+renderAll\(\)/)
})

test('a Raw pen stroke is drawn piece by piece on the page canvas, with no extra full-screen layer', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /live-canvas|liveCanvasRef|liveOverlayActiveRef/)
  assert.doesNotMatch(css, /\.live-canvas/)
  // only pen strokes over a usable page picture qualify; eraser, shapes, previews and gestures keep the page-canvas path
  assert.match(app, /const dirtyRect = DIRTY_RECT_ENABLED && penStrokeFrame && sameViewport && !gestureFrame && liveStroke && !liveStroke\.shape && shapePreviewRef\.current === null/)
  assert.match(app, /const incrementalLive = LIVE_INCREMENTAL_ENABLED && dirtyRect !== null && liveStroke !== null && liveStroke\.kind === 'stroke'\s*&& !liveStroke\.erase && strokeDisplayMode === 'raw'/)
  // while it runs, a frame draws only the newest part of the stroke and returns before the full render
  assert.match(app, /liveState\.strokeId === liveStroke!\.id[\s\S]*?drawLiveFrame\(\)[\s\S]*?return\n    \}/)
  // the frame that starts it paints the page without the stroke, then keeps a copy as the base
  assert.match(app, /if \(activeStrokeRef\.current && !startLive\)/)
  assert.match(app, /if \(startLive && liveStroke\) \{[\s\S]*?baseContext\.drawImage\(canvas, 0, 0\)[\s\S]*?createLiveStrokeState\(liveStroke\.id\)/)
})

test('drawing paths can be switched from the address for on-device comparison', () => {
  assert.match(app, /DRAW_SWITCHES\.get\('cache'\) !== 'off'/)
  assert.match(app, /DRAW_SWITCHES\.get\('live'\) === 'incremental'/)
  assert.match(app, /DRAW_SWITCHES\.get\('predict'\) === 'on'/)
})

test('the low-latency canvas hint is opt-in and applies to the page canvas', () => {
  assert.match(app, /MAIN_CANVAS_OPTIONS: CanvasRenderingContext2DSettings \| undefined = DRAW_SWITCHES\.get\('desync'\) === 'on' \|\| CANVAS_ON_CPU\s*\? \{ \.\.\.\(DRAW_SWITCHES\.get\('desync'\) === 'on' \? \{ desynchronized: true \} : \{\}\), \.\.\.LAYER_CANVAS_OPTIONS \}\s*: undefined/)
  assert.equal((app.match(/getContext\('2d', MAIN_CANVAS_OPTIONS\)/g) ?? []).length, 2)
})
