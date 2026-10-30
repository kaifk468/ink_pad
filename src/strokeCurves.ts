import type { Point } from './canvasModel'

export type StrokeCurveSegment = {
  from: Point
  control?: Point
  to: Point
  pressure: number
  curved: boolean
}

export function buildMidpointCurve(points: Point[]): StrokeCurveSegment[] {
  if (points.length < 2) return []
  if (points.length === 2) {
    return [{ from: points[0], to: points[1], pressure: (points[0].pressure + points[1].pressure) / 2, curved: false }]
  }

  const segments: StrokeCurveSegment[] = []
  let from = points[0]
  for (let index = 1; index < points.length - 1; index += 1) {
    const control = points[index]
    const next = points[index + 1]
    const to = { x: (control.x + next.x) / 2, y: (control.y + next.y) / 2, pressure: (control.pressure + next.pressure) / 2 }
    segments.push({ from, control, to, pressure: (points[index - 1].pressure + control.pressure) / 2, curved: true })
    from = to
  }
  const last = points[points.length - 1]
  segments.push({ from, control: last, to: last, pressure: (points[points.length - 2].pressure + last.pressure) / 2, curved: true })
  return segments
}
