import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFile } from 'node:fs/promises'

const { buildExcalidrawItems, isExcalidrawText, excalidrawInsertMessage } = await loadModule('excalidrawImport.ts')
const doc = await loadModule('documentFormat.ts')
const clip = await loadModule('clipboard.ts')
const app = await readAppSource()

const base = { angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roundness: null, isDeleted: false, groupIds: [], boundElements: null }
const el = (id, type, extra) => ({ ...base, id, type, x: 0, y: 0, width: 100, height: 60, ...extra })

const elements = [
  el('frame1', 'frame', { x: 100, y: 100, width: 700, height: 500, name: 'Backend' }),
  el('A', 'rectangle', { x: 200, y: 200, width: 120, height: 60, roundness: { type: 3 }, backgroundColor: '#a5d8ff', groupIds: ['g1'], boundElements: [{ id: 'arrow1', type: 'arrow' }, { id: 'tA', type: 'text' }] }),
  el('tA', 'text', { x: 230, y: 220, width: 60, height: 25, text: 'API', originalText: 'API', fontSize: 20, fontFamily: 5, textAlign: 'center', verticalAlign: 'middle', containerId: 'A', groupIds: ['g1'] }),
  el('B', 'rectangle', { x: 500, y: 200, width: 120, height: 60, strokeWidth: 4 }),
  el('arrow1', 'arrow', { x: 322, y: 230, width: 176, height: 0, points: [[0, 0], [176, 0]], startBinding: { elementId: 'A', focus: 0, gap: 2 }, endBinding: { elementId: 'B', focus: 0, gap: 2 }, startArrowhead: null, endArrowhead: 'arrow', strokeStyle: 'dashed', boundElements: [{ id: 'tArrow', type: 'text' }] }),
  el('tArrow', 'text', { x: 380, y: 205, text: 'calls', originalText: 'calls', fontSize: 16, fontFamily: 1, containerId: 'arrow1' }),
  el('E', 'ellipse', { x: 200, y: 400, width: 140, height: 90, backgroundColor: '#ffec99', strokeStyle: 'dashed', angle: 0.5 }),
  el('D', 'diamond', { x: 500, y: 400, width: 120, height: 100, groupIds: ['g1'] }),
  el('free', 'text', { x: 50, y: 20, width: 200, height: 25, text: 'System design', originalText: 'System design', fontSize: 28, fontFamily: 2, strokeColor: '#e03131' }),
  el('line1', 'line', { x: 400, y: 500, width: 100, height: 50, points: [[0, 0], [50, 20], [100, 50]], startArrowhead: null, endArrowhead: null }),
  el('lineArrow', 'arrow', { x: 400, y: 560, width: 100, height: 0, points: [[0, 0], [100, 0]], startBinding: { elementId: 'B', focus: 0, gap: 1 }, endBinding: null, startArrowhead: 'arrow', endArrowhead: 'arrow' }),
  el('pen', 'freedraw', { x: 650, y: 150, width: 20, height: 10, points: [[0, 0], [10, 5], [20, 10]], pressures: [0.2, 0.6, 1] }),
  el('img', 'image', { x: 0, y: 0, fileId: 'f1' }),
  el('gone', 'rectangle', { isDeleted: true }),
]
const sample = { type: 'excalidraw/clipboard', elements, files: {} }
const text = JSON.stringify(sample)

const build = () => {
  const r = buildExcalidrawItems(text)
  assert.equal(r.ok, true, JSON.stringify(r))
  return r
}
const of = (items, kind) => items.filter((i) => i.kind === kind)

test('detects clipboard and file JSON', () => {
  assert.equal(isExcalidrawText(text), true)
  assert.equal(isExcalidrawText(JSON.stringify({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} })), true)
  assert.equal(isExcalidrawText('{"type":"other"}'), false)
  assert.equal(isExcalidrawText('graph TD\nA-->B'), false)
  assert.equal(isExcalidrawText('hello'), false)
})

test('counts imported and skipped, skips deleted silently', () => {
  const r = build()
  assert.equal(r.skipped, 1) // the image
  assert.equal(r.shapes, 12) // frame, A, tA, B, arrow1, tArrow, E, D, free, line1, lineArrow, pen
  assert.equal(excalidrawInsertMessage(12, 2), 'Imported 12 shapes from Excalidraw (2 skipped)')
  assert.equal(excalidrawInsertMessage(1, 0), 'Imported 1 shape from Excalidraw')
})

test('shapes: fill, dash, rotation, round corners, widths, colours', () => {
  const { items } = build()
  const rects = of(items, 'rectangle')
  assert.equal(rects.length, 5) // frame, A, B, E, D
  const [frame, a, b, e, d] = rects
  assert.equal(frame.dash, 'dashed')
  assert.equal(frame.fillColor, undefined)
  assert.equal(a.fillColor, '#a5d8ff')
  assert.equal(a.rounded, true)
  assert.equal(b.rounded, undefined)
  assert.equal(b.strokeWidth, 5)
  assert.equal(a.strokeWidth, 3)
  assert.equal(e.ellipse, true)
  assert.equal(e.dash, 'dashed')
  assert.equal(e.fillColor, '#ffec99')
  assert.equal(e.angle, 0.5)
  assert.equal(d.diamond, true)
  assert.equal(a.angle, undefined)
  assert.equal(a.strokeColor, '#1e1e1e')
})

test('frame is a dashed boundary behind everything with its name', () => {
  const { items } = build()
  assert.equal(items[0].kind, 'rectangle')
  assert.equal(items[0].dash, 'dashed')
  assert.ok(of(items, 'text').some((t) => t.text === 'Backend'))
})

test('top-left of the drawing is at the origin', () => {
  const { items } = build()
  const r = of(items, 'rectangle')
  assert.ok(Math.min(...of(items, 'text').map((i) => i.x)) >= 0)
  assert.equal(Math.min(...r.map((i) => i.x), ...of(items, 'text').map((i) => i.x), ...of(items, 'stroke').flatMap((s) => s.points.map((p) => p.x))), 0)
  assert.equal(Math.min(...r.map((i) => i.y), ...of(items, 'text').map((i) => i.y)), 0)
})

test('text in a container is a centred label; free text keeps colour, size and font', () => {
  const { items } = build()
  const a = of(items, 'rectangle')[1]
  const api = of(items, 'text').find((t) => t.text === 'API')
  assert.equal(api.align, 'center')
  assert.equal(api.fontFamily, 'excalifont')
  assert.ok(Math.abs(api.x + api.width / 2 - (a.x + a.width / 2)) < 0.5)
  assert.ok(Math.abs(api.y + api.height / 2 - (a.y + a.height / 2)) < 0.5)
  const free = of(items, 'text').find((t) => t.text === 'System design')
  assert.equal(free.fontSize, 28)
  assert.equal(free.color, '#e03131')
  assert.equal(free.fontFamily, 'sans')
})

test('a long label shrinks to fit its shape', () => {
  const long = 'A fairly long label for a small box'
  const r = buildExcalidrawItems({ type: 'excalidraw', elements: [el('s', 'rectangle', { width: 80, height: 40 }), el('t', 'text', { text: long, originalText: long, fontSize: 20, containerId: 's' })] })
  assert.equal(r.ok, true)
  const label = of(r.items, 'text')[0]
  assert.ok(label.fontSize < 20)
})

test('bound arrow becomes an attached connector with label, dash, direction', () => {
  const { items } = build()
  assert.equal(of(items, 'connector').length, 1)
  const [connector] = of(items, 'connector')
  const rects = of(items, 'rectangle')
  const a = rects[1]
  const b = rects[2]
  assert.equal(connector.relationshipType, 'directed-association')
  assert.equal(connector.reversed, false)
  assert.equal(connector.twoWay, undefined)
  assert.equal(connector.dash, 'dashed')
  assert.equal(connector.label, 'calls')
  assert.equal(connector.startAttachment.rectangleId, a.id)
  assert.equal(connector.endAttachment.rectangleId, b.id)
  // the arrow starts 2 units right of A (clamped to its right edge) and ends 2 left of B (clamped to its left edge)
  assert.equal(connector.startAttachment.offsetX, a.width)
  assert.equal(connector.startAttachment.offsetY, 30)
  assert.equal(connector.endAttachment.offsetX, 0)
  assert.equal(connector.start.x, a.x + a.width)
  assert.equal(connector.end.x, b.x)
  assert.equal(of(items, 'text').some((t) => t.text === 'calls'), false) // the label lives on the connector
})

test('arrowhead variants on bound arrows', () => {
  const two = (startArrowhead, endArrowhead) => {
    const r = buildExcalidrawItems({ type: 'excalidraw', elements: [
      el('p', 'rectangle', { x: 0, y: 0 }), el('q', 'rectangle', { x: 300, y: 0 }),
      el('ar', 'arrow', { x: 100, y: 30, points: [[0, 0], [200, 0]], startBinding: { elementId: 'p' }, endBinding: { elementId: 'q' }, startArrowhead, endArrowhead, elbowed: true }),
    ] })
    return of(r.items, 'connector')[0]
  }
  const both = two('arrow', 'arrow')
  assert.equal(both.relationshipType, 'directed-association')
  assert.equal(both.twoWay, true)
  assert.equal(both.routing, 'elbow')
  assert.equal(two(null, null).relationshipType, 'association')
  const back = two('triangle', null)
  assert.equal(back.relationshipType, 'directed-association')
  assert.equal(back.reversed, true)
})

test('unbound arrows and lines become strokes', () => {
  const { items } = build()
  const strokes = of(items, 'stroke')
  assert.equal(strokes.length, 3)
  const arrow = strokes.find((s) => s.shape === 'arrow')
  assert.equal(arrow.arrowheads, 'both') // bound at one end only, so not a connector
  assert.equal(arrow.points.length, 2)
  assert.ok(strokes.find((s) => s.points.length === 3 && !s.shape && s.points[0].pressure === 1))
  const pen = strokes.find((s) => s.points.some((p) => p.pressure === 0.2))
  assert.deepEqual(pen.points.map((p) => p.pressure), [0.2, 0.6, 1])
})

test('freedraw without pressures uses 0.5; a straight line is a line stroke', () => {
  const r = buildExcalidrawItems({ type: 'excalidraw', elements: [
    el('f', 'freedraw', { points: [[0, 0], [5, 5]], pressures: [] }),
    el('l', 'line', { points: [[0, 0], [100, 0]], strokeStyle: 'dotted' }),
  ] })
  const f = of(r.items, 'stroke').find((s) => !s.shape)
  const l = of(r.items, 'stroke').find((s) => s.shape)
  assert.equal(f.points[0].pressure, 0.5)
  assert.equal(l.shape, 'line')
  assert.equal(l.arrowheads, 'none')
  assert.equal(l.dash, 'dotted')
})

test('groups: one number per outermost group; single members are not groups', () => {
  const { items } = build()
  const rects = of(items, 'rectangle')
  assert.equal(rects[1].group, 1) // A
  assert.equal(rects[4].group, 1) // D
  assert.equal(of(items, 'text').find((t) => t.text === 'API').group, 1)
  assert.equal(rects[2].group, undefined)
  const lone = buildExcalidrawItems({ type: 'excalidraw', elements: [el('x', 'rectangle', { groupIds: ['inner', 'outer'] }), el('y', 'rectangle', { groupIds: ['outer'] }), el('z', 'rectangle', { groupIds: ['solo'] })] })
  const [x, y, z] = of(lone.items, 'rectangle')
  assert.equal(x.group, y.group)
  assert.equal(x.group, 1)
  assert.equal(z.group, undefined)
})

test('items survive documentFormat sanitize and a paste', () => {
  const { items } = build()
  for (const item of items) {
    const clean = doc.sanitizeItem(JSON.parse(JSON.stringify(item)))
    assert.ok(clean, `${item.kind} sanitizes`)
    assert.equal(clean.kind, item.kind)
    if (item.kind === 'rectangle') {
      assert.equal(clean.fillColor, item.fillColor)
      assert.equal(clean.dash, item.dash)
      assert.equal(clean.angle, item.angle)
      assert.equal(clean.group, item.group)
    }
    if (item.kind === 'connector') {
      assert.deepEqual(clean.startAttachment, item.startAttachment)
      assert.equal(clean.label, item.label)
      assert.equal(clean.dash, item.dash)
    }
    if (item.kind === 'stroke') assert.equal(clean.shape, item.shape)
  }
  const pasted = clip.pasteItems(items, { stroke: 1, rectangle: 1, connector: 1, text: 1 }, 24, { x: 0, y: 0, width: 5000, height: 5000 }, { x: 1000, y: 1000 }, [])
  assert.ok(pasted)
  const connector = of(pasted.items, 'connector')[0]
  assert.ok(of(pasted.items, 'rectangle').some((r) => r.id === connector.startAttachment.rectangleId))
})

test('malformed and empty input', () => {
  for (const bad of ['', 'not json', '[]', 'null', '{"type":"other","elements":[]}', '{"type":"excalidraw"}', '{"type":"excalidraw","elements":"x"}']) {
    const r = buildExcalidrawItems(bad)
    assert.equal(r.ok, false, bad)
    assert.equal(r.error, 'Not an Excalidraw file')
  }
  assert.equal(buildExcalidrawItems({ type: 'excalidraw', elements: [] }).ok, false)
  assert.equal(buildExcalidrawItems({ type: 'excalidraw', elements: [el('i', 'image')] }).ok, false)
  // junk elements are tolerated
  const r = buildExcalidrawItems({ type: 'excalidraw', elements: [null, 5, 'x', { type: 'rectangle' }, el('ok', 'rectangle', { x: 'bad' })] })
  assert.equal(r.ok, true)
  assert.equal(r.items.length, 2)
  // bound to something that was not imported: a stroke, not a connector
  const unbound = buildExcalidrawItems({ type: 'excalidraw', elements: [el('p', 'rectangle'), el('ar', 'arrow', { points: [[0, 0], [50, 0]], startBinding: { elementId: 'p' }, endBinding: { elementId: 'missing' }, endArrowhead: 'arrow' })] })
  assert.equal(of(unbound.items, 'connector').length, 0)
  assert.equal(of(unbound.items, 'stroke').length, 1)
})

test('wiring: paste detects Excalidraw first, file import in More tray and palette', async () => {
  assert.match(app, /isExcalidrawText\(full\)[\s\S]{0,160}importExcalidraw\(excalidraw, at\)[\s\S]*?const mermaidText = full\.slice/)
  assert.match(app, /const importExcalidraw = [\s\S]*?buildExcalidrawItems\(source\)[\s\S]*?insertTemplateItems\(built\.items, at, true, true\)[\s\S]*?excalidrawInsertMessage/)
  assert.match(app, /type="file" accept="\.excalidraw,application\/json" hidden/)
  assert.match(app, /id: 'excalidraw:import', label: 'Import Excalidraw file…'/)
  assert.match(app, /onExcalidraw=\{\(\) => excalidrawFileRef\.current\?\.click\(\)\}/)
  const tray = await readFile(new URL('../src/app/MoreTray.tsx', import.meta.url), 'utf8')
  assert.match(tray, /onExcalidraw && <button[\s\S]*?Import Excalidraw file…/)
  const dock = await readFile(new URL('../src/app/ToolDock.tsx', import.meta.url), 'utf8')
  assert.equal((dock.match(/onExcalidraw=\{props\.onExcalidraw\}/g) ?? []).length, 2) // desktop and tablet trays
})
