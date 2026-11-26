import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFile } from 'node:fs/promises'

const { buildExcalidrawItems } = await loadModule('excalidrawImport.ts')
const { isOwnClipboardText } = await loadModule('systemPaste.ts')
const app = await readAppSource()

const base = { angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roundness: null, isDeleted: false, groupIds: [], boundElements: null }
const el = (id, type, extra) => ({ ...base, id, type, x: 0, y: 0, width: 100, height: 60, ...extra })
const wrap = (elements) => ({ type: 'excalidraw/clipboard', elements })
const ptsOf = (n) => Array.from({ length: n }, (_, i) => [i, i % 7])

test('freedraw with 150k points does not throw; stroke is capped at 10k keeping first and last', () => {
  const r = buildExcalidrawItems(wrap([el('p', 'freedraw', { x: 10, y: 10, points: ptsOf(150000) })]))
  assert.equal(r.ok, true)
  const stroke = r.items.find((i) => i.kind === 'stroke')
  assert.equal(stroke.points.length, 10000)
  assert.deepEqual([stroke.points[0].x, stroke.points.at(-1).x], [0, 149999])
})

test('total points are capped; further strokes are skipped and counted', () => {
  const many = Array.from({ length: 25 }, (_, i) => el(`s${i}`, 'freedraw', { x: i * 5, y: 0, points: ptsOf(10000) }))
  const r = buildExcalidrawItems(wrap(many))
  assert.equal(r.ok, true)
  assert.equal(r.items.filter((i) => i.kind === 'stroke').length, 20)
  assert.equal(r.skipped, 5)
})

test('coordinates or sizes beyond 1e6 skip the element', () => {
  const r = buildExcalidrawItems(wrap([el('a', 'rectangle', { x: 1e308 }), el('b', 'rectangle', { width: 5e6 }), el('c', 'freedraw', { points: [[0, 0], [2e6, 0]] }), el('d', 'rectangle', { x: 5, y: 5 })]))
  assert.equal(r.ok, true)
  assert.equal(r.items.length, 1)
  assert.equal(r.skipped, 3)
  assert.ok(r.items.every((i) => Number.isFinite(i.x)))
})

test('an arrow bound to a diamond ends on the outline, not at a bbox corner', () => {
  const r = buildExcalidrawItems(wrap([
    el('D', 'diamond', { x: 200, y: 0, width: 100, height: 100 }),
    el('R', 'rectangle', { x: 0, y: 0, width: 100, height: 100 }),
    el('a', 'arrow', { x: 100, y: 5, width: 100, height: 0, points: [[0, 0], [100, 0]], startBinding: { elementId: 'R' }, endBinding: { elementId: 'D' }, endArrowhead: 'arrow' }),
  ]))
  const connector = r.items.find((i) => i.kind === 'connector')
  const diamond = r.items.find((i) => i.kind === 'rectangle' && i.diamond)
  const e = connector.end
  assert.ok(Math.abs(Math.abs(e.x - (diamond.x + 50)) / 50 + Math.abs(e.y - (diamond.y + 50)) / 50 - 1) < 0.02)
  assert.deepEqual([connector.endAttachment.offsetX, connector.endAttachment.offsetY], [e.x - diamond.x, e.y - diamond.y])
})

test('angle rotates line and freedraw points around the element centre', () => {
  const r = buildExcalidrawItems(wrap([el('l', 'line', { x: 0, y: 0, width: 100, height: 0, angle: Math.PI / 2, points: [[0, 0], [100, 0]] })]))
  const [a, b] = r.items[0].points
  assert.deepEqual([Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)], [0, 0, 0, 100])
  const f = buildExcalidrawItems(wrap([el('f', 'freedraw', { x: 0, y: 0, width: 100, height: 0, angle: Math.PI / 2, points: [[0, 0], [100, 0]] })]))
  assert.equal(Math.round(f.items[0].points[1].y - f.items[0].points[0].y), 100)
})

test('text, including labels inside shapes, is capped at 2000 characters', () => {
  const long = 'x'.repeat(5000)
  const r = buildExcalidrawItems(wrap([
    el('A', 'rectangle', { x: 0, y: 0, width: 300, height: 200, boundElements: [{ id: 't', type: 'text' }] }),
    el('t', 'text', { text: long, originalText: long, fontSize: 20, containerId: 'A' }),
    el('free', 'text', { x: 400, text: long, originalText: long, fontSize: 20 }),
  ]))
  const texts = r.items.filter((i) => i.kind === 'text')
  assert.equal(texts.length, 2)
  assert.ok(texts.every((t) => t.text.length === 2000))
})

test('wiring: file size limit and a single parse on paste', () => {
  assert.match(app, /file\.size > MAX_EXCALIDRAW_FILE_BYTES\) \{ showToast\('File too large'\)/)
  assert.match(app, /MAX_EXCALIDRAW_FILE_BYTES = 20 \* 1024 \* 1024/)
  assert.match(app, /const excalidraw = isExcalidrawText\(full\) \? buildExcalidrawItems\(full\) : null/)
  assert.match(app, /importExcalidraw\(excalidraw, at\)/)
  assert.doesNotMatch(app, /buildExcalidrawItems\(full\)\.ok/)
})

test('Excalidraw / Mermaid system text beats in-app items unless InkPad wrote it; plain text does not', () => {
  assert.equal(isOwnClipboardText('graph TD\r\nA-->B ', 'graph TD\nA-->B'), true)
  assert.equal(isOwnClipboardText('graph TD\nA-->B', null), false)
  assert.equal(isOwnClipboardText('other', 'graph TD'), false)
  assert.equal(isOwnClipboardText('', ''), false)
  assert.match(app, /case 'paste':[\s\S]{0,360}inputModeRef\.current === 'desktop'\) return false/)
  assert.match(app, /pasteEventRef\.current = \(event\) => \{\s*if \(inputModeRef\.current !== 'desktop' \|\| event\.defaultPrevented\) return/)
  assert.match(app, /clipboardRef\.current\.length > 0\) \{[\s\S]{0,400}!isOwnClipboardText\(systemText, lastWrittenTextRef\.current\) && pasteSystemText\(systemText, at, true\)\) return\s*pasteWithToast\(at\)/)
  assert.match(app, /if \(structuredOnly\) return false/)
  assert.match(app, /isTypingTarget\(target\?\.tagName \?\? 'BODY', Boolean\(target\?\.isContentEditable\)\)\) return/)
  assert.equal((app.match(/lastWrittenTextRef\.current = text/g) ?? []).length, 2)
})

test('leftover widened-type casts are gone', async () => {
  for (const f of ['mermaidErImport.ts', 'mermaidStateImport.ts', 'excalidrawImport.ts', 'mermaidExport.ts']) {
    const src = await readFile(new URL(`../src/${f}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /as unknown as (CanvasItem|RectangleObject)|RectangleObject & \{ rounded|ConnectorObject & Cardinalities/, f)
  }
})
