import type { Point } from './canvasModel'

// Keep the raw-point retention threshold constant in CSS pixels at every zoom.
export const MIN_STROKE_SAMPLE_DISTANCE_SCREEN_PX = 0.5

export function getMinimumStrokeSampleDistanceCanvas(zoomScale: number): number {
  const safeScale = Number.isFinite(zoomScale) && zoomScale > 0 ? zoomScale : 1
  return MIN_STROKE_SAMPLE_DISTANCE_SCREEN_PX / safeScale
}

export function shouldAppendStrokeSample(previous: Point, next: Point, zoomScale: number): boolean {
  return Math.hypot(next.x - previous.x, next.y - previous.y) > getMinimumStrokeSampleDistanceCanvas(zoomScale)
}
