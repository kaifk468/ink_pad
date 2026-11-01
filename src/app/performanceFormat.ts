import type { CanvasItem } from '../canvasModel'
import type { DiagnosticDeviceInfo, MetricSummary, SceneComplexity } from '../performanceDiagnostics'

export function getSceneComplexity(items: CanvasItem[], zoom: number, devicePixelRatio: number, pageOverviewExpanded: boolean): SceneComplexity {
  let strokes = 0
  let rectangles = 0
  let connectors = 0
  let storedPoints = 0
  for (const item of items) {
    if (item.kind === 'stroke') {
      strokes += 1
      storedPoints += item.points.length
    } else if (item.kind === 'rectangle') rectangles += 1
    else if (item.kind === 'connector') connectors += 1
  }
  return { items: items.length, strokes, rectangles, connectors, storedPoints, zoom, devicePixelRatio, pageOverviewExpanded }
}

export function getDiagnosticDeviceInfo(): DiagnosticDeviceInfo {
  const browser = window.navigator
  return {
    userAgent: browser.userAgent || null,
    platform: browser.platform || null,
    devicePixelRatio: window.devicePixelRatio || 1,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: window.screen.width, height: window.screen.height },
    hardwareConcurrency: browser.hardwareConcurrency || null,
    maxTouchPoints: browser.maxTouchPoints || 0,
  }
}

export function formatMetricSummary(summary: MetricSummary): string {
  if (!summary.observations) return '—'
  const sampled = summary.observations < summary.totalObservations ? ` (${summary.totalObservations} total)` : ''
  return `P50 ${summary.p50Ms.toFixed(2)} · P95 ${summary.p95Ms.toFixed(2)} · max ${summary.maxMs.toFixed(2)} ms · n ${summary.observations}${sampled}`
}

export function formatFocusedP95(summary: MetricSummary): string {
  if (!summary.observations) return 'No samples'
  const total = summary.observations < summary.totalObservations ? ` / ${summary.totalObservations} total` : ''
  return `P95 ${summary.p95Ms.toFixed(2)} ms · max ${summary.maxMs.toFixed(2)} · n ${summary.observations}${total}`
}

export function formatBrowserStall(summary: MetricSummary, supported: boolean | null): string {
  if (supported === false) return 'not supported'
  if (!summary.totalObservations) return 'none observed'
  const sampled = summary.observations < summary.totalObservations ? ` (${summary.totalObservations} total)` : ''
  return `P50 ${summary.p50Ms.toFixed(1)} · P95 ${summary.p95Ms.toFixed(1)} · max ${summary.maxMs.toFixed(1)} ms · n ${summary.observations}${sampled}`
}
