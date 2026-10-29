import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const modelSource = await readFile(new URL('../src/canvasModel.ts', import.meta.url), 'utf8')
const modelOutput = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const modelUrl = `data:text/javascript;base64,${Buffer.from(modelOutput).toString('base64')}`
const model = await import(modelUrl)
const lassoSource = await readFile(new URL('../src/lassoSelection.ts', import.meta.url), 'utf8')
const lassoOutput = ts.transpileModule(lassoSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("from './canvasModel'", `from '${modelUrl}'`)
const lasso = await import(`data:text/javascript;base64,${Buffer.from(lassoOutput).toString('base64')}`)
const rectangle = (id, x, y, width, height) => ({ kind: 'rectangle', id, x, y, width, height, strokeColor: '#202124', strokeWidth: 4 })
const stroke = (id, points, shape) => ({ kind: 'stroke', id, points: points.map(([x, y]) => ({ x, y, pressure: 1 })), color: '#202124', width: 4, erase: false, shape })
const square = [[0, 0], [200, 0], [200, 200], [0, 200]].map(([x, y]) => ({ x, y, pressure: 1 }))

test('selects freehand strokes by path length, including strokes that extend beyond the loop', () => {
  const items = [stroke(1, [[-40, 100], [130, 100], [180, 100]])]
  assert.deepEqual(lasso.selectItemsByLasso(items, square), ['stroke:1'])
})

test('does not select a freehand stroke when half or less of its path is inside', () => {
  const items = [stroke(1, [[-100, 100], [100, 100]])]
  assert.deepEqual(lasso.selectItemsByLasso(items, square), [])
})

test('selects recognized rectangles as complete objects by their center', () => {
  const items = [rectangle(4, 20, 20, 160, 160), rectangle(5, 160, 160, 100, 100)]
  assert.deepEqual(lasso.selectItemsByLasso(items, square), ['rectangle:4'])
})

test('requires recognized relationship lines and arrows to be fully enclosed', () => {
  const items = [
    stroke(1, [[-30, 100], [150, 100]], 'line'),
    stroke(2, [[20, 120], [170, 120]], 'line'),
    stroke(3, [[-30, 140], [150, 140]], 'arrow'),
  ]
  assert.deepEqual(lasso.selectItemsByLasso(items, square), ['stroke:2'])
})

test('translates every selected item by the same offset and leaves other items unchanged', () => {
  const items = [rectangle(1, 10, 20, 40, 50), stroke(2, [[15, 25], [25, 35]]), stroke(3, [[300, 300], [310, 310]])]
  const moved = model.translateSelectedItems(items, new Set(['rectangle:1', 'stroke:2']), 17, -9)
  assert.deepEqual(moved[0], { ...items[0], x: 27, y: 11 })
  assert.deepEqual(moved[1].points.map(({ x, y }) => [x, y]), [[32, 16], [42, 26]])
  assert.equal(moved[2], items[2])
})

test('snapshot history restores and reapplies the complete lasso movement', () => {
  const history = new model.CanvasSnapshotHistory()
  const original = [rectangle(1, 10, 20, 40, 50), stroke(2, [[15, 25], [25, 35]])]
  history.record(original)
  const moved = model.translateSelectedItems(original, new Set(['rectangle:1', 'stroke:2']), 17, -9)
  const undone = history.undo(moved)
  assert.deepEqual(undone, original)
  const redone = history.redo(undone)
  assert.deepEqual(redone, moved)
})

test('creates a connector item with its endpoints, color, and stroke width', () => {
  const start = { x: 20, y: 30, pressure: 0.7 }
  const end = { x: 180, y: 130, pressure: 0.8 }
  assert.deepEqual(model.createConnector(9, start, end, '#3568d4', 7), {
    kind: 'connector',
    id: 9,
    start,
    end,
    strokeColor: '#3568d4',
    strokeWidth: 7,
    relationshipType: 'association',
    reversed: false,
  })
})

test('lasso selects a fully enclosed connector but ignores one that only crosses the loop', () => {
  const inside = model.createConnector(1, { x: 30, y: 40, pressure: 1 }, { x: 160, y: 160, pressure: 1 }, '#202124', 4)
  const crossing = model.createConnector(2, { x: -40, y: 100, pressure: 1 }, { x: 140, y: 100, pressure: 1 }, '#202124', 4)
  const endpointOutside = model.createConnector(3, { x: -1, y: 100, pressure: 1 }, { x: 140, y: 100, pressure: 1 }, '#202124', 4)
  assert.deepEqual(lasso.selectItemsByLasso([inside, crossing, endpointOutside], square), ['connector:1'])
})

test('connector hit testing follows its line instead of its bounding box', () => {
  const connector = model.createConnector(1, { x: 20, y: 20, pressure: 1 }, { x: 180, y: 180, pressure: 1 }, '#202124', 4)
  assert.equal(lasso.itemHitTest(connector, { x: 100, y: 100, pressure: 1 }), true)
  assert.equal(lasso.itemHitTest(connector, { x: 100, y: 20, pressure: 1 }), false)
})

test('connector selection hit testing includes relationship arrowheads and diamonds', () => {
  const start = { x: 20, y: 80, pressure: 1 }
  const end = { x: 220, y: 80, pressure: 1 }
  const inheritance = model.createConnector(1, start, end, '#202124', 4, undefined, undefined, 'inheritance')
  const aggregation = model.createConnector(2, start, end, '#202124', 4, undefined, undefined, 'aggregation')
  assert.equal(lasso.itemHitTest(inheritance, { x: 210, y: 80, pressure: 1 }), true)
  assert.equal(lasso.itemHitTest(aggregation, { x: 30, y: 80, pressure: 1 }), true)
})

test('moves a selected connector by the exact offset while leaving other items intact', () => {
  const connector = model.createConnector(1, { x: 20, y: 30, pressure: 0.7 }, { x: 180, y: 130, pressure: 0.8 }, '#3568d4', 7)
  const unrelated = stroke(2, [[400, 400], [450, 450]])
  const moved = model.translateSelectedItems([connector, unrelated], new Set(['connector:1']), -15, 23)
  assert.deepEqual(moved[0].start, { x: 5, y: 53, pressure: 0.7 })
  assert.deepEqual(moved[0].end, { x: 165, y: 153, pressure: 0.8 })
  assert.equal(moved[0].strokeColor, '#3568d4')
  assert.equal(moved[0].strokeWidth, 7)
  assert.equal(moved[1], unrelated)
})

test('moving a connector cannot translate its two rectangle-locked endpoints', () => {
  const left = rectangle(1, 20, 40, 100, 80)
  const right = rectangle(2, 240, 60, 120, 90)
  const connector = model.createConnector(3,
    { x: 120, y: 80, pressure: 0.7 }, { x: 240, y: 105, pressure: 0.8 }, '#202124', 4,
    { rectangleId: left.id, offsetX: 100, offsetY: 40 }, { rectangleId: right.id, offsetX: 0, offsetY: 45 })
  const moved = model.translateSelectedItems([left, right, connector], new Set(['connector:3']), 15, 20)[2]
  assert.deepEqual(moved.start, connector.start)
  assert.deepEqual(moved.end, connector.end)
  assert.deepEqual(moved.startAttachment, connector.startAttachment)
  assert.deepEqual(moved.endAttachment, connector.endAttachment)
  assert.equal(moved, connector)
})

test('moving a connector keeps its attached endpoint fixed and translates a free endpoint exactly', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 220, y: 180, pressure: 1 }, '#202124', 4,
    { rectangleId: box.id, offsetX: 100, offsetY: 40 })
  const moved = model.translateSelectedItems([box, connector], new Set(['connector:2']), 15, 20)[1]
  assert.deepEqual(moved.start, connector.start)
  assert.deepEqual(moved.startAttachment, connector.startAttachment)
  assert.deepEqual(moved.end, { x: 235, y: 200, pressure: 1 })
  assert.equal(moved.endAttachment, undefined)
})

test('undo and redo of moving a connector preserve endpoint attachment IDs and anchors', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 220, y: 180, pressure: 1 }, '#202124', 4,
    { rectangleId: box.id, offsetX: 100, offsetY: 40 }, undefined, 'dependency')
  const original = [box, connector]
  const history = new model.CanvasSnapshotHistory()
  history.record(original)
  const moved = model.translateSelectedItems(original, new Set(['connector:2']), 15, 20)
  assert.deepEqual(history.undo(moved), original)
  const redone = history.redo(original)
  assert.deepEqual(redone, moved)
  assert.equal(redone[1].startAttachment.rectangleId, box.id)
  assert.deepEqual(redone[1].startAttachment, { rectangleId: box.id, offsetX: 100, offsetY: 40 })
})

test('changing a relationship type does not unlock connector endpoint anchors', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 220, y: 180, pressure: 1 }, '#202124', 4,
    { rectangleId: box.id, offsetX: 100, offsetY: 40 }, undefined, 'inheritance')
  const updated = model.updateConnectorRelationship([box, connector], connector.id, 'composition')
  const moved = model.translateSelectedItems(updated, new Set(['connector:2']), 18, -12)
  assert.deepEqual(moved[1].start, connector.start)
  assert.deepEqual(moved[1].startAttachment, connector.startAttachment)
  assert.equal(moved[1].relationshipType, 'composition')
})

test('resize handle hit testing recognizes rectangle corners and edge midpoints', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  assert.equal(model.hitTestRectangleResizeHandle(box, { x: 20, y: 40, pressure: 1 }), 'nw')
  assert.equal(model.hitTestRectangleResizeHandle(box, { x: 120, y: 80, pressure: 1 }), 'e')
  assert.equal(model.hitTestRectangleResizeHandle(box, { x: 70, y: 80, pressure: 1 }), null)
})

test('resizing a rectangle updates its dimensions and keeps attached connectors on the boundary', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const otherBox = rectangle(2, 300, 40, 100, 80)
  const connector = model.createConnector(3,
    { x: 120, y: 80, pressure: 0.7 }, { x: 300, y: 80, pressure: 0.8 }, '#3568d4', 4,
    { rectangleId: box.id, offsetX: 100, offsetY: 40 }, { rectangleId: otherBox.id, offsetX: 0, offsetY: 40 })
  const bounds = model.getResizedRectangleBounds(box, 'e', 25, 0)
  assert.deepEqual(bounds, { x: 20, y: 40, width: 125, height: 80 })
  const resized = model.resizeRectangleItems([box, otherBox, connector], box.id, bounds)
  assert.deepEqual(resized[0], { ...box, width: 125 })
  assert.deepEqual(resized[2].start, { x: 145, y: 80, pressure: 0.7 })
  assert.deepEqual(resized[2].startAttachment, { rectangleId: box.id, offsetX: 125, offsetY: 40 })
  assert.deepEqual(resized[2].end, connector.end)
  assert.deepEqual(resized[2].endAttachment, connector.endAttachment)
  assert.equal(resized[1], otherBox)
})

test('resize history undo and redo restore rectangle dimensions and attached endpoint anchors', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 240, y: 80, pressure: 1 }, '#202124', 4,
    { rectangleId: box.id, offsetX: 100, offsetY: 40 })
  const original = [box, connector]
  const history = new model.CanvasSnapshotHistory()
  history.record(original)
  const resized = model.resizeRectangleItems(original, box.id, model.getResizedRectangleBounds(box, 'se', 30, 20))
  assert.deepEqual(history.undo(resized), original)
  assert.deepEqual(history.redo(original), resized)
  assert.deepEqual(resized[1].startAttachment, { rectangleId: box.id, offsetX: 130, offsetY: 50 })
  assert.deepEqual(resized[1].start, { x: 150, y: 90, pressure: 1 })
})

test('lasso group bounds include selected rectangles, handwriting, and connectors', () => {
  const first = rectangle(1, 20, 40, 100, 80)
  const second = rectangle(2, 220, 60, 100, 100)
  const writing = stroke(4, [[120, 100], [150, 110]])
  const connector = model.createConnector(3,
    { x: 120, y: 80, pressure: 1 }, { x: 220, y: 110, pressure: 1 }, '#202124', 4,
    { rectangleId: first.id, offsetX: 100, offsetY: 40 }, { rectangleId: second.id, offsetX: 0, offsetY: 50 })
  const selection = new Set(['rectangle:1', 'rectangle:2', 'stroke:4', 'connector:3'])
  assert.deepEqual(model.getCanvasSelectionBounds([first, second, writing, connector], selection), {
    x: 18, y: 38, width: 304, height: 124,
  })
})

test('collective lasso resizing scales rectangles, handwriting, and connectors together', () => {
  const first = rectangle(1, 20, 40, 100, 80)
  const second = rectangle(2, 220, 60, 100, 100)
  const writing = stroke(4, [[120, 100], [150, 110]])
  const connector = model.createConnector(3,
    { x: 120, y: 80, pressure: 1 }, { x: 220, y: 110, pressure: 1 }, '#3568d4', 4,
    { rectangleId: first.id, offsetX: 100, offsetY: 40 }, { rectangleId: second.id, offsetX: 0, offsetY: 50 }, 'inheritance')
  const unrelated = stroke(5, [[500, 500], [520, 520]])
  const items = [first, second, writing, connector, unrelated]
  const selection = new Set(['rectangle:1', 'rectangle:2', 'stroke:4', 'connector:3'])
  const newBounds = { x: 18, y: 38, width: 608, height: 248 }
  const resized = model.resizeSelectedItems(items, selection, newBounds)

  assert.deepEqual(resized[0], { ...first, x: 22, y: 42, width: 200, height: 160, strokeWidth: 8 })
  assert.deepEqual(resized[1], { ...second, x: 422, y: 82, width: 200, height: 200, strokeWidth: 8 })
  assert.deepEqual(resized[2].points.map(({ x, y }) => [x, y]), [[222, 162], [282, 182]])
  assert.equal(resized[2].width, 8)
  assert.deepEqual(resized[3].start, { x: 222, y: 122, pressure: 1 })
  assert.deepEqual(resized[3].end, { x: 422, y: 182, pressure: 1 })
  assert.deepEqual(resized[3].startAttachment, { rectangleId: first.id, offsetX: 200, offsetY: 80 })
  assert.deepEqual(resized[3].endAttachment, { rectangleId: second.id, offsetX: 0, offsetY: 100 })
  assert.equal(resized[3].relationshipType, 'inheritance')
  assert.equal(resized[4], unrelated)
})

test('group resize updates attached connectors even when they are outside the lasso selection', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 300, y: 80, pressure: 1 }, '#202124', 4,
    { rectangleId: box.id, offsetX: 100, offsetY: 40 })
  const writing = stroke(3, [[50, 60], [70, 80]])
  const items = [box, connector, writing]
  const selection = new Set(['rectangle:1', 'stroke:3'])
  const resized = model.resizeSelectedItems(items, selection, { x: 18, y: 38, width: 208, height: 168 })
  assert.deepEqual(resized[0], { ...box, x: 22, y: 42, width: 200, height: 160, strokeWidth: 8 })
  assert.deepEqual(resized[1].start, { x: 222, y: 122, pressure: 1 })
  assert.deepEqual(resized[1].startAttachment, { rectangleId: box.id, offsetX: 200, offsetY: 80 })
  assert.equal(resized[1].end.x, connector.end.x)
  assert.deepEqual(resized[2].points.map(({ x, y }) => [x, y]), [[82, 82], [122, 122]])
})

test('group resize undo and redo restore all objects and attached connector anchors', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const writing = stroke(3, [[50, 60], [70, 80]])
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 300, y: 80, pressure: 1 }, '#202124', 4,
    { rectangleId: box.id, offsetX: 100, offsetY: 40 })
  const original = [box, connector, writing]
  const history = new model.CanvasSnapshotHistory()
  history.record(original)
  const selection = new Set(['rectangle:1', 'stroke:3'])
  const resized = model.resizeSelectedItems(original, selection, { x: 18, y: 38, width: 208, height: 168 })
  assert.deepEqual(history.undo(resized), original)
  assert.deepEqual(history.redo(original), resized)
  assert.deepEqual(resized[1].startAttachment, { rectangleId: box.id, offsetX: 200, offsetY: 80 })
})

test('snapshot history undoes and redoes a connector movement and creation', () => {
  const history = new model.CanvasSnapshotHistory()
  const connector = model.createConnector(1, { x: 20, y: 30, pressure: 1 }, { x: 180, y: 130, pressure: 1 }, '#202124', 4)
  history.record([])
  const created = [connector]
  assert.deepEqual(history.undo(created), [])
  assert.deepEqual(history.redo([]), created)

  history.record(created)
  const moved = model.translateSelectedItems(created, new Set(['connector:1']), 11, -8)
  assert.deepEqual(history.undo(moved), created)
  assert.deepEqual(history.redo(created), moved)
})

test('snaps an endpoint to the nearest rectangle boundary within the S Pen tolerance', () => {
  const box = rectangle(7, 100, 100, 120, 80)
  const snapped = model.snapConnectorEndpoint({ x: 155, y: 94, pressure: 0.6 }, [box])
  assert.deepEqual(snapped, {
    point: { x: 155, y: 100, pressure: 0.6 },
    attachment: { rectangleId: 7, offsetX: 55, offsetY: 0 },
  })
  assert.equal(model.snapConnectorEndpoint({ x: 260, y: 200, pressure: 1 }, [box]), null)
})

test('connectors can attach both endpoints to separate rectangle boundaries', () => {
  const left = rectangle(1, 20, 40, 100, 80)
  const right = rectangle(2, 240, 60, 120, 90)
  const start = model.snapConnectorEndpoint({ x: 117, y: 80, pressure: 1 }, [left, right])
  const end = model.snapConnectorEndpoint({ x: 244, y: 105, pressure: 1 }, [left, right])
  assert.deepEqual(start?.point, { x: 120, y: 80, pressure: 1 })
  assert.deepEqual(end?.point, { x: 240, y: 105, pressure: 1 })
  const connector = model.createConnector(3, start.point, end.point, '#3568d4', 4, start.attachment, end.attachment)
  assert.equal(connector.startAttachment.rectangleId, left.id)
  assert.equal(connector.endAttachment.rectangleId, right.id)
})

test('moving one attached rectangle updates only its endpoint and keeps the other attachment', () => {
  const left = rectangle(1, 20, 40, 100, 80)
  const right = rectangle(2, 240, 60, 120, 90)
  const connector = model.createConnector(3,
    { x: 120, y: 80, pressure: 1 }, { x: 240, y: 105, pressure: 1 }, '#e45b55', 7,
    { rectangleId: 1, offsetX: 100, offsetY: 40 }, { rectangleId: 2, offsetX: 0, offsetY: 45 })
  const moved = model.translateSelectedItems([left, right, connector], new Set(['rectangle:1']), 15, -10)
  assert.deepEqual(moved[0], { ...left, x: 35, y: 30 })
  assert.deepEqual(moved[2].start, { x: 135, y: 70, pressure: 1 })
  assert.deepEqual(moved[2].end, connector.end)
  assert.deepEqual(moved[2].endAttachment, connector.endAttachment)
  assert.equal(moved[2].strokeColor, '#e45b55')
  assert.equal(moved[2].strokeWidth, 7)
  assert.equal(moved[1], right)
})

test('moves a rectangle with one attached endpoint and one free endpoint', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 220, y: 140, pressure: 1 }, '#202124', 4,
    { rectangleId: 1, offsetX: 100, offsetY: 40 })
  const moved = model.translateSelectedItems([box, connector], new Set(['rectangle:1']), -12, 18)
  assert.deepEqual(moved[1].start, { x: 108, y: 98, pressure: 1 })
  assert.deepEqual(moved[1].end, connector.end)
  assert.deepEqual(moved[1].startAttachment, connector.startAttachment)
  assert.equal(moved[1].endAttachment, undefined)
})

test('creates a connector with one snapped endpoint and one freely placed endpoint', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const start = model.snapConnectorEndpoint({ x: 118, y: 80, pressure: 1 }, [box])
  const freeEnd = { x: 220, y: 180, pressure: 1 }
  assert.equal(model.snapConnectorEndpoint(freeEnd, [box]), null)
  const connector = model.createConnector(2, start.point, freeEnd, '#202124', 4, start.attachment)
  assert.equal(connector.startAttachment.rectangleId, 1)
  assert.equal(connector.endAttachment, undefined)
})

test('moves the opposite rectangle endpoint when that rectangle is selected', () => {
  const left = rectangle(1, 20, 40, 100, 80)
  const right = rectangle(2, 240, 60, 120, 90)
  const connector = model.createConnector(3,
    { x: 120, y: 80, pressure: 1 }, { x: 240, y: 105, pressure: 1 }, '#202124', 4,
    { rectangleId: 1, offsetX: 100, offsetY: 40 }, { rectangleId: 2, offsetX: 0, offsetY: 45 })
  const moved = model.translateSelectedItems([left, right, connector], new Set(['rectangle:2']), 20, 5)
  assert.deepEqual(moved[2].start, connector.start)
  assert.deepEqual(moved[2].end, { x: 260, y: 110, pressure: 1 })
  assert.deepEqual(moved[2].startAttachment, connector.startAttachment)
})

test('lasso movement updates attached connectors without moving unselected handwriting', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 240, y: 100, pressure: 1 }, '#202124', 4,
    { rectangleId: 1, offsetX: 100, offsetY: 40 })
  const writing = stroke(3, [[45, 60], [55, 70]])
  const moved = model.translateSelectedItems([box, connector, writing], new Set(['rectangle:1']), 30, 10)
  assert.deepEqual(moved[1].start, { x: 150, y: 90, pressure: 1 })
  assert.equal(moved[1].end.x, 240)
  assert.equal(moved[2], writing)
})

test('Select and Lasso rectangle key sets both update attachments in the common movement path', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 240, y: 100, pressure: 1 }, '#202124', 4,
    { rectangleId: 1, offsetX: 100, offsetY: 40 })
  const selectKeys = new Set(['rectangle:1'])
  const lassoKeys = new Set(lasso.selectItemsByLasso([box], square))
  for (const selectionKeys of [selectKeys, lassoKeys]) {
    const moved = model.translateSelectedItems([box, connector], selectionKeys, 8, 9)
    assert.deepEqual(moved[1].start, { x: 128, y: 89, pressure: 1 })
  }
})

test('deleting a rectangle detaches its connector endpoint without removing the connector', () => {
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 240, y: 100, pressure: 1 }, '#202124', 4,
    { rectangleId: 1, offsetX: 100, offsetY: 40 }, { rectangleId: 3, offsetX: 0, offsetY: 40 })
  const remaining = model.detachConnectorsFromRectangles([connector], new Set([1]))
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].startAttachment, undefined)
  assert.deepEqual(remaining[0].endAttachment, connector.endAttachment)
  assert.deepEqual(remaining[0].start, connector.start)
})

test('undo and redo of rectangle deletion restore and then clear connector attachment references', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 240, y: 100, pressure: 1 }, '#202124', 4,
    { rectangleId: 1, offsetX: 100, offsetY: 40 })
  const history = new model.CanvasSnapshotHistory()
  const original = [box, connector]
  history.record(original)
  const deleted = model.detachConnectorsFromRectangles([connector], new Set([box.id]))
  const afterDelete = [deleted[0]]
  assert.equal(afterDelete[0].startAttachment, undefined)
  const undone = history.undo(afterDelete)
  assert.deepEqual(undone, original)
  const redone = history.redo(undone)
  assert.deepEqual(redone, afterDelete)
})

test('snapshot undo and redo preserve rectangle movement and connector attachment metadata', () => {
  const box = rectangle(1, 20, 40, 100, 80)
  const connector = model.createConnector(2,
    { x: 120, y: 80, pressure: 1 }, { x: 240, y: 100, pressure: 1 }, '#202124', 4,
    { rectangleId: 1, offsetX: 100, offsetY: 40 })
  const history = new model.CanvasSnapshotHistory()
  const original = [box, connector]
  history.record(original)
  const moved = model.translateSelectedItems(original, new Set(['rectangle:1']), 20, -5)
  assert.deepEqual(history.undo(moved), original)
  assert.deepEqual(history.redo(original), moved)
})

test('renders all UML relationship types with the expected line and endpoint decoration', () => {
  const expected = {
    association: { lineStyle: 'solid', symbol: 'none', endpoint: null },
    inheritance: { lineStyle: 'solid', symbol: 'hollow-triangle', endpoint: 'end' },
    dependency: { lineStyle: 'dashed', symbol: 'open-arrow', endpoint: 'end' },
    aggregation: { lineStyle: 'solid', symbol: 'hollow-diamond', endpoint: 'start' },
    composition: { lineStyle: 'solid', symbol: 'filled-diamond', endpoint: 'start' },
  }
  for (const [relationshipType, renderSpec] of Object.entries(expected)) {
    const connector = model.createConnector(1, { x: 0, y: 0, pressure: 1 }, { x: 100, y: 50, pressure: 1 }, '#202124', 4, undefined, undefined, relationshipType)
    assert.deepEqual(model.getConnectorRenderSpec(connector), renderSpec)
  }
})

test('dependency arrowhead base is calculated back from its endpoint toward the connector', () => {
  const forward = model.createConnector(1, { x: 10, y: 30, pressure: 1 }, { x: 210, y: 30, pressure: 1 }, '#202124', 4,
    undefined, undefined, 'dependency')
  const forwardGeometry = model.getConnectorSymbolGeometry(forward)
  assert.equal(forwardGeometry.tip.x, forward.end.x)
  assert.ok(forwardGeometry.base.x < forward.end.x && forwardGeometry.base.x > forward.start.x)

  const reversed = model.reverseConnectorDirection([forward], forward.id)[0]
  const reversedGeometry = model.getConnectorSymbolGeometry(reversed)
  assert.equal(reversedGeometry.tip.x, reversed.start.x)
  assert.ok(reversedGeometry.base.x > reversed.start.x && reversedGeometry.base.x < reversed.end.x)
})

test('attached rectangle outlines are redrawn after a connector in canvas render order', () => {
  const first = rectangle(1, 10, 20, 80, 60)
  const second = rectangle(2, 200, 20, 80, 60)
  const connector = model.createConnector(3, { x: 90, y: 50, pressure: 1 }, { x: 200, y: 50, pressure: 1 }, '#202124', 4,
    { rectangleId: first.id, offsetX: 80, offsetY: 30 }, { rectangleId: second.id, offsetX: 0, offsetY: 30 })
  const order = model.canvasItemsForRendering([first, second, connector])
  assert.deepEqual(order.map((item) => `${item.kind}:${item.id}`), [
    'rectangle:1', 'rectangle:2', 'connector:3', 'rectangle:1', 'rectangle:2',
  ])
})

test('reverses arrowheads and diamonds without changing endpoints or rectangle attachments', () => {
  const startAttachment = { rectangleId: 11, offsetX: 80, offsetY: 25 }
  const endAttachment = { rectangleId: 12, offsetX: 0, offsetY: 40 }
  for (const [relationshipType, expectedSymbol] of [
    ['inheritance', 'hollow-triangle'],
    ['dependency', 'open-arrow'],
    ['aggregation', 'hollow-diamond'],
    ['composition', 'filled-diamond'],
  ]) {
    const connector = model.createConnector(5, { x: 100, y: 25, pressure: 1 }, { x: 300, y: 40, pressure: 1 }, '#3568d4', 7,
      startAttachment, endAttachment, relationshipType)
    const reversed = model.reverseConnectorDirection([connector], connector.id)[0]
    assert.equal(model.getConnectorRenderSpec(reversed).symbol, expectedSymbol)
    assert.equal(model.getConnectorRenderSpec(reversed).endpoint, relationshipType === 'aggregation' || relationshipType === 'composition' ? 'end' : 'start')
    assert.deepEqual(reversed.start, connector.start)
    assert.deepEqual(reversed.end, connector.end)
    assert.deepEqual(reversed.startAttachment, startAttachment)
    assert.deepEqual(reversed.endAttachment, endAttachment)
  }
})

test('association has no reversible direction', () => {
  const connector = model.createConnector(1, { x: 0, y: 0, pressure: 1 }, { x: 100, y: 0, pressure: 1 }, '#202124', 4)
  assert.equal(model.reverseConnectorDirection([connector], connector.id)[0], connector)
})

test('changing relationship type preserves connector geometry and attachments', () => {
  const connector = model.createConnector(4, { x: 40, y: 60, pressure: 1 }, { x: 240, y: 160, pressure: 1 }, '#e45b55', 7,
    { rectangleId: 1, offsetX: 90, offsetY: 20 }, { rectangleId: 2, offsetX: 0, offsetY: 50 })
  const changed = model.updateConnectorRelationship([connector], connector.id, 'inheritance')[0]
  assert.equal(changed.relationshipType, 'inheritance')
  assert.equal(changed.reversed, false)
  assert.deepEqual(changed.start, connector.start)
  assert.deepEqual(changed.end, connector.end)
  assert.deepEqual(changed.startAttachment, connector.startAttachment)
  assert.deepEqual(changed.endAttachment, connector.endAttachment)
  assert.equal(changed.strokeColor, connector.strokeColor)
  assert.equal(changed.strokeWidth, connector.strokeWidth)
})

test('changing relationship type and reversing direction are separate undoable actions', () => {
  const connector = model.createConnector(4, { x: 40, y: 60, pressure: 1 }, { x: 240, y: 160, pressure: 1 }, '#202124', 4,
    { rectangleId: 1, offsetX: 90, offsetY: 20 }, { rectangleId: 2, offsetX: 0, offsetY: 50 })
  const history = new model.CanvasSnapshotHistory()
  history.record([connector])
  const typed = model.updateConnectorRelationship([connector], connector.id, 'dependency')
  assert.deepEqual(history.undo(typed), [connector])
  assert.deepEqual(history.redo([connector]), typed)

  history.record(typed)
  const reversed = model.reverseConnectorDirection(typed, connector.id)
  assert.equal(model.getConnectorRenderSpec(reversed[0]).endpoint, 'start')
  assert.deepEqual(history.undo(reversed), typed)
  assert.deepEqual(history.redo(typed), reversed)
})

test('relationship decoration stays attached when either connected rectangle moves', () => {
  const left = rectangle(1, 20, 40, 100, 80)
  const right = rectangle(2, 240, 60, 120, 90)
  const original = model.createConnector(3, { x: 120, y: 80, pressure: 1 }, { x: 240, y: 105, pressure: 1 }, '#3568d4', 4,
    { rectangleId: 1, offsetX: 100, offsetY: 40 }, { rectangleId: 2, offsetX: 0, offsetY: 45 })
  for (const relationshipType of ['inheritance', 'dependency', 'aggregation', 'composition']) {
    const changed = model.updateConnectorRelationship([left, right, original], original.id, relationshipType)
    const movedLeft = model.translateSelectedItems(changed, new Set(['rectangle:1']), 13, -9)
    assert.deepEqual(movedLeft[2].start, { x: 133, y: 71, pressure: 1 })
    assert.deepEqual(movedLeft[2].end, original.end)
    const movedRight = model.translateSelectedItems(changed, new Set(['rectangle:2']), -7, 12)
    assert.deepEqual(movedRight[2].start, original.start)
    assert.deepEqual(movedRight[2].end, { x: 233, y: 117, pressure: 1 })
    assert.equal(movedRight[2].relationshipType, relationshipType)
  }
})

test('relationship type changes reset invisible association direction', () => {
  const connector = model.createConnector(1, { x: 0, y: 0, pressure: 1 }, { x: 100, y: 0, pressure: 1 }, '#202124', 4,
    undefined, undefined, 'inheritance', true)
  const association = model.updateConnectorRelationship([connector], 1, 'association')[0]
  assert.equal(association.reversed, false)
  assert.deepEqual(model.getConnectorRenderSpec(association), { lineStyle: 'solid', symbol: 'none', endpoint: null })
})
