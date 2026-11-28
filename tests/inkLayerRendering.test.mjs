import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { readAppSource } from './helpers/appSource.mjs'

const appSource = await readAppSource()
const modelSource = await readFile(new URL('../src/canvasModel.ts', import.meta.url), 'utf8')
const modelOutput = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const model = await import(`data:text/javascript;base64,${Buffer.from(modelOutput).toString('base64')}`)

test('main canvas keeps the page background separate from ink compositing', () => {
  assert.match(appSource, /function getReusableCanvasLayer\(/)
  assert.match(appSource, /if \(!layerRef\.current\) \{\s*layerRef\.current = document\.createElement\('canvas'\)/)
  assert.match(appSource, /const inkLayer = getReusableCanvasLayer\(inkLayerRef, canvas\.width, canvas\.height\)/)
  assert.match(appSource, /drawStroke[\s\S]*?ctx\.globalCompositeOperation = stroke\.erase \? 'destination-out' : 'source-over'/)
  assert.match(appSource, /canvasItemsForRendering\(routeConnectors\(items\)\)\.forEach\(\(item\) => \{ if \(!isItemVisible\(item, view\)\) return; if \(\(editingTextId === null \|\| item\.kind !== 'text' \|\| item\.id !== editingTextId\) && \(editingCodeId === null \|\| item\.kind !== 'code' \|\| item\.id !== editingCodeId\)\) drawItem\(target, item\) \}\)/)
  assert.match(appSource, /drawItem\(target, preview \?\? activeStrokeRef\.current\)/)
  assert.match(appSource, /ctx\.drawImage\(inkLayer, 0, 0\)/)
  const renderAll = appSource.slice(appSource.indexOf('const renderAll = useCallback'), appSource.indexOf('const applyViewport'))
  assert.match(renderAll, /applySheetLayer\(sheetLayer, sheetLayerAppliedRef\.current/)
  assert.doesNotMatch(renderAll, /ctx\.fillRect\(SHEET_BOUNDS/)
  assert.doesNotMatch(renderAll, /shadowBlur|createPattern/)
  assert.ok(renderAll.indexOf('ctx.clearRect(0, 0, canvas.width, canvas.height)') < renderAll.indexOf('ctx.drawImage(inkLayer, 0, 0)'))
})

test('eraser strokes remain localized paths, preserving ink outside the erased segment', () => {
  const original = {
    kind: 'stroke',
    id: 10,
    points: [{ x: 10, y: 20, pressure: 0.5 }, { x: 40, y: 20, pressure: 0.5 }],
    color: '#202124',
    width: 4,
    erase: false,
  }
  const partialErase = {
    kind: 'stroke',
    id: 11,
    points: [{ x: 22, y: 20, pressure: 0 }, { x: 28, y: 20, pressure: 0 }],
    color: '#202124',
    width: 14,
    erase: true,
  }
  const beforeErase = [original]
  const afterErase = [...beforeErase, partialErase]
  const history = new model.CanvasSnapshotHistory()
  history.record(beforeErase)

  assert.equal(afterErase[0].points.length, 2)
  assert.deepEqual(afterErase[1].points.map(({ x }) => x), [22, 28])
  assert.deepEqual(history.undo(afterErase), beforeErase)
  assert.deepEqual(history.redo(beforeErase), afterErase)
})

test('connectors and shapes render on the same ink layer and remain in history snapshots', () => {
  assert.match(appSource, /canvasItemsForRendering\(routeConnectors\(items\)\)\.forEach\(\(item\) => \{ if \(!isItemVisible\(item, view\)\) return; if \(\(editingTextId === null \|\| item\.kind !== 'text' \|\| item\.id !== editingTextId\) && \(editingCodeId === null \|\| item\.kind !== 'code' \|\| item\.id !== editingCodeId\)\) drawItem\(target, item\) \}\)/)
  const rectangle = { kind: 'rectangle', id: 1, x: 20, y: 20, width: 100, height: 70, strokeColor: '#202124', strokeWidth: 3 }
  const connector = { kind: 'connector', id: 2, start: { x: 120, y: 55 }, end: { x: 200, y: 55 }, strokeColor: '#202124', strokeWidth: 3, relationshipType: 'association', reversed: false }
  const beforeMove = [rectangle, connector]
  const history = new model.CanvasSnapshotHistory()
  history.record(beforeMove)
  const afterMove = [
    { ...rectangle, x: 40 },
    { ...connector, start: { x: 140, y: 55 } },
  ]

  assert.deepEqual(history.undo(afterMove), beforeMove)
  assert.deepEqual(history.redo(beforeMove), afterMove)
})

test('workspace map composites erased item rendering over its own background and the page overview is gone', () => {
  const navigatorStart = appSource.indexOf('const renderNavigator = useCallback')
  const renderAllStart = appSource.indexOf('const renderAll = useCallback')
  const navigator = appSource.slice(navigatorStart, renderAllStart)

  assert.match(navigator, /drawMinimapItems\(inkContext, geometry\)/)
  assert.match(navigator, /getReusableCanvasLayer\(minimapInkLayerRef, pixelWidth, pixelHeight\)/)
  assert.match(navigator, /ctx\.fillStyle = '#e9ebf0'[\s\S]*?ctx\.fillStyle = PAGE_BACKGROUND_COLORS\[pageBackground\][\s\S]*?drawPageTemplateOverview\(ctx, canvasType,[\s\S]*?ctx\.drawImage\(inkLayer, 0, 0\)/)
  assert.match(appSource, /ctx\.globalCompositeOperation = item\.erase \? 'destination-out' : 'source-over'/)
  assert.doesNotMatch(appSource, /renderPageOverview|pageOverviewRef|navigator-page-section|Expand page overview/)
})
