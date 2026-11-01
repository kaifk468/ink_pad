import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { readAppSource } from './helpers/appSource.mjs'

const source = await readFile(new URL('../src/performanceBenchmark.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const benchmark = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const app = await readAppSource()

test('benchmark scenes are deterministic and contain requested object counts and realistic mixes', () => {
  for (const size of benchmark.BENCHMARK_SCENE_SIZES) {
    const first = benchmark.createBenchmarkScene(size)
    assert.deepEqual(benchmark.createBenchmarkScene(size), first)
    assert.equal(first.length, size)
    assert.ok(first.some((item) => item.kind === 'stroke'))
    assert.ok(first.some((item) => item.kind === 'rectangle'))
    assert.ok(first.some((item) => item.kind === 'connector'))
    assert.ok(new Set(first.filter((item) => item.kind === 'stroke').map((item) => item.points.length)).size > 1)
  }
})

test('benchmark sample summary reports median P95 max and count', () => {
  assert.deepEqual(benchmark.summarizeBenchmarkSamples([4, 1, 3, 2]), { medianMs: 2, p95Ms: 4, maxMs: 4, observations: 4 })
})

test('DEV benchmark uses the production renderAll path and separate JSON output', () => {
  assert.match(app, /void runSyntheticBenchmark\('(?:controlled|native)'\)/)
  assert.match(app, /renderAll\(\)/)
  assert.match(app, /inkpad-synthetic-render-benchmark/)
  assert.match(app, /Export benchmark JSON/)
  assert.match(app, /onBackgroundRendered/)
  assert.match(app, /backgroundRenderMs: summarizeBenchmarkSamples\(backgroundSamples\)/)
  assert.match(app, /for \(const template of \['blank', 'lined', 'dotted'\]/)
  assert.match(app, /sheetColor: 'white'/)
})

test('benchmark matrix compares all three templates for each fixed object count', () => {
  const scenarios = benchmark.BENCHMARK_SCENE_SIZES.flatMap((objectCount) => ['blank', 'lined', 'dotted'].map((template) => ({ objectCount, template, sheetColor: 'white' })))
  assert.equal(scenarios.length, 9)
  for (const size of benchmark.BENCHMARK_SCENE_SIZES) {
    const group = scenarios.filter(({ objectCount }) => objectCount === size)
    assert.deepEqual(group.map(({ template }) => template), ['blank', 'lined', 'dotted'])
    assert.ok(group.every(({ sheetColor }) => sheetColor === 'white'))
  }
})

test('controlled and native modes report isolated effective and actual environment values', () => {
  const actual = { viewportWidth: 1365, viewportHeight: 900, dpr: 2, backingWidth: 2730, backingHeight: 1800, zoom: 1.5, offsetX: -120, offsetY: 45 }
  const controlled = benchmark.getBenchmarkEnvironment('controlled', actual)
  assert.deepEqual(controlled.configuredViewport, { width: 1200, height: 800 })
  assert.equal(controlled.effectiveDpr, 1)
  assert.equal(controlled.canvasZoom, 1)
  assert.deepEqual(controlled.canvasOffset, { x: 0, y: 0 })
  assert.deepEqual(controlled.effectiveBackingStore, { width: 1200, height: 800 })
  assert.deepEqual(controlled.actualBackingStore, { width: 2730, height: 1800 })
  const native = benchmark.getBenchmarkEnvironment('native', actual)
  assert.deepEqual(native.configuredViewport, { width: 1365, height: 900 })
  assert.equal(native.effectiveDpr, 2)
  assert.equal(native.canvasZoom, 1.5)
  assert.deepEqual(native.canvasOffset, { x: -120, y: 45 })
})

test('both benchmark modes use one generator and production state is restored after benchmark', () => {
  assert.match(app, /createBenchmarkScene\(size\)/)
  assert.match(app, /runSyntheticBenchmark\('controlled'\)/)
  assert.match(app, /runSyntheticBenchmark\('native'\)/)
  assert.match(app, /strokesRef\.current = oldItems/)
  assert.match(app, /viewportRef\.current\s*=/) // view changes remain owned by production gestures; benchmark passes a local render override
  assert.match(app, /oldCanvasWidth/)
  assert.match(app, /canvas\.width = oldCanvasWidth/)
})
