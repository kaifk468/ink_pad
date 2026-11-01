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

export function getPageOverviewGeometry(width: number, height: number, padding = 8): MinimapGeometry {
  return getMinimapGeometry(width, height, SHEET_BOUNDS, padding)
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

/** Clamp a viewport so it never shows anything outside the sheet: zoom-out stops where the sheet exactly fits. */
export function clampViewportToSheet(viewport: Viewport, viewportWidth: number, viewportHeight: number): Viewport {
  const minScale = getCoverScale(viewportWidth, viewportHeight)
  const scale = Math.max(minScale, Math.min(MAX_ZOOM, viewport.scale))
  return clampViewportToBounds({ ...viewport, scale }, viewportWidth, viewportHeight, SHEET_BOUNDS)
}

/** The view a fresh app or a freshly opened diagram starts in: INITIAL_ZOOM centered on the sheet. */
export function getInitialViewport(viewportWidth: number, viewportHeight: number): Viewport {
  const scale = Math.max(INITIAL_ZOOM, getCoverScale(viewportWidth, viewportHeight))
  return clampViewportToSheet({
    scale,
    offsetX: viewportWidth / 2 - (SHEET_WIDTH / 2) * scale,
    offsetY: viewportHeight / 2 - (SHEET_HEIGHT / 2) * scale,
  }, viewportWidth, viewportHeight)
}
