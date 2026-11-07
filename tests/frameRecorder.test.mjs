import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const rec = await loadModule('app/frameRecorder.ts')

test('summary reports gap percentiles, slow share, draw time and samples per frame', () => {
  const r = rec.createFrameRecorder()
  let t = 1000
  for (let i = 0; i < 100; i += 1) { r.frame(t, 2); r.samples(3); t += i % 10 === 9 ? 30 : 11 }
  const s = r.finish()
  assert.equal(s.frames, 100)
  assert.equal(s.gapP50, 11)
  assert.equal(s.gapMax, 30)
  assert.ok(Math.abs(s.slowShare - 0.1) < 0.02)
  assert.equal(s.drawP50, 2)
  assert.equal(s.samplesPerFrame, 3)
})

test('pauses of the pen are not counted as slow frames, and a short stroke gives no summary', () => {
  const r = rec.createFrameRecorder()
  r.frame(0, 1); r.frame(11, 1); r.frame(500, 1); r.frame(511, 1); r.frame(522, 1); r.frame(533, 1); r.frame(544, 1)
  const s = r.finish()
  assert.equal(s.gapMax, 11)
  r.frame(0, 1); r.frame(11, 1)
  assert.equal(r.finish(), null)
})

test('the recorder starts over for every stroke', () => {
  const r = rec.createFrameRecorder()
  for (let i = 0; i < 10; i += 1) r.frame(i * 40, 1)
  assert.equal(r.finish().gapP50, 40)
  for (let i = 0; i < 10; i += 1) r.frame(i * 11, 1)
  assert.equal(r.finish().gapP50, 11)
})

test('text lines are compact and list every flag', () => {
  const line = rec.formatFrameSummary({ frames: 120, gapP50: 11.1, gapP95: 14, gapMax: 31, slowShare: 0.03, drawP50: 4.2, drawMax: 12, samplesPerFrame: 2.5 })
  assert.match(line, /gap 11\/14\/31 ms/)
  assert.match(line, /slow 3%/)
  const flags = rec.formatDrawFlags({ directMax: 18000, live: 'whole', predict: false, thin: true, cache: true, desync: false, cpu: false, dprCap: null, oneLayer: false, group: true, dirty: true, layerDom: false })
  assert.equal(flags, 'direct<=18000 · live=whole · predict=off · thin=on · cache=on · group=on · layers=two · canvas=gpu · dpr<=any · dirty=box · layerdom=off · desync=off')
})

test('App shows the flags line and the frame line with ?debug=on and always uses the cached path, whole-stroke, no prediction', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const ink = await readFile(new URL('../src/app/visibleInk.ts', import.meta.url), 'utf8')
  assert.match(ink, /DEFAULT_DIRECT_MAX_VISIBLE_POINTS = 0\b/)
  assert.match(app, /LIVE_INCREMENTAL_ENABLED = DRAW_SWITCHES\.get\('live'\) === 'incremental'/)
  assert.match(app, /PEN_PREDICTION_ENABLED = DRAW_SWITCHES\.get\('predict'\) === 'on'/)
  assert.match(app, /formatDrawFlags\(/)
  assert.match(app, /frameRecorderRef\.current\.frame\(frameTimestamp/)
  assert.match(app, /frameRecorderRef\.current\.finish\(\)/)
  assert.match(app, /frameRecorderRef\.current\.samples\(samples\.length\)/)
})
