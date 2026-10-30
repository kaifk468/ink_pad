export type DiagnosticStrokeMode = 'raw' | 'smooth'
export type DiagnosticStrokeLength = 'short' | 'long'

type TimedValues = {
  frameWaitMs: number[]
  renderAllMs: number[]
  activeStrokeRenderMs: number[]
  minimapMs: number[]
  pageOverviewMs: number[]
  eventToRenderMs: number[]
}

type ActiveStrokeMetrics = TimedValues & {
  mode: DiagnosticStrokeMode
  startedAt: number
  pointerMoves: number
  coalescedSamples: number
  eventIntervalsMs: number[]
  lastPointerTimestamp: number
  latestPointerReceivedAt: number | null
  frameRequests: number
  coalescedFrameRequests: number
}

export type StrokeDiagnosticRow = {
  mode: DiagnosticStrokeMode
  length: DiagnosticStrokeLength
  strokes: number
  avgDurationMs: number
  avgPoints: number
  avgPointerIntervalMs: number
  avgPointerHz: number
  avgSamplesPerMove: number
  avgFrameWaitMs: number
  avgRenderAllMs: number
  avgActiveStrokeRenderMs: number
  avgMinimapMs: number
  avgPageOverviewMs: number
  avgEventToRenderMs: number
  avgCoalescedFrameRequests: number
}

type StrokeSummary = Omit<StrokeDiagnosticRow, 'mode' | 'length' | 'strokes'>

const STROKE_LENGTH_SPLIT_POINTS = 120
const MAX_STROKES_PER_BUCKET = 40

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function metricsForStroke(): TimedValues {
  return { frameWaitMs: [], renderAllMs: [], activeStrokeRenderMs: [], minimapMs: [], pageOverviewMs: [], eventToRenderMs: [] }
}

export class PerformanceDiagnostics {
  private activeStroke: ActiveStrokeMetrics | null = null
  private pendingFrameAt: number | null = null
  private completed = new Map<string, StrokeSummary[]>()

  isStrokeActive(): boolean {
    return this.activeStroke !== null
  }

  startStroke(mode: DiagnosticStrokeMode, now: number, pointerTimestamp: number): void {
    this.activeStroke = {
      ...metricsForStroke(), mode, startedAt: now, pointerMoves: 0, coalescedSamples: 0,
      eventIntervalsMs: [], lastPointerTimestamp: pointerTimestamp, latestPointerReceivedAt: null,
      frameRequests: 0, coalescedFrameRequests: 0,
    }
  }

  recordPointerMove(pointerTimestamp: number, coalescedSampleCount: number, receivedAt: number): void {
    const stroke = this.activeStroke
    if (!stroke) return
    const interval = pointerTimestamp - stroke.lastPointerTimestamp
    if (Number.isFinite(interval) && interval > 0) stroke.eventIntervalsMs.push(interval)
    stroke.lastPointerTimestamp = pointerTimestamp
    stroke.pointerMoves += 1
    stroke.coalescedSamples += coalescedSampleCount
    stroke.latestPointerReceivedAt = receivedAt
  }

  recordFrameRequest(now: number, alreadyPending: boolean): void {
    if (!alreadyPending) this.pendingFrameAt = now
    const stroke = this.activeStroke
    if (!stroke) return
    stroke.frameRequests += 1
    if (alreadyPending) stroke.coalescedFrameRequests += 1
  }

  recordFrameCallback(now: number): void {
    if (this.pendingFrameAt === null) return
    this.activeStroke?.frameWaitMs.push(now - this.pendingFrameAt)
    this.pendingFrameAt = null
  }

  recordActiveStrokeRender(durationMs: number): void {
    this.activeStroke?.activeStrokeRenderMs.push(durationMs)
  }

  recordMinimapRender(durationMs: number): void {
    this.activeStroke?.minimapMs.push(durationMs)
  }

  recordPageOverviewRender(durationMs: number): void {
    this.activeStroke?.pageOverviewMs.push(durationMs)
  }

  recordRenderComplete(durationMs: number, finishedAt: number): void {
    const stroke = this.activeStroke
    if (!stroke) return
    stroke.renderAllMs.push(durationMs)
    if (stroke.latestPointerReceivedAt !== null) {
      stroke.eventToRenderMs.push(finishedAt - stroke.latestPointerReceivedAt)
      stroke.latestPointerReceivedAt = null
    }
  }

  finishStroke(pointCount: number, finishedAt: number): void {
    const stroke = this.activeStroke
    if (!stroke) return
    const length: DiagnosticStrokeLength = pointCount <= STROKE_LENGTH_SPLIT_POINTS ? 'short' : 'long'
    const key = `${stroke.mode}-${length}`
    const summaries = this.completed.get(key) ?? []
    const durationMs = finishedAt - stroke.startedAt
    const avgEventIntervalMs = mean(stroke.eventIntervalsMs)
    const summary: StrokeSummary = {
      avgDurationMs: durationMs,
      avgPoints: pointCount,
      avgPointerIntervalMs: avgEventIntervalMs,
      avgPointerHz: avgEventIntervalMs > 0 ? 1000 / avgEventIntervalMs : 0,
      avgSamplesPerMove: stroke.pointerMoves ? stroke.coalescedSamples / stroke.pointerMoves : 0,
      avgFrameWaitMs: mean(stroke.frameWaitMs),
      avgRenderAllMs: mean(stroke.renderAllMs),
      avgActiveStrokeRenderMs: mean(stroke.activeStrokeRenderMs),
      avgMinimapMs: mean(stroke.minimapMs),
      avgPageOverviewMs: mean(stroke.pageOverviewMs),
      avgEventToRenderMs: mean(stroke.eventToRenderMs),
      avgCoalescedFrameRequests: stroke.frameRequests ? stroke.coalescedFrameRequests / stroke.frameRequests : 0,
    }
    summaries.push(summary)
    if (summaries.length > MAX_STROKES_PER_BUCKET) summaries.shift()
    this.completed.set(key, summaries)
    this.activeStroke = null
  }

  reset(): void {
    this.activeStroke = null
    this.pendingFrameAt = null
    this.completed.clear()
  }

  snapshot(): StrokeDiagnosticRow[] {
    const rows: StrokeDiagnosticRow[] = []
    for (const mode of ['raw', 'smooth'] as const) {
      for (const length of ['short', 'long'] as const) {
        const summaries = this.completed.get(`${mode}-${length}`) ?? []
        const average = (field: keyof StrokeSummary) => mean(summaries.map((summary) => summary[field]))
        rows.push({
          mode, length, strokes: summaries.length,
          avgDurationMs: average('avgDurationMs'), avgPoints: average('avgPoints'), avgPointerIntervalMs: average('avgPointerIntervalMs'), avgPointerHz: average('avgPointerHz'),
          avgSamplesPerMove: average('avgSamplesPerMove'), avgFrameWaitMs: average('avgFrameWaitMs'),
          avgRenderAllMs: average('avgRenderAllMs'), avgActiveStrokeRenderMs: average('avgActiveStrokeRenderMs'),
          avgMinimapMs: average('avgMinimapMs'), avgPageOverviewMs: average('avgPageOverviewMs'),
          avgEventToRenderMs: average('avgEventToRenderMs'), avgCoalescedFrameRequests: average('avgCoalescedFrameRequests'),
        })
      }
    }
    return rows
  }
}
