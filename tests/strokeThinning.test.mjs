import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const thin = await loadModule('strokeThinning.ts')
const curves = await loadModule('strokeCurves.ts')

const pt = (x, y, pressure = 0.5) => ({ x, y, pressure })

/** Max distance from each original point to the polyline of the kept points. */
function maxDeviation(original, kept) {
  let worst = 0
  for (const p of original) {
    let best = Infinity
    for (let i = 0; i < kept.length - 1; i += 1) {
      const a = kept[i], b = kept[i + 1]
      const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy
      const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy))
    }
    worst = Math.max(worst, best)
  }
  return worst
}

test('a densely sampled straight line keeps only its ends', () => {
  const line = Array.from({ length: 200 }, (_, i) => pt(i * 0.25, i * 0.1))
  const out = thin.thinPoints(line)
  assert.deepEqual(out, [line[0], line[199]])
})

test('corners, endpoints and curve shape survive thinning', () => {
  const corner = [...Array.from({ length: 50 }, (_, i) => pt(i, 0)), ...Array.from({ length: 50 }, (_, i) => pt(49, i + 1))]
  const out = thin.thinPoints(corner)
  assert.ok(out.includes(corner[49]), 'corner kept')
  assert.equal(out[0], corner[0])
  assert.equal(out[out.length - 1], corner[corner.length - 1])
  const wave = Array.from({ length: 400 }, (_, i) => pt(i * 0.3, Math.sin(i / 12) * 8))
  const thinned = thin.thinPoints(wave)
  assert.ok(thinned.length < wave.length / 3, `${thinned.length} of ${wave.length}`)
  assert.ok(maxDeviation(wave, thinned) <= thin.THIN_DISTANCE_TOLERANCE + 1e-9)
})

test('pressure changes that alter line width are kept', () => {
  const ramp = Array.from({ length: 100 }, (_, i) => pt(i, 0, i < 50 ? 0.2 : 0.9))
  const out = thin.thinPoints(ramp)
  assert.ok(out.length >= 3)
  assert.ok(out.some((p) => p.pressure === 0.2) && out.some((p) => p.pressure === 0.9))
})

test('thinned Raw curves stay within a fraction of a unit of the original', () => {
  const wave = Array.from({ length: 600 }, (_, i) => pt(i * 0.25, Math.sin(i / 9) * 10 + Math.cos(i / 4)))
  const sample = (points) => curves.buildInterpolatingCurve(points).map((s) => s.to)
  const before = sample(wave)
  const after = curves.buildInterpolatingCurve(thin.thinPoints(wave))
  const polyline = []
  for (const s of after) polyline.push(s.from, s.to)
  assert.ok(maxDeviation(before, polyline) < 0.6)
})

test('only plain pen strokes are thinned', () => {
  const base = { kind: 'stroke', id: 1, color: '#000', width: 2, erase: false, points: Array.from({ length: 50 }, (_, i) => pt(i, 0)) }
  assert.equal(thin.thinStroke(base).points.length, 2)
  const eraser = { ...base, erase: true }
  assert.equal(thin.thinStroke(eraser), eraser)
  const arrow = { ...base, shape: 'arrow' }
  assert.equal(thin.thinStroke(arrow), arrow)
  const short = { ...base, points: base.points.slice(0, 3) }
  assert.equal(thin.thinStroke(short), short)
  assert.equal(base.points.length, 50, 'input not mutated')
})

test('finishing a stroke thins it (switch ?thin=off)', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /STROKE_THINNING_ENABLED = DRAW_SWITCHES\.get\('thin'\) !== 'off'/)
  assert.match(app, /stroke = thinStroke\(stroke\)\s*strokesRef\.current\.push\(stroke\)/)
})
