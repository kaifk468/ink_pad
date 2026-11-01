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
