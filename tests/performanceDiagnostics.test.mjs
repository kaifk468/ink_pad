import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { readAppSource } from './helpers/appSource.mjs'

const source = await readFile(new URL('../src/performanceDiagnostics.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const { PerformanceDiagnostics, getLargestMeasuredLatencyStage } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const appSource = await readAppSource()
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')

test('diagnostics report input, RAF, rendering, and complexity measurements by mode and stroke size', () => {
  const metrics = new PerformanceDiagnostics()
  metrics.startCapture()
  metrics.startStroke('raw', 0, 0, { items: 8, strokes: 5, rectangles: 2, connectors: 1, storedPoints: 940, zoom: 1.5, devicePixelRatio: 2, pageOverviewExpanded: true })
  metrics.recordPointerMove([10, 15], 16)
  metrics.recordFrameRequest(12, false)
  metrics.recordFrameRequest(13, true)
  metrics.recordFrameCallback(18)
  metrics.recordActiveStrokeRender(1.5)
  metrics.recordHistoryInkRender(0.6)
  metrics.recordCompositeRender(0.4)
  metrics.recordMainCanvasRender(1.8)
  metrics.recordMinimapRender(0.5)
  metrics.recordPageOverviewRender(0.2)
  metrics.recordRenderComplete(2.2, 20)
  metrics.recordPointerMove([20], 21)
  metrics.recordFrameRequest(21, false)
  metrics.recordFrameCallback(25)
  metrics.recordRenderComplete(3, 28)
  metrics.finishStroke(3, 100)

  const row = metrics.snapshot().find(({ mode, length }) => mode === 'raw' && length === 'short')
  assert.equal(row.strokes, 1)
  assert.equal(row.avgDurationMs, 100)
  assert.equal(row.avgPoints, 3)
  assert.equal(row.avgPointerHz, 150)
  assert.equal(row.avgSamplesPerMove, 1.5)
  assert.equal(row.avgMergedFrameRequests, 1 / 3)
  assert.equal(row.avgSceneItems, 8)
  assert.equal(row.avgScenePoints, 940)
  assert.equal(row.avgZoom, 1.5)
  assert.equal(row.avgDevicePixelRatio, 2)
  assert.equal(row.pageOverviewUsePercent, 100)
  assert.equal(row.metrics.sampleToHandlerMs.p95Ms, 6)
  assert.equal(row.metrics.sampleToHandlerMs.p50Ms, 1)
  assert.equal(row.metrics.sampleToHandlerMs.maxMs, 6)
  assert.equal(row.metrics.sampleToHandlerMs.observations, 4)
  assert.equal(row.metrics.sampleIntervalMs.p95Ms, 10)
  assert.equal(row.metrics.sampleIntervalMs.maxMs, 10)
  assert.equal(row.metrics.frameWaitMs.p95Ms, 6)
  assert.equal(row.metrics.frameGapMs.maxMs, 7)
  assert.equal(row.metrics.activeStrokeRenderMs.maxMs, 1.5)
  assert.equal(row.metrics.historyInkMs.p95Ms, 0.6)
  assert.equal(row.metrics.compositeMs.maxMs, 0.4)
  assert.equal(row.metrics.minimapMs.p95Ms, 0.5)
  assert.equal(row.metrics.pageOverviewMs.p95Ms, 0.2)
  assert.equal(row.metrics.renderAllMs.p95Ms, 3)
  assert.equal(row.metrics.latestSampleToRenderMs.p95Ms, 8)
  assert.equal(row.metrics.oldestSampleToRenderMs.p95Ms, 20)
  assert.equal(metrics.snapshot().find(({ mode, length }) => mode === 'smooth' && length === 'long').strokes, 0)
})

test('capture is opt-in and stroke retention is bounded and resettable', () => {
  const metrics = new PerformanceDiagnostics()
  metrics.startStroke('raw', 0, 0)
  metrics.finishStroke(1, 5)
  assert.equal(metrics.snapshot().find((row) => row.mode === 'raw' && row.length === 'short').strokes, 0)
  metrics.startCapture()
  for (let index = 0; index < 45; index += 1) {
    metrics.startStroke('raw', index * 10, index * 10)
    metrics.finishStroke(121, index * 10 + 5)
  }
  assert.equal(metrics.snapshot().find((row) => row.mode === 'raw' && row.length === 'long').strokes, 40)
  metrics.reset()
  assert.ok(metrics.snapshot().every((row) => row.strokes === 0))
  assert.equal(metrics.isCapturing(), true)
  metrics.stopCapture()
  assert.equal(metrics.isCapturing(), false)
})

test('metric buffers bound P95 storage while preserving exact observation counts and maximums', () => {
  const metrics = new PerformanceDiagnostics()
  metrics.startCapture()
  metrics.startStroke('raw', 0, 0)
  for (let index = 1; index <= 520; index += 1) {
    const timestamp = index
    metrics.recordPointerMove([timestamp], timestamp + 2)
  }
  metrics.finishStroke(520, 600)

  const row = metrics.snapshot().find(({ mode, length }) => mode === 'raw' && length === 'long')
  assert.equal(row.metrics.sampleToHandlerMs.observations, 512)
  assert.equal(row.metrics.sampleToHandlerMs.totalObservations, 521)
  assert.equal(row.metrics.sampleToHandlerMs.p95Ms, 2)
  assert.equal(row.metrics.sampleToHandlerMs.maxMs, 2)
})

test('browser long task and long animation frame durations expose P95, maximum, and counts', () => {
  const metrics = new PerformanceDiagnostics()
  metrics.startCapture()
  metrics.setLongTaskSupport(true)
  metrics.setLongAnimationFrameSupport(false)
  metrics.recordBrowserStall('longtask', 60)
  metrics.recordBrowserStall('longtask', 90)

  const summary = metrics.browserStallSnapshot()
  assert.equal(summary.longTaskSupported, true)
  assert.equal(summary.longTaskCount, 2)
  assert.equal(summary.longTaskDuration.p95Ms, 90)
  assert.equal(summary.longTaskDuration.p50Ms, 60)
  assert.equal(summary.longTaskDuration.maxMs, 90)
  assert.equal(summary.longTaskDuration.totalObservations, 2)
  assert.equal(summary.longAnimationFrameSupported, false)
  assert.equal(summary.longAnimationFrameCount, 0)
})

test('latency focus identifies the largest measured input, RAF, or render P95 stage', () => {
  const base = { p50Ms: 0, p95Ms: 0, maxMs: 0, observations: 0, totalObservations: 0 }
  assert.equal(getLargestMeasuredLatencyStage({
    sampleToHandlerMs: { ...base, p95Ms: 2, observations: 10 },
    frameWaitMs: { ...base, p95Ms: 8, observations: 10 },
    mainCanvasMs: { ...base, p95Ms: 4, observations: 10 },
    minimapMs: { ...base, p95Ms: 1, observations: 10 },
    pageOverviewMs: { ...base, p95Ms: 0.5, observations: 10 },
  }).label, 'RAF wait')
  assert.equal(getLargestMeasuredLatencyStage({
    sampleToHandlerMs: base,
    frameWaitMs: base,
    mainCanvasMs: base,
    minimapMs: base,
    pageOverviewMs: base,
  }).label, 'Awaiting samples')
  assert.equal(getLargestMeasuredLatencyStage({
    sampleToHandlerMs: { ...base, p95Ms: 2, observations: 10 },
    frameWaitMs: { ...base, p95Ms: 3, observations: 10 },
    mainCanvasMs: { ...base, p95Ms: 4, observations: 10 },
    minimapMs: { ...base, p95Ms: 9, observations: 10 },
    pageOverviewMs: { ...base, p95Ms: 1, observations: 10 },
  }).label, 'Minimap render')
})

test('JSON export includes distributions, stall metrics, timestamps, device metadata, and no stroke content', () => {
  const metrics = new PerformanceDiagnostics()
  metrics.startCapture(Date.UTC(2026, 9, 31, 10, 0, 0))
  metrics.setLongTaskSupport(true)
  metrics.setLongAnimationFrameSupport(true)
  metrics.startStroke('raw', 0, 0, { items: 4, strokes: 3, rectangles: 1, connectors: 0, storedPoints: 400, zoom: 1.25, devicePixelRatio: 2, pageOverviewExpanded: false })
  metrics.recordPointerMove([10, 14, 19], 22)
  metrics.recordRenderComplete(3, 25)
  metrics.recordBrowserStall('longtask', 58)
  metrics.recordBrowserStall('long-animation-frame', 64)
  metrics.finishStroke(12, 100)
  metrics.stopCapture(Date.UTC(2026, 9, 31, 10, 0, 2))

  const device = {
    userAgent: 'Samsung Browser test UA',
    platform: 'Linux armv8l',
    devicePixelRatio: 2,
    viewport: { width: 1280, height: 800 },
    screen: { width: 1600, height: 1000 },
    hardwareConcurrency: 8,
    maxTouchPoints: 10,
  }
  const jsonText = JSON.stringify(metrics.exportJson(device, Date.UTC(2026, 9, 31, 10, 0, 3)))
  const exported = JSON.parse(jsonText)
  const rawGroup = exported.capture.groups.find(({ mode, length }) => mode === 'raw' && length === 'short')

  assert.equal(exported.schema, 'inkpad-performance-diagnostics')
  assert.equal(exported.schemaVersion, 1)
  assert.equal(exported.exportedAt, '2026-10-31T10:00:03.000Z')
  assert.equal(exported.capture.startedAt, '2026-10-31T10:00:00.000Z')
  assert.equal(exported.capture.stoppedAt, '2026-10-31T10:00:02.000Z')
  assert.equal(exported.capture.durationMs, 2000)
  assert.equal(exported.capture.strokeCount, 1)
  assert.equal(exported.capture.retainedStrokeCount, 1)
  assert.equal(exported.capture.strokeCountsByGroup['raw-short'], 1)
  assert.equal(rawGroup.avgZoom, 1.25)
  assert.equal(rawGroup.strokeDistributions.strokeDurationMs.p50, 100)
  assert.equal(rawGroup.strokeDistributions.strokeDurationMs.p95, 100)
  assert.equal(rawGroup.strokeDistributions.strokeDurationMs.max, 100)
  assert.equal(rawGroup.strokeDistributions.strokeDurationMs.observations, 1)
  assert.equal(rawGroup.strokeDistributions.strokeDurationMs.totalObservations, 1)
  assert.equal(rawGroup.strokeDistributions.zoom.p50, 1.25)
  assert.equal(rawGroup.metrics.renderAllMs.p50Ms, 3)
  assert.equal(rawGroup.metrics.renderAllMs.p95Ms, 3)
  assert.equal(rawGroup.metrics.renderAllMs.maxMs, 3)
  assert.equal(rawGroup.metrics.renderAllMs.observations, 1)
  assert.equal(rawGroup.metrics.renderAllMs.totalObservations, 1)
  assert.equal(exported.browserStalls.longTaskDuration.p95Ms, 58)
  assert.equal(exported.browserStalls.longTaskDuration.maxMs, 58)
  assert.equal(exported.browserStalls.longTaskDuration.totalObservations, 1)
  assert.equal(exported.browserStalls.longAnimationFrameDuration.p50Ms, 64)
  assert.deepEqual(exported.device, device)
  assert.deepEqual(exported.privacy, {
    includesStrokeCoordinates: false,
    includesStrokePressure: false,
    includesStrokeContent: false,
  })
  assert.doesNotMatch(jsonText, /canvasItems|"coordinates"\s*:|"path"\s*:|"points"\s*:\s*\[|"x"\s*:|"y"\s*:/)
})

test('JSON export preserves exact total stroke count when retained dashboard rows are capped', () => {
  const metrics = new PerformanceDiagnostics()
  metrics.startCapture(0)
  for (let index = 0; index < 45; index += 1) {
    metrics.startStroke('raw', index * 10, index * 10)
    metrics.finishStroke(10, index * 10 + 5)
  }
  const exported = metrics.exportJson({
    userAgent: null, platform: null, devicePixelRatio: 1,
    viewport: { width: 1, height: 1 }, screen: { width: 1, height: 1 }, hardwareConcurrency: null, maxTouchPoints: 0,
  }, 500)

  assert.equal(exported.capture.strokeCount, 45)
  assert.equal(exported.capture.retainedStrokeCount, 40)
  assert.equal(exported.capture.strokeCountsByGroup['raw-short'], 45)
  const rawShort = exported.capture.groups.find(({ mode, length }) => mode === 'raw' && length === 'short')
  assert.equal(rawShort.strokeDistributions.strokeDurationMs.observations, 40)
  assert.equal(rawShort.strokeDistributions.strokeDurationMs.totalObservations, 45)
})

test('instrumentation and its compact panel are development-only', () => {
  assert.match(appSource, /const PERFORMANCE_DIAGNOSTICS_ENABLED = import\.meta\.env\.DEV/)
  assert.match(appSource, /PERFORMANCE_DIAGNOSTICS_ENABLED && performanceDiagnosticsOpen/)
  assert.match(appSource, /getPointerSamples\(event\.nativeEvent\)/)
  assert.match(appSource, /PerformanceObserver/)
  assert.match(appSource, /performanceCaptureActive/)
  assert.match(appSource, /performance-latency-focus/)
  assert.match(appSource, /formatFocusedP95\(row\.metrics\.sampleToHandlerMs\)/)
  assert.match(appSource, /formatFocusedP95\(row\.metrics\.frameWaitMs\)/)
  assert.match(appSource, /formatFocusedP95\(row\.metrics\.mainCanvasMs\)/)
  assert.match(appSource, /getLargestMeasuredLatencyStage\(row\.metrics\)/)
  assert.match(appSource, /Export JSON/)
  assert.match(appSource, /diagnostics\.exportJson\(getDiagnosticDeviceInfo\(\)\)/)
  assert.match(appSource, /type: 'application\/json'/)
  assert.match(appSource, /recordMinimapRender/)
  assert.doesNotMatch(appSource, /recordPageOverviewRender/) // the Page overview was removed; the metric stays in the diagnostics module
  assert.match(appSource, /formatMetricSummary\(row\.metrics\.renderAllMs\)/)
  assert.match(css, /\.performance-panel\s*\{/)
  assert.match(css, /\.performance-browser-stalls\s*\{/)
  assert.match(css, /\.performance-latency-focus-grid\s*\{/)
})
