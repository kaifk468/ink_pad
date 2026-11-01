export type DiagnosticStrokeMode = 'raw' | 'smooth'
export type DiagnosticStrokeLength = 'short' | 'long'

export type SceneComplexity = {
  items: number
  strokes: number
  rectangles: number
  connectors: number
  storedPoints: number
  zoom: number
  devicePixelRatio: number
  pageOverviewExpanded: boolean
}

export const PERFORMANCE_METRICS = [
  'sampleToHandlerMs',
  'sampleIntervalMs',
  'frameWaitMs',
  'frameGapMs',
  'renderAllMs',
  'mainCanvasMs',
  'historyInkMs',
  'activeStrokeRenderMs',
  'compositeMs',
  'minimapMs',
  'pageOverviewMs',
  'latestSampleToRenderMs',
  'oldestSampleToRenderMs',
] as const

export type PerformanceMetric = typeof PERFORMANCE_METRICS[number]
export type MetricSummary = {
  p50Ms: number
  p95Ms: number
  maxMs: number
  /** Number of retained observations used to calculate P95. */
  observations: number
  /** Total observations seen, including samples outside the bounded P95 window. */
  totalObservations: number
}
export type MetricSummaries = Record<PerformanceMetric, MetricSummary>
export type LatencyStageSummary = {
  label: 'Pointer delivery' | 'RAF wait' | 'Main canvas render' | 'Minimap render' | 'Page overview render' | 'Awaiting samples'
  p95Ms: number
  observations: number
}
export type NumericDistribution = {
  p50: number
  p95: number
  max: number
  observations: number
  totalObservations: number
}
export type StrokeDistributionName =
  | 'strokeDurationMs'
  | 'retainedPointCount'
  | 'pointerHz'
  | 'samplesPerMove'
  | 'mergedFrameRequestRatio'
  | 'sceneItems'
  | 'sceneStrokes'
  | 'sceneRectangles'
  | 'sceneConnectors'
  | 'scenePoints'
  | 'zoom'
  | 'devicePixelRatio'
  | 'pageOverviewExpanded'
export type StrokeDistributions = Record<StrokeDistributionName, NumericDistribution>

export type StrokeDiagnosticRow = {
  mode: DiagnosticStrokeMode
  length: DiagnosticStrokeLength
  strokes: number
  avgDurationMs: number
  avgPoints: number
  avgPointerHz: number
  avgSamplesPerMove: number
  avgMergedFrameRequests: number
  avgSceneItems: number
  avgSceneStrokes: number
  avgSceneRectangles: number
  avgSceneConnectors: number
  avgScenePoints: number
  avgZoom: number
  avgDevicePixelRatio: number
  pageOverviewUsePercent: number
  metrics: MetricSummaries
  strokeDistributions: StrokeDistributions
}

export function getLargestMeasuredLatencyStage(metrics: Pick<MetricSummaries, 'sampleToHandlerMs' | 'frameWaitMs' | 'mainCanvasMs' | 'minimapMs' | 'pageOverviewMs'>): LatencyStageSummary {
  const stages: LatencyStageSummary[] = [
    { label: 'Pointer delivery', p95Ms: metrics.sampleToHandlerMs.p95Ms, observations: metrics.sampleToHandlerMs.observations },
    { label: 'RAF wait', p95Ms: metrics.frameWaitMs.p95Ms, observations: metrics.frameWaitMs.observations },
    { label: 'Main canvas render', p95Ms: metrics.mainCanvasMs.p95Ms, observations: metrics.mainCanvasMs.observations },
    { label: 'Minimap render', p95Ms: metrics.minimapMs.p95Ms, observations: metrics.minimapMs.observations },
    { label: 'Page overview render', p95Ms: metrics.pageOverviewMs.p95Ms, observations: metrics.pageOverviewMs.observations },
  ]
  return stages.filter((stage) => stage.observations > 0).reduce((largest, stage) => stage.p95Ms > largest.p95Ms ? stage : largest, {
    label: 'Awaiting samples', p95Ms: 0, observations: 0,
  })
}

export type BrowserStallSummary = {
  longTaskSupported: boolean | null
  longAnimationFrameSupported: boolean | null
  longTaskCount: number
  longTaskDuration: MetricSummary
  longAnimationFrameCount: number
  longAnimationFrameDuration: MetricSummary
}

export type DiagnosticDeviceInfo = {
  userAgent: string | null
  platform: string | null
  devicePixelRatio: number
  viewport: { width: number; height: number }
  screen: { width: number; height: number }
  hardwareConcurrency: number | null
  maxTouchPoints: number
}

export type DiagnosticsJsonExport = {
  schema: 'inkpad-performance-diagnostics'
  schemaVersion: 1
  exportedAt: string
  capture: {
    startedAt: string | null
    stoppedAt: string | null
    activeAtExport: boolean
    durationMs: number | null
    strokeCount: number
    retainedStrokeCount: number
    strokeCountsByGroup: Record<string, number>
    groups: StrokeDiagnosticRow[]
  }
  browserStalls: BrowserStallSummary
  device: DiagnosticDeviceInfo
  privacy: {
    includesStrokeCoordinates: false
    includesStrokePressure: false
    includesStrokeContent: false
  }
}

type MetricBuffer = { samples: number[]; cursor: number; total: number; max: number }
type MetricBufferSet = Record<PerformanceMetric, MetricBuffer>
type MetricBufferSnapshot = { samples: number[]; total: number; max: number }
type MetricBufferSnapshotSet = Record<PerformanceMetric, MetricBufferSnapshot>

type ActiveStrokeMetrics = {
  mode: DiagnosticStrokeMode
  startedAt: number
  lastPointerTimestamp: number
  pointerMoves: number
  coalescedSamples: number
  pointerIntervalTotal: number
  pointerIntervalCount: number
  pendingOldestSampleTime: number | null
  pendingLatestSampleTime: number | null
  frameRequests: number
  mergedFrameRequests: number
  lastFrameCallbackAt: number | null
  complexity: SceneComplexity
  metrics: MetricBufferSet
}

type StrokeSummary = {
  durationMs: number
  points: number
  avgPointerHz: number
  avgSamplesPerMove: number
  avgMergedFrameRequests: number
  complexity: SceneComplexity
  metrics: MetricBufferSnapshotSet
}

const SHORT_STROKE_LIMIT_POINTS = 120
const MAX_STROKES_PER_BUCKET = 40
// Bounds percentile storage while keeping maximums and total counts exact.
const MAX_SAMPLES_PER_METRIC_PER_STROKE = 512
const MAX_BROWSER_STALL_SAMPLES = 1024

function createMetricBuffer(): MetricBuffer {
  return { samples: [], cursor: 0, total: 0, max: 0 }
}

function createMetricBuffers(): MetricBufferSet {
  return Object.fromEntries(PERFORMANCE_METRICS.map((name) => [name, createMetricBuffer()])) as MetricBufferSet
}

function recordMetric(buffer: MetricBuffer, value: number): void {
  if (!Number.isFinite(value) || value < 0) return
  buffer.total += 1
  buffer.max = Math.max(buffer.max, value)
  if (buffer.samples.length < MAX_SAMPLES_PER_METRIC_PER_STROKE) {
    buffer.samples.push(value)
    return
  }
  buffer.samples[buffer.cursor] = value
  buffer.cursor = (buffer.cursor + 1) % MAX_SAMPLES_PER_METRIC_PER_STROKE
}

function recordGlobalMetric(buffer: MetricBuffer, value: number, capacity = MAX_BROWSER_STALL_SAMPLES): void {
  if (!Number.isFinite(value) || value < 0) return
  buffer.total += 1
  buffer.max = Math.max(buffer.max, value)
  if (buffer.samples.length < capacity) {
    buffer.samples.push(value)
    return
  }
  buffer.samples[buffer.cursor] = value
  buffer.cursor = (buffer.cursor + 1) % capacity
}

function snapshotMetricBuffers(metrics: MetricBufferSet): MetricBufferSnapshotSet {
  return Object.fromEntries(PERFORMANCE_METRICS.map((name) => {
    const metric = metrics[name]
    return [name, { samples: [...metric.samples], total: metric.total, max: metric.max }]
  })) as MetricBufferSnapshotSet
}

function percentile(values: number[], percentileValue: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)]
}

function summarizeValues(values: number[], totalObservations: number): NumericDistribution {
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length ? Math.max(...values) : 0,
    observations: values.length,
    totalObservations,
  }
}

function summarizeMetric(sources: Array<{ samples: number[]; total: number; max: number }>): MetricSummary {
  const samples = sources.flatMap((source) => source.samples)
  return {
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    maxMs: sources.reduce((maximum, source) => Math.max(maximum, source.max), 0),
    observations: samples.length,
    totalObservations: sources.reduce((sum, source) => sum + source.total, 0),
  }
}

function normalizeEventTimestamp(timestamp: number, receivedAt: number): number {
  // Older WebKit builds can expose epoch timestamps instead of the monotonic
  // time origin used by performance.now(). Normalize those without changing
  // the native PointerEvent or the saved canvas point model.
  if (timestamp > receivedAt + 60_000 && Number.isFinite(performance.timeOrigin)) return timestamp - performance.timeOrigin
  return timestamp
}

function emptyComplexity(): SceneComplexity {
  return { items: 0, strokes: 0, rectangles: 0, connectors: 0, storedPoints: 0, zoom: 0, devicePixelRatio: 0, pageOverviewExpanded: false }
}

export class PerformanceDiagnostics {
  private captureEnabled = false
  private activeStroke: ActiveStrokeMetrics | null = null
  private pendingFrameAt: number | null = null
  private completed = new Map<string, StrokeSummary[]>()
  private longTask = createMetricBuffer()
  private longAnimationFrame = createMetricBuffer()
  private longTaskSupported: boolean | null = null
  private longAnimationFrameSupported: boolean | null = null
  private captureStartedAt: number | null = null
  private captureStoppedAt: number | null = null
  private completedStrokeCount = 0
  private completedStrokeCountsByGroup = new Map<string, number>()

  isCapturing(): boolean {
    return this.captureEnabled
  }

  isStrokeActive(): boolean {
    return this.captureEnabled && this.activeStroke !== null
  }

  startCapture(now = Date.now()): void {
    this.reset()
    this.longTaskSupported = null
    this.longAnimationFrameSupported = null
    this.captureStartedAt = now
    this.captureStoppedAt = null
    this.captureEnabled = true
  }

  stopCapture(now = Date.now()): void {
    if (this.captureEnabled) this.captureStoppedAt = now
    this.captureEnabled = false
    this.activeStroke = null
    this.pendingFrameAt = null
  }

  setLongTaskSupport(supported: boolean): void {
    this.longTaskSupported = supported
  }

  setLongAnimationFrameSupport(supported: boolean): void {
    this.longAnimationFrameSupported = supported
  }

  startStroke(mode: DiagnosticStrokeMode, now: number, pointerTimestamp: number, complexity = emptyComplexity()): void {
    if (!this.captureEnabled) return
    const normalizedPointerTimestamp = normalizeEventTimestamp(pointerTimestamp, now)
    this.pendingFrameAt = null
    this.activeStroke = {
      mode,
      startedAt: now,
      lastPointerTimestamp: normalizedPointerTimestamp,
      pointerMoves: 0,
      coalescedSamples: 0,
      pointerIntervalTotal: 0,
      pointerIntervalCount: 0,
      pendingOldestSampleTime: normalizedPointerTimestamp,
      pendingLatestSampleTime: normalizedPointerTimestamp,
      frameRequests: 0,
      mergedFrameRequests: 0,
      lastFrameCallbackAt: null,
      complexity: { ...complexity },
      metrics: createMetricBuffers(),
    }
    recordMetric(this.activeStroke.metrics.sampleToHandlerMs, now - normalizedPointerTimestamp)
  }

  recordPointerMove(sampleTimestamps: number[], receivedAt: number): void {
    const stroke = this.activeStroke
    if (!this.captureEnabled || !stroke) return
    stroke.pointerMoves += 1
    stroke.coalescedSamples += sampleTimestamps.length
    for (const timestamp of sampleTimestamps) {
      const monotonicTimestamp = normalizeEventTimestamp(timestamp, receivedAt)
      recordMetric(stroke.metrics.sampleToHandlerMs, receivedAt - monotonicTimestamp)
      const interval = monotonicTimestamp - stroke.lastPointerTimestamp
      if (interval > 0) {
        recordMetric(stroke.metrics.sampleIntervalMs, interval)
        stroke.pointerIntervalTotal += interval
        stroke.pointerIntervalCount += 1
      }
      stroke.lastPointerTimestamp = monotonicTimestamp
      if (stroke.pendingOldestSampleTime === null) stroke.pendingOldestSampleTime = monotonicTimestamp
      stroke.pendingLatestSampleTime = monotonicTimestamp
    }
  }

  recordFrameRequest(now: number, alreadyPending: boolean): void {
    if (!this.captureEnabled) return
    if (!alreadyPending) this.pendingFrameAt = now
    const stroke = this.activeStroke
    if (!stroke) return
    stroke.frameRequests += 1
    if (alreadyPending) stroke.mergedFrameRequests += 1
  }

  recordFrameCallback(now: number): void {
    if (!this.captureEnabled) return
    const stroke = this.activeStroke
    if (this.pendingFrameAt !== null) {
      if (stroke) recordMetric(stroke.metrics.frameWaitMs, now - this.pendingFrameAt)
      this.pendingFrameAt = null
    }
    if (!stroke) return
    if (stroke.lastFrameCallbackAt !== null) recordMetric(stroke.metrics.frameGapMs, now - stroke.lastFrameCallbackAt)
    stroke.lastFrameCallbackAt = now
  }

  recordMainCanvasRender(durationMs: number): void {
    if (this.captureEnabled && this.activeStroke) recordMetric(this.activeStroke.metrics.mainCanvasMs, durationMs)
  }

  recordHistoryInkRender(durationMs: number): void {
    if (this.captureEnabled && this.activeStroke) recordMetric(this.activeStroke.metrics.historyInkMs, durationMs)
  }

  recordActiveStrokeRender(durationMs: number): void {
    if (this.captureEnabled && this.activeStroke) recordMetric(this.activeStroke.metrics.activeStrokeRenderMs, durationMs)
  }

  recordCompositeRender(durationMs: number): void {
    if (this.captureEnabled && this.activeStroke) recordMetric(this.activeStroke.metrics.compositeMs, durationMs)
  }

  recordMinimapRender(durationMs: number): void {
    if (this.captureEnabled && this.activeStroke) recordMetric(this.activeStroke.metrics.minimapMs, durationMs)
  }

  recordPageOverviewRender(durationMs: number): void {
    if (this.captureEnabled && this.activeStroke) recordMetric(this.activeStroke.metrics.pageOverviewMs, durationMs)
  }

  recordRenderComplete(durationMs: number, finishedAt: number): void {
    const stroke = this.activeStroke
    if (!this.captureEnabled || !stroke) return
    recordMetric(stroke.metrics.renderAllMs, durationMs)
    if (stroke.pendingLatestSampleTime !== null) {
      recordMetric(stroke.metrics.latestSampleToRenderMs, finishedAt - stroke.pendingLatestSampleTime)
      if (stroke.pendingOldestSampleTime !== null) recordMetric(stroke.metrics.oldestSampleToRenderMs, finishedAt - stroke.pendingOldestSampleTime)
      stroke.pendingOldestSampleTime = null
      stroke.pendingLatestSampleTime = null
    }
  }

  recordBrowserStall(kind: 'longtask' | 'long-animation-frame', durationMs: number): void {
    if (!this.captureEnabled) return
    recordGlobalMetric(kind === 'longtask' ? this.longTask : this.longAnimationFrame, durationMs)
  }

  finishStroke(pointCount: number, finishedAt: number): void {
    const stroke = this.activeStroke
    if (!this.captureEnabled || !stroke) return
    const length: DiagnosticStrokeLength = pointCount <= SHORT_STROKE_LIMIT_POINTS ? 'short' : 'long'
    const key = `${stroke.mode}-${length}`
    const summaries = this.completed.get(key) ?? []
    this.completedStrokeCount += 1
    this.completedStrokeCountsByGroup.set(key, (this.completedStrokeCountsByGroup.get(key) ?? 0) + 1)
    const averageInterval = stroke.pointerIntervalCount
      ? stroke.pointerIntervalTotal / stroke.pointerIntervalCount
      : 0
    summaries.push({
      durationMs: finishedAt - stroke.startedAt,
      points: pointCount,
      avgPointerHz: averageInterval > 0 ? 1000 / averageInterval : 0,
      avgSamplesPerMove: stroke.pointerMoves ? stroke.coalescedSamples / stroke.pointerMoves : 0,
      avgMergedFrameRequests: stroke.frameRequests ? stroke.mergedFrameRequests / stroke.frameRequests : 0,
      complexity: stroke.complexity,
      metrics: snapshotMetricBuffers(stroke.metrics),
    })
    if (summaries.length > MAX_STROKES_PER_BUCKET) summaries.shift()
    this.completed.set(key, summaries)
    this.activeStroke = null
  }

  reset(): void {
    this.activeStroke = null
    this.pendingFrameAt = null
    this.completed.clear()
    this.longTask = createMetricBuffer()
    this.longAnimationFrame = createMetricBuffer()
    this.completedStrokeCount = 0
    this.completedStrokeCountsByGroup.clear()
    this.captureStartedAt = this.captureEnabled ? Date.now() : null
    this.captureStoppedAt = null
  }

  browserStallSnapshot(): BrowserStallSummary {
    return {
      longTaskSupported: this.longTaskSupported,
      longAnimationFrameSupported: this.longAnimationFrameSupported,
      longTaskCount: this.longTask.total,
      longTaskDuration: summarizeMetric([{ samples: this.longTask.samples, total: this.longTask.total, max: this.longTask.max }]),
      longAnimationFrameCount: this.longAnimationFrame.total,
      longAnimationFrameDuration: summarizeMetric([{ samples: this.longAnimationFrame.samples, total: this.longAnimationFrame.total, max: this.longAnimationFrame.max }]),
    }
  }

  exportJson(device: DiagnosticDeviceInfo, exportedAt = Date.now()): DiagnosticsJsonExport {
    const groups = this.snapshot()
    const endTime = this.captureStoppedAt ?? (this.captureEnabled ? exportedAt : null)
    return {
      schema: 'inkpad-performance-diagnostics',
      schemaVersion: 1,
      exportedAt: new Date(exportedAt).toISOString(),
      capture: {
        startedAt: this.captureStartedAt === null ? null : new Date(this.captureStartedAt).toISOString(),
        stoppedAt: this.captureStoppedAt === null ? null : new Date(this.captureStoppedAt).toISOString(),
        activeAtExport: this.captureEnabled,
        durationMs: this.captureStartedAt === null || endTime === null ? null : endTime - this.captureStartedAt,
        strokeCount: this.completedStrokeCount,
        retainedStrokeCount: groups.reduce((sum, group) => sum + group.strokes, 0),
        strokeCountsByGroup: Object.fromEntries(['raw-short', 'raw-long', 'smooth-short', 'smooth-long'].map((key) => [key, this.completedStrokeCountsByGroup.get(key) ?? 0])),
        groups,
      },
      browserStalls: this.browserStallSnapshot(),
      device: { ...device, viewport: { ...device.viewport }, screen: { ...device.screen } },
      privacy: {
        includesStrokeCoordinates: false,
        includesStrokePressure: false,
        includesStrokeContent: false,
      },
    }
  }

  snapshot(): StrokeDiagnosticRow[] {
    const rows: StrokeDiagnosticRow[] = []
    for (const mode of ['raw', 'smooth'] as const) {
      for (const length of ['short', 'long'] as const) {
        const summaries = this.completed.get(`${mode}-${length}`) ?? []
        const average = (select: (summary: StrokeSummary) => number) => summaries.length
          ? summaries.reduce((sum, summary) => sum + select(summary), 0) / summaries.length
          : 0
        const metrics = Object.fromEntries(PERFORMANCE_METRICS.map((name) => [
          name,
          summarizeMetric(summaries.map((summary) => summary.metrics[name])),
        ])) as MetricSummaries
        const totalStrokes = this.completedStrokeCountsByGroup.get(`${mode}-${length}`) ?? 0
        const strokeValues: Record<StrokeDistributionName, number[]> = {
          strokeDurationMs: summaries.map((summary) => summary.durationMs),
          retainedPointCount: summaries.map((summary) => summary.points),
          pointerHz: summaries.map((summary) => summary.avgPointerHz),
          samplesPerMove: summaries.map((summary) => summary.avgSamplesPerMove),
          mergedFrameRequestRatio: summaries.map((summary) => summary.avgMergedFrameRequests),
          sceneItems: summaries.map((summary) => summary.complexity.items),
          sceneStrokes: summaries.map((summary) => summary.complexity.strokes),
          sceneRectangles: summaries.map((summary) => summary.complexity.rectangles),
          sceneConnectors: summaries.map((summary) => summary.complexity.connectors),
          scenePoints: summaries.map((summary) => summary.complexity.storedPoints),
          zoom: summaries.map((summary) => summary.complexity.zoom),
          devicePixelRatio: summaries.map((summary) => summary.complexity.devicePixelRatio),
          pageOverviewExpanded: summaries.map((summary) => Number(summary.complexity.pageOverviewExpanded)),
        }
        const strokeDistributions = Object.fromEntries(Object.entries(strokeValues).map(([name, values]) => [
          name,
          summarizeValues(values, totalStrokes),
        ])) as StrokeDistributions
        rows.push({
          mode, length, strokes: summaries.length,
          avgDurationMs: average((summary) => summary.durationMs),
          avgPoints: average((summary) => summary.points),
          avgPointerHz: average((summary) => summary.avgPointerHz),
          avgSamplesPerMove: average((summary) => summary.avgSamplesPerMove),
          avgMergedFrameRequests: average((summary) => summary.avgMergedFrameRequests),
          avgSceneItems: average((summary) => summary.complexity.items),
          avgSceneStrokes: average((summary) => summary.complexity.strokes),
          avgSceneRectangles: average((summary) => summary.complexity.rectangles),
          avgSceneConnectors: average((summary) => summary.complexity.connectors),
          avgScenePoints: average((summary) => summary.complexity.storedPoints),
          avgZoom: average((summary) => summary.complexity.zoom),
          avgDevicePixelRatio: average((summary) => summary.complexity.devicePixelRatio),
          pageOverviewUsePercent: summaries.length ? average((summary) => Number(summary.complexity.pageOverviewExpanded)) * 100 : 0,
          metrics,
          strokeDistributions,
        })
      }
    }
    return rows
  }
}
