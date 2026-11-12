import type { Point } from './canvasModel'

export type Viewport = { scale: number; offsetX: number; offsetY: number }
export type ViewBounds = { x: number; y: number; width: number; height: number }
export type MinimapGeometry = { scale: number; offsetX: number; offsetY: number }
export type TouchNavigationGestureMode = 'pinch-zoom' | 'three-finger-pan'

export const SHEET_WIDTH = 2500
export const SHEET_HEIGHT = 1500
export const SHEET_BOUNDS: ViewBounds = { x: 0, y: 0, width: SHEET_WIDTH, height: SHEET_HEIGHT }
export const WORKSPACE_MARGIN_RATIO = 0.05
export const WORKSPACE_MARGIN_X = SHEET_WIDTH * WORKSPACE_MARGIN_RATIO
export const WORKSPACE_MARGIN_Y = SHEET_HEIGHT * WORKSPACE_MARGIN_RATIO
export const WORKSPACE_WIDTH = SHEET_WIDTH + WORKSPACE_MARGIN_X * 2
export const WORKSPACE_HEIGHT = SHEET_HEIGHT + WORKSPACE_MARGIN_Y * 2
export const WORKSPACE_BOUNDS: ViewBounds = {
  x: SHEET_BOUNDS.x - WORKSPACE_MARGIN_X,
  y: SHEET_BOUNDS.y - WORKSPACE_MARGIN_Y,
  width: WORKSPACE_WIDTH,
  height: WORKSPACE_HEIGHT,
}
/** The page starts SHEET_HEIGHT tall and grows downward in SHEET_GROW_STEP strips, up to SHEET_MAX_HEIGHT. */
export const SHEET_MIN_HEIGHT = SHEET_HEIGHT
export const SHEET_MAX_HEIGHT = 3000
export const SHEET_GROW_STEP = 500
/** Ink ending within this distance of the page bottom makes the page grow. */
export const SHEET_GROW_ZONE = 200

export function sheetBoundsFor(sheetHeight: number): ViewBounds {
  return { x: 0, y: 0, width: SHEET_WIDTH, height: sheetHeight }
}

export function workspaceBoundsFor(sheetHeight: number): ViewBounds {
  const marginX = WORKSPACE_MARGIN_X
  const marginY = sheetHeight * WORKSPACE_MARGIN_RATIO
  return { x: -marginX, y: -marginY, width: SHEET_WIDTH + marginX * 2, height: sheetHeight + marginY * 2 }
}

/** A saved page height forced into a valid one: a whole number of steps from the minimum, within the limits. */
export function normalizeSheetHeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SHEET_MIN_HEIGHT
  const steps = Math.ceil((Math.max(SHEET_MIN_HEIGHT, Math.min(SHEET_MAX_HEIGHT, value)) - SHEET_MIN_HEIGHT) / SHEET_GROW_STEP)
  return Math.min(SHEET_MAX_HEIGHT, SHEET_MIN_HEIGHT + steps * SHEET_GROW_STEP)
}

/** The page height after ink reaching `bottom` was added: grows strip by strip while the ink is within the grow zone of the bottom. */
export function nextSheetHeight(current: number, bottom: number): number {
  let height = current
  while (height < SHEET_MAX_HEIGHT && bottom > height - SHEET_GROW_ZONE) height += SHEET_GROW_STEP
  return Math.min(SHEET_MAX_HEIGHT, height)
}

export const DEFAULT_ZOOM = 1
/** Zoom the app opens at. Reset and the zoom buttons still treat 100% as the default. */
export const INITIAL_ZOOM = 1.1
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 3
export const THREE_FINGER_PAN_THRESHOLD = 3

export function getTouchNavigationGestureMode(touchCount: number): TouchNavigationGestureMode | null {
  if (touchCount === 2) return 'pinch-zoom'
  if (touchCount === 3) return 'three-finger-pan'
  return null
}

export function getNavigatorPanels(pageOverviewExpanded: boolean): Array<'workspace' | 'page'> {
  return pageOverviewExpanded ? ['workspace', 'page'] : ['workspace']
}

export function fitViewportToBounds(
  bounds: ViewBounds,
  viewportWidth: number,
  viewportHeight: number,
  padding = 32,
  minScale = MIN_ZOOM,
  maxScale = MAX_ZOOM,
): Viewport {
  const availableWidth = Math.max(1, viewportWidth - padding * 2)
  const availableHeight = Math.max(1, viewportHeight - padding * 2)
  const scale = Math.max(minScale, Math.min(maxScale, availableWidth / Math.max(1, bounds.width), availableHeight / Math.max(1, bounds.height)))
  return {
    scale,
    offsetX: (viewportWidth - bounds.width * scale) / 2 - bounds.x * scale,
    offsetY: (viewportHeight - bounds.height * scale) / 2 - bounds.y * scale,
  }
}

export function getMinimapGeometry(
  width: number,
  height: number,
  bounds: ViewBounds = WORKSPACE_BOUNDS,
  padding = 8,
): MinimapGeometry {
  const scale = Math.min((width - padding * 2) / Math.max(1, bounds.width), (height - padding * 2) / Math.max(1, bounds.height))
  return {
    scale,
    offsetX: (width - bounds.width * scale) / 2 - bounds.x * scale,
    offsetY: (height - bounds.height * scale) / 2 - bounds.y * scale,
  }
}

export function getPageOverviewGeometry(width: number, height: number, padding = 8, sheetHeight = SHEET_HEIGHT): MinimapGeometry {
  return getMinimapGeometry(width, height, sheetBoundsFor(sheetHeight), padding)
}

export function minimapToCanvasPoint(point: Point, geometry: MinimapGeometry): Point {
  return {
    ...point,
    x: (point.x - geometry.offsetX) / geometry.scale,
    y: (point.y - geometry.offsetY) / geometry.scale,
  }
}

export function screenToCanvasPoint(point: Point, viewport: Viewport): Point {
  return {
    ...point,
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  }
}

export function canvasToScreenPoint(point: Point, viewport: Viewport): Point {
  return {
    ...point,
    x: point.x * viewport.scale + viewport.offsetX,
    y: point.y * viewport.scale + viewport.offsetY,
  }
}

export function panViewport(viewport: Viewport, deltaX: number, deltaY: number): Viewport {
  return { ...viewport, offsetX: viewport.offsetX + deltaX, offsetY: viewport.offsetY + deltaY }
}

export function panThreeFingerViewport(startViewport: Viewport, startCenter: Point, currentCenter: Point): Viewport {
  return panViewport(startViewport, currentCenter.x - startCenter.x, currentCenter.y - startCenter.y)
}

export function clampViewportToBounds(
  viewport: Viewport,
  viewportWidth: number,
  viewportHeight: number,
  bounds: ViewBounds = WORKSPACE_BOUNDS,
): Viewport {
  const scale = Math.max(Number.EPSILON, viewport.scale)
  const visibleWidth = viewportWidth / scale
  const visibleHeight = viewportHeight / scale
  const clampAxis = (offset: number, screenSize: number, min: number, size: number, visibleSize: number) => {
    if (visibleSize >= size) return screenSize / 2 - (min + size / 2) * scale || 0
    const minOffset = screenSize - (min + size) * scale
    const maxOffset = -min * scale
    return Math.max(minOffset, Math.min(maxOffset, offset)) || 0
  }
  return {
    ...viewport,
    scale,
    offsetX: clampAxis(viewport.offsetX, viewportWidth, bounds.x, bounds.width, visibleWidth),
    offsetY: clampAxis(viewport.offsetY, viewportHeight, bounds.y, bounds.height, visibleHeight),
  }
}

export function centerViewportOnPoint(
  viewport: Viewport,
  point: Point,
  viewportWidth: number,
  viewportHeight: number,
  bounds: ViewBounds = WORKSPACE_BOUNDS,
): Viewport {
  return clampViewportToBounds({
    ...viewport,
    offsetX: viewportWidth / 2 - point.x * viewport.scale,
    offsetY: viewportHeight / 2 - point.y * viewport.scale,
  }, viewportWidth, viewportHeight, bounds)
}

export function clampPointToBounds(point: Point, bounds: ViewBounds = WORKSPACE_BOUNDS): Point {
  return {
    ...point,
    x: Math.max(bounds.x, Math.min(bounds.x + bounds.width, point.x)),
    y: Math.max(bounds.y, Math.min(bounds.y + bounds.height, point.y)),
  }
}

export function isPointWithinBounds(point: Point, bounds: ViewBounds = WORKSPACE_BOUNDS): boolean {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y && point.y <= bounds.y + bounds.height
}

export function clipSegmentToBounds(start: Point, end: Point, bounds: ViewBounds = WORKSPACE_BOUNDS): Point | null {
  const dx = end.x - start.x
  const dy = end.y - start.y
  let startT = 0
  let endT = 1
  const tests: Array<[number, number]> = [
    [-dx, start.x - bounds.x],
    [dx, bounds.x + bounds.width - start.x],
    [-dy, start.y - bounds.y],
    [dy, bounds.y + bounds.height - start.y],
  ]
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const ratio = q / p
    if (p < 0) startT = Math.max(startT, ratio)
    else endT = Math.min(endT, ratio)
    if (startT > endT) return null
  }
  return {
    ...end,
    x: start.x + endT * dx,
    y: start.y + endT * dy,
    pressure: start.pressure + endT * (end.pressure - start.pressure),
  }
}

export function clampTranslationToBounds(itemBounds: ViewBounds, dx: number, dy: number, bounds: ViewBounds = WORKSPACE_BOUNDS) {
  const minDx = bounds.x - itemBounds.x
  const maxDx = bounds.x + bounds.width - itemBounds.x - itemBounds.width
  const minDy = bounds.y - itemBounds.y
  const maxDy = bounds.y + bounds.height - itemBounds.y - itemBounds.height
  return {
    dx: minDx <= maxDx ? Math.max(minDx, Math.min(maxDx, dx)) : 0,
    dy: minDy <= maxDy ? Math.max(minDy, Math.min(maxDy, dy)) : 0,
  }
}

export function zoomViewportAt(
  viewport: Viewport,
  requestedScale: number,
  screenPoint: Point,
  minScale = MIN_ZOOM,
  maxScale = MAX_ZOOM,
): Viewport {
  const scale = Math.max(minScale, Math.min(maxScale, requestedScale))
  const anchor = screenToCanvasPoint(screenPoint, viewport)
  return {
    scale,
    offsetX: screenPoint.x - anchor.x * scale,
    offsetY: screenPoint.y - anchor.y * scale,
  }
}

export function zoomTwoFingerViewport(
  startViewport: Viewport,
  startCenter: Point,
  startDistance: number,
  currentDistance: number,
  minScale = MIN_ZOOM,
  maxScale = MAX_ZOOM,
): Viewport {
  const ratio = startDistance > 0 ? currentDistance / startDistance : 1
  return zoomViewportAt(startViewport, startViewport.scale * ratio, startCenter, minScale, maxScale)
}

/** Smallest scale at which the sheet fully covers the viewport, so no area outside the sheet is ever visible. */
export function getCoverScale(viewportWidth: number, viewportHeight: number, bounds: ViewBounds = SHEET_BOUNDS): number {
  return Math.max(viewportWidth / Math.max(1, bounds.width), viewportHeight / Math.max(1, bounds.height))
}

/** Width (screen px, about a thumb) of the grey desk the view may scroll past each edge of the sheet, so the corners can be reached away from the tablet's edge. */
export const DESK_MARGIN_PX = 72
/** The most the view can be stretched past the desk margin (screen px) while a finger drags it; it springs back on release. */
export const RUBBER_BAND_MAX_PX = 80

/**
 * Clamp a viewport to the sheet: zoom-out stops where the sheet exactly fits, and the view may show at most `deskMarginPx`
 * (screen px) of desk beyond each edge. With the default margin of 0 nothing outside the sheet is ever visible.
 */
export function clampViewportToSheet(viewport: Viewport, viewportWidth: number, viewportHeight: number, sheetHeight = SHEET_HEIGHT, deskMarginPx = 0): Viewport {
  const sheet = sheetHeight === SHEET_HEIGHT ? SHEET_BOUNDS : sheetBoundsFor(sheetHeight)
  const minScale = getCoverScale(viewportWidth, viewportHeight, sheet)
  const scale = Math.max(minScale, Math.min(MAX_ZOOM, viewport.scale))
  const margin = deskMarginPx / scale
  const bounds = margin > 0
    ? { x: sheet.x - margin, y: sheet.y - margin, width: sheet.width + margin * 2, height: sheet.height + margin * 2 }
    : sheet
  return clampViewportToBounds({ ...viewport, scale }, viewportWidth, viewportHeight, bounds)
}

/** How far a drag past an edge actually moves the view: starts 1:1 and gets harder, never beyond `max`. */
export function rubberBandOverscroll(distance: number, max = RUBBER_BAND_MAX_PX): number {
  if (!(distance > 0) || !(max > 0)) return 0
  return max * (1 - Math.exp(-distance / max))
}

/**
 * The viewport to show while a finger drags: inside the limits it is exactly what the finger asks for; past a limit it
 * stretches with growing resistance (rubber band). Zoom is still hard-clamped. Releasing should animate back to
 * `clampViewportToSheet` with the same arguments.
 */
export function rubberBandViewport(viewport: Viewport, viewportWidth: number, viewportHeight: number, sheetHeight = SHEET_HEIGHT, deskMarginPx = 0): Viewport {
  const hard = clampViewportToSheet(viewport, viewportWidth, viewportHeight, sheetHeight, deskMarginPx)
  const stretch = (wanted: number, limit: number) => {
    const over = wanted - limit
    return over === 0 ? limit : limit + Math.sign(over) * rubberBandOverscroll(Math.abs(over))
  }
  return {
    scale: hard.scale,
    offsetX: stretch(viewport.offsetX, hard.offsetX),
    offsetY: stretch(viewport.offsetY, hard.offsetY),
  }
}

/** The view a fresh app or a freshly opened diagram starts in: INITIAL_ZOOM centered on the sheet. */
export function getInitialViewport(viewportWidth: number, viewportHeight: number, sheetHeight = SHEET_HEIGHT): Viewport {
  // Always opens on the first screen of the page (the top SHEET_MIN_HEIGHT), even on a page that has grown.
  const scale = Math.max(INITIAL_ZOOM, getCoverScale(viewportWidth, viewportHeight))
  return clampViewportToSheet({
    scale,
    offsetX: viewportWidth / 2 - (SHEET_WIDTH / 2) * scale,
    offsetY: viewportHeight / 2 - (SHEET_HEIGHT / 2) * scale,
  }, viewportWidth, viewportHeight, sheetHeight)
}
