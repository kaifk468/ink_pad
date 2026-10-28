import { useCallback, useEffect, useRef, useState } from 'react'
import { CanvasSnapshotHistory, canvasItemKey, canvasItemsForRendering, cloneCanvasItems, createConnector, detachConnectorsFromRectangles, getConnectorRenderSpec, getConnectorSymbolGeometry, reverseConnectorDirection, snapConnectorEndpoint, translateSelectedItems, updateConnectorRelationship } from './canvasModel'
import type { CanvasItem, ConnectorObject, ConnectorRelationshipType, Point, RectangleObject, Stroke } from './canvasModel'
import { itemHitTest, selectItemsByLasso } from './lassoSelection'

const COLORS = [
  { name: 'Ink black', value: '#202124' },
  { name: 'Cobalt blue', value: '#3568d4' },
  { name: 'Coral red', value: '#e45b55' },
  { name: 'Leaf green', value: '#38845b' },
  { name: 'Violet', value: '#8856c7' },
]
const WIDTHS = [2, 4, 7, 11]
const ERASER_SIZES = [14, 28, 48, 72]
const SHAPE_HOLD_MS = 450
const SHAPE_HOLD_JITTER_PX = 7

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<CanvasItem[]>([])
  const historyRef = useRef(new CanvasSnapshotHistory())
  const activeStrokeRef = useRef<Stroke | null>(null)
  const activeConnectorRef = useRef<{
    pointerId: number
    start: Point
    end: Point
    startAttachment?: ConnectorObject['startAttachment']
    endAttachment?: ConnectorObject['endAttachment']
  } | null>(null)
  const shapePreviewRef = useRef<CanvasItem | null>(null)
  const selectedRectangleIdRef = useRef<number | null>(null)
  const activeDragRef = useRef<{ pointerId: number; itemKey: string; start: Point; originalItems: CanvasItem[]; moved: boolean } | null>(null)
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
  const [color, setColor] = useState(COLORS[0].value)
  const [width, setWidth] = useState(4)
  const [eraser, setEraser] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [shapeMode, setShapeMode] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [lassoMode, setLassoMode] = useState(false)
  const [connectorMode, setConnectorMode] = useState(false)
  const [selectedItemCount, setSelectedItemCount] = useState(0)
  const [selectedConnectorId, setSelectedConnectorId] = useState<number | null>(null)
  const [selectedConnectorType, setSelectedConnectorType] = useState<ConnectorRelationshipType | null>(null)
  const [selectedConnectorReversed, setSelectedConnectorReversed] = useState(false)
  const [eraserSize, setEraserSize] = useState(28)
  const [objectEraser, setObjectEraser] = useState(false)
  const [eraserMenuOpen, setEraserMenuOpen] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

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
    if (holdTimerRef.current !== null && point && anchor && Math.hypot(point.x - anchor.x, point.y - anchor.y) < SHAPE_HOLD_JITTER_PX) return
    clearShapeHoldTimer()
    if (point) holdAnchorRef.current = point
    holdTimerRef.current = window.setTimeout(() => {
      const stroke = activeStrokeRef.current
      if (!stroke) return
      const recognizedShapes = shapeMode ? recognizeShape(stroke) : stroke
      const recognized = recognizedShapes.kind === 'rectangle' || (recognizedShapes.kind === 'stroke' && recognizedShapes.shape) ? recognizedShapes : recognizeLine(stroke)
      if (recognized.kind === 'rectangle' || (recognized.kind === 'stroke' && recognized.shape)) {
        shapePreviewRef.current = recognized
        renderAll()
      }
      holdTimerRef.current = null
    }, SHAPE_HOLD_MS)
  }

  const hitTestObject = (point: Point) => {
    for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
      const item = strokesRef.current[index]
      if (item.kind === 'rectangle') {
        const pad = Math.max(8, item.strokeWidth * 2)
        if (point.x >= item.x - pad && point.x <= item.x + item.width + pad && point.y >= item.y - pad && point.y <= item.y + item.height + pad) return index
        continue
      }
      if (item.kind === 'connector') {
        if (itemHitTest(item, point, Math.max(18, item.strokeWidth * 3))) return index
        continue
      }
      const stroke = item
      // Eraser marks are operations on earlier ink, not independently selectable objects.
      if (stroke.erase || !stroke.points.length) continue
      // Freehand paths and arrows are removed as one action when any segment is touched.
      const hitRadius = Math.max(18, stroke.width * 3)
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

  const hitTestRectangle = (point: Point) => {
    for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
      const item = strokesRef.current[index]
      if (item.kind !== 'rectangle') continue
      const pad = Math.max(8, item.strokeWidth * 2)
      if (point.x >= item.x - pad && point.x <= item.x + item.width + pad && point.y >= item.y - pad && point.y <= item.y + item.height + pad) return item
    }
    return null
  }

  const hitTestConnector = (point: Point) => {
    for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
      const item = strokesRef.current[index]
      if (item.kind === 'connector' && itemHitTest(item, point)) return item
    }
    return null
  }

  const recognizeShape = (stroke: Stroke): CanvasItem => {
    const points = stroke.points
    if (points.length < 6 || stroke.erase) return stroke
    const first = points[0]
    const last = points[points.length - 1]
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const left = Math.min(...xs)
    const right = Math.max(...xs)
    const top = Math.min(...ys)
    const bottom = Math.max(...ys)
    const boxWidth = right - left
    const boxHeight = bottom - top
    const diagonal = Math.hypot(boxWidth, boxHeight)

    // A roughly closed loop with four broad sides becomes a clean class box.
    if (diagonal > 36 && Math.hypot(first.x - last.x, first.y - last.y) < diagonal * 0.32) {
      let pathLength = 0
      for (let i = 1; i < points.length; i += 1) pathLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
      const perimeter = 2 * (boxWidth + boxHeight)
      if (boxWidth > 38 && boxHeight > 30 && pathLength / perimeter > 0.68 && pathLength / perimeter < 1.65) {
        return {
          kind: 'rectangle',
          id: nextRectangleIdRef.current++,
          x: left,
          y: top,
          width: boxWidth,
          height: boxHeight,
          strokeColor: stroke.color,
          strokeWidth: stroke.width,
        }
      }
    }

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
    const { points } = stroke
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
    } else {
      for (let i = 1; i < points.length; i += 1) {
        const previous = points[i - 1]
        const current = points[i]
        const pressure = (previous.pressure + current.pressure) / 2
        const pressureScale = pressure > 0 ? 0.35 + pressure * 0.9 : 1
        ctx.lineWidth = stroke.width * pressureScale
        ctx.beginPath()
        ctx.moveTo(previous.x, previous.y)
        ctx.lineTo(current.x, current.y)
        ctx.stroke()
      }
    }
    ctx.restore()
  }, [])

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

  const setSelectedRectangle = (id: number | null) => {
    selectedRectangleIdRef.current = id
  }

  const renderAll = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
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
    canvasItemsForRendering(strokesRef.current).forEach((item) => drawItem(ctx, item))
    if (activeStrokeRef.current) {
      const preview = shapePreviewRef.current
      drawItem(ctx, preview ?? activeStrokeRef.current)
    }
    const activeConnector = activeConnectorRef.current
    if (activeConnector) {
      drawConnector(ctx, createConnector(0, activeConnector.start, activeConnector.end, color, width), '#5574ed', width + 5)
      drawConnector(ctx, createConnector(0, activeConnector.start, activeConnector.end, color, width))
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
  }, [color, drawConnector, drawItem, drawStroke, width])

  const scheduleRender = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
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

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pressure,
    }
  }

  const finishStroke = useCallback((pointerId: number) => {
    if (activePointerRef.current !== pointerId) return
    clearShapeHoldTimer()
    if (activeStrokeRef.current) {
      saveHistory()
      let stroke = shapePreviewRef.current
      if (!stroke) {
        const heldStroke = activeStrokeRef.current
        const heldLongEnough = performance.now() - lastSignificantMoveAtRef.current >= SHAPE_HOLD_MS
        const recognizedShape = shapeMode ? recognizeShape(heldStroke) : heldStroke
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
    activeDragRef.current = null
    holdAnchorRef.current = null
    lastSignificantMoveAtRef.current = 0
    scheduleRender()
  }, [scheduleRender, shapeMode])

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType !== 'pen' || activePointerRef.current !== null || activeConnectorRef.current !== null || activeDragRef.current !== null || activeLassoRef.current !== null || lassoDragRef.current !== null) return
    event.preventDefault()
    const point = getPoint(event)
    if (connectorMode) {
      event.currentTarget.setPointerCapture(event.pointerId)
      const snappedStart = snapConnectorEndpoint(point, strokesRef.current)
      activeConnectorRef.current = {
        pointerId: event.pointerId,
        start: snappedStart?.point ?? point,
        end: point,
        startAttachment: snappedStart?.attachment,
      }
      renderAll()
      return
    }
    if (lassoMode) {
      const selectedItems = strokesRef.current.filter((item) => selectedKeysRef.current.has(canvasItemKey(item)))
      const hitSelected = [...selectedItems].reverse().some((item) => itemHitTest(item, point))
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
      const objectIndex = hitTestObject(point)
      if (objectIndex !== -1) {
        saveHistory()
        const [removedItem] = strokesRef.current.splice(objectIndex, 1)
        if (removedItem?.kind === 'rectangle') {
          strokesRef.current = detachConnectorsFromRectangles(strokesRef.current, new Set([removedItem.id]))
        }
        setHasInk(strokesRef.current.length > 0)
        reconcileSelectedItems()
        renderAll()
      }
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointerRef.current = event.pointerId
    lastSignificantMoveAtRef.current = performance.now()
    activeStrokeRef.current = {
      kind: 'stroke',
      id: nextStrokeIdRef.current++,
      points: [point],
      color,
      width: eraser ? eraserSize : width,
      erase: eraser,
    }
    shapePreviewRef.current = null
    holdAnchorRef.current = point
    scheduleShapePreview(point)
    scheduleRender()
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const activeConnector = activeConnectorRef.current
    if (activeConnector?.pointerId === event.pointerId) {
      event.preventDefault()
      const point = getPoint(event)
      const snappedEnd = snapConnectorEndpoint(point, strokesRef.current)
      activeConnector.end = snappedEnd?.point ?? point
      activeConnector.endAttachment = snappedEnd?.attachment
      scheduleRender()
      return
    }
    const lassoDrag = lassoDragRef.current
    if (lassoDrag?.pointerId === event.pointerId) {
      event.preventDefault()
      const point = getPoint(event)
      const deltaX = point.x - lassoDrag.start.x
      const deltaY = point.y - lassoDrag.start.y
      if (!lassoDrag.moved && Math.hypot(deltaX, deltaY) < 2) return
      if (!lassoDrag.moved) {
        saveHistory()
        lassoDrag.moved = true
      }
      strokesRef.current = translateSelectedItems(lassoDrag.originalItems, lassoDrag.keys, deltaX, deltaY)
      renderAll()
      return
    }
    const activeLasso = activeLassoRef.current
    if (activeLasso?.pointerId === event.pointerId) {
      event.preventDefault()
      const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
      for (const sample of samples) {
        const rect = event.currentTarget.getBoundingClientRect()
        const point = { x: sample.clientX - rect.left, y: sample.clientY - rect.top, pressure: sample.pressure }
        const previous = activeLasso.points[activeLasso.points.length - 1]
        if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 1.5) activeLasso.points.push(point)
      }
      scheduleRender()
      return
    }
    const drag = activeDragRef.current
    if (drag?.pointerId === event.pointerId) {
      event.preventDefault()
      const point = getPoint(event)
      const deltaX = point.x - drag.start.x
      const deltaY = point.y - drag.start.y
      if (!drag.moved && Math.hypot(deltaX, deltaY) < 2) return
      if (!drag.moved) {
        saveHistory()
        drag.moved = true
      }
      strokesRef.current = translateSelectedItems(drag.originalItems, new Set([drag.itemKey]), deltaX, deltaY)
      renderAll()
      return
    }
    if (activePointerRef.current !== event.pointerId || !activeStrokeRef.current) return
    event.preventDefault()
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    for (const sample of samples) {
      const rect = event.currentTarget.getBoundingClientRect()
      activeStrokeRef.current.points.push({
        x: sample.clientX - rect.left,
        y: sample.clientY - rect.top,
        pressure: sample.pressure,
      })
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
    const activeConnector = activeConnectorRef.current
    if (activeConnector?.pointerId === event.pointerId) {
      const point = getPoint(event)
      const snappedEnd = snapConnectorEndpoint(point, strokesRef.current)
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
        ))
        setHasInk(true)
      }
      activeConnectorRef.current = null
      renderAll()
      return
    }
    const activeLasso = activeLassoRef.current
    if (activeLasso?.pointerId === event.pointerId) {
      const finalPoint = getPoint(event)
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
      const points = activeStrokeRef.current.points
      const previousPoint = points[points.length - 1]
      const movement = Math.hypot(finalPoint.x - previousPoint.x, finalPoint.y - previousPoint.y)
      if (movement > 0.5) points.push(finalPoint)
      if (holdAnchorRef.current && Math.hypot(finalPoint.x - holdAnchorRef.current.x, finalPoint.y - holdAnchorRef.current.y) >= SHAPE_HOLD_JITTER_PX) {
        lastSignificantMoveAtRef.current = performance.now()
      }
    }
    finishStroke(event.pointerId)
  }

  const onPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeConnectorRef.current?.pointerId === event.pointerId) {
      activeConnectorRef.current = null
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
    shapePreviewRef.current = null
    activeLassoRef.current = null
    lassoDragRef.current = null
    updateSelectedItems([])
    activePointerRef.current = null
    holdAnchorRef.current = null
    setSelectedRectangle(null)
    clearShapeHoldTimer()
    setHasInk(false)
    renderAll()
  }

  return (
    <main className="app-shell">
      <section className="canvas-stage" aria-label="Drawing canvas">
        <canvas
          ref={canvasRef}
          className={`drawing-canvas${selectionMode ? ' selecting' : ''}${connectorMode ? ' connecting' : ''}`}
          aria-label="White drawing canvas. Use an S Pen to draw."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
        />
        {!hasInk && <div className="canvas-hint" aria-hidden="true">Draw here with your S Pen</div>}
      </section>
      <header className="toolbar" aria-label="Drawing tools">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">Ink Pad</span>
          <span className="brand-divider" />
          <span className="tool-label">Pen</span>
        </div>
        <button className={`tool-button shape-button${shapeMode ? ' selected' : ''}`} type="button" aria-pressed={shapeMode} title="Straight lines snap on hold automatically. Toggle for rectangles and arrows." onClick={() => { setShapeMode((value) => !value); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); clearLassoSelection(); setEraser(false) }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="10" height="10" rx="1"/><path d="M10 19h9m0 0-4-4m4 4-4 4"/></svg><span>Shapes</span>
        </button>
        <button className={`tool-button selection-button${selectionMode ? ' selected' : ''}`} type="button" aria-pressed={selectionMode} title="Select and move rectangles" onClick={() => { const next = !selectionMode; setSelectionMode(next); setLassoMode(false); setConnectorMode(false); setShapeMode(false); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v16l4.3-4.1 3.2 6.1 2.5-1.3-3.1-6.1H18L5 3Z"/><rect x="15.5" y="3.5" width="5" height="5" rx="1"/></svg><span>Select</span>
        </button>
        <button className={`tool-button lasso-button${lassoMode ? ' selected' : ''}`} type="button" aria-pressed={lassoMode} title="Draw a loop to select and move multiple items" onClick={() => { const next = !lassoMode; setLassoMode(next); setSelectionMode(false); setConnectorMode(false); setShapeMode(false); setEraser(false); setEraserMenuOpen(false); setSelectedRectangle(null); clearLassoSelection() }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12c0-4.1 3.1-7 7.3-7 3.8 0 6.7 2.2 6.7 5.7 0 3.8-3.2 7.3-7.1 7.3-3.8 0-6.9-2.1-6.9-6Z"/><path d="M17.5 17.5 20 20"/></svg><span>Lasso</span>
        </button>
        <button className={`tool-button connector-button${connectorMode ? ' selected' : ''}`} type="button" aria-pressed={connectorMode} title="Draw a straight UML relationship connector with the S Pen" onClick={() => { const next = !connectorMode; setConnectorMode(next); setLassoMode(false); setSelectionMode(false); setShapeMode(false); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="6" height="6" rx="1"/><rect x="14.5" y="14" width="6" height="6" rx="1"/><path d="m9.5 8.5 5 6"/></svg><span>Connector</span>
        </button>
        <button className="clear-selection-button" type="button" disabled={selectedItemCount === 0} onClick={clearLassoSelection}>Clear selection</button>
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
            <option value="inheritance">Inheritance</option>
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
        <span className="toolbar-spacer" />
        <button className="history-button" type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-2"/></svg>
        </button>
        <button className="history-button" type="button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9h-9a6 6 0 0 0 0 12h2"/></svg>
        </button>
        <div className="eraser-control">
        <button className={`tool-button eraser-button${eraser ? ' selected' : ''}`} type="button" aria-pressed={eraser} aria-expanded={eraserMenuOpen} onClick={() => { setShapeMode(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); clearLassoSelection(); setEraser((value) => !value); setEraserMenuOpen((value) => !value) }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.2 4.8 9.9 0a1.5 1.5 0 0 1 1.1 2.6l-9.8 9.8a1.5 1.5 0 0 1-2.1 0l-4.1-4.1a1.5 1.5 0 0 1 0-2.1l7.2-7.2a1.5 1.5 0 0 1 1.1-.4Z"/><path d="m8.1 17.2 3.6 3.6h8"/></svg>
          <span>Eraser</span>
        </button>
        {eraserMenuOpen && <div className="eraser-popover" role="group" aria-label="Eraser options">
          <span className="popover-label">Size</span>
          <div className="eraser-sizes">{ERASER_SIZES.map((size) => <button className={`eraser-size${eraserSize === size && !objectEraser ? ' selected' : ''}`} type="button" key={size} aria-label={`${size} pixel eraser`} aria-pressed={eraserSize === size && !objectEraser} onClick={() => { setEraserSize(size); setObjectEraser(false); setEraser(true) }}><span style={{ width: Math.max(7, Math.min(20, size / 3)), height: Math.max(7, Math.min(20, size / 3)) }} /></button>)}</div>
          <button className={`object-eraser${objectEraser ? ' selected' : ''}`} type="button" aria-pressed={objectEraser} onClick={() => { setObjectEraser((value) => !value); setEraser(true) }}>Delete whole shape</button>
        </div>}
        </div>
        <button className="clear-button" type="button" onClick={clearCanvas} disabled={!hasInk}>Clear</button>
      </header>
    </main>
  )
}

export default App
