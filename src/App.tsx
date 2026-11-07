import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { compactAfterErase } from './app/eraserCompaction'
import { createEraserStroke, getEraserSweepPoints, isPenHoverEraseInput } from './eraserInput'
import { CONNECTOR_SNAP_TOLERANCE, CanvasSnapshotHistory, canvasItemKey, appendedItemsForRendering, canvasItemsForRendering, cloneCanvasItems, createConnector, detachConnectorsFromRectangles, getCanvasSelectionBounds, getRectangleResizeHandles, getResizedRectangleBounds, hitTestRectangleResizeHandle, resizeRectangleItems, resizeSelectedItems, reverseConnectorDirection, snapConnectorEndpoint, translateSelectedItems, updateConnectorRelationship } from './canvasModel'
import type { CanvasItem, ClassBoxContent, ConnectorObject, ConnectorRelationshipType, Point, RectangleBounds, RectangleObject, RectangleResizeHandle, Stroke, TextObject } from './canvasModel'
import { itemHitTest, selectItemsByLasso } from './lassoSelection'
import { loadStrokeDisplayMode, saveStrokeDisplayMode, type StrokeDisplayMode } from './strokeDisplayMode'
import { MAX_PREDICTION_DISTANCE_SCREEN_PX, getPointerSamples, getPredictedPoints } from './pointerSamples'
import { shouldAppendStrokeSample } from './strokeSampling'
import { getLargestMeasuredLatencyStage, PerformanceDiagnostics, type BrowserStallSummary, type StrokeDiagnosticRow } from './performanceDiagnostics'
import { BENCHMARK_MEASURED_FRAMES, BENCHMARK_SCENE_SIZES, BENCHMARK_SEED, BENCHMARK_WARMUP_FRAMES, CONTROLLED_BENCHMARK_VIEWPORT, createBenchmarkScene, getBenchmarkEnvironment, summarizeBenchmarkSamples, type BenchmarkMode } from './performanceBenchmark'
import { applySheetLayer, drawPageTemplateOverview, getSheetLayerState, loadPageTemplate, savePageTemplate, type PageTemplate, type SheetLayerState } from './pageTemplates'
import { loadPageBackground, PAGE_BACKGROUND_COLORS, savePageBackground, type PageBackground } from './pageBackground'
import { getNextIds } from './documentFormat'
import { FilePanel } from './FilePanel'
import { COLORS, ERASER_SIZES, PERFORMANCE_DIAGNOSTICS_ENABLED, SHAPE_HOLD_JITTER_PX, UML_CONNECTOR_TOOLS, WIDTHS } from './app/appConfig'
import { thinItems, thinStroke } from './strokeThinning'
import { createTestInk, isTestInk } from './testInk'
import { createFrameRecorder, formatDrawFlags, formatFrameSummary } from './app/frameRecorder'
import { createLiveStrokeState, drawLiveStrokeFrame, type LiveStrokeState } from './app/liveStroke'
import { chooseDrawMode, countVisiblePoints, DEFAULT_DIRECT_MAX_VISIBLE_POINTS, isItemVisible, viewRectOf, type DrawMode } from './app/visibleInk'
import { createFontMeasure, createTextMeasure, drawConnector, drawItem as drawItemToCanvas, drawMinimapItems as drawMinimapItemsToCanvas, drawStroke as drawStrokeToCanvas, getReusableCanvasLayer, layerCanvasOptions, rawDrawingOptions } from './app/canvasRenderer'
import { formatBrowserStall, formatFocusedP95, formatMetricSummary, getDiagnosticDeviceInfo, getSceneComplexity } from './app/performanceFormat'
import { UmlConnectorIcon } from './app/UmlConnectorIcon'
import { TextEditorOverlay, type TextEditorState } from './TextEditorOverlay'
import { ClassBoxDialog } from './ClassBoxDialog'
import { AccountButton } from './app/AccountButton'
import { ContextPanel } from './app/ContextPanel'
import { HistoryBar } from './app/HistoryBar'
import { ToolDock } from './app/ToolDock'
import { TopLeftBar } from './app/TopLeftBar'
import { ZoomControls } from './app/ZoomControls'
import { statusLabel } from './FilePanel'
import { StoragePanel } from './StoragePanel'
import { CLASS_BOX_DEFAULT_STROKE_WIDTH, EMPTY_CLASS_BOX, createClassBox, fitClassBoxBounds, isEmptyClassBox, normalizeClassBoxContent, sameClassBoxContent } from './classBoxLayout'
import { DEFAULT_TEXT_FONT_SIZE, createTextObject, isBlankText, normalizeText, updateTextObject } from './textLayout'
import { useDocuments } from './app/useDocuments'
import { SHAPE_RECOGNITION_HOLD_MS, recognizeRectangleOnHold, recognizeRectangleStroke } from './shapeRecognition'
import { DEFAULT_ZOOM, INITIAL_ZOOM, MAX_ZOOM, MIN_ZOOM, SHEET_BOUNDS, SHEET_HEIGHT, SHEET_WIDTH, THREE_FINGER_PAN_THRESHOLD, WORKSPACE_BOUNDS, centerViewportOnPoint, clampPointToBounds, clampTranslationToBounds, clampViewportToSheet, getCoverScale, getInitialViewport, clipSegmentToBounds, fitViewportToBounds, getMinimapGeometry, getTouchNavigationGestureMode, isPointWithinBounds, minimapToCanvasPoint, panThreeFingerViewport, type MinimapGeometry, type TouchNavigationGestureMode, type ViewBounds, type Viewport, screenToCanvasPoint, zoomTwoFingerViewport } from './viewport'


const DOUBLE_TAP_MS = 400
const MINIMAP_LIVE_REFRESH_MS = 300
const GESTURE_SETTLE_MS = 140
const ZOOM_STEP = 1.25

/** True when the saved page picture was drawn from exactly these items (same objects in the same order). */
function sameItems(snapshot: CanvasItem[], items: CanvasItem[], count: number): boolean {
  if (snapshot.length !== count || items.length < count) return false
  for (let index = 0; index < count; index += 1) if (snapshot[index] !== items[index]) return false
  return true
}

type DeviceRect = { x: number; y: number; width: number; height: number }

// Diagnostic switches for comparing drawing paths on a device without a second build (add them to the address).
const DRAW_SWITCHES = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
// ?cache=off: no saved page picture, the page is redrawn every frame (like the original build).
const PAGE_CACHE_ENABLED = DRAW_SWITCHES.get('cache') !== 'off'
// The live stroke is redrawn whole (clipped to its area) every frame. ?live=incremental draws only its newest part
// instead; on the tablet that felt worse than redrawing the whole stroke.
const LIVE_INCREMENTAL_ENABLED = DRAW_SWITCHES.get('live') === 'incremental'
// ?predict=on draws the browser's predicted pen positions ahead of the ink; it made no difference on the tablet, so it is off.
const PEN_PREDICTION_ENABLED = DRAW_SWITCHES.get('predict') === 'on'
// ?desync=on asks the browser for its low-latency canvas path (skips waiting for the compositor) for the page canvas.
// ?canvas=cpu asks for software-drawn canvases (willReadFrequently) to test whether the tablet's GPU canvas path is what delays frames.
const CANVAS_ON_CPU = DRAW_SWITCHES.get('canvas') === 'cpu'
const LAYER_CANVAS_OPTIONS: CanvasRenderingContext2DSettings | undefined = CANVAS_ON_CPU ? { willReadFrequently: true } : undefined
const MAIN_CANVAS_OPTIONS: CanvasRenderingContext2DSettings | undefined = DRAW_SWITCHES.get('desync') === 'on' || CANVAS_ON_CPU
  ? { ...(DRAW_SWITCHES.get('desync') === 'on' ? { desynchronized: true } : {}), ...LAYER_CANVAS_OPTIONS }
  : undefined
// ?layers=one draws straight onto the page canvas, without the extra full-screen layer that is copied over every frame.
const ONE_LAYER_ENABLED = DRAW_SWITCHES.get('layers') === 'one'
// ?group=off draws every Raw segment in its own call again (by default neighbouring segments of the same width share one).
const GROUP_SEGMENTS_ENABLED = DRAW_SWITCHES.get('group') !== 'off'
rawDrawingOptions.groupWidths = GROUP_SEGMENTS_ENABLED
// ?dirty=off repaints the whole page canvas every frame while writing instead of only the box around the stroke
// (tests whether partial updates of a big canvas are what makes frames late on the tablet).
const DIRTY_RECT_ENABLED = DRAW_SWITCHES.get('dirty') !== 'off'
// ?layerdom=on puts the off-screen layer canvases on the page, invisible (tests whether detached canvases are drawn slowly).
const LAYERS_ON_PAGE = DRAW_SWITCHES.get('layerdom') === 'on'
layerCanvasOptions.attachToPage = LAYERS_ON_PAGE
// ?dpr=N draws the page canvas with at most N pixels per CSS pixel (the tablet uses 2.125), to test whether canvas size is the cost.
const DPR_CAP = Number(DRAW_SWITCHES.get('dpr'))
const canvasPixelRatio = () => Math.max(1, Math.min(window.devicePixelRatio || 1, DPR_CAP > 0 ? DPR_CAP : Infinity))
// ?debug=on shows a small readout of the drawing path and the amount of ink (also on the deployed site, for tablet checks).
const STROKE_THINNING_ENABLED = DRAW_SWITCHES.get('thin') !== 'off'
const DRAW_READOUT_ENABLED = DRAW_SWITCHES.get('debug') === 'on'
// Direct redraw while at most N ink points are visible, the saved page picture above that. ?direct=N overrides (0 = always the picture).
const DIRECT_MAX_VISIBLE_POINTS = Number.isFinite(Number(DRAW_SWITCHES.get('direct'))) && DRAW_SWITCHES.get('direct') !== null ? Number(DRAW_SWITCHES.get('direct')) : DEFAULT_DIRECT_MAX_VISIBLE_POINTS
const DRAW_FLAGS_TEXT = formatDrawFlags({
  directMax: DIRECT_MAX_VISIBLE_POINTS,
  live: LIVE_INCREMENTAL_ENABLED ? 'incremental' : 'whole',
  predict: PEN_PREDICTION_ENABLED,
  thin: STROKE_THINNING_ENABLED,
  cache: PAGE_CACHE_ENABLED,
  desync: DRAW_SWITCHES.get('desync') === 'on',
  cpu: CANVAS_ON_CPU,
  dprCap: DPR_CAP > 0 ? DPR_CAP : null,
  oneLayer: ONE_LAYER_ENABLED,
  group: GROUP_SEGMENTS_ENABLED,
  dirty: DIRTY_RECT_ENABLED,
  layerDom: LAYERS_ON_PAGE,
})

/** The canvas area (device pixels) a growing stroke can touch: its bounding box plus line width and curve overshoot. */
function getDirtyRect(points: Point[], strokeWidth: number, viewport: Viewport, dpr: number, canvasWidth: number, canvasHeight: number): DeviceRect | null {
  if (!points.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let longestSegment = 0
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
    if (index > 0) longestSegment = Math.max(longestSegment, Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y))
  }
  const pad = ((strokeWidth * 0.7 + longestSegment * 0.5) * viewport.scale + 4) * dpr + 4
  const x0 = Math.max(0, Math.floor((minX * viewport.scale + viewport.offsetX) * dpr - pad))
  const y0 = Math.max(0, Math.floor((minY * viewport.scale + viewport.offsetY) * dpr - pad))
  const x1 = Math.min(canvasWidth, Math.ceil((maxX * viewport.scale + viewport.offsetX) * dpr + pad))
  const y1 = Math.min(canvasHeight, Math.ceil((maxY * viewport.scale + viewport.offsetY) * dpr + pad))
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inkLayerRef = useRef<HTMLCanvasElement | null>(null)
  const sheetLayerRef = useRef<HTMLDivElement | null>(null)
  const sheetLayerAppliedRef = useRef<Partial<SheetLayerState>>({})
  const minimapInkLayerRef = useRef<HTMLCanvasElement | null>(null)
  // While one pen stroke is being drawn, everything already on the page is painted once into this layer and
  // reused each frame, so a frame costs the same however much is written. Dropped as soon as the stroke ends.
  const historyLayerRef = useRef<HTMLCanvasElement | null>(null)
  const drawReadoutRef = useRef<HTMLDivElement>(null)
  // The stroke being written (Raw pen): the page as it was when the stroke started, and the stroke's final spans.
  const liveBaseRef = useRef<HTMLCanvasElement | null>(null)
  const liveLayerRef = useRef<HTMLCanvasElement | null>(null)
  const liveStateRef = useRef<LiveStrokeState | null>(null)
  // Where the browser predicts the pen will be in the next few milliseconds (drawn ahead of the ink, never saved).
  const predictedPointsRef = useRef<Point[]>([])
  const drawModeRef = useRef<DrawMode>(DIRECT_MAX_VISIBLE_POINTS <= 0 ? 'cached' : 'direct')
  const historyCacheRef = useRef<{ snapshot: CanvasItem[]; mode: StrokeDisplayMode; scale: number; offsetX: number; offsetY: number; dpr: number; width: number; height: number } | null>(null)
  const minimapRenderedAtRef = useRef(0)
  // True while a pinch or three-finger pan is moving: the page is shown as a moved copy of a saved picture, then redrawn sharply once it settles.
  const viewportGestureRef = useRef(false)
  const gestureSettleTimerRef = useRef<number | null>(null)
  const toolbarRef = useRef<HTMLElement>(null)
  const umlToolboxRef = useRef<HTMLDivElement>(null)
  const eraserControlRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
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
  const activeDragRef = useRef<{ pointerId: number; itemKey: string; start: Point; originalItems: CanvasItem[]; moved: boolean; editTextId?: number | null; editClassBoxId?: number | null } | null>(null)
  const textTapRef = useRef<{ pointerId: number; point: Point } | null>(null)
  const classTapRef = useRef<{ pointerId: number; point: Point } | null>(null)
  const activeResizeRef = useRef<{ pointerId: number; rectangleId: number | null; selectedKeys: Set<string> | null; handle: RectangleResizeHandle; start: Point; originalBounds: RectangleBounds; originalItems: CanvasItem[]; moved: boolean } | null>(null)
  const activeLassoRef = useRef<{ pointerId: number; points: Point[] } | null>(null)
  const lassoDragRef = useRef<{ pointerId: number; start: Point; keys: Set<string>; originalItems: CanvasItem[]; moved: boolean } | null>(null)
  const selectedKeysRef = useRef<Set<string>>(new Set())
  const nextRectangleIdRef = useRef(1)
  const nextStrokeIdRef = useRef(1)
  const nextConnectorIdRef = useRef(1)
  const nextTextIdRef = useRef(1)
  const textEditorRef = useRef<TextEditorState | null>(null)
  const textEditorValueRef = useRef('')
  const holdTimerRef = useRef<number | null>(null)
  const activePointerRef = useRef<number | null>(null)
  const holdAnchorRef = useRef<Point | null>(null)
  const lastSignificantMoveAtRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const frameRecorderRef = useRef(createFrameRecorder())
  const frameReadoutRef = useRef<HTMLDivElement>(null)
  const initialViewDoneRef = useRef(false)
  const viewportRef = useRef<Viewport>({ scale: INITIAL_ZOOM, offsetX: 0, offsetY: 0 })
  const touchPointsRef = useRef(new Map<number, Point>())
  const touchGestureRef = useRef<{ mode: TouchNavigationGestureMode; viewport: Viewport; center: Point; distance: number } | null>(null)
  const minimapDragPointerRef = useRef<{ pointerId: number; bounds: ViewBounds; geometry: MinimapGeometry } | null>(null)
  const umlToolboxDragRef = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number; moved: boolean } | null>(null)
  const suppressMinimizedToolboxClickRef = useRef(false)
  const [color, setColor] = useState(COLORS[0].value)
  const [width, setWidth] = useState(WIDTHS[0])
  const [strokeDisplayMode, setStrokeDisplayMode] = useState<StrokeDisplayMode>(() => loadStrokeDisplayMode())
  const [pageTemplate, setPageTemplate] = useState<PageTemplate>(() => loadPageTemplate())
  const [pageBackground, setPageBackground] = useState<PageBackground>(() => loadPageBackground())
  const pageTemplateRef = useRef(pageTemplate)
  const pageBackgroundRef = useRef(pageBackground)
  pageTemplateRef.current = pageTemplate
  pageBackgroundRef.current = pageBackground

  const {
    filePanelOpen, setFilePanelOpen, refreshLibrary, docTitle, saveStatus, fileNotice, setFileNotice, library, folders, currentDocId,
    storage, driveProfile, storagePanelOpen, setStoragePanelOpen, chooseDeviceFolder, reconnectDeviceFolder, connectDrive, useBrowserStorage, copyBrowserToDevice,
    newDiagramIn, createFolder, renameFolder, deleteFolder, moveDiagram,
    scheduleAutosave, newDiagram, openStoredDiagram, deleteStoredDiagram, renameDiagram,
    exportDocumentFile, importDocumentFile, exportSvgFile, exportPngFile,
  } = useDocuments({
    getItems: () => strokesRef.current,
    getPage: () => ({ template: pageTemplateRef.current, background: pageBackgroundRef.current }),
    isInputActive: () => activeStrokeRef.current !== null || activePointerRef.current !== null,
    loadDocument: (loaded) => {
      clearShapeHoldTimer()
      activeStrokeRef.current = null
      activeConnectorRef.current = null
      activeResizeRef.current = null
      shapePreviewRef.current = null
      activeLassoRef.current = null
      lassoDragRef.current = null
      activePointerRef.current = null
      hoverErasePointerRef.current = null
      activeObjectEraserRef.current = null
      holdAnchorRef.current = null
      updateSelectedItems([])
      setSelectedRectangle(null)
      strokesRef.current = cloneCanvasItems(loaded.items)
      const nextIds = getNextIds(strokesRef.current)
      nextStrokeIdRef.current = nextIds.stroke
      nextRectangleIdRef.current = nextIds.rectangle
      nextConnectorIdRef.current = nextIds.connector
      nextTextIdRef.current = nextIds.text
      textEditorRef.current = null
      textTapRef.current = null
      classTapRef.current = null
      setTextEditor(null)
      setClassBoxEditor(null)
      historyRef.current = new CanvasSnapshotHistory()
      setCanUndo(false)
      setCanRedo(false)
      setHasInk(strokesRef.current.length > 0)
      pageTemplateRef.current = loaded.page.template
      pageBackgroundRef.current = loaded.page.background
      setPageTemplate(loaded.page.template)
      setPageBackground(loaded.page.background)
      renderAll()
      openAtDefaultView()
    },
  })
  const [eraser, setEraser] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [shapeMode, setShapeMode] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [textMode, setTextMode] = useState(false)
  const [classMode, setClassMode] = useState(false)
  const [classBoxEditor, setClassBoxEditor] = useState<{ rectangleId: number | null; x: number; y: number; content: ClassBoxContent } | null>(null)
  const [textSize, setTextSize] = useState(DEFAULT_TEXT_FONT_SIZE)
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null)
  const [lassoMode, setLassoMode] = useState(false)
  const [connectorMode, setConnectorMode] = useState(false)
  const [umlConnectorType, setUmlConnectorType] = useState<ConnectorRelationshipType | null>(null)
  const [umlToolboxPosition, setUmlToolboxPosition] = useState<{ left: number; top: number } | null>(null)
  const [umlToolboxMinimized, setUmlToolboxMinimized] = useState(true)
  const [selectedItemCount, setSelectedItemCount] = useState(0)
  const [selectedConnectorId, setSelectedConnectorId] = useState<number | null>(null)
  const [selectedConnectorType, setSelectedConnectorType] = useState<ConnectorRelationshipType | null>(null)
  const [selectedConnectorReversed, setSelectedConnectorReversed] = useState(false)
  const [eraserSize, setEraserSize] = useState(28)
  const [objectEraser, setObjectEraser] = useState(false)
  const [optionsFor, setOptionsFor] = useState<'pen' | 'eraser' | 'text' | null>(null)
  const lastToolTapRef = useRef<{ tool: string; time: number } | null>(null)
  const eraserMenuOpen = optionsFor === 'eraser'
  const setEraserMenuOpen = (open: boolean) => setOptionsFor(open ? 'eraser' : null)
  const [eraserPopoverPosition, setEraserPopoverPosition] = useState<{ left: number; top: number; width: number } | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [zoomPercent, setZoomPercent] = useState(Math.round(INITIAL_ZOOM * 100))
  const [performanceDiagnosticsOpen, setPerformanceDiagnosticsOpen] = useState(false)
  const [performanceCaptureActive, setPerformanceCaptureActive] = useState(false)
  const [performanceRows, setPerformanceRows] = useState<StrokeDiagnosticRow[]>([])
  const [browserStallSummary, setBrowserStallSummary] = useState<BrowserStallSummary | null>(null)
  const [benchmarkRunning, setBenchmarkRunning] = useState(false)
  const [benchmarkResult, setBenchmarkResult] = useState<Record<string, unknown> | null>(null)
  const [navigatorMinimized, setNavigatorMinimized] = useState(true)
  const penModeActive = !eraser && !shapeMode && !selectionMode && !lassoMode && !connectorMode && !textMode && !classMode && umlConnectorType === null

  const getCurrentMinimapBounds = useCallback((): ViewBounds => {
    return { ...SHEET_BOUNDS }
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
    scheduleAutosave()
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
    if (connectorMode || eraser || shapeMode || selectionMode || lassoMode || textMode || classMode) setUmlConnectorType(null)
  }, [connectorMode, eraser, shapeMode, selectionMode, lassoMode, textMode, classMode])

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
    setTextMode(false); setClassMode(false)
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
    scheduleAutosave()
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
    scheduleAutosave()
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
      if (item.kind === 'text') {
        if (itemHitTest(item, point, 8 / viewportRef.current.scale)) return index
        continue
      }
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

  const hitTestText = (point: Point): TextObject | null => {
    const pad = 8 / viewportRef.current.scale
    for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
      const item = strokesRef.current[index]
      if (item.kind === 'text' && itemHitTest(item, point, pad)) return item
    }
    return null
  }

  const openTextEditor = (editor: TextEditorState) => {
    if (textEditorRef.current) commitTextEditor()
    textEditorRef.current = editor
    textEditorValueRef.current = editor.initialText
    setTextEditor(editor)
    updateSelectedItems([])
    setSelectedRectangle(null)
    renderAll()
  }

  const commitTextEditor = () => {
    const editor = textEditorRef.current
    if (!editor) return
    textEditorRef.current = null
    setTextEditor(null)
    const value = normalizeText(textEditorValueRef.current)
    if (editor.itemId === null) {
      if (!isBlankText(value)) {
        saveHistory()
        strokesRef.current.push(createTextObject(nextTextIdRef.current++, editor.x, editor.y, value, editor.color, editor.fontSize, createTextMeasure(editor.fontSize)))
        setHasInk(true)
      }
    } else {
      const index = strokesRef.current.findIndex((item) => item.kind === 'text' && item.id === editor.itemId)
      const existing = index === -1 ? null : strokesRef.current[index]
      if (existing && existing.kind === 'text') {
        if (isBlankText(value)) {
          saveHistory()
          strokesRef.current = strokesRef.current.filter((_, itemIndex) => itemIndex !== index)
          setHasInk(strokesRef.current.length > 0)
          reconcileSelectedItems()
        } else if (value !== existing.text) {
          saveHistory()
          const updated = updateTextObject(existing, value, existing.fontSize, createTextMeasure(existing.fontSize))
          strokesRef.current = strokesRef.current.map((item, itemIndex) => (itemIndex === index ? updated : item))
        }
      }
    }
    renderAll()
  }

  const cancelTextEditor = () => {
    if (!textEditorRef.current) return
    textEditorRef.current = null
    setTextEditor(null)
    renderAll()
  }

  const editTextItem = (item: TextObject) => openTextEditor({ itemId: item.id, x: item.x, y: item.y, fontSize: item.fontSize, color: item.color, initialText: item.text })

  const openClassBoxEditor = (editor: { rectangleId: number | null; x: number; y: number; content: ClassBoxContent }) => {
    if (textEditorRef.current) commitTextEditor()
    setClassBoxEditor(editor)
  }

  const commitClassBox = (content: ClassBoxContent) => {
    const editor = classBoxEditor
    setClassBoxEditor(null)
    if (!editor) return
    const clean = normalizeClassBoxContent(content)
    const measure = createFontMeasure()
    if (editor.rectangleId === null) {
      if (isEmptyClassBox(clean)) return
      saveHistory()
      strokesRef.current.push(createClassBox(nextRectangleIdRef.current++, editor.x, editor.y, clean, color, CLASS_BOX_DEFAULT_STROKE_WIDTH, measure))
      setHasInk(true)
      renderAll()
      return
    }
    const existing = strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === editor.rectangleId)
    if (!existing) return
    if (!existing.classBox && isEmptyClassBox(clean)) return
    if (sameClassBoxContent(existing.classBox, clean)) return
    saveHistory()
    const withContent = strokesRef.current.map((item) => (item.kind === 'rectangle' && item.id === existing.id ? { ...item, classBox: clean } : item))
    const bounds = fitClassBoxBounds(existing, clean, measure)
    const grown = bounds.width !== existing.width || bounds.height !== existing.height
    strokesRef.current = grown ? resizeRectangleItems(withContent, existing.id, bounds) : withContent
    renderAll()
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

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => drawStrokeToCanvas(ctx, stroke, strokeDisplayMode), [strokeDisplayMode])

  const drawItem = useCallback((ctx: CanvasRenderingContext2D, item: CanvasItem) => {
    drawItemToCanvas(ctx, item, strokeDisplayMode)
  }, [strokeDisplayMode])

  const drawMinimapItems = useCallback((ctx: CanvasRenderingContext2D, geometry: MinimapGeometry) => {
    drawMinimapItemsToCanvas(ctx, canvasItemsForRendering(strokesRef.current), geometry)
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

  const setSelectedRectangle = (id: number | null) => {
    selectedRectangleIdRef.current = id
  }

  const renderAll = useCallback((benchmarkBackground?: { template: PageTemplate; dpr?: number; viewport?: Viewport; onBackgroundRendered: (durationMs: number) => void }) => {
    const diagnostics = performanceDiagnosticsRef.current
    const measureFrame = diagnostics?.isStrokeActive() ?? false
    const renderStartedAt = measureFrame ? performance.now() : 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', MAIN_CANVAS_OPTIONS) as CanvasRenderingContext2D | null | undefined
    if (!canvas || !ctx) return
    const mainCanvasStartedAt = measureFrame ? performance.now() : 0
    const inkLayer = getReusableCanvasLayer(inkLayerRef, canvas.width, canvas.height)
    const inkContext = inkLayer.getContext('2d', LAYER_CANVAS_OPTIONS)
    if (!inkContext) return
    const dpr = benchmarkBackground?.dpr ?? canvasPixelRatio()
    const viewport = benchmarkBackground?.viewport ?? viewportRef.current
    const editingTextId = textEditorRef.current?.itemId ?? null
    const items = strokesRef.current
    const liveStroke = activeStrokeRef.current
    const penStrokeFrame = !benchmarkBackground && editingTextId === null && liveStroke !== null && liveStroke.kind === 'stroke' && !liveStroke.erase
    const gestureFrame = !benchmarkBackground && editingTextId === null && viewportGestureRef.current
    // The picture of everything already on the page is kept between frames and between strokes. A finished pen stroke is
    // added to it directly, so neither starting nor ending a stroke redraws the whole page.
    const viewCssWidth = canvas.width / dpr
    const viewCssHeight = canvas.height / dpr
    const view = viewRectOf(viewport, viewCssWidth, viewCssHeight)
    // Which drawing path to use depends on how much ink is in view, and only changes between strokes.
    if (!benchmarkBackground && liveStroke === null) {
      const visiblePoints = countVisiblePoints(items, view)
      const nextMode = chooseDrawMode(drawModeRef.current, visiblePoints, DIRECT_MAX_VISIBLE_POINTS)
      if (import.meta.env.DEV || DRAW_READOUT_ENABLED) {
        canvas.dataset.visiblePoints = String(visiblePoints)
        const readout = drawReadoutRef.current
        if (readout) {
          let erasers = 0
          let eraserPoints = 0
          for (const item of items) if (item.kind === 'stroke' && item.erase) { erasers += 1; eraserPoints += item.points.length }
          readout.textContent = `draw: ${nextMode} · visible ink points ${visiblePoints} · eraser points on page ${eraserPoints} · items ${items.length} · erasers ${erasers}`
        }
      }
      if (canvas.dataset.drawMode !== nextMode) canvas.dataset.drawMode = nextMode
      if (nextMode !== drawModeRef.current) {
        drawModeRef.current = nextMode
      }
    }
    const drawMode = drawModeRef.current
    const cacheAllowed = !benchmarkBackground && editingTextId === null && PAGE_CACHE_ENABLED && drawMode === 'cached'
    const cache = historyCacheRef.current
    const historyLayerNow = historyLayerRef.current
    const cacheBase = cacheAllowed && cache !== null && historyLayerNow !== null
      && cache.dpr === dpr && cache.width === canvas.width && cache.height === canvas.height && cache.mode === strokeDisplayMode
    const viewportSame = cacheBase && cache!.scale === viewport.scale && cache!.offsetX === viewport.offsetX && cache!.offsetY === viewport.offsetY
    let itemsMatch = cacheBase && sameItems(cache!.snapshot, items, items.length)
    // One item added on top since the picture was made (a stroke, or a recognized rectangle or line, a connector, a text
    // label): draw just that item onto the picture, in the same order a full redraw would use.
    if (cacheBase && !itemsMatch && viewportSame && items.length === cache!.snapshot.length + 1 && sameItems(cache!.snapshot, items, cache!.snapshot.length)) {
      const historyContext = historyLayerNow!.getContext('2d', LAYER_CANVAS_OPTIONS)
      if (historyContext) {
        historyContext.save()
        historyContext.setTransform(dpr * viewport.scale, 0, 0, dpr * viewport.scale, dpr * viewport.offsetX, dpr * viewport.offsetY)
        historyContext.beginPath()
        historyContext.rect(WORKSPACE_BOUNDS.x, WORKSPACE_BOUNDS.y, WORKSPACE_BOUNDS.width, WORKSPACE_BOUNDS.height)
        historyContext.clip()
        for (const added of appendedItemsForRendering(items)) drawItem(historyContext, added)
        historyContext.restore()
        cache!.snapshot = items.slice()
        itemsMatch = true
      }
    }
    const cacheUsable = itemsMatch
    const sameViewport = cacheUsable && viewportSame
    // With a pen stroke over a saved picture of the page, only the area around the stroke changes, so only that area is repainted.
    // Mid-gesture the saved picture is drawn straight onto the canvas, skipping the ink layer.
    const directGesture = cacheUsable && gestureFrame && !sameViewport
    const dirtyRect = DIRTY_RECT_ENABLED && penStrokeFrame && sameViewport && !gestureFrame && liveStroke && !liveStroke.shape && shapePreviewRef.current === null
      ? getDirtyRect(liveStroke.points, liveStroke.width, viewport, dpr, canvas.width, canvas.height)
      : null
    // A Raw pen stroke over the saved page picture is drawn piece by piece: each frame repaints only the small area
    // around the newest part of the stroke (see app/liveStroke.ts). The first frame of the stroke paints the page once
    // without the stroke and keeps a copy of it. Erasers, shapes, Smooth mode and gestures use the paths below.
    const incrementalLive = LIVE_INCREMENTAL_ENABLED && dirtyRect !== null && liveStroke !== null && liveStroke.kind === 'stroke'
      && !liveStroke.erase && strokeDisplayMode === 'raw'
    const liveState = liveStateRef.current
    const liveTransform = { scale: viewport.scale, offsetX: viewport.offsetX, offsetY: viewport.offsetY, dpr }
    const drawLiveFrame = () => {
      const base = liveBaseRef.current
      const live = liveLayerRef.current
      if (!base || !live || !liveStateRef.current || !liveStroke || liveStroke.kind !== 'stroke') return
      const activeStrokeRenderStartedAt = measureFrame ? performance.now() : 0
      drawLiveStrokeFrame({ page: ctx, base, live, stroke: liveStroke, predicted: PEN_PREDICTION_ENABLED ? predictedPointsRef.current : [], state: liveStateRef.current, transform: liveTransform, clip: WORKSPACE_BOUNDS })
      if (measureFrame) diagnostics?.recordActiveStrokeRender(performance.now() - activeStrokeRenderStartedAt)
    }
    if (incrementalLive && liveState && liveState.strokeId === liveStroke!.id
      && liveBaseRef.current?.width === canvas.width && liveBaseRef.current.height === canvas.height) {
      drawLiveFrame()
      const minimapNow = performance.now()
      if (minimapNow - minimapRenderedAtRef.current > MINIMAP_LIVE_REFRESH_MS) {
        minimapRenderedAtRef.current = minimapNow
        renderNavigator()
      }
      if (measureFrame) diagnostics?.recordRenderComplete(performance.now() - renderStartedAt, performance.now())
      return
    }
    liveStateRef.current = null
    const startLive = incrementalLive
    const dirty = startLive ? null : dirtyRect
    // ?layers=one: draw the ink straight onto the page canvas instead of a second full-screen layer that is copied over.
    // Not while something is selected (its highlight sits under the ink) or during a pinch/pan frame.
    const oneLayer = ONE_LAYER_ENABLED && !benchmarkBackground && !startLive && !directGesture
      && selectedKeysRef.current.size === 0 && selectedRectangleIdRef.current === null
      && (!cacheAllowed || (sameViewport && cache !== null && historyLayerRef.current !== null))
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (dirty) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(dirty.x, dirty.y, dirty.width, dirty.height)
      ctx.clip()
    }
    ctx.clearRect(dirty?.x ?? 0, dirty?.y ?? 0, dirty?.width ?? canvas.width, dirty?.height ?? canvas.height)
    ctx.setTransform(dpr * viewport.scale, 0, 0, dpr * viewport.scale, dpr * viewport.offsetX, dpr * viewport.offsetY)
    // The sheet color, template and shadow live in a CSS layer behind this transparent canvas, so the canvas never
    // repaints a patterned sheet. The layer follows the same viewport transform used for every canvas draw below.
    const backgroundStartedAt = benchmarkBackground ? performance.now() : 0
    const sheetLayer = sheetLayerRef.current
    if (sheetLayer) {
      applySheetLayer(sheetLayer, sheetLayerAppliedRef.current, getSheetLayerState(
        benchmarkBackground?.template ?? pageTemplate,
        PAGE_BACKGROUND_COLORS[benchmarkBackground ? 'white' : pageBackground],
        viewport,
      ))
    }
    if (benchmarkBackground) benchmarkBackground.onBackgroundRendered(performance.now() - backgroundStartedAt)
    const drawSheetBorders = () => {
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
    }
    if (!oneLayer) drawSheetBorders()
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
      } else if (item.kind === 'text') {
        ctx.save()
        ctx.strokeStyle = '#5574ed'
        ctx.lineWidth = 2
        ctx.setLineDash([7, 4])
        ctx.strokeRect(item.x - 6, item.y - 6, item.width + 12, item.height + 12)
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
    // The ink goes onto its own layer that is copied onto the page canvas, or (oneLayer) straight onto the page canvas,
    // which is already cleared, clipped to the changed area and set to the page transform.
    const target = oneLayer ? ctx : inkContext
    if (!oneLayer) {
      inkContext.setTransform(1, 0, 0, 1, 0, 0)
      if (dirty) {
        inkContext.save()
        inkContext.beginPath()
        inkContext.rect(dirty.x, dirty.y, dirty.width, dirty.height)
        inkContext.clip()
      }
      if (!directGesture) inkContext.clearRect(dirty?.x ?? 0, dirty?.y ?? 0, dirty?.width ?? inkLayer.width, dirty?.height ?? inkLayer.height)
      inkContext.setTransform(dpr * viewport.scale, 0, 0, dpr * viewport.scale, dpr * viewport.offsetX, dpr * viewport.offsetY)
    }
    target.save()
    target.beginPath()
    target.rect(WORKSPACE_BOUNDS.x, WORKSPACE_BOUNDS.y, WORKSPACE_BOUNDS.width, WORKSPACE_BOUNDS.height)
    target.clip()
    const historyInkStartedAt = measureFrame ? performance.now() : 0
    if (directGesture) {
      // nothing to draw into the ink layer; the saved picture is composited below
    } else if (sameViewport && cache && historyLayerRef.current) {
      target.save()
      target.setTransform(1, 0, 0, 1, 0, 0)
      if (dirty) target.drawImage(historyLayerRef.current, dirty.x, dirty.y, dirty.width, dirty.height, dirty.x, dirty.y, dirty.width, dirty.height)
      else target.drawImage(historyLayerRef.current, 0, 0)
      target.restore()
    } else {
      canvasItemsForRendering(items).forEach((item) => { if (!isItemVisible(item, view)) return; if (editingTextId === null || item.kind !== 'text' || item.id !== editingTextId) drawItem(target, item) })
      if (cacheAllowed) {
        const historyLayer = getReusableCanvasLayer(historyLayerRef, canvas.width, canvas.height)
        const historyContext = historyLayer.getContext('2d', LAYER_CANVAS_OPTIONS)
        if (historyContext) {
          historyContext.setTransform(1, 0, 0, 1, 0, 0)
          historyContext.clearRect(0, 0, historyLayer.width, historyLayer.height)
          historyContext.drawImage(inkLayer, 0, 0)
          historyCacheRef.current = { snapshot: items.slice(), mode: strokeDisplayMode, scale: viewport.scale, offsetX: viewport.offsetX, offsetY: viewport.offsetY, dpr, width: canvas.width, height: canvas.height }
        }
      } else {
        historyCacheRef.current = null
      }
    }
    if (measureFrame) diagnostics?.recordHistoryInkRender(performance.now() - historyInkStartedAt)
    if (activeStrokeRef.current && !startLive) {
      const preview = shapePreviewRef.current
      const activeStrokeRenderStartedAt = measureFrame ? performance.now() : 0
      drawItem(target, preview ?? activeStrokeRef.current)
      if (measureFrame) diagnostics?.recordActiveStrokeRender(performance.now() - activeStrokeRenderStartedAt)
    }
    target.restore()
    if (!oneLayer && dirty) inkContext.restore()
    const compositeStartedAt = measureFrame ? performance.now() : 0
    if (oneLayer) {
      // The sheet borders sit under the ink: draw them behind what is already on the canvas.
      ctx.save()
      ctx.globalCompositeOperation = 'destination-over'
      drawSheetBorders()
      ctx.restore()
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (oneLayer) {
      // nothing to copy: the ink is already on the page canvas
    } else if (directGesture && cache && historyLayerRef.current) {
      const k = viewport.scale / cache.scale
      ctx.setTransform(k, 0, 0, k, dpr * (viewport.offsetX - k * cache.offsetX), dpr * (viewport.offsetY - k * cache.offsetY))
      ctx.drawImage(historyLayerRef.current, 0, 0)
    } else if (dirty) ctx.drawImage(inkLayer, dirty.x, dirty.y, dirty.width, dirty.height, dirty.x, dirty.y, dirty.width, dirty.height)
    else ctx.drawImage(inkLayer, 0, 0)
    if (measureFrame) diagnostics?.recordCompositeRender(performance.now() - compositeStartedAt)
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
    if (dirty) ctx.restore()
    if (startLive && liveStroke) {
      // Keep the page as painted now (without the stroke) and start an empty layer for the stroke's final spans.
      const base = getReusableCanvasLayer(liveBaseRef, canvas.width, canvas.height)
      const baseContext = base.getContext('2d', LAYER_CANVAS_OPTIONS)
      const live = getReusableCanvasLayer(liveLayerRef, canvas.width, canvas.height)
      const liveContext = live.getContext('2d', LAYER_CANVAS_OPTIONS)
      if (baseContext && liveContext) {
        baseContext.setTransform(1, 0, 0, 1, 0, 0)
        baseContext.globalCompositeOperation = 'copy'
        baseContext.drawImage(canvas, 0, 0)
        baseContext.globalCompositeOperation = 'source-over'
        liveContext.setTransform(1, 0, 0, 1, 0, 0)
        liveContext.clearRect(0, 0, live.width, live.height)
        liveStateRef.current = createLiveStrokeState(liveStroke.id)
        drawLiveFrame()
      }
    }
    if (measureFrame) diagnostics?.recordMainCanvasRender(performance.now() - mainCanvasStartedAt)
    const minimapStartedAt = measureFrame ? performance.now() : 0
    // The minimap redraws every item, so while a stroke is being written it is refreshed a few times a second at most.
    const minimapNow = performance.now()
    if ((!activeStrokeRef.current && !gestureFrame) || minimapNow - minimapRenderedAtRef.current > MINIMAP_LIVE_REFRESH_MS) {
      minimapRenderedAtRef.current = minimapNow
      renderNavigator()
    }
    if (measureFrame) diagnostics?.recordMinimapRender(performance.now() - minimapStartedAt)
    if (measureFrame) diagnostics?.recordRenderComplete(performance.now() - renderStartedAt, performance.now())
  }, [color, drawConnector, drawItem, drawStroke, pageBackground, pageTemplate, renderNavigator, strokeDisplayMode, width])

  const applyViewport = (viewport: Viewport, gesture = false) => {
    if (textEditorRef.current) commitTextEditor()
    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    const boundedViewport = rect
      ? clampViewportToSheet(viewport, rect.width, rect.height)
      : viewport
    viewportRef.current = boundedViewport
    setZoomPercent(Math.round(boundedViewport.scale * 100))
    if (gesture) {
      // Pinch and pan: at most one cheap frame per display frame, then one sharp redraw when the fingers settle.
      viewportGestureRef.current = true
      if (gestureSettleTimerRef.current !== null) window.clearTimeout(gestureSettleTimerRef.current)
      gestureSettleTimerRef.current = window.setTimeout(() => {
        gestureSettleTimerRef.current = null
        viewportGestureRef.current = false
        renderAll()
      }, GESTURE_SETTLE_MS)
      scheduleRender()
      return
    }
    renderAll()
  }

  const scheduleRender = useCallback(() => {
    const diagnostics = performanceDiagnosticsRef.current
    const alreadyPending = frameRef.current !== null
    if (diagnostics?.isCapturing()) diagnostics.recordFrameRequest(performance.now(), alreadyPending)
    if (alreadyPending) return
    frameRef.current = requestAnimationFrame((frameTimestamp) => {
      frameRef.current = null
      if (diagnostics?.isCapturing()) diagnostics.recordFrameCallback(frameTimestamp)
      if (DRAW_READOUT_ENABLED && activeStrokeRef.current) {
        const drawStartedAt = performance.now()
        renderAll()
        frameRecorderRef.current.frame(frameTimestamp, performance.now() - drawStartedAt)
        return
      }
      renderAll()
    })
  }, [renderAll])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = canvasPixelRatio()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    if (!initialViewDoneRef.current && rect.width > 0 && rect.height > 0) {
      initialViewDoneRef.current = true
      viewportRef.current = getInitialViewport(rect.width, rect.height)
    }
    viewportRef.current = clampViewportToSheet(viewportRef.current, rect.width, rect.height)
    setZoomPercent(Math.round(viewportRef.current.scale * 100))
    if (textEditorRef.current) setTextEditor({ ...textEditorRef.current })
    const ctx = canvas.getContext('2d', MAIN_CANVAS_OPTIONS) as CanvasRenderingContext2D | null
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
  }, [navigatorMinimized, renderAll])

  useEffect(() => {
    saveStrokeDisplayMode(strokeDisplayMode)
    renderAll()
  }, [renderAll, strokeDisplayMode])

  useEffect(() => {
    savePageTemplate(pageTemplate)
    renderAll()
    scheduleAutosave()
  }, [pageTemplate, renderAll])

  useEffect(() => {
    savePageBackground(pageBackground)
    renderAll()
    scheduleAutosave()
  }, [pageBackground, renderAll])


  useEffect(() => {
    if (!PERFORMANCE_DIAGNOSTICS_ENABLED || !performanceDiagnosticsOpen) return
    const updateRows = () => {
      const diagnostics = performanceDiagnosticsRef.current
      setPerformanceRows(diagnostics?.snapshot() ?? [])
      setBrowserStallSummary(diagnostics?.browserStallSnapshot() ?? null)
    }
    updateRows()
    const timer = window.setInterval(() => {
      if (!performanceDiagnosticsRef.current?.isStrokeActive()) updateRows()
    }, 500)
    return () => window.clearInterval(timer)
  }, [performanceDiagnosticsOpen, performanceCaptureActive])

  useEffect(() => {
    if (!PERFORMANCE_DIAGNOSTICS_ENABLED || !performanceCaptureActive) return
    const diagnostics = performanceDiagnosticsRef.current
    if (!diagnostics || typeof PerformanceObserver === 'undefined') {
      diagnostics?.setLongTaskSupport(false)
      diagnostics?.setLongAnimationFrameSupport(false)
      return
    }

    const observers: PerformanceObserver[] = []
    const supportedTypes = PerformanceObserver.supportedEntryTypes ?? []
    const observe = (type: 'longtask' | 'long-animation-frame', record: (duration: number) => void) => {
      if (!supportedTypes.includes(type)) {
        if (type === 'longtask') diagnostics.setLongTaskSupport(false)
        else diagnostics.setLongAnimationFrameSupport(false)
        return
      }
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) record(entry.duration)
        })
        observer.observe({ type, buffered: false })
        observers.push(observer)
        if (type === 'longtask') diagnostics.setLongTaskSupport(true)
        else diagnostics.setLongAnimationFrameSupport(true)
      } catch {
        if (type === 'longtask') diagnostics.setLongTaskSupport(false)
        else diagnostics.setLongAnimationFrameSupport(false)
      }
    }
    observe('longtask', (duration) => diagnostics.recordBrowserStall('longtask', duration))
    observe('long-animation-frame', (duration) => diagnostics.recordBrowserStall('long-animation-frame', duration))
    setBrowserStallSummary(diagnostics.browserStallSnapshot())
    return () => observers.forEach((observer) => observer.disconnect())
  }, [performanceCaptureActive])

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

  useEffect(() => {
    if (optionsFor === null) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest?.('.context-panel, .eraser-popover, .tool-dock')) return
      setOptionsFor(null)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOptionsFor(null) }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [optionsFor])

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
    setTextMode(false); setClassMode(false)
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
    applyViewport({ scale: getCoverScale(rect.width, rect.height), offsetX: 0, offsetY: 0 })
  }

  const openAtDefaultView = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    applyViewport(getInitialViewport(rect.width, rect.height))
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

  const resetView = () => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    applyViewport({ scale: DEFAULT_ZOOM, offsetX: rect.width / 2 - SHEET_WIDTH / 2 * DEFAULT_ZOOM, offsetY: rect.height / 2 - SHEET_HEIGHT / 2 * DEFAULT_ZOOM })
  }

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
      applyViewport(zoomTwoFingerViewport(gesture.viewport, gesture.center, gesture.distance, distance, MIN_ZOOM, MAX_ZOOM), true)
    } else {
      const center = {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        pressure: 1,
      }
      if (Math.hypot(center.x - gesture.center.x, center.y - gesture.center.y) >= THREE_FINGER_PAN_THRESHOLD) {
        applyViewport(panThreeFingerViewport(gesture.viewport, gesture.center, center), true)
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
      if (DRAW_READOUT_ENABLED) {
        const summary = frameRecorderRef.current.finish()
        if (summary && frameReadoutRef.current) frameReadoutRef.current.textContent = formatFrameSummary(summary)
      }
      const diagnostics = performanceDiagnosticsRef.current
      if (diagnostics?.isCapturing()) {
        diagnostics.finishStroke(pointCount, performance.now())
        if (performanceDiagnosticsOpen) {
          setPerformanceRows(diagnostics.snapshot())
          setBrowserStallSummary(diagnostics.browserStallSnapshot())
        }
      }
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
      if (stroke.kind === 'stroke' && STROKE_THINNING_ENABLED) stroke = thinStroke(stroke)
      strokesRef.current.push(stroke)
      if (stroke.kind === 'stroke' && stroke.erase) strokesRef.current = compactAfterErase(strokesRef.current, () => nextStrokeIdRef.current++)
      setHasInk(true)
    }
    activeStrokeRef.current = null
    predictedPointsRef.current = []
    activeConnectorRef.current = null
    shapePreviewRef.current = null
    activePointerRef.current = null
    if (hoverErasePointerRef.current === pointerId) hoverErasePointerRef.current = null
    activeDragRef.current = null
    holdAnchorRef.current = null
    lastSignificantMoveAtRef.current = 0
    scheduleRender()
  }, [performanceDiagnosticsOpen, scheduleRender, shapeMode])

  const appendStrokeSample = (pointerId: number, point: Point): boolean => {
    const stroke = activeStrokeRef.current
    if (!stroke) return false
    const previous = stroke.points[stroke.points.length - 1]
    const clippedPoint = clipSegmentToBounds(previous, point)
    if (clippedPoint && shouldAppendStrokeSample(previous, clippedPoint)) {
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
    if (textEditorRef.current) commitTextEditor()
    if (textMode) {
      event.currentTarget.setPointerCapture(event.pointerId)
      textTapRef.current = { pointerId: event.pointerId, point }
      return
    }
    if (classMode) {
      event.currentTarget.setPointerCapture(event.pointerId)
      classTapRef.current = { pointerId: event.pointerId, point }
      return
    }
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
          originalItems: strokesRef.current.slice(),
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
          originalItems: strokesRef.current.slice(),
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
          originalItems: strokesRef.current.slice(),
          moved: false,
        }
        return
      }
      const previouslySelectedRectangleId = selectedRectangleIdRef.current
      const textHit = hitTestText(point)
      const rectangle = textHit ? null : hitTestRectangle(point)
      const connector = textHit || rectangle ? null : hitTestConnector(point)
      const textWasSelected = textHit !== null && selectedKeysRef.current.has(canvasItemKey(textHit))
      setSelectedRectangle(rectangle?.id ?? null)
      updateSelectedItems(textHit ? [canvasItemKey(textHit)] : connector ? [canvasItemKey(connector)] : [])
      renderAll()
      const selectedItem = textHit ?? rectangle ?? connector
      if (!selectedItem) return
      event.currentTarget.setPointerCapture(event.pointerId)
      activeDragRef.current = {
        pointerId: event.pointerId,
        itemKey: canvasItemKey(selectedItem),
        start: point,
        originalItems: strokesRef.current.slice(),
        moved: false,
        // Tapping already-selected text (without dragging) edits it.
        editTextId: textWasSelected && textHit ? textHit.id : null,
        editClassBoxId: rectangle?.classBox && previouslySelectedRectangleId === rectangle.id ? rectangle.id : null,
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
    const diagnostics = performanceDiagnosticsRef.current
    if (!eraser && diagnostics?.isCapturing()) {
      diagnostics.startStroke(
        strokeDisplayMode,
        performance.now(),
        event.nativeEvent.timeStamp,
        getSceneComplexity(strokesRef.current, viewportRef.current.scale, Math.max(1, window.devicePixelRatio || 1), false),
      )
    }
    shapePreviewRef.current = null
    predictedPointsRef.current = []
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
    const samples = getPointerSamples(event.nativeEvent)
    if (DRAW_READOUT_ENABLED) frameRecorderRef.current.samples(samples.length)
    const diagnostics = performanceDiagnosticsRef.current
    if (diagnostics?.isCapturing()) diagnostics.recordPointerMove(samples.map((sample) => sample.timeStamp), performance.now())
    const rect = event.currentTarget.getBoundingClientRect()
    for (const sample of samples) {
      const point = screenToCanvasPoint({
        x: sample.clientX - rect.left,
        y: sample.clientY - rect.top,
        pressure: sample.pressure,
      }, viewportRef.current)
      if (!appendStrokeSample(event.pointerId, point)) return
    }
    // Where the browser expects the pen next: drawn just ahead of the ink so it keeps up with the tip, never saved.
    const liveNow = activeStrokeRef.current
    predictedPointsRef.current = PEN_PREDICTION_ENABLED && liveNow?.kind === 'stroke' && !liveNow.erase
      ? getPredictedPoints(event.nativeEvent, (clientX, clientY) => {
        const point = screenToCanvasPoint({ x: clientX - rect.left, y: clientY - rect.top, pressure: 0 }, viewportRef.current)
        return isPointWithinBounds(point) ? point : null
      }, liveNow.points[liveNow.points.length - 1], MAX_PREDICTION_DISTANCE_SCREEN_PX / viewportRef.current.scale)
      : []
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
    if (textTapRef.current?.pointerId === event.pointerId) {
      // The editor opens on pen-up (the end of the tap) so the on-screen keyboard is allowed to appear.
      const tap = textTapRef.current
      textTapRef.current = null
      const existing = hitTestText(tap.point)
      if (existing) editTextItem(existing)
      else openTextEditor({ itemId: null, x: tap.point.x, y: tap.point.y - textSize * 0.65, fontSize: textSize, color, initialText: '' })
      return
    }
    if (classTapRef.current?.pointerId === event.pointerId) {
      // Like text, the dialog opens on pen-up so the keyboard is allowed to appear.
      const tap = classTapRef.current
      classTapRef.current = null
      const existing = hitTestRectangle(tap.point)
      if (existing) openClassBoxEditor({ rectangleId: existing.id, x: existing.x, y: existing.y, content: existing.classBox ?? EMPTY_CLASS_BOX })
      else openClassBoxEditor({ rectangleId: null, x: tap.point.x, y: tap.point.y, content: EMPTY_CLASS_BOX })
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
      const drag = activeDragRef.current
      activeDragRef.current = null
      if (!drag.moved && drag.editTextId != null) {
        const tapped = strokesRef.current.find((item): item is TextObject => item.kind === 'text' && item.id === drag.editTextId)
        if (tapped) editTextItem(tapped)
      }
      if (!drag.moved && drag.editClassBoxId != null) {
        const tappedBox = strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === drag.editClassBoxId)
        if (tappedBox?.classBox) openClassBoxEditor({ rectangleId: tappedBox.id, x: tappedBox.x, y: tappedBox.y, content: tappedBox.classBox })
      }
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
    if (textTapRef.current?.pointerId === event.pointerId) {
      textTapRef.current = null
      return
    }
    if (classTapRef.current?.pointerId === event.pointerId) {
      classTapRef.current = null
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

  const runSyntheticBenchmark = async (mode: BenchmarkMode) => {
    if (benchmarkRunning) return
    setBenchmarkRunning(true)
    const oldItems = strokesRef.current
    const oldActive = activeStrokeRef.current
    const oldDiagnostics = performanceDiagnosticsRef.current
    const canvas = canvasRef.current
    const oldPointerEvents = canvas?.style.pointerEvents
    const oldCanvasWidth = canvas?.width
    const oldCanvasHeight = canvas?.height
    const actualEnvironment = {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      dpr: Math.max(1, window.devicePixelRatio || 1),
      backingWidth: canvas?.width ?? 0,
      backingHeight: canvas?.height ?? 0,
      zoom: viewportRef.current.scale,
      offsetX: viewportRef.current.offsetX,
      offsetY: viewportRef.current.offsetY,
    }
    const effectiveViewport: Viewport = mode === 'controlled'
      ? { scale: CONTROLLED_BENCHMARK_VIEWPORT.zoom, offsetX: 0, offsetY: 0 }
      : { ...viewportRef.current }
    const effectiveDpr = mode === 'controlled' ? CONTROLLED_BENCHMARK_VIEWPORT.dpr : actualEnvironment.dpr
    if (canvas) canvas.style.pointerEvents = 'none'
    if (canvas && mode === 'controlled') {
      canvas.width = Math.round(CONTROLLED_BENCHMARK_VIEWPORT.width * CONTROLLED_BENCHMARK_VIEWPORT.dpr)
      canvas.height = Math.round(CONTROLLED_BENCHMARK_VIEWPORT.height * CONTROLLED_BENCHMARK_VIEWPORT.dpr)
    }
    const results: Record<string, unknown>[] = []
    const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))
    try {
      for (const size of BENCHMARK_SCENE_SIZES) {
        strokesRef.current = createBenchmarkScene(size)
        activeStrokeRef.current = { kind: 'stroke', id: -1, points: Array.from({ length: 48 }, (_, index) => ({ x: 100 + index * 2, y: 300 + Math.sin(index / 4) * 18, pressure: 0.5 })), color: '#202124', width: 4, erase: false }
        const complexity = getSceneComplexity(strokesRef.current, effectiveViewport.scale, effectiveDpr, false)
        const warmup = new PerformanceDiagnostics()
        performanceDiagnosticsRef.current = warmup
        for (const template of ['blank', 'lined', 'dotted'] as const) {
          for (let frame = 0; frame < BENCHMARK_WARMUP_FRAMES; frame += 1) { await nextFrame(); renderAll({ template, dpr: effectiveDpr, viewport: effectiveViewport, onBackgroundRendered: () => undefined }) }
          const diagnostics = new PerformanceDiagnostics()
          performanceDiagnosticsRef.current = diagnostics
          diagnostics.startCapture()
          diagnostics.startStroke('raw', performance.now(), performance.now(), complexity)
          const backgroundSamples: number[] = []
          const laf: number[] = []
          let observer: PerformanceObserver | null = null
          if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
            observer = new PerformanceObserver((list) => list.getEntries().forEach((entry) => laf.push(entry.duration)))
            observer.observe({ type: 'long-animation-frame', buffered: false })
          }
          for (let frame = 0; frame < BENCHMARK_MEASURED_FRAMES; frame += 1) {
            diagnostics.recordFrameRequest(performance.now(), false)
            await new Promise<void>((resolve) => requestAnimationFrame((timestamp) => {
              diagnostics.recordFrameCallback(timestamp)
              renderAll({ template, dpr: effectiveDpr, viewport: effectiveViewport, onBackgroundRendered: (duration) => backgroundSamples.push(duration) })
              resolve()
            }))
          }
          diagnostics.finishStroke(48, performance.now())
          diagnostics.stopCapture()
          await new Promise((resolve) => setTimeout(resolve, 0))
          const row = diagnostics.snapshot().find((entry) => entry.mode === 'raw' && entry.length === 'short')
          const metricNames = ['renderAllMs', 'historyInkMs', 'activeStrokeRenderMs', 'frameGapMs', 'compositeMs', 'minimapMs', 'pageOverviewMs'] as const
          const metrics = Object.fromEntries(metricNames.map((name) => {
            const metric = row?.metrics[name]
            return [name, { medianMs: metric?.p50Ms ?? 0, p95Ms: metric?.p95Ms ?? 0, maxMs: metric?.maxMs ?? 0, observations: metric?.observations ?? 0 }]
          }))
          results.push({ mode, objectCount: size, template, sheetColor: 'white', seed: BENCHMARK_SEED, warmupFrames: BENCHMARK_WARMUP_FRAMES, measuredFrames: BENCHMARK_MEASURED_FRAMES, environment: getBenchmarkEnvironment(mode, actualEnvironment), composition: { strokes: complexity.strokes, rectangles: complexity.rectangles, connectors: complexity.connectors, storedPoints: complexity.storedPoints }, metrics: { backgroundRenderMs: summarizeBenchmarkSamples(backgroundSamples), ...metrics }, longAnimationFrames: { supported: Boolean(observer), ...summarizeBenchmarkSamples(laf) } })
          observer?.disconnect()
        }
      }
      setBenchmarkResult({ schema: 'inkpad-synthetic-render-benchmark', version: 2, mode, generatedAt: new Date().toISOString(), device: getDiagnosticDeviceInfo(), captureType: 'synthetic; separate from S Pen diagnostics', results })
    } finally {
      strokesRef.current = oldItems
      activeStrokeRef.current = oldActive
      performanceDiagnosticsRef.current = oldDiagnostics
      if (canvas) canvas.style.pointerEvents = oldPointerEvents ?? ''
      if (canvas && oldCanvasWidth !== undefined && oldCanvasHeight !== undefined) {
        canvas.width = oldCanvasWidth
        canvas.height = oldCanvasHeight
      }
      renderAll()
      setBenchmarkRunning(false)
    }
  }

  // Development only (menu > Fill view with test ink): adds handwriting-like strokes over the current view, or removes them again.
  const fillTestInk = (targetPoints: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    cancelTextEditor()
    const strokes = createTestInk(viewRectOf(viewportRef.current, rect.width, rect.height), SHEET_BOUNDS, targetPoints, nextStrokeIdRef.current)
    if (!strokes.length) return
    nextStrokeIdRef.current += strokes.length
    saveHistory()
    strokesRef.current = [...strokesRef.current, ...strokes]
    setHasInk(true)
    renderAll()
  }

  const removeTestInk = () => {
    const kept = strokesRef.current.filter((item) => !isTestInk(item))
    if (kept.length === strokesRef.current.length) return
    cancelTextEditor()
    saveHistory()
    strokesRef.current = kept
    reconcileSelectedItems()
    setHasInk(kept.length > 0)
    renderAll()
  }

  const clearCanvas = () => {
    cancelTextEditor()
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
    scheduleAutosave()
  }

  const slimInk = () => {
    const result = thinItems(strokesRef.current)
    if (result.after >= result.before) { setFileNotice('Ink is already slim.'); return }
    saveHistory()
    strokesRef.current = result.items
    setFileNotice(`Slimmed ink: ${result.before.toLocaleString()} → ${result.after.toLocaleString()} points.`)
    renderAll()
    scheduleAutosave()
  }

  const onPointerLeave = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (hoverErasePointerRef.current === event.pointerId) finishStroke(event.pointerId)
  }

  const toggleShapeTool = () => { setOptionsFor(null); setShapeMode((value) => !value); setTextMode(false); setClassMode(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); clearLassoSelection(); setEraser(false) }
  const toggleSelectTool = () => { const next = !selectionMode; setSelectionMode(next); setTextMode(false); setClassMode(false); setLassoMode(false); setConnectorMode(false); setShapeMode(false); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }
  const openTextOptions = () => { setTextMode(true); setClassMode(false); setShapeMode(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); setEraser(false); clearLassoSelection(); setOptionsFor('text') }
  const toggleTextTool = () => { const next = !textMode; setTextMode(next); setClassMode(false); setShapeMode(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }
  const toggleClassTool = () => { const next = !classMode; setClassMode(next); setTextMode(false); setShapeMode(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }
  const toggleLassoTool = () => { const next = !lassoMode; setLassoMode(next); setTextMode(false); setClassMode(false); setSelectionMode(false); setConnectorMode(false); setShapeMode(false); setEraser(false); setEraserMenuOpen(false); setSelectedRectangle(null); clearLassoSelection() }
  const toggleConnectorTool = () => { const next = !connectorMode; setConnectorMode(next); setTextMode(false); setClassMode(false); setLassoMode(false); setSelectionMode(false); setShapeMode(false); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }
  const isDoubleTap = (tool: string) => {
    const now = Date.now()
    const last = lastToolTapRef.current
    lastToolTapRef.current = { tool, time: now }
    return last !== null && last.tool === tool && now - last.time <= DOUBLE_TAP_MS
  }
  const tapPenTool = () => {
    const double = isDoubleTap('pen')
    selectPenMode()
    setOptionsFor(double ? 'pen' : null)
  }
  const tapEraserTool = () => {
    if (isDoubleTap('eraser')) {
      setTextMode(false); setClassMode(false); setShapeMode(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); clearLassoSelection()
      setEraser(true)
      setOptionsFor('eraser')
      return
    }
    setTextMode(false); setClassMode(false); setShapeMode(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); clearLassoSelection()
    setEraser((value) => !value)
    setOptionsFor(null)
  }
  const selectColor = (value: string) => { setColor(value); setEraser(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); clearLassoSelection() }

  const zoomBy = (factor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const viewport = viewportRef.current
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.scale * factor))
    const center = { x: rect.width / 2, y: rect.height / 2, pressure: 1 }
    const anchor = screenToCanvasPoint(center, viewport)
    applyViewport({ scale, offsetX: center.x - anchor.x * scale, offsetY: center.y - anchor.y * scale })
  }

  return (
    <main className="app-shell">
      <section className="canvas-stage" aria-label="Drawing canvas">
        <div ref={sheetLayerRef} className="sheet-layer" aria-hidden="true" style={{ width: SHEET_WIDTH, height: SHEET_HEIGHT }} />
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
        {DRAW_READOUT_ENABLED && (
          <div className="draw-readouts" aria-hidden="true">
            <div className="draw-readout">{DRAW_FLAGS_TEXT}</div>
            <div ref={frameReadoutRef} className="draw-readout">last stroke: write a stroke to see frame timing</div>
            <div ref={drawReadoutRef} className="draw-readout" />
          </div>
        )}
        {textEditor && <TextEditorOverlay
          key={`${textEditor.itemId ?? 'new'}:${textEditor.x}:${textEditor.y}`}
          editor={textEditor}
          viewport={viewportRef.current}
          measure={createTextMeasure}
          onChange={(value) => { textEditorValueRef.current = value }}
          onCommit={commitTextEditor}
          onCancel={cancelTextEditor}
        />}
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
        <aside className={`viewport-navigator${navigatorMinimized ? ' minimized' : ''}`} aria-label="Canvas navigation">
          {navigatorMinimized ? (
            <button className="navigator-restore" type="button" aria-label="Show workspace map" title="Show workspace map" onClick={() => setNavigatorMinimized(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2"/><rect x="7" y="8.5" width="6" height="5" rx="1"/></svg>
            </button>
          ) : (
            <>
              <div className="navigator-header">
                <span className="navigator-map-label">Workspace</span>
                <button
                  className="navigator-expand-button"
                  type="button"
                  aria-label="Minimize workspace map"
                  title="Minimize"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => { event.stopPropagation(); setNavigatorMinimized(true) }}
                >
                  <span aria-hidden="true">−</span>
                </button>
              </div>
              <div className="navigator-maps">
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
              </div>
              <div className="navigator-controls">
                <button type="button" onClick={fitCanvasView}>Fit canvas</button>
                <button type="button" onClick={fitDrawingView}>Fit drawing</button>
                <button type="button" onClick={resetView}>Reset</button>
              </div>
            </>
          )}
          <div className={`navigator-status status-${saveStatus}`} role="status">{statusLabel(saveStatus, storage.kind)}</div>
        </aside>
      </section>
      <TopLeftBar
        title={docTitle}
        library={library}
        folders={folders}
        currentId={currentDocId}
        pageTemplate={pageTemplate}
        onPageTemplate={setPageTemplate}
        pageBackground={pageBackground}
        onPageBackground={setPageBackground}
        hasInk={hasInk}
        filePanelOpen={filePanelOpen}
        onToggleFilePanel={() => setFilePanelOpen((open) => !open)}
        onClear={clearCanvas}
        onSlimInk={slimInk}
        onOpenDiagram={(id) => void openStoredDiagram(id)}
        onFoldersOpen={() => void refreshLibrary()}
        onNewDiagramIn={(folderId) => void newDiagramIn(folderId)}
        onCreateFolder={(name, parentId) => void createFolder(name, parentId)}
        onRenameFolder={(id, name) => void renameFolder(id, name)}
        onDeleteFolder={(id) => void deleteFolder(id)}
        onMoveDiagram={(docId, folderId) => void moveDiagram(docId, folderId)}
        notice={fileNotice}
        storage={storage}
        onOpenStorage={() => setStoragePanelOpen(true)}
        diagnostics={{ enabled: PERFORMANCE_DIAGNOSTICS_ENABLED, open: performanceDiagnosticsOpen, onToggle: () => setPerformanceDiagnosticsOpen((open) => !open), onFillTestInk: fillTestInk, onRemoveTestInk: removeTestInk }}
      />
      <HistoryBar canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
      <AccountButton profile={driveProfile} needsReconnect={storage.kind === 'drive' && storage.locked} onReconnect={() => void reconnectDeviceFolder()} onOpenStorage={() => setStoragePanelOpen(true)} />
      <ContextPanel
        showStyle={optionsFor === 'pen' && penModeActive}
        color={color}
        onColor={selectColor}
        width={width}
        onWidth={setWidth}
        strokeDisplayMode={strokeDisplayMode}
        onStrokeDisplayMode={setStrokeDisplayMode}
        showTextSizes={optionsFor === 'text' && textMode}
        textSize={textSize}
        onTextSize={setTextSize}
        selectedItemCount={selectedItemCount}
        onClearSelection={clearLassoSelection}
        relationship={selectedConnectorId !== null && selectedConnectorType !== null
          ? { type: selectedConnectorType, reversed: selectedConnectorReversed, onChange: changeSelectedConnectorType, onReverse: reverseSelectedConnector }
          : null}
      />
      <ZoomControls zoomPercent={zoomPercent} onZoomIn={() => zoomBy(ZOOM_STEP)} onZoomOut={() => zoomBy(1 / ZOOM_STEP)} />
      <ToolDock
        dockRef={toolbarRef}
        eraserControlRef={eraserControlRef}
        penActive={penModeActive}
        eraserActive={eraser}
        eraserMenuOpen={eraserMenuOpen}
        selectionActive={selectionMode}
        lassoActive={lassoMode}
        connectorActive={connectorMode || umlConnectorType !== null}
        textActive={textMode}
        classActive={classMode}
        shapeActive={shapeMode}
        onPen={tapPenTool}
        onEraser={tapEraserTool}
        onSelect={toggleSelectTool}
        onLasso={toggleLassoTool}
        onConnector={toggleConnectorTool}
        onText={toggleTextTool}
        onTextOptions={openTextOptions}
        onClass={toggleClassTool}
        onShapes={toggleShapeTool}
      />
      {classBoxEditor && <ClassBoxDialog
        key={`${classBoxEditor.rectangleId ?? 'new'}:${classBoxEditor.x}:${classBoxEditor.y}`}
        initial={classBoxEditor.content}
        isNew={classBoxEditor.rectangleId === null || !classBoxEditor.content.name && !classBoxEditor.content.attributes && !classBoxEditor.content.methods}
        onDone={commitClassBox}
        onCancel={() => setClassBoxEditor(null)}
      />}
      {storagePanelOpen && <StoragePanel
        storage={storage}
        profile={driveProfile}
        saveStatus={saveStatus}
        notice={fileNotice}
        onClose={() => setStoragePanelOpen(false)}
        onChooseDeviceFolder={() => void chooseDeviceFolder()}
        onReconnect={() => void reconnectDeviceFolder()}
        onConnectDrive={() => void connectDrive()}
        onUseBrowserStorage={() => void useBrowserStorage()}
        onCopyBrowserHere={() => void copyBrowserToDevice()}
      />}
      {filePanelOpen && <FilePanel
        title={docTitle}
        saveStatus={saveStatus}
        notice={fileNotice}
        library={library}
        currentId={currentDocId}
        canExport={hasInk}
        storage={storage}
        onClose={() => setFilePanelOpen(false)}
        onTitleChange={renameDiagram}
        onNew={() => void newDiagram()}
        onOpen={(id) => void openStoredDiagram(id)}
        onDelete={(id) => void deleteStoredDiagram(id)}
        onExportDocument={exportDocumentFile}
        onImportFile={(file) => void importDocumentFile(file)}
        onExportSvg={exportSvgFile}
        onExportPng={(scale) => void exportPngFile(scale)}
      />}
      {PERFORMANCE_DIAGNOSTICS_ENABLED && performanceDiagnosticsOpen && <section id="inkpad-performance-panel" className="performance-panel" aria-label="Development performance diagnostics">
        <div className="performance-panel-header">
          <div><strong>InkPad drawing latency diagnostics</strong><span>Development only · capture is opt-in · each group keeps up to 40 strokes</span></div>
          <div className="performance-panel-actions">
            <button type="button" aria-pressed={performanceCaptureActive} onClick={() => {
              const diagnostics = performanceDiagnosticsRef.current
              if (!diagnostics) return
              if (performanceCaptureActive) {
                diagnostics.stopCapture()
                setPerformanceRows(diagnostics.snapshot())
                setBrowserStallSummary(diagnostics.browserStallSnapshot())
                setPerformanceCaptureActive(false)
              } else {
                diagnostics.startCapture()
                setPerformanceRows(diagnostics.snapshot())
                setBrowserStallSummary(diagnostics.browserStallSnapshot())
                setPerformanceCaptureActive(true)
              }
            }}>{performanceCaptureActive ? 'Stop capture' : 'Start capture'}</button>
            <button type="button" disabled={benchmarkRunning || performanceCaptureActive} onClick={() => { void runSyntheticBenchmark('controlled') }}>{benchmarkRunning ? 'Benchmarking…' : 'Run controlled'}</button>
            <button type="button" disabled={benchmarkRunning || performanceCaptureActive} onClick={() => { void runSyntheticBenchmark('native') }}>{benchmarkRunning ? 'Benchmarking…' : 'Run native'}</button>
            <button type="button" disabled={!benchmarkResult} onClick={() => {
              if (!benchmarkResult) return
              const blob = new Blob([JSON.stringify(benchmarkResult, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `inkpad-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
              link.click()
              URL.revokeObjectURL(url)
            }}>Export benchmark JSON</button>
            <button type="button" onClick={() => {
              const diagnostics = performanceDiagnosticsRef.current
              if (!diagnostics) return
              const data = diagnostics.exportJson(getDiagnosticDeviceInfo())
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const download = document.createElement('a')
              download.href = url
              download.download = `inkpad-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
              document.body.appendChild(download)
              download.click()
              download.remove()
              window.setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}>Export JSON</button>
            <button type="button" onClick={() => {
              const diagnostics = performanceDiagnosticsRef.current
              diagnostics?.reset()
              setPerformanceRows(diagnostics?.snapshot() ?? [])
              setBrowserStallSummary(diagnostics?.browserStallSnapshot() ?? null)
            }}>Reset</button>
            <button type="button" aria-label="Close performance diagnostics" onClick={() => {
              performanceDiagnosticsRef.current?.stopCapture()
              setPerformanceRows(performanceDiagnosticsRef.current?.snapshot() ?? [])
              setBrowserStallSummary(performanceDiagnosticsRef.current?.browserStallSnapshot() ?? null)
              setPerformanceCaptureActive(false)
              setPerformanceDiagnosticsOpen(false)
            }}>×</button>
          </div>
        </div>
        <div className="performance-browser-stalls">
          <span>Long tasks: {browserStallSummary ? formatBrowserStall(browserStallSummary.longTaskDuration, browserStallSummary.longTaskSupported) : 'not captured'}</span>
          <span>Long animation frames: {browserStallSummary ? formatBrowserStall(browserStallSummary.longAnimationFrameDuration, browserStallSummary.longAnimationFrameSupported) : 'not captured'}</span>
        </div>
        <section className="performance-latency-focus" aria-label="Pointer and animation frame latency P95">
          <div className="performance-latency-focus-heading">
            <strong>Pointer → frame P95</strong>
            <span>Compare delivery, RAF wait, canvas and navigator stages. The largest P95 is a clue, not a causal or digitizer-to-screen measurement.</span>
          </div>
          <div className="performance-latency-focus-grid">
            {performanceRows.map((row) => {
              const largestStage = getLargestMeasuredLatencyStage(row.metrics)
              return <article key={`focus-${row.mode}-${row.length}`}>
                <h3>{row.mode === 'raw' ? 'Raw' : 'Smooth'} · {row.length} <span>({row.strokes} strokes)</span></h3>
                <dl>
                  <div><dt>Pointer event → handler</dt><dd>{formatFocusedP95(row.metrics.sampleToHandlerMs)}</dd></div>
                  <div><dt>Render request → RAF</dt><dd>{formatFocusedP95(row.metrics.frameWaitMs)}</dd></div>
                  <div><dt>Main canvas render</dt><dd>{formatFocusedP95(row.metrics.mainCanvasMs)}</dd></div>
                  <div><dt>Minimap / page overview</dt><dd>{formatFocusedP95(row.metrics.minimapMs)} / {formatFocusedP95(row.metrics.pageOverviewMs)}</dd></div>
                  <div><dt>Latest sample → render complete</dt><dd>{formatFocusedP95(row.metrics.latestSampleToRenderMs)}</dd></div>
                </dl>
                <p>Largest measured stage: <strong>{largestStage.label}</strong>{largestStage.observations ? ` · P95 ${largestStage.p95Ms.toFixed(2)} ms` : ''}</p>
              </article>
            })}
          </div>
        </section>
        <div className="performance-table-scroll"><table>
          <thead><tr>
            <th>Mode / length</th><th>Strokes</th><th>Avg stroke ms</th><th>Active pts</th><th>Moves/s</th><th>Samples/move</th><th>Scene items</th><th>Scene pts</th><th>Zoom / DPR</th><th>Page inset %</th>
            <th>Sample→handler</th><th>Sample Δt</th><th>RAF wait</th><th>RAF gap</th><th>RAF merged</th><th>Render total</th><th>Main canvas</th><th>History ink</th><th>Active stroke</th><th>Composite</th><th>Minimap</th><th>Page view</th><th>Latest→render</th><th>Oldest→render</th>
          </tr></thead>
          <tbody>{performanceRows.map((row) => <tr key={`${row.mode}-${row.length}`}>
            <th>{row.mode === 'raw' ? 'Raw' : 'Smooth'} · {row.length}</th><td>{row.strokes}</td><td>{row.avgDurationMs.toFixed(0)}</td><td>{row.avgPoints.toFixed(0)}</td>
            <td>{row.avgPointerHz.toFixed(1)}</td><td>{row.avgSamplesPerMove.toFixed(2)}</td>
            <td>{row.avgSceneItems.toFixed(0)} ({row.avgSceneStrokes.toFixed(0)}s/{row.avgSceneRectangles.toFixed(0)}r/{row.avgSceneConnectors.toFixed(0)}c)</td><td>{row.avgScenePoints.toFixed(0)}</td>
            <td>{row.avgZoom.toFixed(2)}× / {row.avgDevicePixelRatio.toFixed(2)}</td><td>{row.pageOverviewUsePercent.toFixed(0)}</td>
            <td>{formatMetricSummary(row.metrics.sampleToHandlerMs)}</td><td>{formatMetricSummary(row.metrics.sampleIntervalMs)}</td>
            <td>{formatMetricSummary(row.metrics.frameWaitMs)}</td><td>{formatMetricSummary(row.metrics.frameGapMs)}</td><td>{row.avgMergedFrameRequests.toFixed(2)}</td>
            <td>{formatMetricSummary(row.metrics.renderAllMs)}</td><td>{formatMetricSummary(row.metrics.mainCanvasMs)}</td>
            <td>{formatMetricSummary(row.metrics.historyInkMs)}</td><td>{formatMetricSummary(row.metrics.activeStrokeRenderMs)}</td>
            <td>{formatMetricSummary(row.metrics.compositeMs)}</td><td>{formatMetricSummary(row.metrics.minimapMs)}</td>
            <td>{formatMetricSummary(row.metrics.pageOverviewMs)}</td><td>{formatMetricSummary(row.metrics.latestSampleToRenderMs)}</td>
            <td>{formatMetricSummary(row.metrics.oldestSampleToRenderMs)}</td>
          </tr>)}</tbody>
        </table></div>
        <p>Short ≤120 retained points; long &gt;120. Times are milliseconds. P95 uses up to 512 observations per stroke; maxima and total counts cover every observation. RAF gap is between requested drawing callbacks, not display refresh. Scene complexity is sampled at pen-down. Sample→render ends before browser compositing/display scanout and is not digitizer-to-photon latency. Browser stall APIs are feature-detected.</p>
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
