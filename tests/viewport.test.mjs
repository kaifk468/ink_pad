import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/viewport.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const viewport = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const modelSource = await readFile(new URL('../src/canvasModel.ts', import.meta.url), 'utf8')
const modelOutput = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const model = await import(`data:text/javascript;base64,${Buffer.from(modelOutput).toString('base64')}`)

test('screen and canvas coordinates convert in both directions without changing pressure', () => {
  const transform = { scale: 1.75, offsetX: -120, offsetY: 64 }
  const canvasPoint = { x: 240, y: 180, pressure: 0.63 }
  const screenPoint = viewport.canvasToScreenPoint(canvasPoint, transform)
  assert.deepEqual(screenPoint, { x: 300, y: 379, pressure: 0.63 })
  assert.deepEqual(viewport.screenToCanvasPoint(screenPoint, transform), canvasPoint)
})

test('panning changes only viewport offsets and keeps the zoom unchanged', () => {
  const initial = { scale: 1.4, offsetX: 12, offsetY: -30 }
  assert.deepEqual(viewport.panViewport(initial, 85, -42), { scale: 1.4, offsetX: 97, offsetY: -72 })
  assert.deepEqual(initial, { scale: 1.4, offsetX: 12, offsetY: -30 })
})

test('viewport panning is clamped to fixed workspace edges at normal zoom', () => {
  const base = { scale: 1, offsetX: 0, offsetY: 0 }
  const beyondRightAndTop = viewport.clampViewportToBounds(viewport.panViewport(base, -100000, 100000), 800, 600)
  assert.deepEqual(beyondRightAndTop, { scale: 1, offsetX: 800 - (viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH), offsetY: -viewport.WORKSPACE_BOUNDS.y })
  const beyondLeftAndBottom = viewport.clampViewportToBounds(viewport.panViewport(base, 100000, -100000), 800, 600)
  assert.deepEqual(beyondLeftAndBottom, { scale: 1, offsetX: -viewport.WORKSPACE_BOUNDS.x, offsetY: 600 - (viewport.WORKSPACE_BOUNDS.y + viewport.WORKSPACE_HEIGHT) })
})

test('viewport centers the fixed workspace when zoomed out farther than its bounds', () => {
  const zoomedOut = { scale: 0.1, offsetX: 10000, offsetY: -10000 }
  const centered = viewport.clampViewportToBounds(zoomedOut, 800, 600)
  assert.deepEqual(centered, {
    scale: 0.1,
    offsetX: 400 - (viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH / 2) * 0.1,
    offsetY: 300 - (viewport.WORKSPACE_BOUNDS.y + viewport.WORKSPACE_HEIGHT / 2) * 0.1,
  })
  const worldCenter = viewport.screenToCanvasPoint({ x: 400, y: 300, pressure: 1 }, centered)
  assert.ok(Math.abs(worldCenter.x - (viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH / 2)) < 1e-9)
  assert.equal(worldCenter.y, viewport.WORKSPACE_BOUNDS.y + viewport.WORKSPACE_HEIGHT / 2)
  assert.equal(worldCenter.pressure, 1)
})

test('minimap navigation clamps requests to the fixed workspace and keeps the viewport inside', () => {
  const viewportBefore = { scale: 1, offsetX: 0, offsetY: 0 }
  const requestedOutsidePoint = { x: viewport.WORKSPACE_WIDTH + 9000, y: -6000, pressure: 1 }
  const centered = viewport.centerViewportOnPoint(viewportBefore, requestedOutsidePoint, 800, 600)
  assert.deepEqual(centered, {
    scale: 1,
    offsetX: 800 - (viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH),
    offsetY: -viewport.WORKSPACE_BOUNDS.y,
  })
  assert.deepEqual(viewportBefore, { scale: 1, offsetX: 0, offsetY: 0 })
})

test('new pen segments are clipped at workspace edges and outside-only segments are rejected', () => {
  const workspaceRight = viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_BOUNDS.width
  const insideStart = { x: workspaceRight - 12, y: 200, pressure: 0.4 }
  const outsideEnd = { x: workspaceRight + 88, y: 300, pressure: 1 }
  assert.equal(viewport.isPointWithinBounds(insideStart), true)
  assert.equal(viewport.isPointWithinBounds(outsideEnd), false)
  assert.equal(viewport.isPointWithinBounds({ x: workspaceRight + 0.01, y: 300, pressure: 1 }), false)
  const clipped = viewport.clipSegmentToBounds(insideStart, outsideEnd)
  assert.equal(clipped.x, workspaceRight)
  assert.equal(clipped.y, 212)
  assert.ok(Math.abs(clipped.pressure - 0.472) < 1e-12)
  assert.equal(viewport.clipSegmentToBounds(
    { x: viewport.WORKSPACE_BOUNDS.x - 20, y: viewport.WORKSPACE_BOUNDS.y - 20, pressure: 1 },
    { x: viewport.WORKSPACE_BOUNDS.x - 5, y: viewport.WORKSPACE_BOUNDS.y - 5, pressure: 1 },
  ), null)
  assert.deepEqual(viewport.clampPointToBounds(outsideEnd), { x: workspaceRight, y: 300, pressure: 1 })
})

test('selection translation is constrained without changing the selected objects coordinates', () => {
  const itemBounds = { x: viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH - 100, y: 40, width: 100, height: 80 }
  assert.deepEqual(viewport.clampTranslationToBounds(itemBounds, 600, -200), { dx: 0, dy: -115 })
  assert.deepEqual(itemBounds, { x: viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH - 100, y: 40, width: 100, height: 80 })
})

test('pinch zoom keeps its starting finger midpoint anchored', () => {
  const initial = { scale: 1, offsetX: 0, offsetY: 0 }
  const startCenter = { x: 100, y: 120 }
  const zoomed = viewport.zoomTwoFingerViewport(initial, startCenter, 80, 160)
  assert.deepEqual(zoomed, { scale: 2, offsetX: -100, offsetY: -120 })
  assert.deepEqual(viewport.canvasToScreenPoint(startCenter, zoomed), startCenter)
})

test('zoom limits are enforced while keeping the pinch center anchored', () => {
  const initial = { scale: 1, offsetX: 0, offsetY: 0 }
  const center = { x: 75, y: 90 }
  assert.equal(viewport.zoomViewportAt(initial, 10, center).scale, viewport.MAX_ZOOM)
  assert.equal(viewport.zoomViewportAt(initial, 0.01, center).scale, viewport.MIN_ZOOM)
  const limitedPinch = viewport.zoomTwoFingerViewport(initial, center, 100, 900)
  assert.equal(limitedPinch.scale, viewport.MAX_ZOOM)
  assert.deepEqual(viewport.canvasToScreenPoint(center, limitedPinch), center)
})

test('three-finger pan moves horizontally and vertically without changing zoom', () => {
  const startCenter = { x: 120, y: 160, pressure: 1 }
  const initial = { scale: 1.25, offsetX: -50, offsetY: 25 }
  assert.deepEqual(viewport.panThreeFingerViewport(initial, startCenter, { x: 150, y: 140, pressure: 1 }), {
    scale: 1.25,
    offsetX: -20,
    offsetY: 5,
  })
})

test('touch counts keep pinch, three-finger pan, and unrelated touch counts separate', () => {
  assert.equal(viewport.getTouchNavigationGestureMode(2), 'pinch-zoom')
  assert.equal(viewport.getTouchNavigationGestureMode(3), 'three-finger-pan')
  assert.equal(viewport.getTouchNavigationGestureMode(1), null)
  assert.equal(viewport.getTouchNavigationGestureMode(4), null)
})

test('two-finger pinch zooms around its starting midpoint and never pans with midpoint drift', () => {
  const startCenter = { x: 120, y: 160, pressure: 1 }
  const initial = { scale: 1, offsetX: 0, offsetY: 0 }
  const noDistanceChange = viewport.zoomTwoFingerViewport(initial, startCenter, 100, 100)
  assert.deepEqual(noDistanceChange, initial)
  const zoomed = viewport.zoomTwoFingerViewport(initial, startCenter, 100, 150)
  assert.deepEqual(zoomed, { scale: 1.5, offsetX: -60, offsetY: -80 })
  assert.deepEqual(viewport.canvasToScreenPoint(startCenter, zoomed), startCenter)
})

test('white sheet changes size without rebasing existing canvas coordinates and has five-percent margins', () => {
  assert.deepEqual([viewport.SHEET_WIDTH, viewport.SHEET_HEIGHT], [2500, 1500])
  assert.deepEqual(viewport.SHEET_BOUNDS, { x: 0, y: 0, width: 2500, height: 1500 })
  assert.deepEqual([viewport.WORKSPACE_WIDTH, viewport.WORKSPACE_HEIGHT], [2750, 1650])
  assert.deepEqual(viewport.WORKSPACE_BOUNDS, { x: -125, y: -75, width: 2750, height: 1650 })
  assert.equal(viewport.WORKSPACE_MARGIN_X, viewport.SHEET_WIDTH * 0.05)
  assert.equal(viewport.WORKSPACE_MARGIN_Y, viewport.SHEET_HEIGHT * 0.05)
  assert.equal(viewport.isPointWithinBounds({ x: -80, y: -40, pressure: 1 }), true)
  assert.equal(viewport.isPointWithinBounds({ x: -126, y: -40, pressure: 1 }), false)
  assert.equal(viewport.isPointWithinBounds({ x: 2600, y: 1540, pressure: 1 }), true)
  assert.equal(viewport.isPointWithinBounds({ x: 2626, y: 1540, pressure: 1 }), false)
  const legacyPoint = { x: 640, y: 480, pressure: 0.8 }
  assert.deepEqual(viewport.screenToCanvasPoint(viewport.canvasToScreenPoint(legacyPoint, { scale: 1.25, offsetX: -40, offsetY: 25 }), { scale: 1.25, offsetX: -40, offsetY: 25 }), legacyPoint)
  assert.equal(viewport.DEFAULT_ZOOM, 1)
})

test('fit canvas centers the sheet and its gray margin inside the viewport', () => {
  const fitted = viewport.fitViewportToBounds(viewport.WORKSPACE_BOUNDS, 1200, 800, 40)
  const topLeft = viewport.canvasToScreenPoint({ x: viewport.WORKSPACE_BOUNDS.x, y: viewport.WORKSPACE_BOUNDS.y, pressure: 1 }, fitted)
  const bottomRight = viewport.canvasToScreenPoint({ x: viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH, y: viewport.WORKSPACE_BOUNDS.y + viewport.WORKSPACE_HEIGHT, pressure: 1 }, fitted)
  assert.ok(topLeft.x >= 40 - 1e-9 && topLeft.y >= 40 - 1e-9)
  assert.ok(bottomRight.x <= 1160 + 1e-9 && bottomRight.y <= 760 + 1e-9)
  assert.ok(Math.abs(topLeft.x + bottomRight.x - 1200) < 1e-9)
  assert.ok(Math.abs(topLeft.y + bottomRight.y - 800) < 1e-9)
})

test('fit drawing centers content bounds without changing the drawing coordinate space', () => {
  const bounds = { x: 350, y: 420, width: 500, height: 260 }
  const fitted = viewport.fitViewportToBounds(bounds, 1000, 700, 48)
  const topLeft = viewport.canvasToScreenPoint({ x: bounds.x, y: bounds.y, pressure: 1 }, fitted)
  const bottomRight = viewport.canvasToScreenPoint({ x: bounds.x + bounds.width, y: bounds.y + bounds.height, pressure: 1 }, fitted)
  assert.ok(topLeft.x >= 48 && topLeft.y >= 48)
  assert.ok(bottomRight.x <= 952 && bottomRight.y <= 652)
  assert.ok(Math.abs(topLeft.x + bottomRight.x - 1000) < 1e-9)
  assert.ok(Math.abs(topLeft.y + bottomRight.y - 700) < 1e-9)
  assert.deepEqual(bounds, { x: 350, y: 420, width: 500, height: 260 })
})

test('minimap points map back into workspace coordinates including negative margin coordinates', () => {
  const geometry = viewport.getMinimapGeometry(220, 150)
  const center = { x: geometry.offsetX + (viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH / 2) * geometry.scale, y: geometry.offsetY + (viewport.WORKSPACE_BOUNDS.y + viewport.WORKSPACE_HEIGHT / 2) * geometry.scale, pressure: 1 }
  const mapped = viewport.minimapToCanvasPoint(center, geometry)
  assert.ok(Math.abs(mapped.x - (viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH / 2)) < 1e-9)
  assert.equal(mapped.y, viewport.WORKSPACE_BOUNDS.y + viewport.WORKSPACE_HEIGHT / 2)
})

test('workspace minimap geometry stays fixed and clips off-workspace drawing coordinates', () => {
  const bounds = viewport.WORKSPACE_BOUNDS
  assert.deepEqual(bounds, { x: -125, y: -75, width: 2750, height: 1650 })
  const geometry = viewport.getMinimapGeometry(220, 150, bounds)
  const outsideDrawing = { x: viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH + 240, y: 1600, pressure: 1 }
  const mapped = {
    x: outsideDrawing.x * geometry.scale + geometry.offsetX,
    y: outsideDrawing.y * geometry.scale + geometry.offsetY,
    pressure: outsideDrawing.pressure,
  }
  assert.equal(viewport.isPointWithinBounds(outsideDrawing), false)
  assert.ok(mapped.x > geometry.offsetX + (viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH) * geometry.scale)
  assert.ok(mapped.y < geometry.offsetY + viewport.WORKSPACE_BOUNDS.y * geometry.scale || mapped.y > geometry.offsetY + (viewport.WORKSPACE_BOUNDS.y + viewport.WORKSPACE_HEIGHT) * geometry.scale)
  const workspaceLeft = viewport.WORKSPACE_BOUNDS.x * geometry.scale + geometry.offsetX
  const workspaceRight = (viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH) * geometry.scale + geometry.offsetX
  const pageLeft = viewport.SHEET_BOUNDS.x * geometry.scale + geometry.offsetX
  const pageRight = (viewport.SHEET_BOUNDS.x + viewport.SHEET_WIDTH) * geometry.scale + geometry.offsetX
  assert.ok(pageLeft > workspaceLeft)
  assert.ok(pageRight < workspaceRight)
})

test('page overview keeps a fixed scale while workspace overview clips off-workspace drawings', () => {
  const inside = { kind: 'rectangle', id: 1, x: 120, y: 140, width: 180, height: 100, strokeColor: '#202124', strokeWidth: 4 }
  const outside = { kind: 'rectangle', id: 2, x: viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH + 5000, y: 100, width: 90, height: 60, strokeColor: '#3568d4', strokeWidth: 4 }
  const items = [inside, outside]
  const contentBounds = model.getCanvasSelectionBounds(items, new Set(items.map(model.canvasItemKey)))
  const workspaceBounds = viewport.WORKSPACE_BOUNDS
  assert.ok(inside.x >= workspaceBounds.x && inside.x + inside.width <= workspaceBounds.width)
  assert.ok(outside.x > workspaceBounds.x + workspaceBounds.width)
  assert.ok(contentBounds.x + contentBounds.width > workspaceBounds.x + workspaceBounds.width)

  const pageGeometry = viewport.getPageOverviewGeometry(112, 128)
  const samePageGeometry = viewport.getPageOverviewGeometry(112, 128)
  assert.deepEqual(pageGeometry, samePageGeometry)
  const insideMapPoint = viewport.canvasToScreenPoint({ x: inside.x, y: inside.y, pressure: 1 }, { scale: pageGeometry.scale, offsetX: pageGeometry.offsetX, offsetY: pageGeometry.offsetY })
  const outsideMapPoint = viewport.canvasToScreenPoint({ x: outside.x, y: outside.y, pressure: 1 }, { scale: pageGeometry.scale, offsetX: pageGeometry.offsetX, offsetY: pageGeometry.offsetY })
  assert.ok(insideMapPoint.x >= pageGeometry.offsetX && insideMapPoint.x <= pageGeometry.offsetX + viewport.SHEET_WIDTH * pageGeometry.scale)
  assert.ok(outsideMapPoint.x > pageGeometry.offsetX + viewport.SHEET_WIDTH * pageGeometry.scale)
})

test('collapsed and expanded navigator states keep fixed workspace navigation and reject off-page locations', () => {
  const item = { kind: 'rectangle', id: 7, x: viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH - 200, y: 800, width: 120, height: 90, strokeColor: '#202124', strokeWidth: 4 }
  const itemBounds = model.getCanvasSelectionBounds([item], new Set([model.canvasItemKey(item)]))
  assert.ok(itemBounds.x + itemBounds.width <= viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH)
  const bounds = viewport.WORKSPACE_BOUNDS
  const target = { x: item.x + item.width / 2, y: item.y + item.height / 2, pressure: 1 }

  for (const expanded of [false, true]) {
    assert.deepEqual(viewport.getNavigatorPanels(expanded), expanded ? ['workspace', 'page'] : ['workspace'])
    const mapHeight = expanded ? 128 : 108
    const geometry = viewport.getMinimapGeometry(220, mapHeight, bounds)
    const mapPoint = viewport.canvasToScreenPoint(target, { scale: geometry.scale, offsetX: geometry.offsetX, offsetY: geometry.offsetY })
    const navigatedPoint = viewport.minimapToCanvasPoint(mapPoint, geometry)
    assert.ok(Math.abs(navigatedPoint.x - target.x) < 1e-9)
    assert.ok(Math.abs(navigatedPoint.y - target.y) < 1e-9)
    const view = viewport.centerViewportOnPoint({ scale: 1, offsetX: 0, offsetY: 0 }, target, 900, 700)
    const topLeft = viewport.screenToCanvasPoint({ x: 0, y: 0, pressure: 1 }, view)
    const bottomRight = viewport.screenToCanvasPoint({ x: 900, y: 700, pressure: 1 }, view)
    assert.ok(topLeft.x >= viewport.WORKSPACE_BOUNDS.x && topLeft.y >= viewport.WORKSPACE_BOUNDS.y)
    assert.ok(bottomRight.x <= viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH && bottomRight.y <= viewport.WORKSPACE_BOUNDS.y + viewport.WORKSPACE_HEIGHT)
  }
  assert.equal(viewport.isPointWithinBounds({ x: viewport.WORKSPACE_BOUNDS.x + viewport.WORKSPACE_WIDTH + 1, y: 100, pressure: 1 }), false)
})

test('connector snapping, rectangle resizing, and history keep working after viewport transforms', () => {
  const transform = { scale: 1.6, offsetX: -105, offsetY: 47 }
  const rectangle = { kind: 'rectangle', id: 8, x: 100, y: 80, width: 120, height: 90, strokeColor: '#202124', strokeWidth: 4 }
  const originalPoint = { x: 220, y: 125, pressure: 0.7 }
  const penPoint = viewport.screenToCanvasPoint(viewport.canvasToScreenPoint(originalPoint, transform), transform)
  const snapped = model.snapConnectorEndpoint(penPoint, [rectangle])
  assert.deepEqual(snapped.point, originalPoint)
  assert.deepEqual(snapped.attachment, { rectangleId: rectangle.id, offsetX: 120, offsetY: 45 })

  const connector = model.createConnector(3, snapped.point, { x: 400, y: 160, pressure: 1 }, '#3568d4', 4, snapped.attachment)
  const originalItems = [rectangle, connector]
  const history = new model.CanvasSnapshotHistory()
  const start = viewport.canvasToScreenPoint({ x: 220, y: 170, pressure: 1 }, transform)
  const end = viewport.canvasToScreenPoint({ x: 250, y: 190, pressure: 1 }, transform)
  const startCanvas = viewport.screenToCanvasPoint(start, transform)
  const endCanvas = viewport.screenToCanvasPoint(end, transform)
  const bounds = model.getResizedRectangleBounds(rectangle, 'se', endCanvas.x - startCanvas.x, endCanvas.y - startCanvas.y)
  const resized = model.resizeRectangleItems(originalItems, rectangle.id, bounds)
  history.record(originalItems)
  assert.deepEqual(resized[1].start, { x: 250, y: 135, pressure: 0.7 })
  assert.equal(resized[1].startAttachment.rectangleId, rectangle.id)
  assert.ok(Math.abs(resized[1].startAttachment.offsetX - 150) < 1e-9)
  assert.ok(Math.abs(resized[1].startAttachment.offsetY - 55) < 1e-9)
  assert.deepEqual(history.undo(resized), originalItems)
  assert.deepEqual(history.redo(originalItems), resized)
})
