import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/strokeSampling.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const sampling = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const point = (x, y) => ({ x, y, pressure: 0.5 })

test('sample threshold is 0.5 screen pixels at zoom out, default zoom, and zoom in', () => {
  for (const scale of [0.1, 1, 3]) {
    const minimumCanvasDistance = sampling.getMinimumStrokeSampleDistanceCanvas(scale)
    assert.equal(minimumCanvasDistance * scale, sampling.MIN_STROKE_SAMPLE_DISTANCE_SCREEN_PX)
    assert.equal(sampling.shouldAppendStrokeSample(point(0, 0), point(minimumCanvasDistance * 0.9, 0), scale), false)
    assert.equal(sampling.shouldAppendStrokeSample(point(0, 0), point(minimumCanvasDistance * 1.1, 0), scale), true)
  }
})

test('default zoom retains the previous 0.5 canvas-unit sampling threshold', () => {
  assert.equal(sampling.getMinimumStrokeSampleDistanceCanvas(1), 0.5)
  assert.equal(sampling.shouldAppendStrokeSample(point(0, 0), point(0.5, 0), 1), false)
  assert.equal(sampling.shouldAppendStrokeSample(point(0, 0), point(0.501, 0), 1), true)
})

test('freehand sampling uses current viewport zoom without changing the stored point model', async () => {
  assert.match(appSource, /shouldAppendStrokeSample\(previous, clippedPoint, viewportRef\.current\.scale\)/)
  const model = await readFile(new URL('../src/canvasModel.ts', import.meta.url), 'utf8')
  assert.match(model, /export type Point = \{ x: number; y: number; pressure: number \}/)
})
