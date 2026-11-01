import type { CanvasItem, ConnectorObject, ConnectorRelationshipType, Point, RectangleObject, Stroke } from './canvasModel'

export const BENCHMARK_SCENE_SIZES = [25, 250, 1000] as const
export const BENCHMARK_WARMUP_FRAMES = 8
export const BENCHMARK_MEASURED_FRAMES = 40
export const BENCHMARK_SEED = 0x1a2b3c4d
export const CONTROLLED_BENCHMARK_VIEWPORT = { width: 1200, height: 800, dpr: 1, zoom: 1, offsetX: 0, offsetY: 0 } as const
export type BenchmarkMode = 'controlled' | 'native'

export function getBenchmarkEnvironment(mode: BenchmarkMode, actual: { viewportWidth: number; viewportHeight: number; dpr: number; backingWidth: number; backingHeight: number; zoom: number; offsetX: number; offsetY: number }) {
  const configured = mode === 'controlled'
    ? { viewportWidth: CONTROLLED_BENCHMARK_VIEWPORT.width, viewportHeight: CONTROLLED_BENCHMARK_VIEWPORT.height, effectiveDpr: CONTROLLED_BENCHMARK_VIEWPORT.dpr, zoom: CONTROLLED_BENCHMARK_VIEWPORT.zoom, offsetX: CONTROLLED_BENCHMARK_VIEWPORT.offsetX, offsetY: CONTROLLED_BENCHMARK_VIEWPORT.offsetY }
    : { viewportWidth: actual.viewportWidth, viewportHeight: actual.viewportHeight, effectiveDpr: actual.dpr, zoom: actual.zoom, offsetX: actual.offsetX, offsetY: actual.offsetY }
  return { mode, actualViewport: { width: actual.viewportWidth, height: actual.viewportHeight }, configuredViewport: { width: configured.viewportWidth, height: configured.viewportHeight }, actualDpr: actual.dpr, effectiveDpr: configured.effectiveDpr, actualBackingStore: { width: actual.backingWidth, height: actual.backingHeight }, effectiveBackingStore: { width: Math.round(configured.viewportWidth * configured.effectiveDpr), height: Math.round(configured.viewportHeight * configured.effectiveDpr) }, canvasZoom: configured.zoom, canvasOffset: { x: configured.offsetX, y: configured.offsetY } }
}

export function createBenchmarkScene(size: number, seed = BENCHMARK_SEED): CanvasItem[] {
  let state = seed >>> 0
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000 }
  const items: CanvasItem[] = []
  const strokes = Math.round(size * 0.6)
  const rectangles = Math.round(size * 0.2)
  const connectors = size - strokes - rectangles
  for (let index = 0; index < strokes; index += 1) {
    const points: Point[] = []
    const count = [24, 64, 140][index % 3]
    const x = -100 + random() * 2400
    const y = -60 + random() * 1400
    for (let point = 0; point < count; point += 1) {
      const angle = point / Math.max(1, count - 1) * Math.PI * 2
      points.push({ x: x + Math.cos(angle) * (8 + point * 0.08) + random() * 2, y: y + Math.sin(angle) * 12 + random() * 2, pressure: 0.25 + random() * 0.7 })
    }
    const stroke: Stroke = { kind: 'stroke', id: index + 1, points, color: ['#202124', '#3568d4', '#e45b55'][index % 3], width: [2, 4, 7, 11][index % 4], erase: false }
    items.push(stroke)
  }
  const rectangleIds: number[] = []
  for (let index = 0; index < rectangles; index += 1) {
    const id = strokes + index + 1
    rectangleIds.push(id)
    const rectangle: RectangleObject = { kind: 'rectangle', id, x: -80 + random() * 2350, y: -40 + random() * 1300, width: 60 + random() * 180, height: 45 + random() * 120, strokeColor: '#202124', strokeWidth: [2, 4, 7][index % 3] }
    items.push(rectangle)
  }
  for (let index = 0; index < connectors; index += 1) {
    const start = { x: -80 + random() * 2300, y: -40 + random() * 1250, pressure: 0.5 }
    const end = { x: start.x + 40 + random() * 180, y: start.y + random() * 140, pressure: 0.5 }
    const relationshipTypes: ConnectorRelationshipType[] = ['association', 'inheritance', 'dependency']
    const connector: ConnectorObject = { kind: 'connector', id: strokes + rectangles + index + 1, start, end, strokeColor: '#202124', strokeWidth: [2, 4, 7][index % 3], relationshipType: relationshipTypes[index % 3], reversed: false }
    items.push(connector)
  }
  return items
}

export function summarizeBenchmarkSamples(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] : 0
  return { medianMs: percentile(0.5), p95Ms: percentile(0.95), maxMs: sorted.length ? sorted[sorted.length - 1] : 0, observations: values.length }
}
