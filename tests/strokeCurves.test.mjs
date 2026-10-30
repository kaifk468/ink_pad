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

test('Raw interpolating spans pass through every captured point and preserve exact endpoints', () => {
  const points = [point(0, 0), point(5, 4), point(11, 6), point(18, 3), point(24, 0)]
  const segments = curves.buildInterpolatingCurve(points)

  assert.equal(segments.length, points.length - 1)
  assert.deepEqual(segments.map((segment) => segment.from), points.slice(0, -1))
  assert.deepEqual(segments.map((segment) => segment.to), points.slice(1))
  assert.deepEqual(segments[0].from, points[0])
  assert.deepEqual(segments.at(-1).to, points.at(-1))
})

test('Raw interpolation handles one-point dots and two-point straight strokes', () => {
  assert.deepEqual(curves.buildInterpolatingCurve([point(3, 4)]), [])
  const [segment] = curves.buildInterpolatingCurve([point(0, 0), point(9, 12)])
  assert.deepEqual(segment.from, point(0, 0))
  assert.deepEqual(segment.to, point(9, 12))
  for (const control of [segment.control1, segment.control2]) {
    assert.ok(Math.abs(control.x * 12 - control.y * 9) < 1e-9)
  }
})

test('centripetal interpolation keeps collinear input on its straight line', () => {
  const points = [point(0, 0), point(3, 3), point(12, 12), point(13, 13), point(26, 26)]
  const segments = curves.buildInterpolatingCurve(points)

  assert.ok(segments.some((segment) => segment.curved))
  for (const segment of segments) {
    for (const candidate of [segment.control1, segment.control2, segment.from, segment.to].filter(Boolean)) {
      assert.ok(Math.abs(candidate.x - candidate.y) < 1e-9)
    }
  }
})

test('persistent sharp turns remain straight through the original corner point', () => {
  const points = [point(0, 0), point(10, 0), point(1, 1), point(0, 10)]
  const segments = curves.buildInterpolatingCurve(points)

  assert.ok(segments.some((segment) => !segment.curved))
  assert.deepEqual(segments.map((segment) => segment.to), points.slice(1))
})

test('circular curves remain Bézier spans rather than being classified as straight corners', () => {
  const points = Array.from({ length: 33 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2
    return point(40 + Math.cos(angle) * 30, 40 + Math.sin(angle) * 30)
  })
  const segments = curves.buildInterpolatingCurve(points)

  assert.ok(segments.every((segment) => segment.curved))
})

test('O, P, Q, R, and S-like writing curves keep normal bends curved', () => {
  const o = Array.from({ length: 25 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2
    return point(20 + Math.cos(angle) * 12, 20 + Math.sin(angle) * 16)
  })
  const p = [point(0, 30), point(1, 20), point(2, 10), point(8, 4), point(15, 5), point(19, 11), point(18, 18), point(12, 22), point(3, 22)]
  const q = [...o, point(30, 30), point(36, 36)]
  const r = [...p, point(4, 27), point(7, 31)]
  const s = [point(18, 0), point(12, 2), point(6, 5), point(3, 9), point(5, 13), point(11, 15), point(16, 18), point(17, 22), point(13, 26), point(7, 29), point(1, 30)]

  for (const points of [o, p, q, r, s]) {
    const segments = curves.buildInterpolatingCurve(points)
    assert.ok(segments.some((segment) => segment.curved), 'curved letter should retain Bézier spans')
    assert.ok(segments.filter((segment) => !segment.curved).length < segments.length / 2, 'ordinary letter bends should not become a majority of straight spans')
  }
})

test('an isolated sharp sample turn inside an otherwise smooth curve does not force straight spans', () => {
  const points = [point(0, 0), point(4, 3), point(8, 8), point(7, 13), point(12, 18), point(18, 20)]
  const segments = curves.buildInterpolatingCurve(points)
  assert.ok(segments.some((segment) => segment.curved))
  assert.ok(segments.filter((segment) => !segment.curved).length < segments.length)
})

test('interpolating curve output is deterministic and retains pressure per span', () => {
  const points = [
    { ...point(0, 0), pressure: 0.2 },
    { ...point(6, 2), pressure: 0.4 },
    { ...point(14, 5), pressure: 0.8 },
    { ...point(22, 3), pressure: 1 },
  ]
  const first = curves.buildInterpolatingCurve(points)
  const second = curves.buildInterpolatingCurve(points)

  assert.deepEqual(first, second)
  first.forEach((segment, index) => assert.ok(Math.abs(segment.pressure - [0.3, 0.6, 0.9][index]) < 1e-12))
})
