import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const renderer = await loadModule('app/canvasRenderer.ts')
const curves = await loadModule('strokeCurves.ts')

function recorder() {
  const calls = []
  const ctx = new Proxy({}, {
    get(target, key) { if (key in target) return target[key]; return (...args) => { calls.push([key, ...args]) } },
    set(target, key, value) { target[key] = value; if (key === 'lineWidth') calls.push(['lineWidth', value]); return true },
  })
  return { ctx, calls, count: (name) => calls.filter(([n]) => n === name).length }
}

const wave = (n, pressure = () => 0.5) => Array.from({ length: n }, (_, i) => ({ x: i * 2, y: Math.sin(i / 6) * 12, pressure: pressure(i) }))
const stroke = (points, width = 4) => ({ kind: 'stroke', id: 1, color: '#202124', width, erase: false, points })

test('a stroke with steady pressure is drawn in one stroke call, same shape as segment by segment', () => {
  const s = stroke(wave(200))
  const grouped = recorder()
  renderer.drawStroke(grouped.ctx, s, 'raw')
  assert.equal(grouped.count('stroke'), 1)
  const segments = curves.buildInterpolatingCurve(s.points)
  const ends = grouped.calls.filter(([n]) => n === 'bezierCurveTo' || n === 'lineTo').map((c) => c.slice(-2))
  assert.deepEqual(ends, segments.map((seg) => [seg.to.x, seg.to.y]))
  renderer.rawDrawingOptions.groupWidths = false
  try {
    const plain = recorder()
    renderer.drawStroke(plain.ctx, s, 'raw')
    assert.equal(plain.count('stroke'), segments.length)
  } finally { renderer.rawDrawingOptions.groupWidths = true }
})

test('changing pressure splits the path, and widths stay within 4% of the pen width of the exact value', () => {
  const pressures = wave(300, (i) => 0.2 + 0.6 * (Math.sin(i / 25) * 0.5 + 0.5))
  const s = stroke(pressures)
  const rec = recorder()
  renderer.drawStroke(rec.ctx, s, 'raw')
  const strokes = rec.count('stroke')
  assert.ok(strokes > 1 && strokes < 299 / 2, `${strokes} stroke calls for 299 segments`)
  const exact = curves.buildInterpolatingCurve(s.points).map((seg) => renderer.pressureLineWidth(4, seg.pressure))
  const widths = rec.calls.filter(([n]) => n === 'lineWidth').map((c) => c[1])
  assert.ok(Math.max(...widths) <= Math.max(...exact) + 0.081 && Math.min(...widths) >= Math.min(...exact) - 0.081)
})

test('a finished stroke keeps its curve between frames, a growing stroke is rebuilt', () => {
  const s = stroke(wave(50))
  const first = recorder(); renderer.drawStroke(first.ctx, s, 'raw')
  const again = recorder(); renderer.drawStroke(again.ctx, s, 'raw')
  assert.deepEqual(again.calls, first.calls)
  s.points.push({ x: 200, y: 5, pressure: 0.5 })
  const grown = recorder(); renderer.drawStroke(grown.ctx, s, 'raw')
  assert.equal(grown.calls.filter(([n]) => n === 'bezierCurveTo' || n === 'lineTo').length, 50)
  const replaced = { ...s, points: s.points.map((p) => ({ ...p, x: p.x + 10 })) }
  const moved = recorder(); renderer.drawStroke(moved.ctx, replaced, 'raw')
  assert.notDeepEqual(moved.calls.find(([n]) => n === 'moveTo'), grown.calls.find(([n]) => n === 'moveTo'), 'a moved copy is not drawn from the old curve')
})

test('the page switches: one layer, cpu canvas, pixel ratio cap, grouping', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /ONE_LAYER_ENABLED = DRAW_SWITCHES\.get\('layers'\) === 'one'/)
  assert.match(app, /GROUP_SEGMENTS_ENABLED = DRAW_SWITCHES\.get\('group'\) !== 'off'/)
  assert.match(app, /CANVAS_ON_CPU = DRAW_SWITCHES\.get\('canvas'\) === 'cpu'/)
  assert.match(app, /DPR_CAP = Number\(DRAW_SWITCHES\.get\('dpr'\)\)/)
  assert.match(app, /const dpr = benchmarkBackground\?\.dpr \?\? canvasPixelRatio\(\)/)
  // one layer: no copy of the ink layer, the sheet borders go behind the ink, and never while a selection is shown
  assert.match(app, /const oneLayer = ONE_LAYER_ENABLED && [\s\S]*?selectedKeysRef\.current\.size === 0/)
  assert.match(app, /if \(oneLayer\) \{\s*\/\/ nothing to copy/)
  assert.match(app, /globalCompositeOperation = 'destination-over'\s*drawSheetBorders\(\)/)
})

test('?dirty=off repaints the whole canvas and ?layerdom=on attaches the layer canvases to the page', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /DIRTY_RECT_ENABLED = DRAW_SWITCHES\.get\('dirty'\) !== 'off'/)
  assert.match(app, /const dirtyRect = DIRTY_RECT_ENABLED && penStrokeFrame/)
  assert.match(app, /layerCanvasOptions\.attachToPage = LAYERS_ON_PAGE/)
  const calls = []
  const body = { appendChild: (el) => calls.push(el) }
  globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, setAttribute() {} }), body }
  try {
    const ref = { current: null }
    renderer.getReusableCanvasLayer(ref, 10, 10)
    assert.equal(calls.length, 0, 'detached by default')
    renderer.layerCanvasOptions.attachToPage = true
    const attached = { current: null }
    const canvas = renderer.getReusableCanvasLayer(attached, 20, 30)
    assert.equal(calls.length, 1)
    assert.equal(canvas.width, 20)
    assert.equal(renderer.getReusableCanvasLayer(attached, 20, 30), canvas, 'reused, not attached twice')
    assert.equal(calls.length, 1)
  } finally { renderer.layerCanvasOptions.attachToPage = false; delete globalThis.document }
})
