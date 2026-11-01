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
  assert.match(app, /items\.length === cache!\.snapshot\.length \+ 1 && items\[items\.length - 1\]\.kind === 'stroke'/)
  assert.match(app, /drawItem\(historyContext, items\[items\.length - 1\]\)/)
  // no longer thrown away when the stroke ends
  assert.doesNotMatch(app, /cacheable/)
})

test('the minimap is not redrawn on every frame while writing', () => {
  assert.match(app, /MINIMAP_LIVE_REFRESH_MS/)
  assert.match(app, /\(!activeStrokeRef\.current && !gestureFrame\) \|\| minimapNow - minimapRenderedAtRef\.current > MINIMAP_LIVE_REFRESH_MS/)
})

test('a growing pen stroke only repaints the area around it', () => {
  assert.match(app, /function getDirtyRect\(/)
  assert.match(app, /const dirtyRect = penStrokeFrame && sameViewport && !gestureFrame/)
  // shapes and held-shape previews, erasers and gestures always repaint everything
  assert.match(app, /!liveStroke\.shape && shapePreviewRef\.current === null/)
  assert.match(app, /ctx\.rect\(dirty\.x, dirty\.y, dirty\.width, dirty\.height\)/)
  assert.match(app, /if \(dirty\) ctx\.restore\(\)/)
  assert.match(app, /if \(dirty\) inkContext\.restore\(\)/)
})

test('pinch and three-finger pan move a saved picture of the page and redraw sharply when they settle', () => {
  assert.match(app, /GESTURE_SETTLE_MS/)
  assert.match(app, /zoomTwoFingerViewport\(gesture\.viewport, gesture\.center, gesture\.distance, distance, MIN_ZOOM, MAX_ZOOM\), true\)/)
  assert.match(app, /panThreeFingerViewport\(gesture\.viewport, gesture\.center, center\), true\)/)
  assert.match(app, /const directGesture = cacheUsable && gestureFrame && !sameViewport/)
  assert.match(app, /viewportGestureRef\.current = false\n\s+renderAll\(\)/)
})

test('the stroke being written is drawn on its own overlay canvas above the page', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  // a second, transparent canvas that never takes pointer input
  assert.match(app, /<canvas ref=\{liveCanvasRef\} className="live-canvas" aria-hidden="true" \/>/)
  assert.match(css, /\.live-canvas \{[^}]*pointer-events: none/)
  // only pen strokes over a usable page picture take the overlay; eraser, shapes, previews and gestures keep the page-canvas path
  assert.match(app, /const dirtyRect = penStrokeFrame && sameViewport && !gestureFrame && liveStroke && !liveStroke\.shape && shapePreviewRef\.current === null/)
  // while the overlay runs, a frame repaints only the stroke's own area on the overlay and returns before touching the page canvas
  assert.match(app, /overlayCapable && liveOverlayActiveRef\.current/)
  assert.match(app, /drawLiveStroke\(dirtyRect!\)\n[\s\S]*?return\n    \}/)
  // the overlay is cleared in the same render that stops using it, so the hand-off at pen-up happens in one paint
  assert.match(app, /if \(liveOverlayActiveRef\.current\) \{[\s\S]*?clearRect\(0, 0, liveCanvas\.width, liveCanvas\.height\)[\s\S]*?liveOverlayActiveRef\.current = false/)
  // the frame that starts the overlay paints the page without the stroke
  assert.match(app, /if \(activeStrokeRef\.current && !startOverlay\)/)
})

test('the overlay and the page cache can be switched off from the address for on-device comparison', () => {
  assert.match(app, /DRAW_SWITCHES\.get\('overlay'\) !== 'off'/)
  assert.match(app, /DRAW_SWITCHES\.get\('cache'\) !== 'off'/)
  assert.match(app, /const liveCanvas = LIVE_OVERLAY_ENABLED \? liveCanvasRef\.current : null/)
})
