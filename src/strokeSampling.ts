import type { Point } from './canvasModel'

// Retain every distinct coordinate or pressure change. Even subpixel movement
// can describe small handwriting when the tablet reports a dense sample stream.
export function shouldAppendStrokeSample(previous: Point, next: Point): boolean {
  return previous.x !== next.x || previous.y !== next.y || previous.pressure !== next.pressure
}
