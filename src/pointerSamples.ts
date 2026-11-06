/**
 * Return the browser's coalesced pointer samples in their original order,
 * including the dispatched event when it is not already the final sample.
 * The returned PointerEvents retain their native coordinates, pressure, and
 * timestamp; callers decide how to convert coordinates for the canvas.
 */
export function getPointerSamples(event: PointerEvent): PointerEvent[] {
  const coalesced = event.getCoalescedEvents?.() ?? []
  if (coalesced.length === 0) return [event]

  const last = coalesced[coalesced.length - 1]
  const dispatchedEventAlreadyIncluded = last.timeStamp === event.timeStamp
    && last.clientX === event.clientX
    && last.clientY === event.clientY
    && last.pressure === event.pressure

  return dispatchedEventAlreadyIncluded ? coalesced : [...coalesced, event]
}

export const MAX_PREDICTED_POINTS = 3
/** Prediction is a short look ahead; anything further than this from the last real sample is dropped (screen px). */
export const MAX_PREDICTION_DISTANCE_SCREEN_PX = 40

type PredictedPoint = { x: number; y: number; pressure: number }

/**
 * The browser's predicted next pen positions for this move (PointerEvent.getPredictedEvents), converted to canvas
 * points. They are only drawn ahead of the ink and never saved. Keeps at most MAX_PREDICTED_POINTS, stops at the
 * first point the converter rejects (outside the workspace) or beyond the distance limit, and carries the last real
 * pressure because predicted events often report none.
 */
export function getPredictedPoints<T extends PredictedPoint>(
  event: PointerEvent,
  toCanvas: (clientX: number, clientY: number) => T | null,
  last: T,
  maxDistance: number,
): T[] {
  const predicted = event.getPredictedEvents?.() ?? []
  const points: T[] = []
  for (const sample of predicted) {
    if (points.length >= MAX_PREDICTED_POINTS) break
    const point = toCanvas(sample.clientX, sample.clientY)
    if (!point) break
    if (Math.hypot(point.x - last.x, point.y - last.y) > maxDistance) break
    points.push({ ...point, pressure: last.pressure })
  }
  return points
}
