import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/strokeCurves.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const curves = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const point = (x, y) => ({ x, y, pressure: 0.5 })

test('one-point strokes remain dots without curve segments', () => {
  assert.deepEqual(curves.buildMidpointCurve([point(3, 4)]), [])
})

test('two-point strokes remain one exact straight segment', () => {
  const [segment] = curves.buildMidpointCurve([point(0, 0), point(8, 12)])
  assert.equal(segment.curved, false)
  assert.deepEqual(segment.from, point(0, 0))
  assert.deepEqual(segment.to, point(8, 12))
})

test('many collinear points produce only collinear quadratic segments', () => {
  const segments = curves.buildMidpointCurve([point(0, 0), point(2, 2), point(4, 4), point(6, 6)])
  for (const segment of segments) {
    for (const p of [segment.from, segment.control, segment.to].filter(Boolean)) assert.equal(p.x, p.y)
  }
})

test('curve path starts and ends at the original endpoints', () => {
  const points = [point(0, 0), point(5, 8), point(12, 7), point(18, 0)]
  const segments = curves.buildMidpointCurve(points)
  assert.deepEqual(segments[0].from, points[0])
  assert.deepEqual(segments.at(-1).to, points.at(-1))
})
