import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFile } from 'node:fs/promises'

const { buildExcalidrawElements, buildExcalidrawFile, buildExcalidrawClipboard, excalidrawFileName, excalidrawExportMessage } = await loadModule('excalidrawExport.ts')
const { buildExcalidrawItems, isExcalidrawText } = await loadModule('excalidrawImport.ts')
const app = await readAppSource()

const box = (id, x, y, extra = {}) => ({ kind: 'rectangle', id, x, y, width: 200, height: 100, strokeColor: '#1971c2', strokeWidth: 3, ...extra })
const label = (id, b, text, extra = {}) => ({ kind: 'text', id, x: b.x + 70, y: b.y + 38, width: 60, height: 24, text, fontSize: 20, color: '#1e1e1e', ...extra })
const link = (id, from, to, extra = {}) => ({
  kind: 'connector', id, start: { x: 200, y: 50, pressure: 1 }, end: { x: 400, y: 50, pressure: 1 }, strokeColor: '#e03131', strokeWidth: 3,
  relationshipType: 'directed-association', reversed: false,
  startAttachment: { rectangleId: from, offsetX: 200, offsetY: 50 }, endAttachment: { rectangleId: to, offsetX: 0, offsetY: 50 }, ...extra,
})
const A = box(1, 0, 0, { fillColor: '#a5d8ff', rounded: true })
const B = box(2, 400, 0, { diamond: true, dash: 'dashed' })
const C = box(3, 0, 300, { ellipse: true })
const D = box(4, 400, 300, { hldShape: 'database', inkBox: { top: 320, mid: 360, ink: [] } })
const items = [
  A, B, C, D, label(1, A, 'API'), label(2, B, 'Gate'),
  link(1, 1, 2, { label: 'calls', routing: 'elbow', dash: 'dotted' }),
  link(2, 3, 4, { twoWay: true }),
  { kind: 'stroke', id: 1, points: [{ x: 0, y: 500, pressure: 1 }, { x: 100, y: 540, pressure: 1 }], color: '#2f9e44', width: 5, erase: false, shape: 'arrow', arrowheads: 'end', dash: 'dashed' },
  { kind: 'stroke', id: 2, points: [{ x: 300, y: 500, pressure: 0.4 }, { x: 320, y: 520, pressure: 0.8 }, { x: 350, y: 510, pressure: 1 }], color: '#000', width: 3, erase: false },
  { kind: 'stroke', id: 3, points: [{ x: 1, y: 1, pressure: 1 }, { x: 2, y: 2, pressure: 1 }], color: '#000', width: 3, erase: true },
  { kind: 'text', id: 3, x: 500, y: 600, width: 120, height: 24, text: 'Free note', fontSize: 28, color: '#e03131' },
  box(5, -50, -50, { width: 700, height: 500, dash: 'dashed', strokeColor: '#64748b', strokeWidth: 2 }),
  { kind: 'rectangle', id: 6, x: 700, y: 0, width: 220, height: 120, strokeColor: '#000', strokeWidth: 2, classBox: { name: 'Order', attributes: '+id: int', methods: '+pay()' } },
  { kind: 'code', id: 1, x: 700, y: 200, width: 240, height: 100, text: 'const a = 1', language: 'ts' },
  { kind: 'opaque', id: 9, box: null, raw: { kind: 'future' } },
]

test('file and clipboard wrappers have the formats excalidraw.com reads', () => {
  const file = JSON.parse(buildExcalidrawFile(items, null, '#fff9db').text)
  assert.equal(file.type, 'excalidraw')
  assert.equal(file.version, 2)
  assert.equal(file.source, 'InkPad')
  assert.equal(file.appState.viewBackgroundColor, '#fff9db')
  assert.deepEqual(file.files, {})
  const clip = buildExcalidrawClipboard(items)
  const parsed = JSON.parse(clip.text)
  assert.equal(parsed.type, 'excalidraw/clipboard')
  assert.deepEqual(parsed.files, {})
  assert.equal(parsed.elements.length, file.elements.length)
  assert.equal(isExcalidrawText(clip.text), true)
  assert.equal(buildExcalidrawFile(items).text, buildExcalidrawFile(items).text, 'deterministic')
})

test('element shapes: types, fills, dashes, rounded, bound labels, arrows and bindings', () => {
  const { elements, count, skipped } = buildExcalidrawElements(items)
  assert.equal(skipped, 1)
  assert.equal(count, items.length - 2) // the eraser stroke and the opaque item are not written
  const byId = Object.fromEntries(elements.map((e) => [e.id, e]))
  assert.equal(byId.r1.type, 'rectangle')
  assert.deepEqual(byId.r1.roundness, { type: 3 })
  assert.equal(byId.r1.backgroundColor, '#a5d8ff')
  assert.equal(byId.r1.fillStyle, 'solid')
  assert.equal(byId.r1.strokeWidth, 2)
  assert.equal(byId.r2.type, 'diamond')
  assert.equal(byId.r2.strokeStyle, 'dashed')
  assert.equal(byId.r3.type, 'ellipse')
  assert.equal(byId.t1.containerId, 'r1')
  assert.equal(byId.t1.text, 'API')
  assert.ok(byId.r1.boundElements.some((b) => b.id === 't1' && b.type === 'text'))
  assert.ok(byId.r1.boundElements.some((b) => b.id === 'c1' && b.type === 'arrow'))
  // HLD shape without a label gets its kind name as a bound label; class box carries its text.
  assert.match(byId.b4.text, /database/i)
  assert.match(byId.b6.text, /Order[\s\S]*\+id: int[\s\S]*\+pay\(\)/)
  const arrow = byId.c1
  assert.equal(arrow.type, 'arrow')
  assert.equal(arrow.elbowed, false, 'elbow connectors export as plain bound arrows (an elbow arrow without fixedPoint loses its bindings in Excalidraw)')
  assert.equal(arrow.strokeStyle, 'dotted')
  assert.equal(arrow.startBinding.elementId, 'r1')
  assert.equal(arrow.endBinding.elementId, 'r2')
  assert.equal(arrow.startArrowhead, null)
  assert.equal(arrow.endArrowhead, 'arrow')
  assert.deepEqual(arrow.points[0], [0, 0])
  assert.equal(byId.c1l.containerId, 'c1')
  assert.deepEqual(arrow.boundElements, [{ id: 'c1l', type: 'text' }])
  assert.ok(byId.c2.startArrowhead && byId.c2.endArrowhead)
  assert.equal(byId.s1.type, 'arrow')
  assert.equal(byId.s1.strokeWidth, 4)
  assert.equal(byId.s1.strokeStyle, 'dashed')
  assert.equal(byId.s2.type, 'freedraw')
  assert.deepEqual(byId.s2.pressures, [0.4, 0.8, 1])
  assert.equal(byId.s3, undefined)
  assert.equal(byId.t3.fontSize, 28)
  assert.equal(byId.t3.containerId, null)
})

test('round trip through the importer keeps boxes, labels and connectors', () => {
  const built = buildExcalidrawFile(items)
  const back = buildExcalidrawItems(built.text)
  assert.equal(back.ok, true, JSON.stringify(back))
  const rects = back.items.filter((i) => i.kind === 'rectangle')
  assert.equal(rects.length, 7) // 6 boxes (incl. boundary and class box) + the code block background
  assert.equal(rects.filter((r) => r.diamond).length, 1)
  assert.equal(rects.filter((r) => r.ellipse).length, 1)
  assert.equal(rects.filter((r) => r.rounded).length, 2)
  assert.equal(rects.filter((r) => r.fillColor === '#a5d8ff').length, 1)
  assert.equal(rects.filter((r) => r.dash === 'dashed').length, 2) // diamond + boundary
  const texts = back.items.filter((i) => i.kind === 'text').map((t) => t.text)
  for (const word of ['API', 'Gate', 'Free note']) assert.ok(texts.includes(word), word)
  const connectors = back.items.filter((i) => i.kind === 'connector')
  assert.equal(connectors.length, 2)
  const calls = connectors.find((c) => c.label === 'calls')
  assert.ok(calls)
  assert.notEqual(calls.routing, 'elbow', 'the exported arrow is a plain bound arrow')
  assert.ok(calls.startAttachment && calls.endAttachment)
  assert.equal(connectors.filter((c) => c.twoWay).length, 1)
  assert.equal(back.items.filter((i) => i.kind === 'stroke').length, 2)
  const api = back.items.find((i) => i.kind === 'text' && i.text === 'API')
  const apiBox = rects.find((r) => r.fillColor === '#a5d8ff')
  assert.ok(Math.abs(api.x + api.width / 2 - (apiBox.x + apiBox.width / 2)) < 2, 'label stays centred in its box')
})

test('a connector to a box outside the selection is a free arrow', () => {
  const keys = new Set(['rectangle:1', 'connector:1'])
  const { elements } = buildExcalidrawElements(items, keys)
  const ids = elements.map((e) => e.id)
  assert.deepEqual(ids.filter((id) => id.startsWith('r')), ['r1'])
  assert.ok(ids.includes('t1'), 'label inside a selected box comes along')
  assert.ok(!ids.includes('t2'))
  const arrow = elements.find((e) => e.id === 'c1')
  assert.equal(arrow.startBinding.elementId, 'r1')
  assert.equal(arrow.endBinding, null)
})

test('empty selection set exports the page; helpers', () => {
  assert.equal(buildExcalidrawElements(items, new Set()).count, buildExcalidrawElements(items).count)
  assert.equal(buildExcalidrawElements([]).count, 0)
  assert.equal(excalidrawFileName('My: diagram?'), 'My diagram.excalidraw')
  assert.equal(excalidrawFileName('  '), 'diagram.excalidraw')
  assert.equal(excalidrawExportMessage({ elements: [], count: 0, skipped: 0 }, 'Saved', false), 'Nothing to export')
  assert.match(excalidrawExportMessage({ elements: [], count: 3, skipped: 1 }, 'Copied', true), /Copied 3 items for Excalidraw \(selection\); 1 skipped/)
})

test('wired into the export panel and the palette', async () => {
  const panel = await readFile(new URL('../src/FilePanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /onDownloadExcalidraw/)
  assert.match(panel, /Download \.excalidraw/)
  assert.match(panel, /onCopyExcalidraw/)
  assert.match(panel, /Copy for Excalidraw/)
  assert.match(app, /id: 'export:excalidraw-file'/)
  assert.match(app, /id: 'export:excalidraw-copy'/)
  assert.match(app, /buildExcalidrawClipboard\(strokesRef\.current, selectionKeysWithBox\(\)\)/)
  assert.match(app, /onDownloadExcalidraw=\{downloadExcalidraw\}/)
})

test('round 8 fix: an elbow connector exports as a bound plain arrow along its routed path; a bent arrow stroke keeps every point', () => {
  const routed = link(7, 1, 4, { routing: 'elbow', end: { x: 400, y: 350, pressure: 1 }, endAttachment: { rectangleId: 4, offsetX: 0, offsetY: 50 } }) // A (top left) to D (lower right): the routed path bends
  const bent = { kind: 'stroke', id: 9, points: [{ x: 0, y: 0, pressure: 1 }, { x: 50, y: 0, pressure: 1 }, { x: 50, y: 80, pressure: 1 }], color: '#000', width: 3, erase: false, shape: 'arrow', arrowheads: 'end' }
  const straight = { ...bent, id: 10, points: [bent.points[0], bent.points[2]] }
  const byId = Object.fromEntries(buildExcalidrawElements([A, B, D, routed, bent, straight]).elements.map((e) => [e.id, e]))
  assert.equal(byId.c7.elbowed, false)
  assert.ok(byId.c7.points.length >= 3, 'the points follow the routed elbow path')
  assert.equal(byId.c7.startBinding.elementId, 'r1')
  assert.equal(byId.c7.endBinding.elementId, 'r4')
  assert.deepEqual(byId.s9.points, [[0, 0], [50, 0], [50, 80]])
  assert.equal(byId.s10.points.length, 2)
})
