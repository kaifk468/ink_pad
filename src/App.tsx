import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createEraserStroke, getEraserSweepPoints, isPenHoverEraseInput } from './eraserInput'
import { CONNECTOR_SNAP_TOLERANCE, CanvasSnapshotHistory, canvasItemKey, canvasItemsForRendering, cloneCanvasItems, createConnector, detachConnectorsFromRectangles, getCanvasSelectionBounds, getConnectorRenderSpec, getConnectorSymbolGeometry, getRectangleResizeHandles, getResizedRectangleBounds, hitTestRectangleResizeHandle, resizeRectangleItems, resizeSelectedItems, reverseConnectorDirection, snapConnectorEndpoint, translateSelectedItems, updateConnectorRelationship } from './canvasModel'
import type { CanvasItem, ConnectorObject, ConnectorRelationshipType, Point, RectangleBounds, RectangleObject, RectangleResizeHandle, Stroke } from './canvasModel'
import { itemHitTest, selectItemsByLasso } from './lassoSelection'
import { filterDisplayPoints } from './oneEuroFilter'
import { buildMidpointCurve } from './strokeCurves'
import { loadStrokeDisplayMode, saveStrokeDisplayMode, type StrokeDisplayMode } from './strokeDisplayMode'
import { shouldAppendStrokeSample } from './strokeSampling'
import { PerformanceDiagnostics, type StrokeDiagnosticRow } from './performanceDiagnostics'
import { drawPageTemplate, drawPageTemplateOverview, loadPageTemplate, savePageTemplate, type PageTemplate } from './pageTemplates'
import { loadPageBackground, PAGE_BACKGROUND_COLORS, savePageBackground, type PageBackground } from './pageBackground'
import { SHAPE_RECOGNITION_HOLD_MS, recognizeRectangleOnHold, recognizeRectangleStroke } from './shapeRecognition'
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, SHEET_BOUNDS, SHEET_HEIGHT, SHEET_WIDTH, THREE_FINGER_PAN_THRESHOLD, WORKSPACE_BOUNDS, centerViewportOnPoint, clampPointToBounds, clampTranslationToBounds, clampViewportToBounds, clipSegmentToBounds, fitViewportToBounds, getMinimapGeometry, getNavigatorPanels, getPageOverviewGeometry, getTouchNavigationGestureMode, isPointWithinBounds, minimapToCanvasPoint, panThreeFingerViewport, type MinimapGeometry, type TouchNavigationGestureMode, type ViewBounds, type Viewport, screenToCanvasPoint, zoomTwoFingerViewport } from './viewport'

const COLORS = [
  { name: 'Ink black', value: '#202124' },
  { name: 'Cobalt blue', value: '#3568d4' },
  { name: 'Coral red', value: '#e45b55' },
  { name: 'Leaf green', value: '#38845b' },
  { name: 'Violet', value: '#8856c7' },
]
const WIDTHS = [2, 4, 7, 11]
const ERASER_SIZES = [14, 28, 48, 72]
const SHAPE_HOLD_JITTER_PX = 7
const PERFORMANCE_DIAGNOSTICS_ENABLED = import.meta.env.DEV
const UML_CONNECTOR_TOOLS: Array<{ type: ConnectorRelationshipType; label: string }> = [
  { type: 'association', label: 'Association' },
  { type: 'directed-association', label: 'Directed association' },
  { type: 'inheritance', label: 'Inheritance' },
  { type: 'realization', label: 'Realization' },
  { type: 'aggregation', label: 'Aggregation' },
  { type: 'composition', label: 'Composition' },
  { type: 'dependency', label: 'Dependency' },
]

function getReusableCanvasLayer(
  layerRef: { current: HTMLCanvasElement | null },
  width: number,
  height: number,
): HTMLCanvasElement {
  if (!layerRef.current) layerRef.current = document.createElement('canvas')
  if (layerRef.current.width !== width) layerRef.current.width = width
  if (layerRef.current.height !== height) layerRef.current.height = height
  return layerRef.current
}

function UmlConnectorIcon({ type }: { type: ConnectorRelationshipType }) {
  const dashed = type === 'realization' || type === 'dependency'
  const marker = type === 'inheritance' || type === 'realization'
    ? <path d="M27 7 19 2 19 12Z" fill="var(--uml-marker-fill, #ffffff)" />
    : type === 'directed-association' || type === 'dependency'
      ? <path d="m20 2 7 5-7 5" fill="none" />
      : type === 'aggregation' || type === 'composition'
        ? <path d="M2 7 8 2 14 7 8 12Z" fill={type === 'composition' ? 'currentColor' : '#ffffff'} />
        : null
  const line = type === 'aggregation' || type === 'composition' ? 'M14 7H28' : marker ? 'M2 7H19' : 'M2 7H28'
  return (
    <svg className={`uml-tool-icon${dashed ? ' dashed' : ''}`} viewBox="0 0 30 14" aria-hidden="true">
      <path className="uml-tool-line" d={line} />
      {marker}
    </svg>
  )
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inkLayerRef = useRef<HTMLCanvasElement | null>(null)
  const minimapInkLayerRef = useRef<HTMLCanvasElement | null>(null)
  const pageOverviewInkLayerRef = useRef<HTMLCanvasElement | null>(null)
  const toolbarRef = useRef<HTMLElement>(null)
  const umlToolboxRef = useRef<HTMLDivElement>(null)
  const eraserControlRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const pageOverviewRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<CanvasItem[]>([])
  const historyRef = useRef(new CanvasSnapshotHistory())
  const performanceDiagnosticsRef = useRef<PerformanceDiagnostics | null>(null)
  if (PERFORMANCE_DIAGNOSTICS_ENABLED && performanceDiagnosticsRef.current === null) performanceDiagnosticsRef.current = new PerformanceDiagnostics()
  const activeStrokeRef = useRef<Stroke | null>(null)
  const hoverErasePointerRef = useRef<number | null>(null)
  const activeObjectEraserRef = useRef<{ pointerId: number; lastPoint: Point; changed: boolean } | null>(null)
  const activeConnectorRef = useRef<{
    pointerId: number
    start: Point
    end: Point
    relationshipType: ConnectorRelationshipType
    startAttachment?: ConnectorObject['startAttachment']
    endAttachment?: ConnectorObject['endAttachment']
  } | null>(null)
  const shapePreviewRef = useRef<CanvasItem | null>(null)
  const selectedRectangleIdRef = useRef<number | null>(null)
  const activeDragRef = useRef<{ pointerId: number; itemKey: string; start: Point; originalItems: CanvasItem[]; moved: boolean } | null>(null)
  const activeResizeRef = useRef<{ pointerId: number; rectangleId: number | null; selectedKeys: Set<string> | null; handle: RectangleResizeHandle; start: Point; originalBounds: RectangleBounds; originalItems: CanvasItem[]; moved: boolean } | null>(null)
  const activeLassoRef = useRef<{ pointerId: number; points: Point[] } | null>(null)
  const lassoDragRef = useRef<{ pointerId: number; start: Point; keys: Set<string>; originalItems: CanvasItem[]; moved: boolean } | null>(null)
  const selectedKeysRef = useRef<Set<string>>(new Set())
  const nextRectangleIdRef = useRef(1)
  const nextStrokeIdRef = useRef(1)
  const nextConnectorIdRef = useRef(1)
  const holdTimerRef = useRef<number | null>(null)
  const activePointerRef = useRef<number | null>(null)
  const holdAnchorRef = useRef<Point | null>(null)
  const lastSignificantMoveAtRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const viewportRef = useRef<Viewport>({ scale: DEFAULT_ZOOM, offsetX: 0, offsetY: 0 })
  const touchPointsRef = useRef(new Map<number, Point>())
  const touchGestureRef = useRef<{ mode: TouchNavigationGestureMode; viewport: Viewport; center: Point; distance: number } | null>(null)
  const minimapDragPointerRef = useRef<{ pointerId: number; bounds: ViewBounds; geometry: MinimapGeometry } | null>(null)
  const pageOverviewDragPointerRef = useRef<number | null>(null)
  const umlToolboxDragRef = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number; moved: boolean } | null>(null)
  const suppressMinimizedToolboxClickRef = useRef(false)
  const [color, setColor] = useState(COLORS[0].value)
  const [width, setWidth] = useState(4)
  const [strokeDisplayMode, setStrokeDisplayMode] = useState<StrokeDisplayMode>(() => loadStrokeDisplayMode())
  const [pageTemplate, setPageTemplate] = useState<PageTemplate>(() => loadPageTemplate())
  const [pageBackground, setPageBackground] = useState<PageBackground>(() => loadPageBackground())
  const [eraser, setEraser] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [shapeMode, setShapeMode] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [lassoMode, setLassoMode] = useState(false)
  const [connectorMode, setConnectorMode] = useState(false)
  const [umlConnectorType, setUmlConnectorType] = useState<ConnectorRelationshipType | null>(null)
  const [umlToolboxPosition, setUmlToolboxPosition] = useState<{ left: number; top: number } | null>(null)
  const [umlToolboxMinimized, setUmlToolboxMinimized] = useState(false)
  const [selectedItemCount, setSelectedItemCount] = useState(0)
  const [selectedConnectorId, setSelectedConnectorId] = useState<number | null>(null)
  const [selectedConnectorType, setSelectedConnectorType] = useState<ConnectorRelationshipType | null>(null)
  const [selectedConnectorReversed, setSelectedConnectorReversed] = useState(false)
  const [eraserSize, setEraserSize] = useState(28)
  const [objectEraser, setObjectEraser] = useState(false)
  const [eraserMenuOpen, setEraserMenuOpen] = useState(false)
  const [eraserPopoverPosition, setEraserPopoverPosition] = useState<{ left: number; top: number; width: number } | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [zoomPercent, setZoomPercent] = useState(DEFAULT_ZOOM * 100)
  const [performanceDiagnosticsOpen, setPerformanceDiagnosticsOpen] = useState(false)
  const [performanceRows, setPerformanceRows] = useState<StrokeDiagnosticRow[]>([])
  const [pageOverviewExpanded, setPageOverviewExpanded] = useState(false)
  const navigatorPanels = getNavigatorPanels(pageOverviewExpanded)
  const penModeActive = !eraser && !shapeMode && !selectionMode && !lassoMode && !connectorMode && umlConnectorType === null

  const getCurrentMinimapBounds = useCallback((): ViewBounds => {
    return { ...WORKSPACE_BOUNDS }
  }, [])

  const updateSelectedItems = (keys: string[]) => {
    selectedKeysRef.current = new Set(keys)
    setSelectedItemCount(keys.length)
    const connectorId = keys.length === 1 && keys[0].startsWith('connector:') ? Number(keys[0].slice('connector:'.length)) : null
    const connector = connectorId === null ? null : strokesRef.current.find((item): item is ConnectorObject => item.kind === 'connector' && item.id === connectorId)
    setSelectedConnectorId(connector?.id ?? null)
    setSelectedConnectorType(connector?.relationshipType ?? null)
    setSelectedConnectorReversed(connector?.reversed ?? false)
  }

  const reconcileSelectedItems = () => {
    const available = new Set(strokesRef.current.map(canvasItemKey))
    updateSelectedItems([...selectedKeysRef.current].filter((key) => available.has(key)))
  }

  const saveHistory = () => {
    historyRef.current.record(strokesRef.current)
    setCanUndo(historyRef.current.canUndo)
    setCanRedo(historyRef.current.canRedo)
  }

  const changeSelectedConnectorType = (relationshipType: ConnectorRelationshipType) => {
    if (selectedConnectorId === null || selectedConnectorType === relationshipType) return
    saveHistory()
    strokesRef.current = updateConnectorRelationship(strokesRef.current, selectedConnectorId, relationshipType)
    setSelectedConnectorType(relationshipType)
    if (relationshipType === 'association') setSelectedConnectorReversed(false)
    renderAll()
  }

  useEffect(() => {
    if (connectorMode || eraser || shapeMode || selectionMode || lassoMode) setUmlConnectorType(null)
  }, [connectorMode, eraser, shapeMode, selectionMode, lassoMode])

  useEffect(() => {
    setUmlConnectorType(null)
  }, [color])

  const reverseSelectedConnector = () => {
    if (selectedConnectorId === null || selectedConnectorType === null || selectedConnectorType === 'association') return
    saveHistory()
    strokesRef.current = reverseConnectorDirection(strokesRef.current, selectedConnectorId)
    setSelectedConnectorReversed((reversed) => !reversed)
    renderAll()
  }

  const clearLassoSelection = () => {
    updateSelectedItems([])
    setSelectedRectangle(null)
    renderAll()
  }

  const selectPenMode = () => {
    setEraser(false)
    setEraserMenuOpen(false)
    setShapeMode(false)
    setSelectionMode(false)
    setLassoMode(false)
    setConnectorMode(false)
    setUmlConnectorType(null)
    clearLassoSelection()
  }

  const undo = () => {
    const previous = historyRef.current.undo(strokesRef.current)
    if (!previous) return
    strokesRef.current = previous
    setCanUndo(historyRef.current.canUndo)
    setCanRedo(historyRef.current.canRedo)
    setHasInk(strokesRef.current.length > 0)
    reconcileSelectedItems()
    renderAll()
  }

  const redo = () => {
    const next = historyRef.current.redo(strokesRef.current)
    if (!next) return
    strokesRef.current = next
    setCanUndo(historyRef.current.canUndo)
    setCanRedo(historyRef.current.canRedo)
    setHasInk(strokesRef.current.length > 0)
    reconcileSelectedItems()
    renderAll()
  }

  const clearShapeHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  const scheduleShapePreview = (point?: Point) => {
    if (eraser || objectEraser) return
    const anchor = holdAnchorRef.current
    if (holdTimerRef.current !== null && point && anchor && Math.hypot(point.x - anchor.x, point.y - anchor.y) < SHAPE_HOLD_JITTER_PX / viewportRef.current.scale) return
    clearShapeHoldTimer()
    if (point) holdAnchorRef.current = point
    holdTimerRef.current = window.setTimeout(() => {
      const stroke = activeStrokeRef.current
      if (!stroke) return
      let recognized: CanvasItem
      if (shapeMode) {
        const recognizedShape = recognizeShape(stroke)
        recognized = recognizedShape.kind === 'rectangle' || (recognizedShape.kind === 'stroke' && recognizedShape.shape)
          ? recognizedShape
          : recognizeLine(stroke)
      } else {
        const rectangle = recognizeRectangleOnHold(stroke, SHAPE_RECOGNITION_HOLD_MS, nextRectangleIdRef.current)
        if (rectangle) {
          nextRectangleIdRef.current += 1
          recognized = rectangle
        } else recognized = recognizeLine(stroke)
      }
      if (recognized.kind === 'rectangle' || (recognized.kind === 'stroke' && recognized.shape)) {
        shapePreviewRef.current = recognized
        renderAll()
      }
      holdTimerRef.current = null
    }, SHAPE_RECOGNITION_HOLD_MS)
  }

  const hitTestObject = (point: Point) => {
    for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
      const item = strokesRef.current[index]
      if (item.kind === 'rectangle') {
        const pad = Math.max(8 / viewportRef.current.scale, item.strokeWidth * 2)
        if (point.x >= item.x - pad && point.x <= item.x + item.width + pad && point.y >= item.y - pad && point.y <= item.y + item.height + pad) return index
        continue
      }
      if (item.kind === 'connector') {
        if (itemHitTest(item, point, Math.max(18 / viewportRef.current.scale, item.strokeWidth * 3))) return index
        continue
      }
      const stroke = item
      // Eraser marks are operations on earlier ink, not independently selectable objects.
      if (stroke.erase || !stroke.points.length) continue
      // Freehand paths and arrows are removed as one action when any segment is touched.
      const hitRadius = Math.max(18 / viewportRef.current.scale, stroke.width * 3)
      if (stroke.points.length === 1 && Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y) <= hitRadius) return index
      for (let segment = 1; segment < stroke.points.length; segment += 1) {
        const start = stroke.points[segment - 1]
        const end = stroke.points[segment]
        const dx = end.x - start.x
        const dy = end.y - start.y
        const lengthSquared = dx * dx + dy * dy || 1
        const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
        const distance = Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
        if (distance <= hitRadius) return index
      }
    }
    return -1
  }

  const deleteWholeObjectAtPoint = (point: Point): boolean => {
    const objectIndex = hitTestObject(point)
    if (objectIndex === -1) return false
    const gesture = activeObjectEraserRef.current
    if (!gesture?.changed) saveHistory()
    const [removedItem] = strokesRef.current.splice(objectIndex, 1)
    if (removedItem?.kind === 'rectangle') {
      strokesRef.current = detachConnectorsFromRectangles(strokesRef.current, new Set([removedItem.id]))
    }
    if (gesture) gesture.changed = true
    setHasInk(strokesRef.current.length > 0)
    reconcileSelectedItems()
    return true
  }

  const hitTestRectangle = (point: Point) => {
    for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
      const item = strokesRef.current[index]
      if (item.kind !== 'rectangle') continue
      const pad = Math.max(8 / viewportRef.current.scale, item.strokeWidth * 2)
      if (point.x >= item.x - pad && point.x <= item.x + item.width + pad && point.y >= item.y - pad && point.y <= item.y + item.height + pad) return item
    }
    return null
  }

  const hitTestConnector = (point: Point) => {
    for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
      const item = strokesRef.current[index]
      if (item.kind === 'connector' && itemHitTest(item, point, Math.max(12 / viewportRef.current.scale, item.strokeWidth * 2))) return item
    }
    return null
  }

  const recognizeShape = (stroke: Stroke): CanvasItem => {
    const points = stroke.points
    const rectangle = recognizeRectangleStroke(stroke, nextRectangleIdRef.current)
    if (rectangle) {
      nextRectangleIdRef.current += 1
      return rectangle
    }
    if (points.length < 6 || stroke.erase) return stroke
    const first = points[0]

    // Recognize a one-stroke arrow: tail → tip → first wing → tip → second wing.
    let tipIndex = 1
    let maxDistance = 0
    for (let i = 1; i < points.length; i += 1) {
      const distance = Math.hypot(points[i].x - first.x, points[i].y - first.y)
      if (distance > maxDistance) { maxDistance = distance; tipIndex = i }
    }
    if (maxDistance < 55 || tipIndex > points.length - 4) return stroke
    const tip = points[tipIndex]
    const shaftAngle = Math.atan2(tip.y - first.y, tip.x - first.x)
    const wings = points.slice(tipIndex + 1).filter((point) => {
      const distance = Math.hypot(point.x - tip.x, point.y - tip.y)
      return distance > 8 && distance < maxDistance * 0.38
    })
    if (wings.length < 2) return stroke
    const firstWing = wings[0]
    const lastWing = wings[wings.length - 1]
    const angleA = Math.atan2(firstWing.y - tip.y, firstWing.x - tip.x)
    const angleB = Math.atan2(lastWing.y - tip.y, lastWing.x - tip.x)
    const difference = Math.abs(Math.atan2(Math.sin(angleA - angleB), Math.cos(angleA - angleB)))
    const angleFromShaftA = Math.abs(Math.atan2(Math.sin(angleA - shaftAngle), Math.cos(angleA - shaftAngle)))
    const angleFromShaftB = Math.abs(Math.atan2(Math.sin(angleB - shaftAngle), Math.cos(angleB - shaftAngle)))
    if (difference < 0.35 || difference > 2.7 || Math.min(angleFromShaftA, Math.PI - angleFromShaftA) < 0.3 || Math.min(angleFromShaftB, Math.PI - angleFromShaftB) < 0.3) return stroke
    return { ...stroke, shape: 'arrow', points: [first, tip] }
  }

  const recognizeLine = (stroke: Stroke): Stroke => {
    const points = stroke.points
    if (points.length < 2 || stroke.erase) return stroke
    const start = points[0]
    const end = points[points.length - 1]
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    if (length < 45) return stroke

    let pathLength = 0
    let maximumDeviation = 0
    for (let i = 1; i < points.length; i += 1) {
      pathLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
      const deviation = Math.abs(dy * points[i].x - dx * points[i].y + end.x * start.y - end.y * start.x) / length
      maximumDeviation = Math.max(maximumDeviation, deviation)
    }
    if (pathLength / length > 1.2 || maximumDeviation > Math.max(9, length * 0.055)) return stroke
    return { ...stroke, shape: 'line', points: [start, end] }
  }

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    const points = stroke.erase || stroke.shape || strokeDisplayMode === 'raw' ? stroke.points : filterDisplayPoints(stroke.points)
    if (!points.length) return
    ctx.save()
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = stroke.color
    ctx.fillStyle = stroke.color
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (stroke.shape === 'arrow' && points.length >= 2) {
      const [start, end] = points
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      const headLength = Math.max(12, stroke.width * 3.5)
      ctx.lineWidth = stroke.width
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.moveTo(end.x, end.y)
      ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(end.x, end.y)
      ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
      ctx.restore()
      return
    }
    if (stroke.shape === 'line' && points.length >= 2) {
      ctx.lineWidth = stroke.width
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      ctx.lineTo(points[1].x, points[1].y)
      ctx.stroke()
      ctx.restore()
      return
    }
    if (points.length === 1) {
      const p = points[0]
      const pressureScale = p.pressure > 0 ? 0.35 + p.pressure * 0.9 : 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, (stroke.width * pressureScale) / 2, 0, Math.PI * 2)
      ctx.fill()
    } else if (stroke.erase || strokeDisplayMode === 'raw') {
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]
        const current = points[index]
        const pressure = (previous.pressure + current.pressure) / 2
        ctx.lineWidth = stroke.width * (pressure > 0 ? 0.35 + pressure * 0.9 : 1)
        ctx.beginPath()
        ctx.moveTo(previous.x, previous.y)
        ctx.lineTo(current.x, current.y)
        ctx.stroke()
      }
    } else {
      for (const segment of buildMidpointCurve(points)) {
        const pressureScale = segment.pressure > 0 ? 0.35 + segment.pressure * 0.9 : 1
        ctx.lineWidth = stroke.width * pressureScale
        ctx.beginPath()
        ctx.moveTo(segment.from.x, segment.from.y)
        if (segment.curved && segment.control) ctx.quadraticCurveTo(segment.control.x, segment.control.y, segment.to.x, segment.to.y)
        else ctx.lineTo(segment.to.x, segment.to.y)
        ctx.stroke()
      }
    }
    ctx.restore()
  }, [strokeDisplayMode])

  const drawRectangle = useCallback((ctx: CanvasRenderingContext2D, rectangle: RectangleObject) => {
    ctx.save()
    ctx.strokeStyle = rectangle.strokeColor
    ctx.lineWidth = rectangle.strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height)
    ctx.restore()
  }, [])

  const drawConnector = useCallback((ctx: CanvasRenderingContext2D, connector: ConnectorObject, color = connector.strokeColor, width = connector.strokeWidth) => {
    const spec = getConnectorRenderSpec(connector)
    const geometry = getConnectorSymbolGeometry(connector, width)
    const tip = geometry?.tip
    const other = geometry?.other

    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.setLineDash(spec.lineStyle === 'dashed' ? [Math.max(6, width * 2.5), Math.max(4, width * 1.8)] : [])

    if (spec.symbol === 'hollow-triangle' && geometry && tip && other) {
      ctx.beginPath()
      ctx.moveTo(other.x, other.y)
      ctx.lineTo(geometry.base.x, geometry.base.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(tip.x, tip.y)
      ctx.lineTo(geometry.sideA.x, geometry.sideA.y)
      ctx.lineTo(geometry.sideB.x, geometry.sideB.y)
      ctx.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.stroke()
    } else if (spec.symbol === 'open-arrow' && geometry && tip) {
      ctx.beginPath()
      ctx.moveTo(connector.start.x, connector.start.y)
      ctx.lineTo(connector.end.x, connector.end.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(geometry.sideA.x, geometry.sideA.y)
      ctx.lineTo(tip.x, tip.y)
      ctx.lineTo(geometry.sideB.x, geometry.sideB.y)
      ctx.stroke()
    } else if ((spec.symbol === 'hollow-diamond' || spec.symbol === 'filled-diamond') && geometry && tip && other) {
      ctx.beginPath()
      ctx.moveTo(geometry.far.x, geometry.far.y)
      ctx.lineTo(other.x, other.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(tip.x, tip.y)
      ctx.lineTo(geometry.sideA.x, geometry.sideA.y)
      ctx.lineTo(geometry.far.x, geometry.far.y)
      ctx.lineTo(geometry.sideB.x, geometry.sideB.y)
      ctx.closePath()
      ctx.fillStyle = spec.symbol === 'filled-diamond' ? color : '#ffffff'
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(connector.start.x, connector.start.y)
      ctx.lineTo(connector.end.x, connector.end.y)
      ctx.stroke()
    }
    ctx.restore()
  }, [])

  const drawItem = useCallback((ctx: CanvasRenderingContext2D, item: CanvasItem) => {
    if (item.kind === 'rectangle') drawRectangle(ctx, item)
    else if (item.kind === 'connector') drawConnector(ctx, item)
    else drawStroke(ctx, item)
  }, [drawConnector, drawRectangle, drawStroke])

  const drawMinimapItems = useCallback((ctx: CanvasRenderingContext2D, geometry: MinimapGeometry) => {
    const toMiniX = (x: number) => x * geometry.scale + geometry.offsetX
    const toMiniY = (y: number) => y * geometry.scale + geometry.offsetY
    ctx.save()
    for (const item of canvasItemsForRendering(strokesRef.current)) {
      if (item.kind === 'rectangle') {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = item.strokeColor
        ctx.lineWidth = Math.max(1, item.strokeWidth * geometry.scale)
        ctx.strokeRect(toMiniX(item.x), toMiniY(item.y), item.width * geometry.scale, item.height * geometry.scale)
      } else if (item.kind === 'connector') {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = item.strokeColor
        ctx.lineWidth = Math.max(1, item.strokeWidth * geometry.scale)
        ctx.beginPath()
        ctx.moveTo(toMiniX(item.start.x), toMiniY(item.start.y))
        ctx.lineTo(toMiniX(item.end.x), toMiniY(item.end.y))
        ctx.stroke()
      } else if (item.points.length > 0) {
        ctx.globalCompositeOperation = item.erase ? 'destination-out' : 'source-over'
        ctx.strokeStyle = item.erase ? '#000000' : item.color
        ctx.fillStyle = item.erase ? '#000000' : item.color
        ctx.lineWidth = Math.max(1, item.width * geometry.scale)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(toMiniX(item.points[0].x), toMiniY(item.points[0].y))
        item.points.slice(1).forEach((point) => ctx.lineTo(toMiniX(point.x), toMiniY(point.y)))
        if (item.points.length === 1) {
          ctx.arc(toMiniX(item.points[0].x), toMiniY(item.points[0].y), Math.max(0.5, item.width * geometry.scale / 2), 0, Math.PI * 2)
          ctx.fill()
        } else ctx.stroke()
      }
    }
    ctx.restore()
  }, [])

  const renderNavigator = useCallback(() => {
    const minimap = minimapRef.current
    const mainCanvas = canvasRef.current
    const ctx = minimap?.getContext('2d')
    if (!minimap || !mainCanvas || !ctx) return
    const rect = minimap.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const pixelWidth = Math.round(rect.width * dpr)
    const pixelHeight = Math.round(rect.height * dpr)
    if (minimap.width !== pixelWidth || minimap.height !== pixelHeight) {
      minimap.width = pixelWidth
      minimap.height = pixelHeight
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#f1f3f7'
    ctx.fillRect(0, 0, rect.width, rect.height)
    const activeDrag = minimapDragPointerRef.current
    const bounds = activeDrag?.bounds ?? getCurrentMinimapBounds()
    const geometry = activeDrag?.geometry ?? getMinimapGeometry(rect.width, rect.height, bounds)
    const workspaceX = WORKSPACE_BOUNDS.x * geometry.scale + geometry.offsetX
    const workspaceY = WORKSPACE_BOUNDS.y * geometry.scale + geometry.offsetY
    const workspaceWidth = WORKSPACE_BOUNDS.width * geometry.scale
    const workspaceHeight = WORKSPACE_BOUNDS.height * geometry.scale
    const pageX = SHEET_BOUNDS.x * geometry.scale + geometry.offsetX
    const pageY = SHEET_BOUNDS.y * geometry.scale + geometry.offsetY
    const pageWidth = SHEET_WIDTH * geometry.scale
    const pageHeight = SHEET_HEIGHT * geometry.scale
    ctx.fillStyle = '#e9ebf0'
    ctx.fillRect(workspaceX, workspaceY, workspaceWidth, workspaceHeight)
    ctx.strokeStyle = '#c5cad4'
    ctx.lineWidth = 1
    ctx.strokeRect(workspaceX + 0.5, workspaceY + 0.5, workspaceWidth - 1, workspaceHeight - 1)
    ctx.fillStyle = PAGE_BACKGROUND_COLORS[pageBackground]
    ctx.fillRect(pageX, pageY, pageWidth, pageHeight)
    drawPageTemplateOverview(ctx, pageTemplate, { x: pageX, y: pageY, width: pageWidth, height: pageHeight })
    ctx.strokeStyle = '#cfd4df'
    ctx.lineWidth = 1
    ctx.strokeRect(pageX + 0.5, pageY + 0.5, pageWidth - 1, pageHeight - 1)

    const inkLayer = getReusableCanvasLayer(minimapInkLayerRef, pixelWidth, pixelHeight)
    const inkContext = inkLayer.getContext('2d')
    if (!inkContext) return
    inkContext.setTransform(1, 0, 0, 1, 0, 0)
    inkContext.clearRect(0, 0, pixelWidth, pixelHeight)
    inkContext.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawMinimapItems(inkContext, geometry)

    ctx.save()
    ctx.beginPath()
    ctx.rect(workspaceX, workspaceY, workspaceWidth, workspaceHeight)
    ctx.clip()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(inkLayer, 0, 0)
    ctx.restore()
    const mainRect = mainCanvas.getBoundingClientRect()
    const viewport = viewportRef.current
    const viewX = -viewport.offsetX / viewport.scale
    const viewY = -viewport.offsetY / viewport.scale
    const viewWidth = mainRect.width / viewport.scale
    const viewHeight = mainRect.height / viewport.scale
    ctx.save()
    ctx.fillStyle = 'rgba(65, 91, 204, .12)'
    ctx.strokeStyle = '#415bca'
    ctx.lineWidth = 1.5
    ctx.fillRect(viewX * geometry.scale + geometry.offsetX, viewY * geometry.scale + geometry.offsetY, viewWidth * geometry.scale, viewHeight * geometry.scale)
    ctx.strokeRect(viewX * geometry.scale + geometry.offsetX, viewY * geometry.scale + geometry.offsetY, viewWidth * geometry.scale, viewHeight * geometry.scale)
    ctx.restore()
  }, [drawMinimapItems, getCurrentMinimapBounds, pageBackground, pageTemplate])

  const renderPageOverview = useCallback(() => {
    const overview = pageOverviewRef.current
    const mainCanvas = canvasRef.current
    const ctx = overview?.getContext('2d')
    if (!overview || !mainCanvas || !ctx) return
    const rect = overview.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const pixelWidth = Math.round(rect.width * dpr)
    const pixelHeight = Math.round(rect.height * dpr)
    if (overview.width !== pixelWidth || overview.height !== pixelHeight) {
      overview.width = pixelWidth
      overview.height = pixelHeight
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#f1f3f7'
    ctx.fillRect(0, 0, rect.width, rect.height)
    const geometry = getPageOverviewGeometry(rect.width, rect.height)
    const pageX = SHEET_BOUNDS.x * geometry.scale + geometry.offsetX
    const pageY = SHEET_BOUNDS.y * geometry.scale + geometry.offsetY
    const pageWidth = SHEET_WIDTH * geometry.scale
    const pageHeight = SHEET_HEIGHT * geometry.scale
    ctx.fillStyle = PAGE_BACKGROUND_COLORS[pageBackground]
    ctx.fillRect(pageX, pageY, pageWidth, pageHeight)
    drawPageTemplateOverview(ctx, pageTemplate, { x: pageX, y: pageY, width: pageWidth, height: pageHeight })
    const inkLayer = getReusableCanvasLayer(pageOverviewInkLayerRef, pixelWidth, pixelHeight)
    const inkContext = inkLayer.getContext('2d')
    if (!inkContext) return
    inkContext.setTransform(1, 0, 0, 1, 0, 0)
    inkContext.clearRect(0, 0, pixelWidth, pixelHeight)
    inkContext.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawMinimapItems(inkContext, geometry)

    ctx.save()
    ctx.beginPath()
    ctx.rect(pageX, pageY, pageWidth, pageHeight)
    ctx.clip()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(inkLayer, 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const canvasRect = mainCanvas.getBoundingClientRect()
    const viewport = viewportRef.current
    const viewX = -viewport.offsetX / viewport.scale
    const viewY = -viewport.offsetY / viewport.scale
    const viewWidth = canvasRect.width / viewport.scale
    const viewHeight = canvasRect.height / viewport.scale
    ctx.fillStyle = 'rgba(65, 91, 204, .12)'
    ctx.strokeStyle = '#415bca'
    ctx.lineWidth = 1.5
    ctx.fillRect(viewX * geometry.scale + geometry.offsetX, viewY * geometry.scale + geometry.offsetY, viewWidth * geometry.scale, viewHeight * geometry.scale)
    ctx.strokeRect(viewX * geometry.scale + geometry.offsetX, viewY * geometry.scale + geometry.offsetY, viewWidth * geometry.scale, viewHeight * geometry.scale)
    ctx.restore()
    ctx.strokeStyle = '#aeb6c7'
    ctx.lineWidth = 1
    ctx.strokeRect(pageX + 0.5, pageY + 0.5, pageWidth - 1, pageHeight - 1)
  }, [drawMinimapItems, pageBackground, pageTemplate])

  const setSelectedRectangle = (id: number | null) => {
    selectedRectangleIdRef.current = id
  }

  const renderAll = useCallback(() => {
    const diagnostics = performanceDiagnosticsRef.current
    const measureFrame = diagnostics?.isStrokeActive() ?? false
    const renderStartedAt = measureFrame ? performance.now() : 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const inkLayer = getReusableCanvasLayer(inkLayerRef, canvas.width, canvas.height)
    const inkContext = inkLayer.getContext('2d')
    if (!inkContext) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const viewport = viewportRef.current
    ctx.setTransform(dpr * viewport.scale, 0, 0, dpr * viewport.scale, dpr * viewport.offsetX, dpr * viewport.offsetY)
    ctx.save()
    ctx.shadowColor = 'rgba(35, 42, 54, .16)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 3
    ctx.fillStyle = PAGE_BACKGROUND_COLORS[pageBackground]
    ctx.fillRect(SHEET_BOUNDS.x, SHEET_BOUNDS.y, SHEET_WIDTH, SHEET_HEIGHT)
    drawPageTemplate(ctx, pageTemplate)
    ctx.restore()
    ctx.save()
    ctx.strokeStyle = '#d4d7de'
    ctx.lineWidth = 1
    ctx.strokeRect(WORKSPACE_BOUNDS.x + 0.5, WORKSPACE_BOUNDS.y + 0.5, WORKSPACE_BOUNDS.width - 1, WORKSPACE_BOUNDS.height - 1)
    ctx.restore()
    ctx.save()
    ctx.strokeStyle = '#d9dce2'
    ctx.lineWidth = 1
    ctx.strokeRect(SHEET_BOUNDS.x + 0.5, SHEET_BOUNDS.y + 0.5, SHEET_WIDTH - 1, SHEET_HEIGHT - 1)
    ctx.restore()
    ctx.save()
    ctx.beginPath()
    ctx.rect(WORKSPACE_BOUNDS.x, WORKSPACE_BOUNDS.y, WORKSPACE_BOUNDS.width, WORKSPACE_BOUNDS.height)
    ctx.clip()
    strokesRef.current.forEach((item) => {
      if (!selectedKeysRef.current.has(canvasItemKey(item))) return
      if (item.kind === 'rectangle') {
        ctx.save()
        ctx.strokeStyle = '#5574ed'
        ctx.lineWidth = 3
        ctx.setLineDash([7, 4])
        ctx.strokeRect(item.x - 5, item.y - 5, item.width + 10, item.height + 10)
        ctx.restore()
      } else if (item.kind === 'connector') {
        drawConnector(ctx, item, '#5574ed', item.strokeWidth + 8)
      } else if (!item.erase) {
        ctx.save()
        ctx.globalAlpha = 0.28
        drawStroke(ctx, { ...item, color: '#5574ed', width: item.width + 9 })
        ctx.restore()
      }
    })
    inkContext.setTransform(1, 0, 0, 1, 0, 0)
    inkContext.clearRect(0, 0, inkLayer.width, inkLayer.height)
    inkContext.setTransform(dpr * viewport.scale, 0, 0, dpr * viewport.scale, dpr * viewport.offsetX, dpr * viewport.offsetY)
    inkContext.save()
    inkContext.beginPath()
    inkContext.rect(WORKSPACE_BOUNDS.x, WORKSPACE_BOUNDS.y, WORKSPACE_BOUNDS.width, WORKSPACE_BOUNDS.height)
    inkContext.clip()
    canvasItemsForRendering(strokesRef.current).forEach((item) => drawItem(inkContext, item))
    if (activeStrokeRef.current) {
      const preview = shapePreviewRef.current
      const activeStrokeRenderStartedAt = measureFrame ? performance.now() : 0
      drawItem(inkContext, preview ?? activeStrokeRef.current)
      if (measureFrame) diagnostics?.recordActiveStrokeRender(performance.now() - activeStrokeRenderStartedAt)
    }
    inkContext.restore()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(inkLayer, 0, 0)
    ctx.setTransform(dpr * viewport.scale, 0, 0, dpr * viewport.scale, dpr * viewport.offsetX, dpr * viewport.offsetY)
    const activeConnector = activeConnectorRef.current
    if (activeConnector) {
      const previewConnector = createConnector(0, activeConnector.start, activeConnector.end, color, width, undefined, undefined, activeConnector.relationshipType)
      drawConnector(ctx, previewConnector, '#5574ed', width + 5)
      drawConnector(ctx, previewConnector)
      const snapPoints = [
        activeConnector.startAttachment ? activeConnector.start : null,
        activeConnector.endAttachment ? activeConnector.end : null,
      ].filter((point): point is Point => point !== null)
      if (snapPoints.length) {
        ctx.save()
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = '#536fe0'
        ctx.lineWidth = 2
        for (const point of snapPoints) {
          ctx.beginPath()
          ctx.arc(point.x, point.y, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
        ctx.restore()
      }
    }
    const selected = strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === selectedRectangleIdRef.current)
    if (selected) {
      ctx.save()
      ctx.strokeStyle = '#5269df'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(selected.x - 5, selected.y - 5, selected.width + 10, selected.height + 10)
      ctx.restore()
    }
    const soleSelectedRectangle = selectedRectangleIdRef.current !== null
      ? strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === selectedRectangleIdRef.current)
      : selectedKeysRef.current.size === 1
        ? strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && selectedKeysRef.current.has(canvasItemKey(item)))
        : undefined
    const groupBounds = !soleSelectedRectangle && selectedKeysRef.current.size > 1
      ? getCanvasSelectionBounds(strokesRef.current, selectedKeysRef.current)
      : null
    const resizeBounds = soleSelectedRectangle ?? groupBounds ?? undefined
    if (groupBounds) {
      ctx.save()
      ctx.strokeStyle = '#5269df'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(groupBounds.x - 5, groupBounds.y - 5, groupBounds.width + 10, groupBounds.height + 10)
      ctx.restore()
    }
    if (resizeBounds) {
      ctx.save()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#5269df'
      ctx.lineWidth = 2
      for (const { point } of getRectangleResizeHandles(resizeBounds)) {
        ctx.beginPath()
        ctx.rect(point.x - 5, point.y - 5, 10, 10)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }
    const lasso = activeLassoRef.current
    if (lasso && lasso.points.length > 1) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(lasso.points[0].x, lasso.points[0].y)
      lasso.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y))
      ctx.closePath()
      ctx.fillStyle = 'rgba(83, 111, 224, 0.08)'
      ctx.fill()
      ctx.strokeStyle = '#536fe0'
      ctx.lineWidth = 2
      ctx.setLineDash([7, 5])
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
    const minimapStartedAt = measureFrame ? performance.now() : 0
    renderNavigator()
    if (measureFrame) diagnostics?.recordMinimapRender(performance.now() - minimapStartedAt)
    const pageOverviewStartedAt = measureFrame ? performance.now() : 0
    renderPageOverview()
    if (measureFrame) diagnostics?.recordPageOverviewRender(performance.now() - pageOverviewStartedAt)
    if (measureFrame) diagnostics?.recordRenderComplete(performance.now() - renderStartedAt, performance.now())
  }, [color, drawConnector, drawItem, drawStroke, pageBackground, pageTemplate, renderNavigator, renderPageOverview, width])

  const applyViewport = (viewport: Viewport) => {
    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    const boundedViewport = rect
      ? clampViewportToBounds(viewport, rect.width, rect.height)
      : viewport
    viewportRef.current = boundedViewport
    setZoomPercent(Math.round(boundedViewport.scale * 100))
    renderAll()
  }

  const scheduleRender = useCallback(() => {
    const diagnostics = performanceDiagnosticsRef.current
    const alreadyPending = frameRef.current !== null
    diagnostics?.recordFrameRequest(performance.now(), alreadyPending)
    if (alreadyPending) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      diagnostics?.recordFrameCallback(performance.now())
      renderAll()
    })
  }, [renderAll])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    viewportRef.current = clampViewportToBounds(viewportRef.current, rect.width, rect.height)
    setZoomPercent(Math.round(viewportRef.current.scale * 100))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    renderAll()
  }, [renderAll])

  useEffect(() => {
    resizeCanvas()
    const observer = new ResizeObserver(resizeCanvas)
    if (canvasRef.current) observer.observe(canvasRef.current)
    window.addEventListener('orientationchange', resizeCanvas)
    return () => {
      observer.disconnect()
      window.removeEventListener('orientationchange', resizeCanvas)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
    }
  }, [resizeCanvas])

  useEffect(() => {
    renderAll()
  }, [pageOverviewExpanded, renderAll])

  useEffect(() => {
    saveStrokeDisplayMode(strokeDisplayMode)
    renderAll()
  }, [renderAll, strokeDisplayMode])

  useEffect(() => {
    savePageTemplate(pageTemplate)
    renderAll()
  }, [pageTemplate, renderAll])

  useEffect(() => {
    savePageBackground(pageBackground)
    renderAll()
  }, [pageBackground, renderAll])

  useEffect(() => {
    if (!PERFORMANCE_DIAGNOSTICS_ENABLED || !performanceDiagnosticsOpen) return
    const updateRows = () => setPerformanceRows(performanceDiagnosticsRef.current?.snapshot() ?? [])
    updateRows()
    const timer = window.setInterval(updateRows, 250)
    return () => window.clearInterval(timer)
  }, [performanceDiagnosticsOpen])

  useEffect(() => {
    if (!eraserMenuOpen) return
    const updateEraserPopoverPosition = () => {
      const anchor = eraserControlRef.current?.getBoundingClientRect()
      if (!anchor) return
      const width = Math.min(258, Math.max(0, window.innerWidth - 24))
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, anchor.right - width))
      const estimatedHeight = 250
      const belowTop = anchor.bottom + 12
      const top = belowTop + estimatedHeight <= window.innerHeight - 12
        ? belowTop
        : Math.max(12, anchor.top - estimatedHeight - 12)
      setEraserPopoverPosition({ left, top, width })
    }
    updateEraserPopoverPosition()
    const toolbar = toolbarRef.current
    toolbar?.addEventListener('scroll', updateEraserPopoverPosition, { passive: true })
    window.addEventListener('resize', updateEraserPopoverPosition)
    return () => {
      toolbar?.removeEventListener('scroll', updateEraserPopoverPosition)
      window.removeEventListener('resize', updateEraserPopoverPosition)
    }
  }, [eraserMenuOpen])

  const getScreenPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pressure,
    }
  }

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => screenToCanvasPoint(getScreenPoint(event), viewportRef.current)

  const getBoundedPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => clampPointToBounds(getPoint(event))

  const startUmlToolboxDrag = <T extends HTMLElement,>(event: React.PointerEvent<T>) => {
    event.stopPropagation()
    const toolbox = umlToolboxRef.current
    if (!toolbox) return
    const bounds = toolbox.getBoundingClientRect()
    suppressMinimizedToolboxClickRef.current = false
    umlToolboxDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: bounds.left, top: bounds.top, moved: false }
    setUmlToolboxPosition({ left: bounds.left, top: bounds.top })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveUmlToolbox = <T extends HTMLElement,>(event: React.PointerEvent<T>) => {
    const drag = umlToolboxDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) drag.moved = true
    const bounds = umlToolboxRef.current?.getBoundingClientRect()
    const width = bounds?.width ?? 168
    const height = bounds?.height ?? 320
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, drag.left + event.clientX - drag.startX))
    const top = Math.max(8, Math.min(window.innerHeight - height - 8, drag.top + event.clientY - drag.startY))
    setUmlToolboxPosition({ left, top })
  }

  const endUmlToolboxDrag = <T extends HTMLElement,>(event: React.PointerEvent<T>) => {
    if (umlToolboxDragRef.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    suppressMinimizedToolboxClickRef.current = umlToolboxMinimized && umlToolboxDragRef.current.moved
    umlToolboxDragRef.current = null
  }

  const restoreUmlToolbox = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (suppressMinimizedToolboxClickRef.current) {
      suppressMinimizedToolboxClickRef.current = false
      event.preventDefault()
      return
    }
    setUmlToolboxMinimized(false)
  }

  const selectUmlConnectorTool = (relationshipType: ConnectorRelationshipType) => {
    setUmlConnectorType(relationshipType)
    setConnectorMode(false)
    setShapeMode(false)
    setSelectionMode(false)
    setLassoMode(false)
    setEraser(false)
    setEraserMenuOpen(false)
    clearLassoSelection()
  }

  const translateWithinWorkspace = (items: CanvasItem[], keys: Set<string>, dx: number, dy: number): CanvasItem[] => {
    const bounds = getCanvasSelectionBounds(items, keys)
    if (!bounds) return translateSelectedItems(items, keys, dx, dy)
    const translation = clampTranslationToBounds(bounds, dx, dy)
    return translateSelectedItems(items, keys, translation.dx, translation.dy)
  }

  const snapConnectorEndpointWithinWorkspace = (point: Point) => {
    const snapped = snapConnectorEndpoint(point, strokesRef.current, CONNECTOR_SNAP_TOLERANCE / viewportRef.current.scale)
    return snapped && isPointWithinBounds(snapped.point) ? snapped : null
  }

  const fitCanvasView = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    applyViewport(fitViewportToBounds(WORKSPACE_BOUNDS, rect.width, rect.height))
  }

  const fitDrawingView = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = getCanvasSelectionBounds(strokesRef.current, new Set(strokesRef.current.map(canvasItemKey)))
    if (!bounds) {
      fitCanvasView()
      return
    }
    const rect = canvas.getBoundingClientRect()
    applyViewport(fitViewportToBounds(bounds, rect.width, rect.height, 48))
  }

  const resetView = () => applyViewport({ scale: DEFAULT_ZOOM, offsetX: 0, offsetY: 0 })

  const getMinimapCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>, geometry: MinimapGeometry): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return minimapToCanvasPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top, pressure: 1 }, geometry)
  }

  const jumpToMinimapPoint = (point: Point, bounds: ViewBounds) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    applyViewport(centerViewportOnPoint(viewportRef.current, point, rect.width, rect.height, bounds))
  }

  const onMinimapPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const bounds = getCurrentMinimapBounds()
    const geometry = getMinimapGeometry(rect.width, rect.height, bounds)
    minimapDragPointerRef.current = { pointerId: event.pointerId, bounds, geometry }
    event.currentTarget.setPointerCapture(event.pointerId)
    jumpToMinimapPoint(getMinimapCanvasPoint(event, geometry), bounds)
  }

  const onMinimapPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = minimapDragPointerRef.current
    if (drag?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    jumpToMinimapPoint(getMinimapCanvasPoint(event, drag.geometry), drag.bounds)
  }

  const onMinimapPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (minimapDragPointerRef.current?.pointerId === event.pointerId) {
      minimapDragPointerRef.current = null
      renderAll()
    }
  }

  const getPageOverviewCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    const geometry = getPageOverviewGeometry(rect.width, rect.height)
    const point = minimapToCanvasPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top, pressure: 1 }, geometry)
    return {
      ...point,
      x: Math.max(SHEET_BOUNDS.x, Math.min(SHEET_BOUNDS.x + SHEET_WIDTH, point.x)),
      y: Math.max(SHEET_BOUNDS.y, Math.min(SHEET_BOUNDS.y + SHEET_HEIGHT, point.y)),
    }
  }

  const jumpToPageOverviewPoint = (point: Point) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    applyViewport(centerViewportOnPoint(viewportRef.current, point, rect.width, rect.height))
  }

  const onPageOverviewPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    event.stopPropagation()
    pageOverviewDragPointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    jumpToPageOverviewPoint(getPageOverviewCanvasPoint(event))
  }

  const onPageOverviewPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pageOverviewDragPointerRef.current !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    jumpToPageOverviewPoint(getPageOverviewCanvasPoint(event))
  }

  const onPageOverviewPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pageOverviewDragPointerRef.current === event.pointerId) pageOverviewDragPointerRef.current = null
  }

  const beginTouchGesture = () => {
    const mode = getTouchNavigationGestureMode(touchPointsRef.current.size)
    if (!mode) {
      touchGestureRef.current = null
      return
    }
    const points = [...touchPointsRef.current.values()]
    const [first, second] = points
    touchGestureRef.current = {
      mode,
      viewport: { ...viewportRef.current },
      center: {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        pressure: 1,
      },
      distance: mode === 'pinch-zoom' ? Math.hypot(second.x - first.x, second.y - first.y) : 0,
    }
  }

  const updateTouchPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    touchPointsRef.current.set(event.pointerId, getScreenPoint(event))
    const gesture = touchGestureRef.current
    if (!gesture || getTouchNavigationGestureMode(touchPointsRef.current.size) !== gesture.mode) return false
    const points = [...touchPointsRef.current.values()]
    if (gesture.mode === 'pinch-zoom') {
      const [first, second] = points
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      applyViewport(zoomTwoFingerViewport(gesture.viewport, gesture.center, gesture.distance, distance, MIN_ZOOM, MAX_ZOOM))
    } else {
      const center = {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        pressure: 1,
      }
      if (Math.hypot(center.x - gesture.center.x, center.y - gesture.center.y) >= THREE_FINGER_PAN_THRESHOLD) {
        applyViewport(panThreeFingerViewport(gesture.viewport, gesture.center, center))
      }
    }
    return true
  }

  const finishTouchPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    touchPointsRef.current.delete(event.pointerId)
    beginTouchGesture()
  }

  const finishStroke = useCallback((pointerId: number) => {
    if (activePointerRef.current !== pointerId) return
    clearShapeHoldTimer()
    if (activeStrokeRef.current) {
      const pointCount = activeStrokeRef.current.points.length
      performanceDiagnosticsRef.current?.finishStroke(pointCount, performance.now())
      saveHistory()
      let stroke = shapePreviewRef.current
      if (!stroke) {
        const heldStroke = activeStrokeRef.current
        const heldForMs = performance.now() - lastSignificantMoveAtRef.current
        const heldLongEnough = heldForMs >= SHAPE_RECOGNITION_HOLD_MS
        const recognizedShape = shapeMode
          ? recognizeShape(heldStroke)
          : recognizeRectangleOnHold(heldStroke, heldForMs, nextRectangleIdRef.current) ?? heldStroke
        if (!shapeMode && recognizedShape.kind === 'rectangle') nextRectangleIdRef.current += 1
        stroke = recognizedShape.kind === 'rectangle' || (recognizedShape.kind === 'stroke' && recognizedShape.shape)
          ? recognizedShape
          : heldLongEnough ? recognizeLine(heldStroke) : heldStroke
      }
      strokesRef.current.push(stroke)
      setHasInk(true)
    }
    activeStrokeRef.current = null
    activeConnectorRef.current = null
    shapePreviewRef.current = null
    activePointerRef.current = null
    if (hoverErasePointerRef.current === pointerId) hoverErasePointerRef.current = null
    activeDragRef.current = null
    holdAnchorRef.current = null
    lastSignificantMoveAtRef.current = 0
    scheduleRender()
  }, [scheduleRender, shapeMode])

  const appendStrokeSample = (pointerId: number, point: Point): boolean => {
    const stroke = activeStrokeRef.current
    if (!stroke) return false
    const previous = stroke.points[stroke.points.length - 1]
    const clippedPoint = clipSegmentToBounds(previous, point)
    if (clippedPoint && shouldAppendStrokeSample(previous, clippedPoint, viewportRef.current.scale)) {
      stroke.points.push(clippedPoint)
    }
    if (!isPointWithinBounds(point)) {
      finishStroke(pointerId)
      return false
    }
    return true
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch') {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      touchPointsRef.current.set(event.pointerId, getScreenPoint(event))
      beginTouchGesture()
      return
    }
    if (event.pointerType === 'pen' && hoverErasePointerRef.current === event.pointerId) finishStroke(event.pointerId)
    if (event.pointerType !== 'pen' || activePointerRef.current !== null || activeConnectorRef.current !== null || activeDragRef.current !== null || activeResizeRef.current !== null || activeLassoRef.current !== null || lassoDragRef.current !== null) return
    event.preventDefault()
    const rawPoint = getPoint(event)
    if (!isPointWithinBounds(rawPoint)) return
    const point = getBoundedPoint(event)
    if (connectorMode || umlConnectorType !== null) {
      event.currentTarget.setPointerCapture(event.pointerId)
      const snappedStart = snapConnectorEndpointWithinWorkspace(point)
      activeConnectorRef.current = {
        pointerId: event.pointerId,
        start: snappedStart?.point ?? point,
        end: point,
        relationshipType: umlConnectorType ?? 'association',
        startAttachment: snappedStart?.attachment,
      }
      renderAll()
      return
    }
    if (lassoMode) {
      const selectedItems = strokesRef.current.filter((item) => selectedKeysRef.current.has(canvasItemKey(item)))
      const singleSelectedRectangle = selectedItems.length === 1 && selectedItems[0].kind === 'rectangle' ? selectedItems[0] : null
      const selectedBounds = singleSelectedRectangle
        ? { x: singleSelectedRectangle.x, y: singleSelectedRectangle.y, width: singleSelectedRectangle.width, height: singleSelectedRectangle.height }
        : selectedItems.length > 1 ? getCanvasSelectionBounds(strokesRef.current, selectedKeysRef.current) : null
      const resizeHandle = selectedBounds ? hitTestRectangleResizeHandle(selectedBounds, point, 14 / viewportRef.current.scale) : null
      if (selectedBounds && resizeHandle) {
        event.currentTarget.setPointerCapture(event.pointerId)
        activeResizeRef.current = {
          pointerId: event.pointerId,
          rectangleId: singleSelectedRectangle?.id ?? null,
          selectedKeys: singleSelectedRectangle ? null : new Set(selectedKeysRef.current),
          handle: resizeHandle,
          start: point,
          originalBounds: { ...selectedBounds },
          originalItems: cloneCanvasItems(strokesRef.current),
          moved: false,
        }
        return
      }
      const hitSelected = [...selectedItems].reverse().some((item) => itemHitTest(item, point, 12 / viewportRef.current.scale))
      if (selectedKeysRef.current.size > 0 && hitSelected) {
        event.currentTarget.setPointerCapture(event.pointerId)
        lassoDragRef.current = {
          pointerId: event.pointerId,
          start: point,
          keys: new Set(selectedKeysRef.current),
          originalItems: cloneCanvasItems(strokesRef.current),
          moved: false,
        }
        return
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      activeLassoRef.current = { pointerId: event.pointerId, points: [point] }
      renderAll()
      return
    }
    if (selectionMode) {
      const currentlySelectedRectangle = selectedRectangleIdRef.current === null
        ? null
        : strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === selectedRectangleIdRef.current) ?? null
      const selectedHandle = currentlySelectedRectangle ? hitTestRectangleResizeHandle(currentlySelectedRectangle, point, 14 / viewportRef.current.scale) : null
      if (currentlySelectedRectangle && selectedHandle) {
        event.currentTarget.setPointerCapture(event.pointerId)
        activeResizeRef.current = {
          pointerId: event.pointerId,
          rectangleId: currentlySelectedRectangle.id,
          selectedKeys: null,
          handle: selectedHandle,
          start: point,
          originalBounds: { x: currentlySelectedRectangle.x, y: currentlySelectedRectangle.y, width: currentlySelectedRectangle.width, height: currentlySelectedRectangle.height },
          originalItems: cloneCanvasItems(strokesRef.current),
          moved: false,
        }
        return
      }
      const rectangle = hitTestRectangle(point)
      const connector = rectangle ? null : hitTestConnector(point)
      setSelectedRectangle(rectangle?.id ?? null)
      updateSelectedItems(connector ? [canvasItemKey(connector)] : [])
      renderAll()
      const selectedItem = rectangle ?? connector
      if (!selectedItem) return
      event.currentTarget.setPointerCapture(event.pointerId)
      activeDragRef.current = {
        pointerId: event.pointerId,
        itemKey: canvasItemKey(selectedItem),
        start: point,
        originalItems: cloneCanvasItems(strokesRef.current),
        moved: false,
      }
      return
    }
    if (eraser && objectEraser) {
      event.currentTarget.setPointerCapture(event.pointerId)
      activeObjectEraserRef.current = { pointerId: event.pointerId, lastPoint: point, changed: false }
      if (deleteWholeObjectAtPoint(point)) renderAll()
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointerRef.current = event.pointerId
    lastSignificantMoveAtRef.current = performance.now()
    activeStrokeRef.current = eraser
      ? createEraserStroke(nextStrokeIdRef.current++, point, color, eraserSize)
      : { kind: 'stroke', id: nextStrokeIdRef.current++, points: [point], color, width, erase: false }
    if (!eraser) performanceDiagnosticsRef.current?.startStroke(strokeDisplayMode, performance.now(), event.nativeEvent.timeStamp)
    shapePreviewRef.current = null
    holdAnchorRef.current = point
    scheduleShapePreview(point)
    scheduleRender()
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (touchPointsRef.current.has(event.pointerId)) {
      event.preventDefault()
      updateTouchPoint(event)
      return
    }
    const objectEraseGesture = activeObjectEraserRef.current
    if (objectEraseGesture?.pointerId === event.pointerId) {
      event.preventDefault()
      const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
      let changed = false
      for (const sample of samples) {
        const rect = event.currentTarget.getBoundingClientRect()
        const point = screenToCanvasPoint({
          x: sample.clientX - rect.left,
          y: sample.clientY - rect.top,
          pressure: sample.pressure,
        }, viewportRef.current)
        const maxSpacing = 6 / viewportRef.current.scale
        for (const sweepPoint of getEraserSweepPoints(objectEraseGesture.lastPoint, point, maxSpacing)) {
          if (isPointWithinBounds(sweepPoint) && deleteWholeObjectAtPoint(sweepPoint)) changed = true
        }
        objectEraseGesture.lastPoint = point
      }
      if (changed) renderAll()
      return
    }
    if (isPenHoverEraseInput(event.pointerType, event.buttons, eraser, objectEraser)
      && activePointerRef.current === null
      && touchPointsRef.current.size === 0
      && activeConnectorRef.current === null
      && activeResizeRef.current === null
      && activeLassoRef.current === null
      && lassoDragRef.current === null
      && activeDragRef.current === null) {
      const point = getPoint(event)
      if (isPointWithinBounds(point) && hitTestObject(point) !== -1) {
        event.preventDefault()
        activePointerRef.current = event.pointerId
        hoverErasePointerRef.current = event.pointerId
        activeStrokeRef.current = createEraserStroke(nextStrokeIdRef.current++, point, color, eraserSize)
        shapePreviewRef.current = null
        holdAnchorRef.current = point
        lastSignificantMoveAtRef.current = performance.now()
        scheduleRender()
        return
      }
    }
    const activeConnector = activeConnectorRef.current
    if (activeConnector?.pointerId === event.pointerId) {
      event.preventDefault()
      const point = getBoundedPoint(event)
      const snappedEnd = snapConnectorEndpointWithinWorkspace(point)
      activeConnector.end = snappedEnd?.point ?? point
      activeConnector.endAttachment = snappedEnd?.attachment
      scheduleRender()
      return
    }
    const activeResize = activeResizeRef.current
    if (activeResize?.pointerId === event.pointerId) {
      event.preventDefault()
      const point = getBoundedPoint(event)
      const bounds = getResizedRectangleBounds(
        activeResize.originalBounds,
        activeResize.handle,
        point.x - activeResize.start.x,
        point.y - activeResize.start.y,
      )
      const original = activeResize.originalBounds
      const unchanged = bounds.x === original.x && bounds.y === original.y
        && bounds.width === original.width && bounds.height === original.height
      if (!activeResize.moved && unchanged) return
      const nextItems = activeResize.rectangleId !== null
        ? resizeRectangleItems(activeResize.originalItems, activeResize.rectangleId, bounds)
        : resizeSelectedItems(activeResize.originalItems, activeResize.selectedKeys ?? new Set(), bounds)
      if (!activeResize.moved) {
        saveHistory()
        activeResize.moved = true
      }
      strokesRef.current = nextItems
      renderAll()
      return
    }
    const lassoDrag = lassoDragRef.current
    if (lassoDrag?.pointerId === event.pointerId) {
      event.preventDefault()
      const point = getBoundedPoint(event)
      const deltaX = point.x - lassoDrag.start.x
      const deltaY = point.y - lassoDrag.start.y
      if (!lassoDrag.moved && Math.hypot(deltaX, deltaY) < 2) return
      const nextItems = translateWithinWorkspace(lassoDrag.originalItems, lassoDrag.keys, deltaX, deltaY)
      if (!lassoDrag.moved && nextItems.every((item, index) => item === lassoDrag.originalItems[index])) return
      if (!lassoDrag.moved) {
        saveHistory()
        lassoDrag.moved = true
      }
      strokesRef.current = nextItems
      renderAll()
      return
    }
    const activeLasso = activeLassoRef.current
    if (activeLasso?.pointerId === event.pointerId) {
      event.preventDefault()
      const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
      for (const sample of samples) {
        const rect = event.currentTarget.getBoundingClientRect()
        const point = clampPointToBounds(screenToCanvasPoint({ x: sample.clientX - rect.left, y: sample.clientY - rect.top, pressure: sample.pressure }, viewportRef.current))
        const previous = activeLasso.points[activeLasso.points.length - 1]
        if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 1.5) activeLasso.points.push(point)
      }
      scheduleRender()
      return
    }
    const drag = activeDragRef.current
    if (drag?.pointerId === event.pointerId) {
      event.preventDefault()
      const point = getBoundedPoint(event)
      const deltaX = point.x - drag.start.x
      const deltaY = point.y - drag.start.y
      if (!drag.moved && Math.hypot(deltaX, deltaY) < 2) return
      const nextItems = translateWithinWorkspace(drag.originalItems, new Set([drag.itemKey]), deltaX, deltaY)
      if (!drag.moved && nextItems.every((item, index) => item === drag.originalItems[index])) return
      if (!drag.moved) {
        saveHistory()
        drag.moved = true
      }
      strokesRef.current = nextItems
      renderAll()
      return
    }
    if (activePointerRef.current !== event.pointerId || !activeStrokeRef.current) return
    event.preventDefault()
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    performanceDiagnosticsRef.current?.recordPointerMove(event.nativeEvent.timeStamp, samples.length, performance.now())
    for (const sample of samples) {
      const rect = event.currentTarget.getBoundingClientRect()
      const point = screenToCanvasPoint({
        x: sample.clientX - rect.left,
        y: sample.clientY - rect.top,
        pressure: sample.pressure,
      }, viewportRef.current)
      if (!appendStrokeSample(event.pointerId, point)) return
    }
    const latestPoint = activeStrokeRef.current.points[activeStrokeRef.current.points.length - 1]
    if (!holdAnchorRef.current || Math.hypot(latestPoint.x - holdAnchorRef.current.x, latestPoint.y - holdAnchorRef.current.y) >= SHAPE_HOLD_JITTER_PX) {
      shapePreviewRef.current = null
      lastSignificantMoveAtRef.current = performance.now()
      scheduleShapePreview(latestPoint)
    }
    scheduleRender()
  }

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (touchPointsRef.current.has(event.pointerId) || event.pointerType === 'touch') {
      finishTouchPointer(event)
      return
    }
    if (hoverErasePointerRef.current === event.pointerId) {
      finishStroke(event.pointerId)
      return
    }
    if (activeObjectEraserRef.current?.pointerId === event.pointerId) {
      activeObjectEraserRef.current = null
      return
    }
    const activeConnector = activeConnectorRef.current
    if (activeConnector?.pointerId === event.pointerId) {
      const point = getBoundedPoint(event)
      const snappedEnd = snapConnectorEndpointWithinWorkspace(point)
      activeConnector.end = snappedEnd?.point ?? point
      activeConnector.endAttachment = snappedEnd?.attachment
      if (Math.hypot(activeConnector.end.x - activeConnector.start.x, activeConnector.end.y - activeConnector.start.y) >= 2) {
        saveHistory()
        strokesRef.current.push(createConnector(
          nextConnectorIdRef.current++,
          activeConnector.start,
          activeConnector.end,
          color,
          width,
          activeConnector.startAttachment,
          activeConnector.endAttachment,
          activeConnector.relationshipType,
        ))
        setHasInk(true)
      }
      activeConnectorRef.current = null
      renderAll()
      return
    }
    if (activeResizeRef.current?.pointerId === event.pointerId) {
      activeResizeRef.current = null
      renderAll()
      return
    }
    const activeLasso = activeLassoRef.current
    if (activeLasso?.pointerId === event.pointerId) {
      const finalPoint = getBoundedPoint(event)
      const previous = activeLasso.points[activeLasso.points.length - 1]
      if (Math.hypot(finalPoint.x - previous.x, finalPoint.y - previous.y) >= 1.5) activeLasso.points.push(finalPoint)
      activeLassoRef.current = null
      updateSelectedItems(selectItemsByLasso(strokesRef.current, activeLasso.points))
      setSelectedRectangle(null)
      renderAll()
      return
    }
    if (lassoDragRef.current?.pointerId === event.pointerId) {
      lassoDragRef.current = null
      return
    }
    if (activeDragRef.current?.pointerId === event.pointerId) {
      activeDragRef.current = null
      return
    }
    if (activePointerRef.current === event.pointerId && activeStrokeRef.current) {
      const finalPoint = getPoint(event)
      appendStrokeSample(event.pointerId, finalPoint)
      if (activeStrokeRef.current && holdAnchorRef.current && Math.hypot(finalPoint.x - holdAnchorRef.current.x, finalPoint.y - holdAnchorRef.current.y) >= SHAPE_HOLD_JITTER_PX) {
        lastSignificantMoveAtRef.current = performance.now()
      }
    }
    finishStroke(event.pointerId)
  }

  const onPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (touchPointsRef.current.has(event.pointerId) || event.pointerType === 'touch') {
      finishTouchPointer(event)
      return
    }
    if (hoverErasePointerRef.current === event.pointerId) {
      finishStroke(event.pointerId)
      return
    }
    if (activeObjectEraserRef.current?.pointerId === event.pointerId) {
      activeObjectEraserRef.current = null
      return
    }
    if (activeConnectorRef.current?.pointerId === event.pointerId) {
      activeConnectorRef.current = null
      renderAll()
      return
    }
    if (activeResizeRef.current?.pointerId === event.pointerId) {
      activeResizeRef.current = null
      renderAll()
      return
    }
    if (activeLassoRef.current?.pointerId === event.pointerId) {
      activeLassoRef.current = null
      renderAll()
      return
    }
    if (lassoDragRef.current?.pointerId === event.pointerId) {
      lassoDragRef.current = null
      renderAll()
      return
    }
    if (activeDragRef.current?.pointerId === event.pointerId) {
      activeDragRef.current = null
      return
    }
    finishStroke(event.pointerId)
  }

  const clearCanvas = () => {
    if (!strokesRef.current.length) return
    saveHistory()
    strokesRef.current = []
    activeStrokeRef.current = null
    activeConnectorRef.current = null
    activeResizeRef.current = null
    shapePreviewRef.current = null
    activeLassoRef.current = null
    lassoDragRef.current = null
    updateSelectedItems([])
    activePointerRef.current = null
    hoverErasePointerRef.current = null
    activeObjectEraserRef.current = null
    holdAnchorRef.current = null
    setSelectedRectangle(null)
    clearShapeHoldTimer()
    setHasInk(false)
    renderAll()
  }

  const onPointerLeave = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (hoverErasePointerRef.current === event.pointerId) finishStroke(event.pointerId)
  }

  return (
    <main className="app-shell">
      <section className="canvas-stage" aria-label="Drawing canvas">
        <canvas
          ref={canvasRef}
          className={`drawing-canvas${selectionMode ? ' selecting' : ''}${connectorMode || umlConnectorType !== null ? ' connecting' : ''}`}
          aria-label="White drawing canvas. Use an S Pen to draw."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onPointerLeave={onPointerLeave}
        />
        {!hasInk && <div className="canvas-hint" aria-hidden="true">Draw here with your S Pen</div>}
        <aside
          ref={umlToolboxRef}
          className={`uml-toolbox${umlToolboxMinimized ? ' minimized' : ''}`}
          aria-label="UML connector tools"
          style={umlToolboxPosition ? { left: umlToolboxPosition.left, top: umlToolboxPosition.top, transform: 'none' } : undefined}
        >
          {umlToolboxMinimized ? (
            <button
              className="uml-toolbox-restore"
              type="button"
              aria-label="Restore UML connector tools"
              title="Restore UML connector tools (drag to move)"
              onPointerDown={startUmlToolboxDrag}
              onPointerMove={moveUmlToolbox}
              onPointerUp={endUmlToolboxDrag}
              onPointerCancel={endUmlToolboxDrag}
              onLostPointerCapture={endUmlToolboxDrag}
              onClick={restoreUmlToolbox}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="7" height="6" rx="1"/><rect x="14" y="14" width="7" height="6" rx="1"/><path d="m9 9 6 6"/></svg>
            </button>
          ) : (
            <>
              <div
                className="uml-toolbox-header"
                onPointerDown={startUmlToolboxDrag}
                onPointerMove={moveUmlToolbox}
                onPointerUp={endUmlToolboxDrag}
                onPointerCancel={endUmlToolboxDrag}
                onLostPointerCapture={endUmlToolboxDrag}
              >
                <span>UML connectors</span>
                <span className="uml-toolbox-header-actions">
                  <span className="uml-toolbox-grip" aria-hidden="true">⠿</span>
                  <button
                    className="uml-toolbox-minimize"
                    type="button"
                    aria-label="Minimize UML toolbox"
                    title="Minimize"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setUmlToolboxMinimized(true)}
                  >−</button>
                </span>
              </div>
              <div className="uml-toolbox-tools">
                {UML_CONNECTOR_TOOLS.map(({ type, label }) => (
                  <button
                    key={type}
                    className={`uml-tool-button${umlConnectorType === type ? ' selected' : ''}`}
                    type="button"
                    aria-label={`${label} connector`}
                    aria-pressed={umlConnectorType === type}
                    title={`Draw a ${label.toLowerCase()} connector`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => selectUmlConnectorTool(type)}
                  >
                    <UmlConnectorIcon type={type} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
        <aside className={`viewport-navigator${navigatorPanels.includes('page') ? ' expanded' : ''}`} aria-label="Canvas navigation">
          <div className="navigator-header">
            <span className="navigator-map-label">Workspace</span>
            <button
              className="navigator-expand-button"
              type="button"
              aria-label={pageOverviewExpanded ? 'Collapse page overview' : 'Expand page overview'}
              aria-expanded={pageOverviewExpanded}
              title={pageOverviewExpanded ? 'Hide page overview' : 'Show page overview'}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); setPageOverviewExpanded((expanded) => !expanded) }}
            >
              <span aria-hidden="true">{pageOverviewExpanded ? '−' : '+'}</span>
            </button>
          </div>
          <div className={`navigator-maps${navigatorPanels.includes('page') ? ' expanded' : ''}`}>
            <div className="navigator-map-section">
              <canvas
                ref={minimapRef}
                className="navigator-map"
                aria-label="Workspace overview. Click or drag to navigate the full drawing area."
                onPointerDown={onMinimapPointerDown}
                onPointerMove={onMinimapPointerMove}
                onPointerUp={onMinimapPointerEnd}
                onPointerCancel={onMinimapPointerEnd}
                onLostPointerCapture={onMinimapPointerEnd}
              />
            </div>
            {navigatorPanels.includes('page') && (
              <div className="navigator-page-section">
                <span className="navigator-map-label">Page</span>
                <canvas
                  ref={pageOverviewRef}
                  className="navigator-page-map"
                  aria-label="Page overview. Click or drag to navigate the white page."
                  onPointerDown={onPageOverviewPointerDown}
                  onPointerMove={onPageOverviewPointerMove}
                  onPointerUp={onPageOverviewPointerEnd}
                  onPointerCancel={onPageOverviewPointerEnd}
                  onLostPointerCapture={onPageOverviewPointerEnd}
                />
              </div>
            )}
          </div>
          <div className="navigator-controls">
            <output className="zoom-indicator" aria-label="Current zoom">{zoomPercent}%</output>
            <button type="button" onClick={fitCanvasView}>Fit canvas</button>
            <button type="button" onClick={fitDrawingView}>Fit drawing</button>
            <button type="button" onClick={resetView}>Reset</button>
          </div>
        </aside>
      </section>
      <header ref={toolbarRef} className="toolbar" aria-label="Drawing tools">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">Ink Pad</span>
        </div>
        <button className="history-button" type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-2"/></svg>
          <span>Undo</span>
        </button>
        <button className="history-button" type="button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9h-9a6 6 0 0 0 0 12h2"/></svg>
          <span>Redo</span>
        </button>
        <span className="toolbar-spacer toolbar-tools-spacer" />
        <button className={`tool-button pen-button${penModeActive ? ' selected' : ''}`} type="button" aria-label="Pen" aria-pressed={penModeActive} title="Freehand pen" onClick={selectPenMode}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 11.8-11.8a2.1 2.1 0 0 1 3 3L7 20l-4 1z"/><path d="m13.5 6.5 4 4"/></svg><span>Pen</span>
        </button>
        <button className={`tool-button shape-button${shapeMode ? ' selected' : ''}`} type="button" aria-pressed={shapeMode} title="Straight lines and rectangles recognize on hold automatically. Toggle for arrows." onClick={() => { setShapeMode((value) => !value); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); clearLassoSelection(); setEraser(false) }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="10" height="10" rx="1"/><path d="M10 19h9m0 0-4-4m4 4-4 4"/></svg><span>Shapes</span>
        </button>
        <button className={`tool-button selection-button${selectionMode ? ' selected' : ''}`} type="button" aria-pressed={selectionMode} title="Select, move, and resize rectangles" onClick={() => { const next = !selectionMode; setSelectionMode(next); setLassoMode(false); setConnectorMode(false); setShapeMode(false); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v16l4.3-4.1 3.2 6.1 2.5-1.3-3.1-6.1H18L5 3Z"/><rect x="15.5" y="3.5" width="5" height="5" rx="1"/></svg><span>Select</span>
        </button>
        <button className={`tool-button lasso-button${lassoMode ? ' selected' : ''}`} type="button" aria-pressed={lassoMode} title="Draw a loop to select and move multiple items" onClick={() => { const next = !lassoMode; setLassoMode(next); setSelectionMode(false); setConnectorMode(false); setShapeMode(false); setEraser(false); setEraserMenuOpen(false); setSelectedRectangle(null); clearLassoSelection() }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12c0-4.1 3.1-7 7.3-7 3.8 0 6.7 2.2 6.7 5.7 0 3.8-3.2 7.3-7.1 7.3-3.8 0-6.9-2.1-6.9-6Z"/><path d="M17.5 17.5 20 20"/></svg><span>Lasso</span>
        </button>
        <button className={`tool-button connector-button${connectorMode || umlConnectorType !== null ? ' selected' : ''}`} type="button" aria-pressed={connectorMode || umlConnectorType !== null} title="Draw a straight UML relationship connector with the S Pen" onClick={() => { const next = !connectorMode; setConnectorMode(next); setLassoMode(false); setSelectionMode(false); setShapeMode(false); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="6" height="6" rx="1"/><rect x="14.5" y="14" width="6" height="6" rx="1"/><path d="m9.5 8.5 5 6"/></svg><span>Connector</span>
        </button>
        {selectedItemCount > 0 && <button className="clear-selection-button" type="button" onClick={clearLassoSelection}>Clear selection</button>}
        {selectedConnectorId !== null && selectedConnectorType !== null && <div className="relationship-controls" role="group" aria-label="Selected connector relationship">
          <label className="relationship-label" htmlFor="connector-relationship-type">Relationship</label>
          <select
            id="connector-relationship-type"
            className="relationship-select"
            aria-label="Connector relationship type"
            value={selectedConnectorType}
            onChange={(event) => changeSelectedConnectorType(event.target.value as ConnectorRelationshipType)}
          >
            <option value="association">Association</option>
            <option value="directed-association">Directed association</option>
            <option value="inheritance">Inheritance</option>
            <option value="realization">Realization</option>
            <option value="dependency">Dependency</option>
            <option value="aggregation">Aggregation</option>
            <option value="composition">Composition</option>
          </select>
          <button
            className="relationship-reverse"
            type="button"
            disabled={selectedConnectorType === 'association'}
            title={selectedConnectorType === 'association' ? 'Association has no direction' : `Reverse ${selectedConnectorReversed ? 'to start' : 'to end'}`}
            aria-label="Reverse connector direction"
            onClick={reverseSelectedConnector}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15l-4-4m4 4-4 4M20 16H5l4 4m-4-4 4-4"/></svg>
            <span>Reverse</span>
          </button>
        </div>}
        <span className="toolbar-spacer toolbar-settings-spacer" />
        <div className="tool-group color-group" aria-label="Pen color">
          {COLORS.map((item) => (
            <button
              className={`color-swatch${color === item.value ? ' selected' : ''}`}
              key={item.value}
              type="button"
              title={item.name}
              aria-label={item.name}
              aria-pressed={color === item.value}
              style={{ '--swatch': item.value } as React.CSSProperties}
              onClick={() => { setColor(item.value); setEraser(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); clearLassoSelection() }}
            />
          ))}
        </div>
        <div className="tool-group thickness-group" aria-label="Stroke thickness">
          {WIDTHS.map((size) => (
            <button
              className={`thickness-button${width === size ? ' selected' : ''}`}
              key={size}
              type="button"
              title={`${size}px stroke`}
              aria-label={`${size} pixel stroke thickness`}
              aria-pressed={width === size}
              onClick={() => setWidth(size)}
            ><span style={{ width: Math.min(size * 2.2, 20), height: Math.min(size * 2.2, 20) }} /></button>
          ))}
        </div>
        <div className="stroke-display-control" role="group" aria-label="Stroke display mode">
          <button className={`stroke-mode-button${strokeDisplayMode === 'smooth' ? ' selected' : ''}`} type="button" aria-label="Smooth stroke display" aria-pressed={strokeDisplayMode === 'smooth'} title="Display smoothed curved strokes" onClick={() => setStrokeDisplayMode('smooth')}>
            <svg viewBox="0 0 24 16" aria-hidden="true"><path d="M1 12c4 0 4-8 8-8s4 8 8 8 4-4 6-4"/></svg><span>Smooth</span>
          </button>
          <button className={`stroke-mode-button${strokeDisplayMode === 'raw' ? ' selected' : ''}`} type="button" aria-label="Raw stroke display" aria-pressed={strokeDisplayMode === 'raw'} title="Display raw straight stroke segments" onClick={() => setStrokeDisplayMode('raw')}>
            <svg viewBox="0 0 24 16" aria-hidden="true"><path d="m1 12 7-8 7 8 8-7"/></svg><span>Raw</span>
          </button>
        </div>
        <label className="page-template-control">
          <span>Page</span>
          <select
            className="page-template-select"
            aria-label="Page template"
            value={pageTemplate}
            onChange={(event) => setPageTemplate(event.target.value as PageTemplate)}
          >
            <option value="blank">Blank</option>
            <option value="lined">Lined</option>
            <option value="dotted">Dotted</option>
          </select>
        </label>
        <label className="page-template-control page-background-control">
          <span>Color</span>
          <select
            className="page-template-select"
            aria-label="Sheet background color"
            value={pageBackground}
            onChange={(event) => setPageBackground(event.target.value as PageBackground)}
          >
            <option value="white">White</option>
            <option value="warm">Warm</option>
            <option value="blue">Blue</option>
            <option value="yellow">Yellow</option>
            <option value="green">Green</option>
          </select>
          <span className="page-color-swatch" aria-hidden="true" style={{ backgroundColor: PAGE_BACKGROUND_COLORS[pageBackground] }} />
        </label>
        <div ref={eraserControlRef} className="eraser-control">
        <button className={`tool-button eraser-button${eraser ? ' selected' : ''}`} type="button" aria-label="Eraser" title="Eraser" aria-pressed={eraser} aria-expanded={eraserMenuOpen} onClick={() => { setShapeMode(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); clearLassoSelection(); setEraser((value) => !value); setEraserMenuOpen((value) => !value) }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.2 4.8 9.9 0a1.5 1.5 0 0 1 1.1 2.6l-9.8 9.8a1.5 1.5 0 0 1-2.1 0l-4.1-4.1a1.5 1.5 0 0 1 0-2.1l7.2-7.2a1.5 1.5 0 0 1 1.1-.4Z"/><path d="m8.1 17.2 3.6 3.6h8"/></svg>
          <span>Eraser</span>
        </button>
        </div>
        {PERFORMANCE_DIAGNOSTICS_ENABLED && <button className={`perf-diagnostics-toggle${performanceDiagnosticsOpen ? ' selected' : ''}`} type="button" aria-expanded={performanceDiagnosticsOpen} aria-controls="inkpad-performance-panel" onClick={() => setPerformanceDiagnosticsOpen((open) => !open)}>Perf</button>}
        <button className="clear-button" type="button" onClick={clearCanvas} disabled={!hasInk}>Clear</button>
      </header>
      {PERFORMANCE_DIAGNOSTICS_ENABLED && performanceDiagnosticsOpen && <section id="inkpad-performance-panel" className="performance-panel" aria-label="Development performance diagnostics">
        <div className="performance-panel-header">
          <div><strong>InkPad stroke diagnostics</strong><span>Development only · averages from up to 40 completed strokes per group</span></div>
          <div className="performance-panel-actions">
            <button type="button" onClick={() => { performanceDiagnosticsRef.current?.reset(); setPerformanceRows(performanceDiagnosticsRef.current?.snapshot() ?? []) }}>Reset</button>
            <button type="button" aria-label="Close performance diagnostics" onClick={() => setPerformanceDiagnosticsOpen(false)}>×</button>
          </div>
        </div>
        <div className="performance-table-scroll"><table>
          <thead><tr><th>Mode / length</th><th>N</th><th>Mean ms</th><th>Points</th><th>Moves/s</th><th>Event Δt</th><th>Samples/move</th><th>RAF wait</th><th>RAF merged</th><th>Render all</th><th>Live stroke</th><th>Minimap</th><th>Page view</th><th>Event→render</th></tr></thead>
          <tbody>{performanceRows.map((row) => <tr key={`${row.mode}-${row.length}`}>
            <th>{row.mode === 'raw' ? 'Raw' : 'Smooth'} · {row.length}</th><td>{row.strokes}</td><td>{row.avgDurationMs.toFixed(0)}</td><td>{row.avgPoints.toFixed(0)}</td>
            <td>{row.avgPointerHz ? row.avgPointerHz.toFixed(1) : '—'}</td><td>{row.avgPointerIntervalMs ? row.avgPointerIntervalMs.toFixed(2) : '—'}</td><td>{row.avgSamplesPerMove ? row.avgSamplesPerMove.toFixed(2) : '—'}</td>
            <td>{row.avgFrameWaitMs ? row.avgFrameWaitMs.toFixed(2) : '—'}</td><td>{row.avgCoalescedFrameRequests.toFixed(2)}</td><td>{row.avgRenderAllMs ? row.avgRenderAllMs.toFixed(2) : '—'}</td>
            <td>{row.avgActiveStrokeRenderMs ? row.avgActiveStrokeRenderMs.toFixed(2) : '—'}</td><td>{row.avgMinimapMs ? row.avgMinimapMs.toFixed(2) : '—'}</td>
            <td>{row.avgPageOverviewMs ? row.avgPageOverviewMs.toFixed(2) : '—'}</td><td>{row.avgEventToRenderMs ? row.avgEventToRenderMs.toFixed(2) : '—'}</td>
          </tr>)}</tbody>
        </table></div>
        <p>Short ≤120 retained points; long &gt;120. Event→render is handler-entry to render completion (not digitizer-to-photon latency). Measurements are summarized on pen-up.</p>
      </section>}
      {eraserMenuOpen && eraserPopoverPosition && createPortal(
        <div
          className="eraser-popover"
          role="group"
          aria-label="Eraser options"
          style={{ left: eraserPopoverPosition.left, top: eraserPopoverPosition.top, width: eraserPopoverPosition.width }}
        >
          <div className="eraser-mode-options" role="group" aria-label="Eraser mode">
            <button className={`eraser-mode-card${!objectEraser ? ' selected' : ''}`} type="button" aria-pressed={!objectEraser} onClick={() => { setObjectEraser(false); setEraser(true) }}>
              <svg viewBox="0 0 36 24" aria-hidden="true"><path d="M3 17c5-10 9 7 15-2s9-6 15-8" /></svg><span>Stroke Eraser</span>
            </button>
            <button className={`eraser-mode-card${objectEraser ? ' selected' : ''}`} type="button" aria-pressed={objectEraser} onClick={() => { setObjectEraser(true); setEraser(true) }}>
              <svg viewBox="0 0 36 24" aria-hidden="true"><rect x="7" y="3" width="22" height="18" strokeDasharray="3 2" /></svg><span>Whole Eraser</span>
            </button>
          </div>
          <div className="eraser-size-heading"><label className="popover-label" htmlFor="eraser-size-range">Size</label><output htmlFor="eraser-size-range">{eraserSize} px</output></div>
          <input id="eraser-size-range" className="eraser-size-range" aria-label="Eraser size" type="range" min="8" max="96" step="1" value={eraserSize} onChange={(event) => { setEraserSize(Number(event.target.value)); setObjectEraser(false); setEraser(true) }} />
          <div className="eraser-sizes" aria-label="Eraser size presets">{ERASER_SIZES.map((size) => <button className={`eraser-size${eraserSize === size && !objectEraser ? ' selected' : ''}`} type="button" key={size} aria-label={`${size} pixel eraser preset`} aria-pressed={eraserSize === size && !objectEraser} onClick={() => { setEraserSize(size); setObjectEraser(false); setEraser(true) }}><span style={{ width: Math.max(7, Math.min(20, size / 3)), height: Math.max(7, Math.min(20, size / 3)) }} /></button>)}</div>
        </div>,
        document.body,
      )}
    </main>
  )
}

export default App
