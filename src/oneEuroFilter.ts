import type { Point } from './canvasModel'

// High cutoff keeps small, slow handwriting close to the raw S Pen path.
export const ONE_EURO_MIN_CUTOFF = 8
// Larger beta quickly reduces filtering as the pen speed increases.
export const ONE_EURO_BETA = 0.2
// Smooth velocity estimates without making direction changes sluggish.
export const ONE_EURO_DERIVATIVE_CUTOFF = 1
const SMALL_STROKE_BOUNDS = 40
const SHARP_CORNER_RADIANS = Math.PI / 4
// Pointer samples do not retain timestamps, so use a stable tablet sampling interval.
const SAMPLE_PERIOD_SECONDS = 1 / 120

function smoothingAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

function filterValue(value: number, previous: number, alpha: number): number {
  return alpha * value + (1 - alpha) * previous
}

function filterChannel(values: number[]): number[] {
  if (values.length < 3) return [...values]
  if (values.every((value) => value === values[0])) return [...values]
  const result = [values[0]]
  let previousFiltered = values[0]
  let previousDerivative = 0

  for (let index = 1; index < values.length - 1; index += 1) {
    const raw = values[index]
    const derivative = (raw - values[index - 1]) / SAMPLE_PERIOD_SECONDS
    const derivativeAlpha = smoothingAlpha(ONE_EURO_DERIVATIVE_CUTOFF, SAMPLE_PERIOD_SECONDS)
    const filteredDerivative = filterValue(derivative, previousDerivative, derivativeAlpha)
    const cutoff = ONE_EURO_MIN_CUTOFF + ONE_EURO_BETA * Math.abs(filteredDerivative)
    previousFiltered = filterValue(raw, previousFiltered, smoothingAlpha(cutoff, SAMPLE_PERIOD_SECONDS))
    result.push(previousFiltered)
    previousDerivative = filteredDerivative
  }

  result.push(values[values.length - 1])
  return result
}

export function filterDisplayPoints(points: Point[]): Point[] {
  const rawCopy = () => points.map((point) => ({ ...point }))
  if (points.length < 3) return rawCopy()
  const xs = points.map(({ x }) => x)
  const ys = points.map(({ y }) => y)
  if (Math.max(...xs) - Math.min(...xs) < SMALL_STROKE_BOUNDS
    && Math.max(...ys) - Math.min(...ys) < SMALL_STROKE_BOUNDS) return rawCopy()
  const x = filterChannel(points.map((point) => point.x))
  const y = filterChannel(points.map((point) => point.y))
  const pressure = filterChannel(points.map((point) => point.pressure))
  const protectedIndices = new Set([0, points.length - 1])
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const incoming = { x: current.x - previous.x, y: current.y - previous.y }
    const outgoing = { x: next.x - current.x, y: next.y - current.y }
    const lengths = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y)
    if (lengths === 0) continue
    const cosine = (incoming.x * outgoing.x + incoming.y * outgoing.y) / lengths
    if (Math.acos(Math.max(-1, Math.min(1, cosine))) >= SHARP_CORNER_RADIANS) {
      protectedIndices.add(index - 1)
      protectedIndices.add(index)
      protectedIndices.add(index + 1)
    }
  }
  return points.map((point, index) => protectedIndices.has(index)
    ? { ...point }
    : { x: x[index], y: y[index], pressure: pressure[index] })
}
