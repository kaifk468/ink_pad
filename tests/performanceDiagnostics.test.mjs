import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/performanceDiagnostics.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const { PerformanceDiagnostics } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')

test('diagnostics summarize pointer, RAF, render stage, and estimated latency metrics by mode and stroke size', () => {
  const metrics = new PerformanceDiagnostics()
  metrics.startStroke('raw', 0, 0)
  metrics.recordPointerMove(10, 3, 12)
  metrics.recordFrameRequest(12, false)
  metrics.recordFrameRequest(13, true)
  metrics.recordFrameCallback(18)
  metrics.recordActiveStrokeRender(1.5)
  metrics.recordMinimapRender(0.5)
  metrics.recordPageOverviewRender(0.2)
  metrics.recordRenderComplete(2.2, 20)
  metrics.recordPointerMove(20, 2, 21)
  metrics.recordFrameRequest(21, false)
  metrics.recordFrameCallback(25)
  metrics.recordRenderComplete(3, 28)
  metrics.finishStroke(3, 100)

  const row = metrics.snapshot().find(({ mode, length }) => mode === 'raw' && length === 'short')
  assert.equal(row.strokes, 1)
  assert.equal(row.avgDurationMs, 100)
  assert.equal(row.avgPoints, 3)
  assert.equal(row.avgPointerIntervalMs, 10)
  assert.equal(row.avgPointerHz, 100)
  assert.equal(row.avgSamplesPerMove, 2.5)
  assert.equal(row.avgFrameWaitMs, 5)
  assert.equal(row.avgCoalescedFrameRequests, 1 / 3)
  assert.equal(row.avgActiveStrokeRenderMs, 1.5)
  assert.equal(row.avgMinimapMs, 0.5)
  assert.equal(row.avgPageOverviewMs, 0.2)
  assert.equal(row.avgRenderAllMs, 2.6)
  assert.equal(row.avgEventToRenderMs, 7.5)
  assert.equal(metrics.snapshot().find(({ mode, length }) => mode === 'smooth' && length === 'long').strokes, 0)
})

test('diagnostic history is bounded and resettable', () => {
  const metrics = new PerformanceDiagnostics()
  for (let index = 0; index < 45; index += 1) {
    metrics.startStroke('raw', index * 10, index * 10)
    metrics.finishStroke(121, index * 10 + 5)
  }
  assert.equal(metrics.snapshot().find((row) => row.mode === 'raw' && row.length === 'long').strokes, 40)
  metrics.reset()
  assert.ok(metrics.snapshot().every((row) => row.strokes === 0))
})

test('instrumentation and its compact panel are development-only', () => {
  assert.match(appSource, /const PERFORMANCE_DIAGNOSTICS_ENABLED = import\.meta\.env\.DEV/)
  assert.match(appSource, /PERFORMANCE_DIAGNOSTICS_ENABLED && performanceDiagnosticsOpen/)
  assert.match(appSource, /getCoalescedEvents\?\.\(\) \?\? \[event\.nativeEvent\]/)
  assert.match(appSource, /recordMinimapRender/)
  assert.match(appSource, /recordPageOverviewRender/)
  assert.match(css, /\.performance-panel\s*\{/)
})
