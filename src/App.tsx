import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { compactAfterErase } from './app/eraserCompaction'
import { createEraserStroke, eraserCursorDiameter, getEraserSweepPoints } from './eraserInput'
import { alignMoves, applyMoves, canAlign, canDistribute, distributeMoves, type AlignOp, type DistributeOp } from './arrange'
import { CONNECTOR_SNAP_TOLERANCE, arrowEndsChoice, setSelectedArrowsTwoWay, restrokeItems, selectionStrokeWidth, selectionHasOutlineWidth, selectionDash, setLineDash, hasLineDash, selectionArrowheads, selectionHasArrowheads, setArrowheads, reorderItems, type LayerMove, type LineDash, type Arrowheads, CanvasSnapshotHistory, itemCenter, angleFromCenter, hitRotateHandle, isRotatable, itemAngle, nearestConnectorAngle, rotateHandle, setItemAngle, snapAngle, createShapeBox, recolorItems, selectionColor, type ShapeKind, allCanvasItemKeys, isItemLocked, setItemsLocked, canvasItemKey, appendedItemsForRendering, canvasItemsForRendering, cloneCanvasItems, createConnector, deleteCanvasItemsByKey, detachConnectorsFromRectangles, getCanvasSelectionBounds, getRectangleResizeHandles, getResizedRectangleBounds, hitTestRectangleResizeHandle, resizeRectangleItems, resizeSelectedItems, resizeTextItem, reverseConnectorDirection, snapConnectorEndpoint, translateSelectedItems, updateConnectorRelationship, updateConnectorRouting } from './canvasModel'
import { QUICK_CONNECT_DOUBLE_CLICK_MS, hitQuickConnect, quickConnectButtons, quickConnectFits, quickConnectHint, type QuickConnectDirection } from './quickConnect'
import { CONNECTOR_CLICK_SLOP_PX, connectorHandlePositions, bendForDrag, hitConnectorHandle, hitConnectorLabel, moveConnectorEndpoint, setConnectorBend, snapEndpointTarget, soleSelectedConnector, toggleConnectorRouting, type ConnectorHandleKind } from './connectorHandles'
import { reattachConnectorSides, routeConnectors } from './connectorRoute'
import { duplicateForDrag, isDuplicateDragPress, type DragDuplicate } from './dragDuplicate'
import { similarItemKeys } from './selectSimilar'
import { canSameSize, sameSizeItems, type SameSizeMode } from './sameSize'
import { addBoundary } from './boundary'
import { canSelectConnected, connectedKeys, linkedKeys } from './selectConnected'
import { changeSelectedShapes, changeShapeChoices, shapeChoiceLabel, type ShapeChoice } from './changeShape'
import { groupStyleSource, canGroup, canUngroup, expandToGroups, groupItems, toggleGroupKeys, ungroupItems } from './grouping'
import { PASTE_OFFSET, copyItems, pasteItems, type PasteResult } from './clipboard'
import { cullTargets, loadSnapping, saveSnapping, selectionCanSnap, snapForDrag, snapTargetsFor, type Bounds, type Guide } from './snapping'
import { tidyItems, tidyScope } from './tidyLayout'
import { HLD_DEFAULT_SIZE, HLD_SHAPES, HLD_SHAPE_LABELS, createHldShape, isHldTapCreate, type HldShape } from './hldShapes'
import { describePenEvent, isPenButtonHeld, loadEraserPrefs, saveEraserPrefs } from './penButton'
import { INK_BOX_DEFAULT_HEIGHT, newInkBoxContent, INK_BOX_DEFAULT_WIDTH, INK_BOX_MIN_HEIGHT, INK_BOX_MIN_WIDTH, addStrokeToInkBox, createInkClassBox, findInkBoxAt, hitInkBoxDivider, hitInkBoxMoveGrip, inkBoxMoveGrip, moveInkBoxDivider, type InkBoxDivider } from './inkClassBox'
import type { CanvasItem, ClassBoxContent, CodeObject, ConnectorObject, ConnectorRelationshipType, Point, RectangleBounds, RectangleObject, RectangleResizeHandle, Stroke, TextObject } from './canvasModel'
import { itemHitTest, selectItemsByLasso } from './lassoSelection'
import { loadStrokeDisplayMode, saveStrokeDisplayMode, type StrokeDisplayMode } from './strokeDisplayMode'
import { MAX_PREDICTION_DISTANCE_SCREEN_PX, getPointerSamples, getPredictedPoints } from './pointerSamples'
import { shouldAppendStrokeSample } from './strokeSampling'
import { getLargestMeasuredLatencyStage, PerformanceDiagnostics, type BrowserStallSummary, type StrokeDiagnosticRow } from './performanceDiagnostics'
import { BENCHMARK_MEASURED_FRAMES, BENCHMARK_SCENE_SIZES, BENCHMARK_SEED, BENCHMARK_WARMUP_FRAMES, CONTROLLED_BENCHMARK_VIEWPORT, createBenchmarkScene, getBenchmarkEnvironment, summarizeBenchmarkSamples, type BenchmarkMode } from './performanceBenchmark'
import { applySheetLayer, drawPageTemplateOverview, getSheetLayerState, loadPageSpacing, loadPageTemplate, savePageSpacing, savePageTemplate, type PageSpacing, type PageTemplate, type SheetLayerState } from './pageTemplates'
import { loadPageBackground, PAGE_BACKGROUND_COLORS, savePageBackground, type PageBackground } from './pageBackground'
import { cleanPageName, getNextIds, normalizePageNames } from './documentFormat'
import { FilePanel } from './FilePanel'
import { COLORS, ERASER_SIZES, PERFORMANCE_DIAGNOSTICS_ENABLED, SHAPE_HOLD_JITTER_PX, UML_CONNECTOR_TOOLS, WIDTHS } from './app/appConfig'
import { thinItems, thinStroke } from './strokeThinning'
import { createTestInk, isTestInk } from './testInk'
import { createFrameRecorder, createRedrawTracker, formatDrawFlags, formatFrameSummary, formatRedrawSummary } from './app/frameRecorder'
import { createLiveStrokeState, drawLiveStrokeFrame, type LiveStrokeState } from './app/liveStroke'
import { chooseDrawMode, countVisiblePoints, DEFAULT_DIRECT_MAX_VISIBLE_POINTS, isItemVisible, viewRectOf, type DrawMode } from './app/visibleInk'
import { setConnectorLabelBackground, createFontMeasure, createTextMeasure, drawConnector, drawSideMidpointDots, drawItem as drawItemToCanvas, drawMinimapItems as drawMinimapItemsToCanvas, drawStroke as drawStrokeToCanvas, getReusableCanvasLayer, layerCanvasOptions, rawDrawingOptions } from './app/canvasRenderer'
import { formatBrowserStall, formatFocusedP95, formatMetricSummary, getDiagnosticDeviceInfo, getSceneComplexity } from './app/performanceFormat'
import { UmlConnectorIcon } from './app/UmlConnectorIcon'
import { TextEditorOverlay, type TextEditorState } from './TextEditorOverlay'
import { CodeEditorOverlay } from './CodeEditorOverlay'
import { codeEditorIsLive } from './codeEditing'
import { MAX_CODE_FONT_SIZE, MIN_CODE_FONT_SIZE, codeFontSize, createCodeObject, newCodeBlockOrigin, setCodeFontSize, setCodeLanguage, setCodeText, setCodeTheme, stepCodeFontSize } from './codeBlock'
import { onCodeHighlighterReady } from './codeHighlight'
import { ClassBoxDialog } from './ClassBoxDialog'
import { AccountButton } from './app/AccountButton'
import { ContextPanel } from './app/ContextPanel'
import { applyStyle, captureStyle, type StyleSnapshot } from './styleClipboard'
import { clearSteps, numberSteps, stepTargets } from './flowSteps'
import { buildMermaid } from './mermaidExport'
import { selectionFillColor, selectionHasFillable, setFillColor, matchingOutline } from './shapeFill'
import { withSketchSeed, withSketchSeeds } from './sketchy'
import { addLaserPoint, laserOnTouchDown, laserSegments, laserVisible, PEN_TOOL_FLAGS, pruneLaser, toolToRestoreAfterLaser, type LaserPoint, type ToolFlags } from './laserPointer'
import { createStickyNote, STICKY_HEIGHT, STICKY_WIDTH } from './stickyNote'
import { HistoryBar } from './app/HistoryBar'
import { ToolDock } from './app/ToolDock'
import { TopLeftBar } from './app/TopLeftBar'
import { HomeScreen } from './app/HomeScreen'
import { storageLabel } from './StoragePanel'
import { ZoomControls } from './app/ZoomControls'
import { EmptyCanvasHint } from './app/EmptyCanvasHint'
import { ShortcutHelp } from './app/ShortcutHelp'
import { CommandPalette } from './app/CommandPalette'
import { FindBar } from './app/FindBar'
import { replaceAcrossPages, replaceToast } from './canvasReplace'
import { sameSearchFingerprint, searchCanvas, searchFingerprint, type SearchMatch } from './canvasSearch'
import { buildDiagramOutline, outlineFileName } from './diagramOutline'
import { downloadBlob } from './documentStore'
import { diagramIdFromEntry, diagramPaletteEntries, shortcutEntryId, shortcutPaletteEntries, type PaletteEntry } from './commandPalette'
import { DESKTOP_SHORTCUTS, shortcutKeyInput } from './desktopShortcuts'
import { TemplateChooser } from './app/TemplateChooser'
import { MermaidDialog } from './app/MermaidDialog'
import { buildMermaidDiagram, isMermaidText, MAX_MERMAID_TEXT, mermaidInsertMessage } from './mermaidImport'
import { DIAGRAM_TEMPLATES, buildTemplate } from './diagramTemplates'
import { addUserTemplate, loadUserTemplates, newTemplateId, removeUserTemplate, saveUserTemplates, userTemplatesBlockedMessage, type UserTemplate } from './userTemplates'
import { statusLabel } from './FilePanel'
import { StoragePanel } from './StoragePanel'
import { CLASS_BOX_DEFAULT_STROKE_WIDTH, EMPTY_CLASS_BOX, createClassBox, fitClassBoxBounds, isEmptyClassBox, normalizeClassBoxContent, sameClassBoxContent } from './classBoxLayout'
import { buildEditedLabel, prepareEditorFit } from './textFit'
import { arrowToolConnector, centreLabelOn, followResizeLabels, isFlowBox, labelsInside, quickCreateConnected, shapeDoubleClick, type FlowDirection } from './diagramFlow'
import { setConnectorEndLabel } from './connectorEndLabels'
import { cornersChoice, setRoundedCorners } from './roundedCorners'
import { connectorLabelCentre, connectorLabelFontSize, connectorLabelPosition, labelPositionForDrag, pointOnConnectorLabel, setConnectorLabel, setConnectorLabelFontSize, setConnectorLabelPosition } from './connectorLabel'
import { TEXT_FONT_SIZES, TEXT_FONT_SIZES_DESKTOP, setTextAlign, keepAlignAnchor, stepFontSize, DEFAULT_TEXT_FONT, DEFAULT_TEXT_FONT_SIZE, LEGACY_TEXT_FONT, changeTextFont, createTextObject, isBlankText, normalizeText, updateTextObject } from './textLayout'
import { loadTextFont } from './textFonts'
import type { TextAlign, TextFontId } from './canvasModel'
import { useDocuments } from './app/useDocuments'
import { SHAPE_RECOGNITION_HOLD_MS, recognizeClosedShapeOnHold, recognizeClosedShapeStroke } from './shapeRecognition'
import { DEFAULT_ZOOM, INITIAL_ZOOM, MAX_ZOOM, MIN_ZOOM, SHEET_MIN_HEIGHT, SHEET_WIDTH, centerViewportOnPoint, nextSheetHeight, normalizeSheetHeight, sheetBoundsFor, workspaceBoundsFor, clampPointToBounds, clampTranslationToBounds, clampViewportToSheet, panViewport, rubberBandViewport, DESK_MARGIN_PX, getCoverScale, getInitialViewport, clipSegmentToBounds, fitViewportToBounds, fitViewportToBoundsInset, DESKTOP_FIT_INSETS, getMinimapGeometry, isPointWithinBounds, minimapToCanvasPoint, type MinimapGeometry, type ViewBounds, type Viewport, screenToCanvasPoint } from './viewport'
import { itemBottom, sheetHeightForItems } from './sheetGrowth'
import { MAX_PAGES, canAddPage, clampPageIndex, duplicatePageItems, duplicatedPageName, insertPageAfter, insertPageAt, movePage, indexAfterMove, removePageAt, writeLastPage } from './pages'
import { PageControls, PageUndoBar } from './app/PageControls'
import { PageOverview } from './app/PageOverview'
import { PenColors } from './app/PenColors'
import { createTouchNavigator, type NavigationSettings } from './touchNavigator'
import { loadNavigationSettings, loadTapUndo, saveNavigationSettings, saveTapUndo } from './navigationSettings'
import { canStartCanvasGesture, canvasCursor, chipBlockLayout, clampMenuPosition, contextMenuHeight, contextMenuRows, CONTEXT_MENU_WIDTH, loadLineDashDefault, saveLineDashDefault, clickPairOnDown, clickPairOnEnd, clickPairOnMove, clickPairOnUp, labelDoubleClickDecision, clickItemsUnchanged, type ClickPair, clickSelectTarget, contextMenuEntries, doubleClickTarget, editTargetForSelection, type ContextMenuAction, edgeHoldDecision, edgeBandBox, EDGE_HOLD_MS, escapeAction, alwaysPreventsDefault, hitTarget, hoverTarget, rectanglePicked, nudgeStartsNewStep, normalizeSelection, isTypingTarget, keyCommand, loadInputMode, loadToolLock, saveToolLock, marqueeSelection, pointerPressure, rectFromPoints, saveInputMode, shiftClickTarget, spaceIsPanKey, startsMousePan, wheelViewport, type SelectionState, type ClickTool, type HitTarget, type InputMode, type KeyCommand } from './desktopInput'


/** How long a toast stays on screen. */
const TOAST_MS = 1800
const DOUBLE_TAP_MS = 400
/** The eraser circle hides this long after the last pen event (lifting the pen away sends none). */
const ERASER_CURSOR_QUIET_MS = 350
// While a stroke is being written the minimap is not touched (it updates after pen-up). Otherwise the viewport box and the saved ink
// picture are redrawn at once on every frame (cheap), while the ink itself is redrawn only after a quiet moment (heavy).
// After a stroke ends (or any other change) the minimap waits this long without a new stroke before it redraws all the ink,
// so a big redraw never lands on the start of the next stroke.
const MINIMAP_IDLE_DELAY_MS = 600
const GESTURE_SETTLE_MS = 140
/** How long the view takes to spring back after being stretched past its limit. */
const SPRING_BACK_MS = 260
const ZOOM_STEP = 1.25
const DELETED_PAGE_UNDO_MS = 8000

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
// Pen strokes over the saved page picture (cached path) repaint the whole page canvas every frame. Tablet test: repainting only
// the box around the stroke made frames late (22/33/44 ms gaps, 97% slow); a full repaint gave 11/11/11, 0% slow.
// ?dirty=box brings the box repaint back.
const DIRTY_RECT_ENABLED = DRAW_SWITCHES.get('dirty') === 'box'
// ?layerdom=on puts the off-screen layer canvases on the page, invisible (tests whether detached canvases are drawn slowly).
const LAYERS_ON_PAGE = DRAW_SWITCHES.get('layerdom') === 'on'
layerCanvasOptions.attachToPage = LAYERS_ON_PAGE
// ?dpr=N draws the page canvas with at most N pixels per CSS pixel (the tablet uses 2.125), to test whether canvas size is the cost.
const DPR_CAP = Number(DRAW_SWITCHES.get('dpr'))
const canvasPixelRatio = () => Math.max(1, Math.min(window.devicePixelRatio || 1, DPR_CAP > 0 ? DPR_CAP : Infinity))
// ?debug=on shows a small readout of the drawing path and the amount of ink (also on the deployed site, for tablet checks).
const STROKE_THINNING_ENABLED = DRAW_SWITCHES.get('thin') !== 'off'
const PEN_BUTTON_DEBUG = DRAW_SWITCHES.get('penbutton') === 'show'
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

type DragDup = DragDuplicate & { before: SelectionState; selected?: boolean }

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
  // What the saved minimap ink picture was drawn for (canvas size and map geometry); the ink is redrawn when this changes.
  const minimapInkKeyRef = useRef('')
  const minimapIdleTimerRef = useRef<number | null>(null)
  // True while a pinch or three-finger pan is moving: the page is shown as a moved copy of a saved picture, then redrawn sharply once it settles.
  const viewportGestureRef = useRef(false)
  const gestureSettleTimerRef = useRef<number | null>(null)
  const springFrameRef = useRef<number | null>(null)
  const toolbarRef = useRef<HTMLElement>(null)
  const umlToolboxRef = useRef<HTMLDivElement>(null)
  const eraserControlRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<CanvasItem[]>([])
  const historyRef = useRef(new CanvasSnapshotHistory())
  const performanceDiagnosticsRef = useRef<PerformanceDiagnostics | null>(null)
  if (PERFORMANCE_DIAGNOSTICS_ENABLED && performanceDiagnosticsRef.current === null) performanceDiagnosticsRef.current = new PerformanceDiagnostics()
  const activeStrokeRef = useRef<Stroke | null>(null)
  const eraserCursorRef = useRef<HTMLDivElement>(null)
  const eraserCursorTimerRef = useRef<number | null>(null)
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
  const activeDragRef = useRef<{ pointerId: number; itemKey: string; start: Point; originalItems: CanvasItem[]; moved: boolean; editTextId?: number | null; editClassBoxId?: number | null; duplicate?: boolean; dup?: DragDup } | null>(null)
  const textTapRef = useRef<{ pointerId: number; point: Point } | null>(null)
  // Desktop double-click on empty canvas: the two clicks so far, and the items and history from before the first one.
  const clickPairRef = useRef<ClickPair | null>(null)
  const clickBeforeRef = useRef<{ items: CanvasItem[]; history: ReturnType<CanvasSnapshotHistory['capture']>; owner: CanvasSnapshotHistory } | null>(null)
  const classTapRef = useRef<{ pointerId: number; point: Point } | null>(null)
  /** The ink class box the current pen/eraser stroke started inside: the stroke is stored in the box. */
  const activeStrokeBoxRef = useRef<number | null>(null)
  const activeDividerRef = useRef<{ pointerId: number; rectangleId: number; which: InkBoxDivider; originalItems: CanvasItem[]; moved: boolean } | null>(null)
  const activeResizeRef = useRef<{ pointerId: number; rectangleId: number | null; selectedKeys: Set<string> | null; handle: RectangleResizeHandle; start: Point; originalBounds: RectangleBounds; originalItems: CanvasItem[]; moved: boolean; created?: boolean; labelKeys?: string[] } | null>(null)
  /** A rotate-handle drag on the single selected label or plain shape. */
  const activeRotateRef = useRef<{ pointerId: number; key: string; originalItems: CanvasItem[]; moved: boolean } | null>(null)
  /** A drag or click on a handle of the single selected connector: `which` is an end, or the middle dot (a click toggles straight/elbow). `saved` = its one history step was recorded. `target` = box highlighted as the snap target. */
  const activeEndpointRef = useRef<{ pointerId: number; pointerType: string; id: number; which: ConnectorHandleKind | 'label'; startScreen: Point; startPoint: Point; startBend: number; startLabelPosition: number; routedConnector: ConnectorObject | null; originalItems: CanvasItem[]; dragged: boolean; saved: boolean; target: number | null } | null>(null)
  const activeLassoRef = useRef<{ pointerId: number; points: Point[] } | null>(null)
  const lassoDragRef = useRef<{ pointerId: number; start: Point; keys: Set<string>; originalItems: CanvasItem[]; moved: boolean; duplicate?: boolean; dup?: DragDup } | null>(null)
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
  const redrawReadoutRef = useRef<HTMLDivElement>(null)
  const redrawTrackerRef = useRef(createRedrawTracker())
  const initialViewDoneRef = useRef(false)
  const viewportRef = useRef<Viewport>({ scale: INITIAL_ZOOM, offsetX: 0, offsetY: 0 })
  const [navigationSettings, setNavigationSettings] = useState<NavigationSettings>(() => loadNavigationSettings())
  const navigationSettingsRef = useRef(navigationSettings)
  // Per-device input mode (menu switch). Tablet, the default, leaves the canvas exactly as it always was; Desktop lets a mouse draw and edit.
  const [inputMode, setInputMode] = useState<InputMode>(() => loadInputMode())
  const [toolLock, setToolLock] = useState<boolean>(() => loadToolLock())
  const toolLockRef = useRef(toolLock)
  toolLockRef.current = toolLock
  const inputModeRef = useRef(inputMode)
  // The zoom lock is a tablet-only control: in Desktop mode a lock saved earlier is ignored (and its switch is hidden), so it can never trap the menu.
  const zoomLockActive = navigationSettings.zoomLocked && inputMode !== 'desktop'
  navigationSettingsRef.current = zoomLockActive === navigationSettings.zoomLocked ? navigationSettings : { ...navigationSettings, zoomLocked: zoomLockActive }
  inputModeRef.current = inputMode
  const updateInputMode = (mode: InputMode) => {
    inputModeRef.current = mode
    setInputMode(mode)
    saveInputMode(mode)
  }
  // True while the current canvas gesture was started by a mouse (hold-to-snap is off for it, unless the Shapes tool is on).
  const mouseGestureRef = useRef(false)
  // Set every render: selects the arrow connector the Arrow tool just made (finishStroke is memoised and must not close over render state).
  const selectNewConnectorRef = useRef<(key: string) => void>(() => {})
  // Desktop pan: a middle-button or Space + left drag moves the view (Desktop mode only).
  const mousePanRef = useRef<{ pointerId: number; start: Point; startViewport: Viewport } | null>(null)
  const spaceHeldRef = useRef(false)
  // Step 7: the item the mouse is over (Desktop mode; only a change redraws), and the pen's edge hold (select a box by holding on its edge).
  const hoverKeyRef = useRef<string | null>(null)
  // Desktop quick-connect buttons: the hovered one, and the press in progress (a click, not a drag, makes the connected shape).
  const quickHoverRef = useRef<QuickConnectDirection | null>(null)
  const quickClickAtRef = useRef(-Infinity)
  const activeQuickRef = useRef<{ pointerId: number; direction: QuickConnectDirection; startScreen: Point; dragged: boolean } | null>(null)
  const hoverPointRef = useRef<Point | null>(null)
  // Desktop paste target: the last mouse position over the canvas (screen coordinates, converted at paste time so a pan or zoom keeps it right); null while the mouse is off the canvas.
  const cursorPointRef = useRef<Point | null>(null)
  const contextMenuPointRef = useRef<Point | null>(null)
  const hoverFrameRef = useRef<number | null>(null)
  // Step 8: the marquee being dragged with the select tool (Desktop mouse). `base` is what Shift keeps.
  const activeMarqueeRef = useRef<{ pointerId: number; start: Point; current: Point; shift: boolean; base: Set<string>; before: Set<string> } | null>(null)
  // Step 9: when the last arrow-key nudge happened (a burst is one undo step).
  const lastNudgeAtRef = useRef<number | null>(null)
  // Step 10: the in-app clipboard (a deep copy of the copied items; never the system clipboard, never saved). It outlives page changes,
  // so a paste works on any page, and in another diagram opened later; every paste takes fresh ids from the shared counters.
  const clipboardRef = useRef<CanvasItem[]>([])
  const pasteCountRef = useRef(0)
  const [clipboardCount, setClipboardCount] = useState(0)
  // Step 11: the right-click menu (Desktop only), at the pointer in screen coordinates.
  // The pointer type of the latest canvas press: a double-tap by a finger or pen is not a mouse double-click.
  const lastPointerTypeRef = useRef('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lockedKey: string | null } | null>(null)
  const contextMenuRef = useRef(contextMenu)
  contextMenuRef.current = contextMenu
  const contextMenuElementRef = useRef<HTMLDivElement>(null)
  // A small message at the bottom centre (Desktop mode only; the tablet UI stays quiet). It is always position: fixed, so it never shifts the layout.
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const showToast = (text: string) => {
    if (inputModeRef.current !== 'desktop') return
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    setToast((current) => ({ id: (current?.id ?? 0) + 1, text }))
    toastTimerRef.current = window.setTimeout(() => { toastTimerRef.current = null; setToast(null) }, TOAST_MS)
  }
  // The tap-undo confirmation shows in every mode (the tablet UI has no other sign that the tap did something).
  const showTapToast = (text: string) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    setToast((current) => ({ id: (current?.id ?? 0) + 1, text }))
    toastTimerRef.current = window.setTimeout(() => { toastTimerRef.current = null; setToast(null) }, TOAST_MS)
  }
  const edgeHoldRef = useRef<{ pointerId: number; boxId: number; start: Point; startedAt: number; timer: number } | null>(null)
  // Step 12: snap and alignment guides while dragging boxes and labels. The setting is per device (default on) and works in both input modes.
  const [snapping, setSnapping] = useState(() => loadSnapping())
  const snappingRef = useRef(snapping)
  snappingRef.current = snapping
  const updateSnapping = (on: boolean) => {
    snappingRef.current = on
    setSnapping(on)
    saveSnapping(on)
  }
  // What a drag snaps to (read once when it starts) and the guide lines to draw. Guides live only here: never items, history or saved data.
  const snapStateRef = useRef<{ pointerId: number; moving: Bounds | null; targets: Bounds[] } | null>(null)
  const guidesRef = useRef<Guide[]>([])
  const [tapUndo, setTapUndo] = useState(() => loadTapUndo())
  const tapUndoRef = useRef(tapUndo)
  tapUndoRef.current = tapUndo
  const touchNavRef = useRef<ReturnType<typeof createTouchNavigator> | null>(null)
  // Laser pointer (transient presenting tool): the trail lives only in these refs and on its own overlay canvas, never in items, history or the saved diagram.
  // Present mode: one class on the app root hides the dock, panels, top bar, minimap, page and zoom controls. Plain state, never saved.
  const [presentMode, setPresentMode] = useState(false)
  const presentModeRef = useRef(false)
  presentModeRef.current = presentMode
  const [laserMode, setLaserMode] = useState(false)
  const laserModeRef = useRef(false)
  laserModeRef.current = laserMode
  const laserCanvasRef = useRef<HTMLCanvasElement>(null)
  const laserTrailRef = useRef<LaserPoint[]>([])
  const laserPointerRef = useRef<number | null>(null)
  const laserPointerTypeRef = useRef<string | null>(null)
  const laserFrameRef = useRef<number | null>(null)
  // While the laser is on a single finger draws the trail, so one-finger pan is off; the second finger still goes to navigation (pinch, three-finger pan).
  if (touchNavRef.current === null) touchNavRef.current = createTouchNavigator(() => laserModeRef.current ? { ...navigationSettingsRef.current, oneFingerPan: false } : navigationSettingsRef.current)
  const touchNav = touchNavRef.current
  const updateNavigationSettings = (patch: Partial<NavigationSettings>) => {
    const next = { ...navigationSettingsRef.current, ...patch }
    navigationSettingsRef.current = next
    setNavigationSettings(next)
    saveNavigationSettings(next)
  }
  const minimapDragPointerRef = useRef<{ pointerId: number; bounds: ViewBounds; geometry: MinimapGeometry } | null>(null)
  const umlToolboxDragRef = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number; moved: boolean } | null>(null)
  const suppressMinimizedToolboxClickRef = useRef(false)
  const [color, setColor] = useState(COLORS[0].value)
  const [width, setWidth] = useState(WIDTHS[0])
  const [strokeDisplayMode, setStrokeDisplayMode] = useState<StrokeDisplayMode>(() => loadStrokeDisplayMode())
  const [pageTemplate, setPageTemplate] = useState<PageTemplate>(() => loadPageTemplate())
  const [pageBackground, setPageBackground] = useState<PageBackground>(() => loadPageBackground())
  const [pageSpacing, setPageSpacing] = useState<PageSpacing>(() => loadPageSpacing())
  const pageSpacingRef = useRef(pageSpacing)
  /** Hand-drawn style of the open diagram (saved in the file; off by default). */
  const [sketchy, setSketchy] = useState(false)
  const sketchyRef = useRef(false)
  sketchyRef.current = sketchy
  pageSpacingRef.current = pageSpacing
  const pageTemplateRef = useRef(pageTemplate)
  const pageBackgroundRef = useRef(pageBackground)
  pageTemplateRef.current = pageTemplate
  pageBackgroundRef.current = pageBackground
  // The page starts at SHEET_MIN_HEIGHT and grows downward when ink is lifted near its bottom (see growSheetFor).
  const [sheetHeight, setSheetHeight] = useState(SHEET_MIN_HEIGHT)
  const sheetHeightRef = useRef(sheetHeight)
  const sheetBoundsRef = useRef(sheetBoundsFor(sheetHeight))
  const workspaceBoundsRef = useRef(workspaceBoundsFor(sheetHeight))
  // Pages of the open diagram. Only the page on screen is live: its items are strokesRef and its undo history is historyRef.
  // The slot of the page on screen is stale on purpose; it is filled in when the page is left. Other pages are plain data.
  const pagesRef = useRef<Array<{ items: CanvasItem[]; history: CanvasSnapshotHistory | null; name?: string }>>([{ items: [], history: null }])
  const pageIndexRef = useRef(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  // Page names live in the page slots (name?: string); this only makes the screen redraw when one changes.
  const [, setPageNamesTick] = useState(0)

  const {
    filePanelOpen, setFilePanelOpen, refreshLibrary, refreshLibraryIfStale, thumbnails, captureThumbnail, renderPageThumbnail, starredIds, toggleStar, docTitle, saveStatus, fileNotice, setFileNotice, library, folders, currentDocId,
    storage, driveProfile, storagePanelOpen, setStoragePanelOpen, chooseDeviceFolder, reconnectDeviceFolder, connectDrive, useBrowserStorage, copyBrowserToDevice,
    newDiagramIn, createFolder, renameFolder, deleteFolder, releaseFolderTarget, moveDiagram,
    scheduleAutosave: scheduleAutosaveBase, newDiagram, openStoredDiagram, deleteStoredDiagram, renameDiagram, renameStoredDiagram, copyStoredDiagram,
    exportDocumentFile, importDocumentFile, exportSvgFile, exportPngFile, copyPngToClipboard, transparentExport, setTransparentExport, exportToNotebookLm, exportBusy,
  } = useDocuments({
    getItems: () => strokesRef.current,
    getPageItems: () => pagesRef.current.map((slot, index) => (index === pageIndexRef.current ? strokesRef.current : slot.items)),
    getPageNames: () => pagesRef.current.map((slot) => slot.name ?? ''),
    getPage: () => ({ template: pageTemplateRef.current, background: pageBackgroundRef.current, spacing: pageSpacingRef.current, sheetHeight: sheetHeightRef.current, sketchy: sketchyRef.current }),
    isInputActive: () => activeStrokeRef.current !== null || activePointerRef.current !== null || liveCodeEditor(),
    loadDocument: (loaded, startPage) => {
      resetInteractionState()
      dismissDeletedPage()
      // Every page is cloned as plain data; the page to open on (the one you left, remembered on this device) becomes the live one.
      const loadedNames = normalizePageNames(loaded.pageNames, 1 + (loaded.pages?.length ?? 0))
      pagesRef.current = [{ items: cloneCanvasItems(loaded.items), history: null }, ...(loaded.pages ?? []).map((page) => ({ items: cloneCanvasItems(page.items), history: null }))].map((slot, index) => (loadedNames[index] ? { ...slot, name: loadedNames[index] } : slot))
      const openIndex = clampPageIndex(startPage, pagesRef.current.length)
      strokesRef.current = pagesRef.current[openIndex].items
      pageIndexRef.current = openIndex
      setPageIndex(openIndex)
      setPageCount(pagesRef.current.length)
      setPageNamesTick((tick) => tick + 1)
      const nextIds = getNextIds(pagesRef.current.flatMap((slot) => slot.items))
      nextStrokeIdRef.current = nextIds.stroke
      nextRectangleIdRef.current = nextIds.rectangle
      nextConnectorIdRef.current = nextIds.connector
      nextTextIdRef.current = nextIds.text
      historyRef.current = new CanvasSnapshotHistory()
      setCanUndo(false)
      setCanRedo(false)
      setHasInk(strokesRef.current.length > 0)
      pageTemplateRef.current = loaded.page.template
      pageBackgroundRef.current = loaded.page.background
      pageSpacingRef.current = loaded.page.spacing ?? 'standard'
      setPageSpacing(loaded.page.spacing ?? 'standard')
      sketchyRef.current = loaded.page.sketchy === true
      setSketchy(loaded.page.sketchy === true)
      setPageTemplate(loaded.page.template)
      setPageBackground(loaded.page.background)
      // A saved height, grown if the content reaches past it (never shrunk).
      applySheetHeight(sheetHeightForItems(strokesRef.current, normalizeSheetHeight(loaded.page.sheetHeight)))
      renderAll()
      openAtDefaultView()
    },
  })
  /** Drops everything in progress on the canvas (strokes, drags, selection, text editing) before another diagram or page is shown. */
  const resetInteractionState = () => {
    clearShapeHoldTimer()
    activeStrokeRef.current = null
    activeConnectorRef.current = null
    activeResizeRef.current = null
    activeRotateRef.current = null
    activeEndpointRef.current = null
    activeQuickRef.current = null
    quickHoverRef.current = null
    activeDividerRef.current = null
    activeStrokeBoxRef.current = null
    shapePreviewRef.current = null
    activeLassoRef.current = null
    lassoDragRef.current = null
    activeMarqueeRef.current = null
    guidesRef.current = []
    snapStateRef.current = null
    pasteCountRef.current = 0
    activePointerRef.current = null
    activeObjectEraserRef.current = null
    holdAnchorRef.current = null
    updateSelectedItems([])
    setSelectedRectangle(null)
    textEditorRef.current = null
    textTapRef.current = null
    classTapRef.current = null
    setTextEditor(null)
    setClassBoxEditor(null)
    codeEditorRef.current = null
    setCodeEditor(null)
  }

  /** Shows the page at `index` of pagesRef: its items and its own undo history become the live ones. */
  const showPageSlot = (index: number) => {
    const slot = pagesRef.current[index]
    strokesRef.current = slot.items
    historyRef.current = slot.history ?? new CanvasSnapshotHistory()
    slot.history = null
    pageIndexRef.current = index
    setPageIndex(index)
    setPageCount(pagesRef.current.length)
    setPageNamesTick((tick) => tick + 1)
    setCanUndo(historyRef.current.canUndo)
    setCanRedo(historyRef.current.canRedo)
    setHasInk(strokesRef.current.length > 0)
    renderAll()
  }

  /** Remembers the page on screen (its items and undo history) in its slot. Call before showing another page. */
  const stashCurrentPage = () => {
    const name = pagesRef.current[pageIndexRef.current]?.name
    pagesRef.current[pageIndexRef.current] = { items: strokesRef.current, history: historyRef.current, ...(name ? { name } : {}) }
  }

  // Reopening a saved diagram lands on the page you left (kept on this device, not in the diagram).
  useEffect(() => {
    if (currentDocId) writeLastPage(currentDocId, pageIndex)
  }, [currentDocId, pageIndex])

  const penBusy = () => activePointerRef.current !== null || activeStrokeRef.current !== null

  const goToPage = (target: number) => {
    const next = clampPageIndex(target, pagesRef.current.length)
    if (next === pageIndexRef.current || penBusy()) return
    if (textEditorRef.current) commitTextEditor()
    dismissDeletedPage()
    stashCurrentPage()
    resetInteractionState()
    showPageSlot(next)
  }

  const addPage = () => {
    if (penBusy()) return
    // A new page needs something on this one first, so empty pages are not stacked by accident.
    if (strokesRef.current.length === 0) return
    if (!canAddPage(pagesRef.current.length)) {
      setFileNotice(`A diagram can have up to ${MAX_PAGES} pages.`)
      return
    }
    if (textEditorRef.current) commitTextEditor()
    dismissDeletedPage()
    stashCurrentPage()
    resetInteractionState()
    pagesRef.current = insertPageAfter(pagesRef.current, pageIndexRef.current, { items: [], history: null })
    showPageSlot(pageIndexRef.current + 1)
    scheduleAutosave()
  }

  /** Duplicate page: a copy of the page on screen goes right after it (fresh ids, connectors on the copied boxes, an empty undo history like an added page) and is shown. */
  const duplicatePage = () => {
    if (penBusy()) return
    if (!canAddPage(pagesRef.current.length)) {
      setFileNotice(`A diagram can have up to ${MAX_PAGES} pages.`)
      return
    }
    if (textEditorRef.current) commitTextEditor()
    dismissDeletedPage()
    stashCurrentPage()
    resetInteractionState()
    const copy = duplicatePageItems(strokesRef.current, { stroke: nextStrokeIdRef.current, rectangle: nextRectangleIdRef.current, connector: nextConnectorIdRef.current, text: nextTextIdRef.current })
    nextStrokeIdRef.current = copy.counters.stroke
    nextRectangleIdRef.current = copy.counters.rectangle
    nextConnectorIdRef.current = copy.counters.connector
    nextTextIdRef.current = copy.counters.text
    pagesRef.current = insertPageAfter(pagesRef.current, pageIndexRef.current, { items: copy.items, history: null, ...(duplicatedPageName(pagesRef.current[pageIndexRef.current]?.name) ? { name: duplicatedPageName(pagesRef.current[pageIndexRef.current]?.name) } : {}) })
    showPageSlot(pageIndexRef.current + 1)
    scheduleAutosave()
    showToast(`Page duplicated (now page ${pageIndexRef.current + 1})${copy.skipped > 0 ? `; ${copy.skipped} ${copy.skipped === 1 ? 'item' : 'items'} this version can't copy ${copy.skipped === 1 ? 'was' : 'were'} left out` : ''}`)
  }

  // The page deleted last, kept (items and its undo history) for a few seconds so the Undo bar can put it back.
  const deletedPageRef = useRef<{ index: number; slot: { items: CanvasItem[]; history: CanvasSnapshotHistory; name?: string } } | null>(null)
  const deletedPageTimerRef = useRef<number | null>(null)
  const [deletedPageNumber, setDeletedPageNumber] = useState<number | null>(null)
  function dismissDeletedPage() {
    if (deletedPageTimerRef.current !== null) window.clearTimeout(deletedPageTimerRef.current)
    deletedPageTimerRef.current = null
    deletedPageRef.current = null
    setDeletedPageNumber(null)
  }

  const deletePage = () => {
    if (penBusy() || pagesRef.current.length <= 1) return
    if (textEditorRef.current) cancelTextEditor()
    resetInteractionState()
    const removedIndex = pageIndexRef.current
    const removedName = pagesRef.current[removedIndex]?.name
    const removedSlot = { items: strokesRef.current, history: historyRef.current, ...(removedName ? { name: removedName } : {}) }
    const removed = removePageAt(pagesRef.current, removedIndex)
    pagesRef.current = removed.pages
    showPageSlot(removed.index)
    scheduleAutosave()
    dismissDeletedPage()
    deletedPageRef.current = { index: removedIndex, slot: removedSlot }
    setDeletedPageNumber(removedIndex + 1)
    deletedPageTimerRef.current = window.setTimeout(dismissDeletedPage, DELETED_PAGE_UNDO_MS)
  }

  const [pageOverviewOpen, setPageOverviewOpen] = useState(false)
  /** Names a page (empty text clears it). Document metadata, not canvas undo history: it is just saved. */
  const renamePage = (index: number, raw: string) => {
    const slot = pagesRef.current[index]
    if (!slot) return
    const name = cleanPageName(raw)
    if (name === (slot.name ?? '')) return
    if (name) slot.name = name
    else delete slot.name
    setPageNamesTick((tick) => tick + 1)
    scheduleAutosave()
  }
  /**
   * Moves page `from` to position `to`: its items and its undo/redo history travel together (they are one slot), the page on screen stays on
   * screen (pageIndex follows it), and the new order is saved. Not part of canvas undo, like add/delete page; move it back with the buttons.
   * A pending "Page deleted" undo bar is dismissed first (its remembered position would be stale after a reorder); the deleted page is then gone for good.
   */
  const movePageTo = (from: number, to: number) => {
    const count = pagesRef.current.length
    const target = clampPageIndex(to, count)
    if (penBusy() || from < 0 || from >= count || target === from) return
    if (textEditorRef.current) commitTextEditor()
    dismissDeletedPage()
    stashCurrentPage()
    resetInteractionState()
    const current = pageIndexRef.current
    pagesRef.current = movePage(pagesRef.current, from, target)
    const shown = indexAfterMove(current, from, target)
    showPageSlot(shown)
    if (currentDocId) writeLastPage(currentDocId, shown)
    scheduleAutosave()
  }

  const undoDeletePage = () => {
    const deleted = deletedPageRef.current
    if (!deleted || penBusy()) return
    if (!canAddPage(pagesRef.current.length)) {
      setFileNotice(`A diagram can have up to ${MAX_PAGES} pages.`)
      return
    }
    if (textEditorRef.current) commitTextEditor()
    stashCurrentPage()
    resetInteractionState()
    const at = Math.min(deleted.index, pagesRef.current.length)
    pagesRef.current = insertPageAt(pagesRef.current, at, { items: deleted.slot.items, history: deleted.slot.history, ...(deleted.slot.name ? { name: deleted.slot.name } : {}) })
    dismissDeletedPage()
    showPageSlot(at)
    scheduleAutosave()
  }

  /** Saves soon, and once the change is in place checks whether the page needs to grow (callers often schedule the save just before adding the item). */
  const scheduleAutosave = () => {
    scheduleAutosaveBase()
    queueMicrotask(growSheetForNewestItem)
  }
  const [eraser, setEraser] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [shapeMode, setShapeMode] = useState(false)
  /** Desktop direct shape tools: drag a rectangle, diamond or ellipse, or a straight line or arrow. Null when none is active. */
  const [shapeTool, setShapeTool] = useState<ShapeKind | 'arrow' | 'line' | null>(null)
  const shapeToolRef = useRef<ShapeKind | 'arrow' | 'line' | null>(null)
  shapeToolRef.current = shapeTool
  const recolorSessionRef = useRef(false)
  const widthSessionRef = useRef(false)
  /** Desktop shape tools: the line style new shapes, lines and arrows get ('solid' = none stored). */
  const [lineDashDefault, setLineDashDefaultState] = useState<'solid' | LineDash>(() => loadLineDashDefault())
  const lineDashDefaultRef = useRef(lineDashDefault)
  lineDashDefaultRef.current = lineDashDefault
  const [, bumpSelectionColor] = useState(0)
  const [selectionMode, setSelectionMode] = useState(false)
  const [textMode, setTextMode] = useState(false)
  const [classMode, setClassMode] = useState(false)
  /** With classMode on: true = the hand-written (ink) class box tool, false = the typed class box tool. */
  const [inkClassTool, setInkClassTool] = useState(false)
  // Which HLD shape the Insert tray picked (only meaningful while the ink class tool is on); null = the class box.
  const [hldShapeTool, setHldShapeTool] = useState<HldShape | null>(null)
  const [classBoxEditor, setClassBoxEditor] = useState<{ rectangleId: number | null; x: number; y: number; content: ClassBoxContent } | null>(null)
  const [textSize, setTextSize] = useState(DEFAULT_TEXT_FONT_SIZE)
  // The font for new labels (Excalifont to start with) and the single label that is selected, if any (its font is shown and can be changed).
  const [textFontId, setTextFontId] = useState<TextFontId>(DEFAULT_TEXT_FONT)
  const [selectedTextId, setSelectedTextId] = useState<number | null>(null)
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null)
  const [codeEditor, setCodeEditor] = useState<{ id: number } | null>(null)
  const codeEditorRef = useRef<{ id: number } | null>(null)
  const codeEditorValueRef = useRef('')
  const [lassoMode, setLassoMode] = useState(false)
  const [connectorMode, setConnectorMode] = useState(false)
  const [umlConnectorType, setUmlConnectorType] = useState<ConnectorRelationshipType | null>(null)
  const [umlToolboxPosition, setUmlToolboxPosition] = useState<{ left: number; top: number } | null>(null)
  const [umlToolboxMinimized, setUmlToolboxMinimized] = useState(true)
  const [selectedItemCount, setSelectedItemCount] = useState(0)
  const [selectedConnectorId, setSelectedConnectorId] = useState<number | null>(null)
  const [selectedConnectorType, setSelectedConnectorType] = useState<ConnectorRelationshipType | null>(null)
  const [selectedConnectorReversed, setSelectedConnectorReversed] = useState(false)
  const [selectedConnectorElbow, setSelectedConnectorElbow] = useState(false)
  const [selectedConnectorTwoWay, setSelectedConnectorTwoWay] = useState(false)
  const [selectedConnectorLabel, setSelectedConnectorLabel] = useState(false)
  // The eraser mode and size used last are remembered (saved), so holding the S Pen button erases the way the person last chose.
  const [savedEraser] = useState(() => loadEraserPrefs())
  const [eraserSize, setEraserSize] = useState(savedEraser.size)
  const [objectEraser, setObjectEraser] = useState(savedEraser.whole)
  useEffect(() => { saveEraserPrefs({ whole: objectEraser, size: eraserSize }) }, [objectEraser, eraserSize])
  const penButtonEraseRef = useRef(false)
  const penButtonReadoutRef = useRef<HTMLDivElement>(null)
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
  const penModeActive = !laserMode && !eraser && !shapeMode && shapeTool === null && !selectionMode && !lassoMode && !connectorMode && !textMode && !classMode && umlConnectorType === null

  const getCurrentMinimapBounds = useCallback((): ViewBounds => {
    return { ...sheetBoundsRef.current }
  }, [])

  const updateSelectedItems = (keys: string[]) => {
    selectedKeysRef.current = new Set(keys)
    setSelectedItemCount(keys.length)
    const connectorId = keys.length === 1 && keys[0].startsWith('connector:') ? Number(keys[0].slice('connector:'.length)) : null
    const connector = connectorId === null ? null : strokesRef.current.find((item): item is ConnectorObject => item.kind === 'connector' && item.id === connectorId)
    setSelectedConnectorId(connector?.id ?? null)
    setSelectedTextId(keys.length === 1 && keys[0].startsWith('text:') ? Number(keys[0].slice('text:'.length)) : null)
    setSelectedConnectorType(connector?.relationshipType ?? null)
    setSelectedConnectorReversed(connector?.reversed ?? false)
    setSelectedConnectorElbow(connector?.routing === 'elbow')
    setSelectedConnectorTwoWay(connector?.twoWay === true)
    setSelectedConnectorLabel(!!connector?.label)
  }

  const reconcileSelectedItems = () => {
    const available = new Set(strokesRef.current.map(canvasItemKey))
    updateSelectedItems([...selectedKeysRef.current].filter((key) => available.has(key)))
    // A single selected box lives in its own ref: it must go too when undo or delete removed the box.
    if (selectedRectangleIdRef.current !== null && !available.has(`rectangle:${selectedRectangleIdRef.current}`)) setSelectedRectangle(null)
  }

  const saveHistory = () => {
    if (deletedPageRef.current) dismissDeletedPage() // drawing again settles the delete
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
    if (relationshipType !== 'directed-association') setSelectedConnectorTwoWay(false)
    if (relationshipType === 'association') setSelectedConnectorReversed(false)
    renderAll()
  }

  useEffect(() => {
    if (connectorMode || eraser || shapeMode || selectionMode || lassoMode || textMode || classMode) setUmlConnectorType(null)
  }, [connectorMode, eraser, shapeMode, selectionMode, lassoMode, textMode, classMode])
  useEffect(() => {
    if (connectorMode || eraser || shapeMode || selectionMode || lassoMode || textMode || classMode) setShapeTool(null)
  }, [connectorMode, eraser, shapeMode, selectionMode, lassoMode, textMode, classMode])

  useEffect(() => {
    setUmlConnectorType(null)
  }, [color])

  const changeSelectedConnectorRouting = (elbow: boolean) => {
    if (selectedConnectorId === null || selectedConnectorElbow === elbow) return
    saveHistory()
    strokesRef.current = updateConnectorRouting(strokesRef.current, selectedConnectorId, elbow ? 'elbow' : 'straight')
    setSelectedConnectorElbow(elbow)
    renderAll()
  }

  /** After a drag: connectors attached to the boxes that moved may switch to facing sides when that makes them clearly shorter (same undo step as the drag). */
  const switchConnectorSides = (keys: ReadonlySet<string>) => {
    const movedIds = new Set<number>()
    for (const key of keys) if (key.startsWith('rectangle:')) movedIds.add(Number(key.slice('rectangle:'.length)))
    const next = reattachConnectorSides(strokesRef.current, movedIds)
    if (next === strokesRef.current) return
    strokesRef.current = next
    scheduleAutosave()
    renderAll()
  }

  /** Tidy button: arranges the selected class boxes (two or more selected) or all of them. One undo step; nothing happens when they are already tidy. */
  const tidyDiagram = () => {
    const scope = tidyScope(strokesRef.current, selectedKeysRef.current)
    const next = tidyItems(strokesRef.current, scope.ids, workspaceBoundsRef.current)
    if (next === strokesRef.current) return
    saveHistory()
    strokesRef.current = next
    renderAll()
  }

  /** Arrow ends: sets or clears the arrowhead at both ends of every selected unlocked arrow connector. One undo step; nothing happens when none would change. */
  const setSelectedArrowEnds = (twoWay: boolean) => {
    const next = setSelectedArrowsTwoWay(strokesRef.current, selectedKeysRef.current, twoWay)
    if (next === strokesRef.current) return
    saveHistory()
    strokesRef.current = next
    setSelectedConnectorTwoWay(twoWay)
    renderAll()
  }

  /** Corners: rounds or squares every selected unlocked plain rectangle. One undo step; nothing happens when none would change. */
  const setSelectedCorners = (rounded: boolean) => {
    const next = setRoundedCorners(strokesRef.current, currentSelectionKeys(), rounded)
    if (next === strokesRef.current) return
    saveHistory()
    strokesRef.current = next
    historyCacheRef.current = null
    renderAll()
    bumpSelectionColor((n) => n + 1)
    scheduleAutosave()
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

  const selectPenMode = () => {
    setLaserMode(false)
    setTextMode(false); setClassMode(false)
    setEraser(false)
    setEraserMenuOpen(false)
    setShapeMode(false); setShapeTool(null)
    setSelectionMode(false)
    setLassoMode(false)
    setConnectorMode(false)
    setUmlConnectorType(null)
    clearLassoSelection()
  }

  // The laser trail: points are screen coordinates; one rAF loop runs only while points remain visible.
  const drawLaser = () => {
    laserFrameRef.current = null
    const now = performance.now()
    laserTrailRef.current = pruneLaser(laserTrailRef.current, now)
    const canvas = laserCanvasRef.current
    if (canvas) {
      const dpr = window.devicePixelRatio || 1
      const width = Math.round(window.innerWidth * dpr)
      const height = Math.round(window.innerHeight * dpr)
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
        const segments = laserSegments(laserTrailRef.current, now)
        // Glow: one continuous path (no overlapping caps, so no darker dots at the joints).
        if (segments.length > 0) {
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'
          ctx.beginPath(); ctx.moveTo(segments[0].x1, segments[0].y1)
          for (const segment of segments) ctx.lineTo(segment.x2, segment.y2)
          ctx.strokeStyle = `rgba(255, 40, 40, ${segments[segments.length - 1].alpha * 0.25})`; ctx.lineWidth = 14; ctx.stroke()
        }
        // Core: per segment so the tail fades; butt caps so segments do not overlap.
        ctx.lineCap = 'butt'
        for (const segment of segments) {
          ctx.beginPath(); ctx.moveTo(segment.x1, segment.y1); ctx.lineTo(segment.x2, segment.y2)
          ctx.strokeStyle = `rgba(255, 30, 30, ${segment.alpha})`; ctx.lineWidth = 5; ctx.stroke()
          ctx.strokeStyle = `rgba(255, 190, 190, ${segment.alpha})`; ctx.lineWidth = 1.8; ctx.stroke()
        }
      }
    }
    if (laserVisible(laserTrailRef.current, now)) laserFrameRef.current = requestAnimationFrame(drawLaser)
    else laserTrailRef.current = []
  }
  const pushLaserPoints = (points: ReadonlyArray<{ clientX: number; clientY: number }>) => {
    const now = performance.now()
    for (const point of points) laserTrailRef.current = addLaserPoint(laserTrailRef.current, point.clientX, point.clientY, now)
    if (laserFrameRef.current === null) laserFrameRef.current = requestAnimationFrame(drawLaser)
  }
  const togglePresentMode = () => {
    setOptionsFor(null); setEraserMenuOpen(false)
    setPresentMode((value) => !value)
  }
  const laserPreviousToolRef = useRef<ToolFlags>(PEN_TOOL_FLAGS)
  const leaveLaser = () => {
    // Back to the tool that was active before the laser (Pen when it was Pen).
    const previous = toolToRestoreAfterLaser(laserPreviousToolRef.current)
    laserPreviousToolRef.current = PEN_TOOL_FLAGS
    setLaserMode(false)
    setEraser(previous.eraser); setShapeMode(previous.shapeMode); setShapeTool(previous.shapeTool as ShapeKind | 'arrow' | 'line' | null)
    setSelectionMode(previous.selectionMode); setLassoMode(previous.lassoMode); setConnectorMode(previous.connectorMode)
    setTextMode(previous.textMode); setClassMode(previous.classMode); setUmlConnectorType(previous.umlConnectorType as ConnectorRelationshipType | null)
  }
  const toggleLaserTool = () => {
    setOptionsFor(null)
    if (laserModeRef.current) { leaveLaser(); return }
    laserPreviousToolRef.current = { eraser, shapeMode, shapeTool, selectionMode, lassoMode, connectorMode, textMode, classMode, umlConnectorType }
    selectPenMode() // clears every other tool ...
    setLaserMode(true) // ... then the laser is set; the last state update wins
  }
  // Leaving the laser (another tool, Esc, the menu) clears the trail and stops the animation loop.
  useEffect(() => {
    if (laserMode) return
    laserPointerRef.current = null
    laserTrailRef.current = []
    if (laserFrameRef.current !== null) { cancelAnimationFrame(laserFrameRef.current); laserFrameRef.current = null }
  }, [laserMode])
  // Picking any other tool (dock, keys, palette, tray) leaves the laser.
  const anotherToolActive = eraser || selectionMode || textMode || classMode || lassoMode || connectorMode || umlConnectorType !== null || shapeMode || shapeTool !== null
  useEffect(() => { if (anotherToolActive) setLaserMode(false) }, [anotherToolActive])

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
    if (eraser || penButtonEraseRef.current) return
    if ((mouseGestureRef.current && !shapeMode) || shapeToolRef.current !== null) return
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
        const closedShape = recognizeClosedShapeOnHold(stroke, SHAPE_RECOGNITION_HOLD_MS, nextRectangleIdRef.current)
        if (closedShape) {
          nextRectangleIdRef.current += 1
          recognized = closedShape
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
    const routedItems = routeConnectors(strokesRef.current)
    for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
      const item = routedItems[index]
      if (isItemLocked(item)) continue // the whole-object eraser never removes a locked item
      if (item.kind === 'text' || item.kind === 'code') {
        if (itemHitTest(item, point, 8 / viewportRef.current.scale)) return index
        continue
      }
      if (item.kind === 'opaque') continue
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
      if (item.kind !== 'rectangle' || item.locked) continue
      if (rectanglePicked(strokesRef.current, item, point, viewportRef.current.scale)) return item
    }
    return null
  }

  const hitTestConnector = (point: Point) => {
    const routedItems = routeConnectors(strokesRef.current)
    for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
      const item = routedItems[index]
      if (item.kind === 'connector' && !item.locked && (itemHitTest(item, point, Math.max(12 / viewportRef.current.scale, item.strokeWidth * 2)) || pointOnConnectorLabel(item, point, createTextMeasure(connectorLabelFontSize(item), DEFAULT_TEXT_FONT)))) return strokesRef.current[index] as ConnectorObject
    }
    return null
  }

  const hitTestCode = (point: Point): CodeObject | null => {
    const pad = 8 / viewportRef.current.scale
    for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
      const item = strokesRef.current[index]
      if (item.kind === 'code' && !item.locked && itemHitTest(item, point, pad)) return item
    }
    return null
  }

  const hitTestText = (point: Point): TextObject | null => {
    const pad = 8 / viewportRef.current.scale
    for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
      const item = strokesRef.current[index]
      if (item.kind === 'text' && !item.locked && itemHitTest(item, point, pad)) return item
    }
    return null
  }

  const openTextEditor = (rawEditor: TextEditorState) => {
    if (textEditorRef.current) commitTextEditor()
    // Desktop auto-fit: find the shape the label sits in (none on the tablet or on plain canvas).
    const editor = rawEditor.connectorId !== undefined ? rawEditor : prepareEditorFit(rawEditor, strokesRef.current, inputModeRef.current === 'desktop')
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
    if (editor.connectorId !== undefined) {
      const next = setConnectorLabel(strokesRef.current, editor.connectorId, value)
      if (next !== strokesRef.current) {
        saveHistory()
        strokesRef.current = next
        setSelectedConnectorLabel(strokesRef.current.some((item) => item.kind === 'connector' && item.id === editor.connectorId && !!item.label))
        setHasInk(true)
      }
      renderAll()
      return
    }
    if (editor.itemId === null) {
      if (!isBlankText(value)) {
        if (!editor.mergeHistory) saveHistory()
        const created = createTextObject(nextTextIdRef.current++, editor.x, editor.y, value, editor.color, editor.fontSize, createTextMeasure(editor.fontSize, editor.fontFamily), editor.fontFamily)
        const label = editor.fitArea || editor.fitOff ? buildEditedLabel(created, value, editor, createTextMeasure) : created
        strokesRef.current.push(editor.centerOn ? { ...centreLabelOn(label, editor.centerOn), align: 'center' as const } : label)
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
        } else {
          const autoFit = editor.fitArea !== undefined || editor.fitOff === true
          const updated = autoFit ? buildEditedLabel(existing, value, editor, createTextMeasure) : value !== existing.text ? updateTextObject(existing, value, existing.fontSize, createTextMeasure(existing.fontSize, existing.fontFamily)) : existing
          if (updated.text !== existing.text || updated.fontSize !== existing.fontSize || updated.fit !== existing.fit) {
            saveHistory()
            const anchored = keepAlignAnchor(existing, updated)
            strokesRef.current = strokesRef.current.map((item, itemIndex) => (itemIndex === index ? anchored : item))
          }
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

  // A new empty label at the point (the Text tool's tap and the Desktop double-click on empty canvas): nothing is made until text is typed.
  const openNewTextEditorAt = (point: Point) => openTextEditor({ itemId: null, x: point.x, y: point.y - textSize * 0.65, fontSize: textSize, fontFamily: textFontId, color, initialText: '' })

  const editTextItem = (item: TextObject, selectAll = false) => openTextEditor({ ...(selectAll ? { selectAll: true } : {}), itemId: item.id, x: item.x, y: item.y, fontSize: item.fontSize, fontFamily: item.fontFamily, color: item.color, initialText: item.text, ...(item.align ? { align: item.align } : {}), ...(item.align === 'center' ? { centerOn: { x: item.x + item.width / 2, y: item.y + item.height / 2 } } : {}), ...(item.align === 'right' ? { anchorRight: item.x + item.width } : {}) })

  // Edits the label of a connector in the text overlay, centred on the middle of its drawn path; committing writes connector.label (one undo step).
  const editConnectorLabel = (connectorId: number): boolean => {
    const connector = routeConnectors(strokesRef.current).find((item): item is ConnectorObject => item.kind === 'connector' && item.id === connectorId)
    if (!connector || connector.locked) return false
    const centre = connectorLabelCentre(connector)
    openTextEditor({ itemId: null, connectorId, x: centre.x, y: centre.y, fontSize: connectorLabelFontSize(connector), fontFamily: DEFAULT_TEXT_FONT, color: connector.strokeColor, initialText: connector.label ?? '', centerOn: { x: centre.x, y: centre.y } })
    return true
  }

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
    // A round closed stroke becomes an oval or circle, a box-like one a rectangle (both are rectangle objects).
    const closedShape = recognizeClosedShapeStroke(stroke, nextRectangleIdRef.current)
    if (closedShape) {
      nextRectangleIdRef.current += 1
      return closedShape
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

  setConnectorLabelBackground(PAGE_BACKGROUND_COLORS[pageBackground])
  const drawItem = useCallback((ctx: CanvasRenderingContext2D, item: CanvasItem) => {
    drawItemToCanvas(ctx, item, strokeDisplayMode, sketchy)
  }, [strokeDisplayMode, sketchy])

  const drawMinimapItems = useCallback((ctx: CanvasRenderingContext2D, geometry: MinimapGeometry) => {
    drawMinimapItemsToCanvas(ctx, canvasItemsForRendering(routeConnectors(strokesRef.current)), geometry)
  }, [])






  /** redrawInk=false repaints only the background, the saved ink picture and the viewport box (cheap); true also redraws every item into the picture. */
  const renderNavigator = useCallback((redrawInk = true) => {
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
    const workspaceX = workspaceBoundsRef.current.x * geometry.scale + geometry.offsetX
    const workspaceY = workspaceBoundsRef.current.y * geometry.scale + geometry.offsetY
    const workspaceWidth = workspaceBoundsRef.current.width * geometry.scale
    const workspaceHeight = workspaceBoundsRef.current.height * geometry.scale
    const pageX = sheetBoundsRef.current.x * geometry.scale + geometry.offsetX
    const pageY = sheetBoundsRef.current.y * geometry.scale + geometry.offsetY
    const pageWidth = SHEET_WIDTH * geometry.scale
    const pageHeight = sheetHeightRef.current * geometry.scale
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

    const inkKey = `${pixelWidth}x${pixelHeight}|${geometry.scale}|${geometry.offsetX}|${geometry.offsetY}`
    const inkLayer = getReusableCanvasLayer(minimapInkLayerRef, pixelWidth, pixelHeight)
    if (redrawInk || minimapInkKeyRef.current !== inkKey) {
      const inkContext = inkLayer.getContext('2d')
      if (!inkContext) return
      inkContext.setTransform(1, 0, 0, 1, 0, 0)
      inkContext.clearRect(0, 0, pixelWidth, pixelHeight)
      inkContext.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawMinimapItems(inkContext, geometry)
      minimapInkKeyRef.current = inkKey
    }

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

  // The single selected box (select tool) is kept in a ref for the gesture code; the state copy only lets the toolbar show Delete for it.
  const [hasSelectedRectangle, setHasSelectedRectangle] = useState(false)
  const setSelectedRectangle = (id: number | null) => {
    selectedRectangleIdRef.current = id
    setHasSelectedRectangle(id !== null)
  }

  // Delete the selected items (lasso or group selection, a selected connector, or the single selected box) as one undo step.
  const deleteSelection = (): boolean => {
    const keys = new Set(selectedKeysRef.current)
    if (selectedRectangleIdRef.current !== null) keys.add(`rectangle:${selectedRectangleIdRef.current}`)
    if (keys.size === 0) return false
    const remaining = deleteCanvasItemsByKey(strokesRef.current, keys)
    if (remaining === strokesRef.current) return false
    saveHistory()
    strokesRef.current = remaining
    setHasInk(strokesRef.current.length > 0)
    updateSelectedItems([])
    setSelectedRectangle(null)
    renderAll()
    return true
  }

  // Desktop lock (Ctrl+Shift+L, right-click menu): locked items are drawn but never selected, edited or erased. One undo step each.
  const lockSelection = (): boolean => {
    const keys = currentSelectionKeys()
    if (keys.size === 0) return false
    const next = setItemsLocked(strokesRef.current, keys, true)
    if (next === strokesRef.current) return false
    saveHistory()
    strokesRef.current = next
    historyCacheRef.current = null
    updateSelectedItems([])
    setSelectedRectangle(null)
    renderAll()
    showToast('Locked')
    return true
  }
  // Group / Ungroup (Ctrl+G / Ctrl+Shift+G, menu, panel): one undo step each; the selection stays and now covers the whole group.
  const groupSelection = (): boolean => {
    const keys = currentSelectionKeys()
    const next = groupItems(strokesRef.current, keys)
    if (next === strokesRef.current) return false
    saveHistory()
    strokesRef.current = next
    historyCacheRef.current = null
    applySelectionState(normalizeSelection(expandToGroups(next, keys)))
    showToast('Grouped')
    return true
  }
  // Change shape (right-click menu, panel): the selected boxes become another shape of their family; one undo step.
  const changeShapeSelection = (target: string): boolean => {
    const next = changeSelectedShapes(strokesRef.current, currentSelectionKeys(), target as ShapeChoice)
    if (next === strokesRef.current) return false
    saveHistory()
    strokesRef.current = next
    historyCacheRef.current = null
    renderAll()
    scheduleAutosave()
    bumpSelectionColor((n) => n + 1)
    showToast(`Changed to ${shapeChoiceLabel(target as ShapeChoice)}`)
    return true
  }
  // Number steps / Clear step numbers (right-click menu, palette, tablet panel): connector labels; one undo step each.
  const numberFlowSteps = (): boolean => {
    const keys = currentSelectionKeys()
    const count = stepTargets(strokesRef.current, keys).length
    const next = numberSteps(strokesRef.current, keys)
    if (count === 0) { showToast('Select connectors to number'); return false }
    if (!next) { showToast(`Numbered ${count} step${count === 1 ? '' : 's'}`); return true }
    saveHistory()
    strokesRef.current = next
    historyCacheRef.current = null
    renderAll()
    scheduleAutosave()
    showToast(`Numbered ${count} step${count === 1 ? '' : 's'}`)
    return true
  }
  const clearFlowSteps = (): boolean => {
    const next = clearSteps(strokesRef.current, currentSelectionKeys())
    if (!next) { showToast('No step numbers to clear'); return false }
    saveHistory()
    strokesRef.current = next
    historyCacheRef.current = null
    renderAll()
    scheduleAutosave()
    showToast('Cleared step numbers')
    return true
  }
  const ungroupSelection = (): boolean => {
    const next = ungroupItems(strokesRef.current, currentSelectionKeys())
    if (next === strokesRef.current) return false
    saveHistory()
    strokesRef.current = next
    historyCacheRef.current = null
    renderAll()
    showToast('Ungrouped')
    return true
  }
  // A selection state widened to every member of the groups it touches (a no-op when nothing on the page is grouped).
  const expandSelectionState = (state: SelectionState): SelectionState => {
    if (!strokesRef.current.some((item) => item.kind !== 'opaque' && item.group !== undefined)) return state
    const keys = new Set(state.keys)
    if (state.rectangleId !== null) keys.add(`rectangle:${state.rectangleId}`)
    return normalizeSelection(expandToGroups(strokesRef.current, keys))
  }
  const unlockItems = (keys: ReadonlySet<string> | null): boolean => {
    const next = setItemsLocked(strokesRef.current, keys, false)
    if (next === strokesRef.current) return false
    saveHistory()
    strokesRef.current = next
    historyCacheRef.current = null
    renderAll()
    showToast('Unlocked')
    return true
  }

  // Select every item on the page, switching to the select tool first when no selecting tool is active so the selection can be moved.
  // Select similar (right-click): the unlocked items of the same kind / shape as the one selected, through the normal selection path. No history entry.
  const soleSelectedKey = (): string | null => {
    const keys = currentSelectionKeys()
    return keys.size === 1 ? [...keys][0] : null
  }
  const selectSimilarItems = (): boolean => {
    const key = soleSelectedKey()
    const keys = key ? similarItemKeys(strokesRef.current, key) : []
    if (keys.length === 0) return false
    if (!selectionMode && !lassoMode) toggleSelectTool()
    setSelectedRectangle(null)
    updateSelectedItems(keys)
    renderAll()
    showToast(`Selected ${keys.length} similar item${keys.length === 1 ? '' : 's'}`)
    return true
  }
  // Select connected / Select all linked (right-click chip, palette, panel): the box, its connectors and the boxes at their other ends (all the way through, for linked). No history entry.
  const selectConnectedItems = (transitive: boolean): boolean => {
    const keys = (transitive ? linkedKeys : connectedKeys)(strokesRef.current, currentSelectionKeys())
    if (keys.length === 0 || !canSelectConnected(strokesRef.current, currentSelectionKeys())) { showToast('No connected items'); return false }
    if (!selectionMode && !lassoMode) toggleSelectTool()
    setSelectedRectangle(null)
    updateSelectedItems(keys)
    renderAll()
    showToast(`Selected ${keys.length} connected item${keys.length === 1 ? '' : 's'}`)
    return true
  }
  // Same size (right-click chips, palette, panel): the selected boxes take the largest width and / or height around their centres. Connectors and inside labels follow; one undo step.
  const sameSizeSelection = (mode: SameSizeMode): boolean => {
    const result = sameSizeItems(strokesRef.current, currentSelectionKeys(), mode, workspaceBoundsRef.current, createTextMeasure)
    if (!result) { showToast(canSameSize(strokesRef.current, currentSelectionKeys()) ? 'Already the same size' : 'Select two or more boxes'); return false }
    saveHistory()
    strokesRef.current = result.items
    historyCacheRef.current = null
    renderAll()
    scheduleAutosave()
    bumpSelectionColor((n) => n + 1)
    showToast(`Made ${result.count} boxes the same ${mode === 'both' ? 'size' : mode}`)
    return true
  }
  // Add boundary (right-click chip, palette, panel): a dashed grey rectangle behind everything around the selection plus a "Boundary" label; one undo step. Desktop opens the editor on the label.
  const addBoundaryAroundSelection = (): boolean => {
    const keys = currentSelectionKeys()
    if (keys.size === 0) return false
    if (textEditorRef.current) commitTextEditor()
    const result = addBoundary(strokesRef.current, keys, { rectangle: nextRectangleIdRef.current, text: nextTextIdRef.current }, workspaceBoundsRef.current, { strokeWidth: width, fontFamily: DEFAULT_TEXT_FONT, measure: createTextMeasure(16, DEFAULT_TEXT_FONT) })
    if (!result) return false
    nextRectangleIdRef.current += 1
    nextTextIdRef.current += 1
    saveHistory()
    const rectangle = sketchyRef.current ? withSketchSeed(result.rectangle) : result.rectangle
    strokesRef.current = rectangle === result.rectangle ? result.items : result.items.map((item) => (item === result.rectangle ? rectangle : item))
    historyCacheRef.current = null
    setHasInk(true)
    scheduleAutosave()
    if (!selectionMode && !lassoMode) toggleSelectTool()
    setSelectedRectangle(null)
    updateSelectedItems([canvasItemKey(result.label)])
    if (inputModeRef.current === 'desktop') editTextItem(result.label, true)
    renderAll()
    return true
  }
  const selectAllItems = (): boolean => {
    const keys = allCanvasItemKeys(strokesRef.current)
    if (keys.length === 0) return false
    if (!selectionMode && !lassoMode) toggleSelectTool()
    setSelectedRectangle(null)
    updateSelectedItems(keys)
    renderAll()
    return true
  }

  // Step 7. The tool the mouse is using, as the click-to-select rule names it.
  const clickToolName = (): ClickTool => laserMode ? 'laser' : eraser ? 'eraser'
    : selectionMode ? 'select' : lassoMode ? 'lasso' : textMode ? 'text' : classMode ? 'classBox'
    : (connectorMode || umlConnectorType !== null) ? 'connector' : shapeTool !== null ? 'shapeDraw' : shapeMode ? 'shape' : 'pen'

  // Selects the hit box, connector or text exactly as the select tool does, and returns the item. A plain box needs the select
  // tool for its handles to work, so from the pen, shapes, text, connector and class tools that tool is switched on; ink boxes
  // keep the pen (their handles already work there) and the lasso keeps its own key-based selection.
  const selectHitTarget = (target: HitTarget): CanvasItem | null => {
    const item = strokesRef.current.find((candidate) => canvasItemKey(candidate) === target.key)
    if (!item) return null
    hoverKeyRef.current = null
    // A member of a group selects the whole group (and the select tool, whose handles move it).
    const groupState = expandSelectionState({ keys: [target.key], rectangleId: null })
    if (groupState.keys.length > 1) {
      if (!selectionMode && !lassoMode) toggleSelectTool()
      applySelectionState(groupState)
      return item
    }
    if (item.kind === 'rectangle' && !lassoMode) {
      if (!item.inkBox && !selectionMode) toggleSelectTool()
      setSelectedRectangle(item.id)
      updateSelectedItems([])
    } else {
      // A text label has resize handles, which work in the select and lasso tools.
      if (item.kind === 'text' && !selectionMode && !lassoMode) toggleSelectTool()
      if (item.kind === 'code' && !selectionMode && !lassoMode) toggleSelectTool()
      setSelectedRectangle(null)
      updateSelectedItems([target.key])
    }
    renderAll()
    return item
  }

  // Applies a multi-select result: one box is the single-box selection (so its handles work); anything else is the key set.
  const applySelectionState = (state: SelectionState) => {
    hoverKeyRef.current = null
    if (lassoMode && state.rectangleId !== null) {
      setSelectedRectangle(null)
      updateSelectedItems([`rectangle:${state.rectangleId}`])
    } else {
      setSelectedRectangle(state.rectangleId)
      updateSelectedItems(state.keys)
    }
    renderAll()
  }
  // The selection as keys, with a single selected box included.
  const selectionKeysWithBox = (): Set<string> => {
    const keys = new Set(selectedKeysRef.current)
    if (selectedRectangleIdRef.current !== null) keys.add(`rectangle:${selectedRectangleIdRef.current}`)
    return keys
  }
  // Starts dragging the whole group selection (the lasso's move, reused).
  const startGroupDrag = (event: React.PointerEvent<HTMLCanvasElement>, point: Point) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    lassoDragRef.current = { pointerId: event.pointerId, start: point, keys: new Set(selectedKeysRef.current), originalItems: strokesRef.current.slice(), moved: false, ...(duplicatePress(event) ? { duplicate: true } : {}) }
  }
  // Ctrl (Cmd) + mouse press with the Select tool in Desktop mode: if it turns into a drag, a copy moves instead of the originals.
  const duplicatePress = (event: React.PointerEvent<HTMLCanvasElement>): boolean => selectionMode && !lassoMode && isDuplicateDragPress(inputModeRef.current, event.pointerType, event.button, event.ctrlKey, event.metaKey)
  // The copy for a duplicating drag, made at the first move past the threshold: originals stay, the copies get the moving keys.
  const beginDuplicate = (holder: { dup?: DragDup }, originalItems: CanvasItem[], dragged: Set<string>, event: React.PointerEvent<HTMLCanvasElement>): DragDup | null => {
    if (holder.dup) return holder.dup
    const carried = withCarriedLabels(event, originalItems, dragged)
    const result = duplicateForDrag(originalItems, dragged, [...carried].filter((key) => !dragged.has(key)), { stroke: nextStrokeIdRef.current, rectangle: nextRectangleIdRef.current, connector: nextConnectorIdRef.current, text: nextTextIdRef.current }, workspaceBoundsRef.current)
    if (!result) return null
    nextStrokeIdRef.current = result.counters.stroke
    nextRectangleIdRef.current = result.counters.rectangle
    nextConnectorIdRef.current = result.counters.connector
    nextTextIdRef.current = result.counters.text
    holder.dup = { ...result, before: normalizeSelection(selectionKeysWithBox()) }
    return holder.dup
  }

  // Desktop mouse drag of plain or HLD shapes: text labels lying fully inside a dragged shape travel with it. Pen and touch drags are unchanged.
  const withCarriedLabels = (event: React.PointerEvent<HTMLCanvasElement>, originalItems: CanvasItem[], keys: Set<string>): Set<string> => {
    if (inputModeRef.current !== 'desktop' || event.pointerType !== 'mouse') return keys
    const carried = labelsInside(originalItems, keys)
    return carried.length === 0 ? keys : new Set([...keys, ...carried])
  }

  // Desktop mouse resize of one plain or HLD shape: the labels inside it at the start follow the resize (decided once, here).
  const resizeLabelKeys = (event: React.PointerEvent<HTMLCanvasElement>, originalItems: CanvasItem[], box: RectangleObject): string[] | undefined => {
    if (inputModeRef.current !== 'desktop' || event.pointerType !== 'mouse' || !isFlowBox(box)) return undefined
    const keys = labelsInside(originalItems, new Set([canvasItemKey(box)]))
    return keys.length > 0 ? keys : undefined
  }

  // The guides and snap state end with the drag, however it ends; the canvas is repainted only when a guide was showing.
  const clearSnapGuides = (repaint = true) => {
    const hadGuides = guidesRef.current.length > 0
    guidesRef.current = []
    snapStateRef.current = null
    if (hadGuides && repaint) renderAll()
  }
  // One drag move: the pointer's delta, nudged so the moving bounds line up with nearby boxes and labels. Off when the setting is off,
  // while Alt is held with a mouse in Desktop mode, and for selections without a box or label (ink and connectors alone never snap).
  const snapDragDelta = (event: React.PointerEvent<HTMLCanvasElement>, originalItems: CanvasItem[], keys: ReadonlySet<string>, dx: number, dy: number): { dx: number; dy: number } => {
    const altWithMouse = event.altKey && event.pointerType === 'mouse' && inputModeRef.current === 'desktop'
    if (!snappingRef.current || altWithMouse) {
      guidesRef.current = []
      return { dx, dy }
    }
    let state = snapStateRef.current
    if (!state || state.pointerId !== event.pointerId) {
      state = { pointerId: event.pointerId, moving: null, targets: [] }
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect && selectionCanSnap(originalItems, keys)) {
        state.moving = getCanvasSelectionBounds(routeConnectors(originalItems), keys)
        state.targets = cullTargets(snapTargetsFor(originalItems, keys), viewRectOf(viewportRef.current, rect.width, rect.height))
      }
      snapStateRef.current = state
    }
    if (!state.moving) return { dx, dy }
    const result = snapForDrag(true, false, { ...state.moving, x: state.moving.x + dx, y: state.moving.y + dy }, state.targets, event.pointerType, viewportRef.current.scale)
    guidesRef.current = result?.guides ?? []
    return result ? { dx: dx + result.dx, dy: dy + result.dy } : { dx, dy }
  }

  // The canvas cursor for the tool, the hover and the pan state (Desktop mode; Tablet mode keeps the default).
  const applyCanvasCursor = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const key = hoverKeyRef.current
    const selected = key !== null && (selectedKeysRef.current.has(key) || key === `rectangle:${selectedRectangleIdRef.current}`)
    if (quickHoverRef.current !== null && inputModeRef.current === 'desktop' && mousePanRef.current === null && !spaceHeldRef.current) { canvas.style.cursor = 'pointer'; return }
    canvas.style.cursor = canvasCursor({ mode: inputModeRef.current, tool: clickToolName(), hover: key === null ? 'none' : selected ? 'selected' : 'item', panning: mousePanRef.current !== null, spaceHeld: spaceHeldRef.current })
  }
  const applyCursorRef = useRef(applyCanvasCursor)
  applyCursorRef.current = applyCanvasCursor
  const cursorTool = clickToolName()
  useEffect(() => {
    if (inputMode !== 'desktop') setMouseHover(null)
    applyCursorRef.current()
  }, [inputMode, cursorTool])

  // Desktop hover: the item under the mouse gets a light outline and a pointer cursor. The pick runs at most once a frame and
  // the canvas is redrawn only when the hovered item changes.
  const refreshHover = () => {
    hoverFrameRef.current = null
    const point = hoverPointRef.current
    const ready = point !== null && inputModeRef.current === 'desktop' && !eraser && !laserModeRef.current
    const target = ready ? hoverTarget(routeConnectors(strokesRef.current), point, viewportRef.current.scale) : null
    const key = target?.key ?? null
    const quickBox = ready ? quickConnectSource() : null
    const quick = quickBox && point ? hitQuickConnect(quickBox, point, viewportRef.current.scale, quickInsideSheet) : null
    const changed = key !== hoverKeyRef.current || quick !== quickHoverRef.current
    hoverKeyRef.current = key
    quickHoverRef.current = quick
    applyCanvasCursor()
    if (changed) renderAll()
  }
  const setMouseHover = (point: Point | null) => {
    hoverPointRef.current = point
    if (point === null) {
      if (hoverFrameRef.current !== null) { cancelAnimationFrame(hoverFrameRef.current); hoverFrameRef.current = null }
      if (hoverKeyRef.current !== null || quickHoverRef.current !== null) { hoverKeyRef.current = null; quickHoverRef.current = null; renderAll() }
      applyCanvasCursor()
      return
    }
    if (hoverFrameRef.current === null) hoverFrameRef.current = requestAnimationFrame(refreshHover)
  }

  // Tablet and Desktop, S Pen only: holding the pen still on a box's edge for 500 ms selects the box instead of drawing.
  const cancelEdgeHold = () => {
    const hold = edgeHoldRef.current
    if (!hold) return
    window.clearTimeout(hold.timer)
    edgeHoldRef.current = null
  }
  const fireEdgeHold = (pointerId: number) => {
    const hold = edgeHoldRef.current
    if (!hold || hold.pointerId !== pointerId) return
    edgeHoldRef.current = null
    const stroke = activeStrokeRef.current
    if (activePointerRef.current !== pointerId || !stroke || stroke.erase) return
    const last = stroke.points[stroke.points.length - 1]
    if (edgeHoldDecision(hold.start, last, performance.now() - hold.startedAt, viewportRef.current.scale) !== 'select') return
    const box = strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === hold.boxId)
    if (!box) return
    // Drop the dot the press started: nothing is drawn, and the press is spent until the pen lifts.
    clearShapeHoldTimer()
    activeStrokeRef.current = null
    activeStrokeBoxRef.current = null
    activePointerRef.current = null
    predictedPointsRef.current = []
    shapePreviewRef.current = null
    holdAnchorRef.current = null
    lastSignificantMoveAtRef.current = 0
    selectHitTarget({ key: canvasItemKey(box), kind: 'rectangle', id: box.id })
  }
  useEffect(() => () => { cancelEdgeHold(); if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current) }, [])

  // Font picker: the choice is the font for new labels, and also changes the single selected label (one undo step, re-measured once the font is ready).
  const selectedTextFont: TextFontId | null = selectedTextId === null ? null
    : (() => { const item = strokesRef.current.find((candidate) => candidate.kind === 'text' && candidate.id === selectedTextId); return item?.kind === 'text' ? item.fontFamily ?? LEGACY_TEXT_FONT : null })()
  const currentSelectionKeys = () => {
    const keys = new Set(selectedKeysRef.current)
    if (selectedRectangleIdRef.current !== null) keys.add(`rectangle:${selectedRectangleIdRef.current}`)
    return keys
  }
  /** The one selected label or plain shape that can be rotated (null for none, several, or other kinds). */
  const soleRotatable = (): TextObject | RectangleObject | null => {
    const keys = currentSelectionKeys()
    if (keys.size !== 1) return null
    const key = [...keys][0]
    const item = strokesRef.current.find((candidate) => canvasItemKey(candidate) === key)
    return item && (item.kind === 'text' || item.kind === 'rectangle') && isRotatable(item) ? item : null
  }
  /** The routed copy of the one selected connector when it shows endpoint handles (Select / lasso only; null otherwise). */
  const soleConnectorWithHandles = (): ConnectorObject | null => {
    if (!selectionMode && !lassoMode) return null
    const keys = currentSelectionKeys()
    if (keys.size !== 1 || ![...keys][0].startsWith('connector:')) return null
    return soleSelectedConnector(routeConnectors(strokesRef.current), keys)
  }
  /**
   * The one selected plain or HLD box that shows the quick-connect buttons: Desktop Select mode, not locked, not rotated, big enough on
   * screen, with no gesture or editor active. Null otherwise. Only mouse input starts a press (pen and touch never use the buttons).
   */
  /** Buttons whose centre is off the page are hidden (and not hit): the page-bounds check would drop the press anyway. */
  const quickInsideSheet = (point: Point) => isPointWithinBounds(point, sheetBoundsRef.current)
  const quickConnectSource = (): RectangleObject | null => {
    if (inputModeRef.current !== 'desktop' || !selectionMode) return null
    if (textEditorRef.current || codeEditorRef.current || activeMarqueeRef.current || activePointerRef.current !== null || activeConnectorRef.current || activeDragRef.current || activeResizeRef.current || activeRotateRef.current || activeEndpointRef.current || activeDividerRef.current || activeLassoRef.current || lassoDragRef.current || mousePanRef.current) return null
    const keys = currentSelectionKeys()
    if (keys.size !== 1) return null
    const item = strokesRef.current.find((candidate) => keys.has(canvasItemKey(candidate)))
    if (!item || item.kind !== 'rectangle' || !isFlowBox(item) || isItemLocked(item) || itemAngle(item) !== 0) return null
    return quickConnectFits(item, viewportRef.current.scale) ? item : null
  }
  /** Starts a quick-connect press when a mouse pointer lands on one of the buttons. A click (not a drag) runs Ctrl+Arrow for that side. */
  const startQuickConnectPress = (event: React.PointerEvent<HTMLCanvasElement>, point: Point): boolean => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false
    const source = quickConnectSource()
    const direction = source ? hitQuickConnect(source, point, viewportRef.current.scale, quickInsideSheet) : null
    if (!direction) return false
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    activeQuickRef.current = { pointerId: event.pointerId, direction, startScreen: getScreenPoint(event), dragged: false }
    // The press must not join a double-click pair (its second click would undo the new shape or open a label editor).
    clickPairRef.current = null
    clickBeforeRef.current = null
    quickHoverRef.current = null
    renderAll()
    return true
  }
  const moveQuickConnectPress = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const press = activeQuickRef.current
    if (!press) return
    event.preventDefault()
    const now = getScreenPoint(event)
    if (Math.hypot(now.x - press.startScreen.x, now.y - press.startScreen.y) >= CONNECTOR_CLICK_SLOP_PX) press.dragged = true
  }
  const finishQuickConnectPress = () => {
    const press = activeQuickRef.current
    activeQuickRef.current = null
    quickClickAtRef.current = performance.now()
    if (press && !press.dragged) quickCreateShape(press.direction)
    renderAll()
  }
  const cancelQuickConnectPress = () => {
    if (activeQuickRef.current === null) return
    activeQuickRef.current = null
    renderAll()
  }
  /** Starts a handle gesture when `point` is on a handle of the selected connector. Returns true when it did. */
  const startConnectorHandleGesture = (event: React.PointerEvent<HTMLCanvasElement>, point: Point, labelOnly = false): boolean => {
    const connector = soleConnectorWithHandles()
    if (!connector) return false
    // The handles win; otherwise a press on the label of the selected connector drags it along the path (a click without movement does nothing, so double-click still edits).
    const which: ConnectorHandleKind | 'label' | null = (labelOnly ? null : hitConnectorHandle(connector, point, viewportRef.current.scale, event.pointerType)) ?? (hitConnectorLabel(connector, point) ? 'label' : null)
    if (!which) return false
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    activeEndpointRef.current = { pointerId: event.pointerId, pointerType: event.pointerType, id: connector.id, which, startScreen: getScreenPoint(event), startPoint: point, startBend: connector.bend ?? 0, startLabelPosition: connectorLabelPosition(connector), routedConnector: which === 'label' ? (routeConnectors(strokesRef.current).find((item): item is ConnectorObject => item.kind === 'connector' && item.id === connector.id) ?? null) : null, originalItems: strokesRef.current.slice(), dragged: false, saved: false, target: null }
    return true
  }
  const moveConnectorHandleGesture = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const gesture = activeEndpointRef.current
    if (!gesture) return
    event.preventDefault()
    const now = getScreenPoint(event)
    if (!gesture.dragged && Math.hypot(now.x - gesture.startScreen.x, now.y - gesture.startScreen.y) < CONNECTOR_CLICK_SLOP_PX) return
    gesture.dragged = true
    if (gesture.which === 'label') {
      // Dragging the label slides it along the routed path (fraction of its length, 0.05..0.95); one undo step per drag.
      event.currentTarget.style.cursor = 'grabbing'
      const connector = gesture.routedConnector // routed once at the start of the gesture (originalItems never change during it)
      if (!connector) return
      const next = setConnectorLabelPosition(gesture.originalItems, gesture.id, labelPositionForDrag(connector, gesture.startPoint, getBoundedPoint(event), gesture.startLabelPosition))
      if (next === strokesRef.current || (!gesture.saved && next === gesture.originalItems)) return
      if (!gesture.saved) { saveHistory(); gesture.saved = true }
      strokesRef.current = next
      renderAll()
      return
    }
    if (gesture.which === 'middle') {
      // Dragging the middle dot of an elbow connector moves its middle segment (one undo step); on any other connector it does nothing.
      const bend = bendForDrag(gesture.originalItems, gesture.id, gesture.startPoint, getBoundedPoint(event), gesture.startBend)
      if (bend === null) return
      const next = setConnectorBend(gesture.originalItems, gesture.id, bend)
      if (next === strokesRef.current || (!gesture.saved && next === gesture.originalItems)) return
      if (!gesture.saved) { saveHistory(); gesture.saved = true }
      strokesRef.current = next
      renderAll()
      return
    }
    const point = getBoundedPoint(event)
    const snapped = snapEndpointTarget(point, gesture.originalItems, CONNECTOR_SNAP_TOLERANCE / viewportRef.current.scale, (p) => isPointWithinBounds(p, workspaceBoundsRef.current))
    if (!gesture.saved) { saveHistory(); gesture.saved = true }
    strokesRef.current = moveConnectorEndpoint(gesture.originalItems, gesture.id, gesture.which, snapped?.point ?? point, snapped)
    gesture.target = snapped?.attachment.rectangleId ?? null
    renderAll()
  }
  const finishConnectorHandleGesture = () => {
    const gesture = activeEndpointRef.current
    activeEndpointRef.current = null
    if (!gesture) return
    if (gesture.which === 'middle' && !gesture.dragged) {
      saveHistory()
      strokesRef.current = toggleConnectorRouting(gesture.originalItems, gesture.id)
      scheduleAutosave()
    } else if (gesture.saved && gesture.which === 'label' && connectorLabelPosition(strokesRef.current.find((item): item is ConnectorObject => item.kind === 'connector' && item.id === gesture.id) ?? {}) === gesture.startLabelPosition) {
      // The label ended exactly where it started: no change, so no history step.
      strokesRef.current = gesture.originalItems
      historyRef.current.discardLast()
      setCanUndo(historyRef.current.canUndo)
      setCanRedo(historyRef.current.canRedo)
    } else if (gesture.saved) scheduleAutosave()
    if (gesture.which === 'label') applyCanvasCursor()
    renderAll()
  }
  /** Escape or pointercancel mid-gesture: put the original items back and forget the history step the drag recorded. */
  const cancelConnectorHandleGesture = () => {
    const gesture = activeEndpointRef.current
    activeEndpointRef.current = null
    if (!gesture) return
    if (gesture.saved) {
      strokesRef.current = gesture.originalItems
      historyRef.current.discardLast()
      setCanUndo(historyRef.current.canUndo)
      setCanRedo(historyRef.current.canRedo)
      scheduleAutosave()
    }
    if (gesture.which === 'label') applyCanvasCursor()
    renderAll()
  }
  const setSelectedItemAngle = (radians: number) => {
    const item = soleRotatable()
    if (!item) return
    const next = setItemAngle(strokesRef.current, canvasItemKey(item), radians)
    if (next === strokesRef.current) return
    saveHistory()
    strokesRef.current = next
    renderAll()
    bumpSelectionColor((n) => n + 1)
  }
  /** Turns the selected label or shape to the slope of the nearest connector, so text can sit along a sloped line. */
  const alignSelectionToLine = () => {
    const item = soleRotatable()
    if (!item) return
    const center = itemCenter(item)
    const angle = nearestConnectorAngle(routeConnectors(strokesRef.current), { x: center.x, y: center.y, pressure: 0 })
    if (angle !== null) setSelectedItemAngle(angle)
  }

  /** Recolours the whole selection (ink, shape, box, connector or text); one undo step per picker drag or swatch click. */
  const recolorSelection = (hex: string, commit: boolean) => {
    const next = recolorItems(strokesRef.current, currentSelectionKeys(), hex)
    if (next !== strokesRef.current) {
      if (!recolorSessionRef.current) { saveHistory(); recolorSessionRef.current = true }
      strokesRef.current = next
      renderAll()
      bumpSelectionColor((n) => n + 1)
    }
    if (commit) recolorSessionRef.current = false
  }

  /** Fills the selected shapes (null = no fill); one undo step per picker drag or swatch click, like recolouring the outline. */
  const fillSelection = (hex: string | null, commit: boolean) => {
    const next = setFillColor(strokesRef.current, currentSelectionKeys(), hex)
    if (next !== strokesRef.current) {
      if (!recolorSessionRef.current) { saveHistory(); recolorSessionRef.current = true }
      strokesRef.current = next
      renderAll()
      bumpSelectionColor((n) => n + 1)
    }
    if (commit) recolorSessionRef.current = false
  }
  /** Sets the outline width of the selection; one undo step per slider drag or preset click (`commit` or `endWidthChange` closes it). */
  const changeSelectionWidth = (value: number, commit: boolean) => {
    const next = restrokeItems(strokesRef.current, currentSelectionKeys(), value)
    if (next !== strokesRef.current) {
      if (!widthSessionRef.current) { saveHistory(); widthSessionRef.current = true }
      strokesRef.current = next
      renderAll()
      bumpSelectionColor((n) => n + 1)
    }
    if (commit) widthSessionRef.current = false
  }
  const endWidthChange = () => { widthSessionRef.current = false }
  /** Line style of the selection (solid / dashed / dotted), or the default for new shapes when nothing is selected. */
  const changeLineDash = (dash: 'solid' | LineDash) => {
    const keys = currentSelectionKeys()
    if (keys.size === 0) {
      setLineDashDefaultState(dash)
      saveLineDashDefault(dash)
      return
    }
    const next = setLineDash(strokesRef.current, keys, dash === 'solid' ? null : dash)
    if (next === strokesRef.current) return
    saveHistory()
    strokesRef.current = next
    renderAll()
    bumpSelectionColor((n) => n + 1)
  }
  const changeArrowheads = (heads: Arrowheads) => {
    const next = setArrowheads(strokesRef.current, currentSelectionKeys(), heads)
    if (next === strokesRef.current) return
    saveHistory()
    strokesRef.current = next
    renderAll()
    bumpSelectionColor((n) => n + 1)
  }
  /** Layer order of the selection (array order is paint order). One undo step; the saved picture of the page is dropped because it assumes items only get added on top. */
  const moveSelectionLayer = (move: LayerMove): boolean => {
    const keys = currentSelectionKeys()
    if (keys.size === 0) return false
    const next = reorderItems(strokesRef.current, keys, move)
    if (next === strokesRef.current) return true
    saveHistory()
    strokesRef.current = next
    historyCacheRef.current = null
    renderAll()
    bumpSelectionColor((n) => n + 1)
    return true
  }
  /** Aligns or distributes the selection; connectors attached to moved boxes follow. One undo step. */
  const arrangeSelection = (moves: ReturnType<typeof alignMoves>) => {
    if (moves.length === 0) return
    saveHistory()
    strokesRef.current = applyMoves(strokesRef.current, moves)
    historyCacheRef.current = null
    renderAll()
    bumpSelectionColor((n) => n + 1)
  }
  const alignSelection = (op: AlignOp) => arrangeSelection(alignMoves(strokesRef.current, currentSelectionKeys(), op))
  const distributeSelection = (op: DistributeOp) => arrangeSelection(distributeMoves(strokesRef.current, currentSelectionKeys(), op))
  /** Turns the hand-drawn style on or off for the whole diagram. Turning it on gives every shape that lacks one a stored seed, in the same undo step. */
  const toggleSketchy = () => {
    const turningOn = !sketchyRef.current
    if (turningOn) {
      const stamped = withSketchSeeds(strokesRef.current)
      if (stamped !== strokesRef.current) {
        saveHistory()
        strokesRef.current = stamped
      }
      pagesRef.current.forEach((slot, index) => { if (index !== pageIndexRef.current) slot.items = withSketchSeeds(slot.items) })
    }
    sketchyRef.current = turningOn
    setSketchy(turningOn)
  }

  const rotatableForPanel = soleRotatable()
  const rotationPanel = rotatableForPanel
    ? { degrees: Math.round((itemAngle(rotatableForPanel) * 180) / Math.PI), onAlign: alignSelectionToLine, onReset: () => setSelectedItemAngle(0) }
    : null

  /** Desktop: the single selected text label, if any. */
  const selectedTextItem = (): TextObject | null => {
    if (inputModeRef.current !== 'desktop' || selectedTextId === null || selectedItemCount !== 1) return null
    const item = strokesRef.current.find((candidate) => candidate.kind === 'text' && candidate.id === selectedTextId)
    return item?.kind === 'text' ? item : null
  }
  const replaceTextItem = (updated: TextObject) => {
    saveHistory()
    strokesRef.current = strokesRef.current.map((candidate) => (candidate.kind === 'text' && candidate.id === updated.id ? updated : candidate))
    renderAll()
  }
  /** Picking a size by hand wins for that label (open editor or selected label): its auto-fit turns off. */
  const pickTextSize = (size: number) => {
    setTextSize(size)
    if (inputModeRef.current !== 'desktop') return
    const editor = textEditorRef.current
    if (editor) {
      const next = { ...editor, fontSize: size, pickedSize: size, fitOff: true }
      textEditorRef.current = next
      setTextEditor(next)
      return
    }
    const item = selectedTextItem()
    if (item && (item.fontSize !== size || item.fit !== 'off')) replaceTextItem(buildEditedLabel(item, item.text, { itemId: item.id, x: item.x, y: item.y, fontSize: size, fontFamily: item.fontFamily, initialText: item.text, fitOff: true }, createTextMeasure))
  }
  /** The one selected connector when it has a label (its size can be changed), else null. */
  const selectedLabelledConnector = (): ConnectorObject | null => {
    const keys = [...selectedKeysRef.current]
    if (keys.length !== 1 || !keys[0].startsWith('connector:')) return null
    const id = Number(keys[0].slice('connector:'.length))
    const item = strokesRef.current.find((candidate) => candidate.kind === 'connector' && candidate.id === id)
    return item?.kind === 'connector' && item.label ? item : null
  }
  /** Sets the label size of the selected labelled connector (panel buttons and the font keys); one undo step. */
  const pickConnectorLabelSize = (size: number) => {
    const connector = selectedLabelledConnector()
    if (!connector || connector.locked) return
    const next = setConnectorLabelFontSize(strokesRef.current, connector.id, size)
    if (next === strokesRef.current) return
    saveHistory()
    strokesRef.current = next
    historyCacheRef.current = null
    renderAll()
    bumpSelectionColor((n) => n + 1)
    scheduleAutosave()
  }
  /** End labels of a connector for the panel inputs, and the commit that sets one (one undo step per change). */
  const endLabelProps = (connectorId: number) => {
    const connector = strokesRef.current.find((item): item is ConnectorObject => item.kind === 'connector' && item.id === connectorId)
    return {
      startLabel: connector?.startLabel ?? '',
      endLabel: connector?.endLabel ?? '',
      onEndLabel: (end: 'start' | 'end', text: string) => {
        const next = setConnectorEndLabel(strokesRef.current, connectorId, end, text)
        if (next === strokesRef.current) return
        saveHistory()
        strokesRef.current = next
        historyCacheRef.current = null
        renderAll()
        bumpSelectionColor((n) => n + 1)
        scheduleAutosave()
      },
    }
  }
  /** Text labels the alignment buttons act on: the selected labels plus the labels inside a selected box (both modes). */
  const alignTargetKeys = (): Set<string> => {
    const selected = currentSelectionKeys()
    const keys = new Set([...selected].filter((key) => key.startsWith('text:')))
    for (const key of labelsInside(strokesRef.current, selected)) keys.add(key)
    return keys
  }
  /** Left / Centre / Right for every target label; one undo step. */
  const pickTextAlign = (align: TextAlign | 'left') => {
    const next = setTextAlign(strokesRef.current, alignTargetKeys(), align)
    if (next === strokesRef.current) return
    saveHistory()
    strokesRef.current = next
    historyCacheRef.current = null
    renderAll()
    bumpSelectionColor((n) => n + 1)
    scheduleAutosave()
  }
  /** The alignment panel state: the shared alignment of the target labels (null when mixed), or undefined when none are selected. */
  const textAlignPanel = (() => {
    const keys = alignTargetKeys()
    if (keys.size === 0) return undefined
    const aligns = new Set<TextAlign | 'left'>(strokesRef.current.filter((item): item is TextObject => item.kind === 'text' && keys.has(`text:${item.id}`) && !item.locked).map((item) => item.align ?? 'left'))
    if (aligns.size === 0) return undefined
    return { value: aligns.size === 1 ? [...aligns][0] : null, onPick: pickTextAlign }
  })()
  /** Font size keys with a plain or HLD box selected: the unlocked labels inside it step one size (each from its own size), one undo step. */
  const stepBoxLabelFontSizes = (direction: 1 | -1): boolean => {
    const labelKeys = new Set(labelsInside(strokesRef.current, currentSelectionKeys()))
    if (labelKeys.size === 0) return false
    let changed = false
    const next = strokesRef.current.map((candidate): CanvasItem => {
      if (candidate.kind !== 'text' || !labelKeys.has(canvasItemKey(candidate))) return candidate
      const size = stepFontSize(candidate.fontSize, direction)
      if (size === null) return candidate
      changed = true
      return buildEditedLabel(candidate, candidate.text, { itemId: candidate.id, x: candidate.x, y: candidate.y, fontSize: size, fontFamily: candidate.fontFamily, initialText: candidate.text, fitOff: true }, createTextMeasure)
    })
    if (changed) {
      saveHistory()
      strokesRef.current = next
      historyCacheRef.current = null
      renderAll()
      scheduleAutosave()
    }
    return true
  }
  /** Ctrl+Shift+. / Ctrl+Shift+, : the selected label one panel size step larger or smaller (turns its auto-fit off like a panel pick); one undo step. */
  const stepSelectedFontSize = (direction: 1 | -1): boolean => {
    const labelled = selectedLabelledConnector()
    if (labelled && !selectedTextItem()) {
      if (labelled.locked) return false
      const size = stepFontSize(connectorLabelFontSize(labelled), direction)
      if (size !== null) pickConnectorLabelSize(size)
      return true
    }
    const item = selectedTextItem()
    if (!item && inputModeRef.current === 'desktop') return stepBoxLabelFontSizes(direction)
    if (!item || isItemLocked(item)) return false
    const size = stepFontSize(item.fontSize, direction)
    if (size === null) return true
    pickTextSize(size)
    return true
  }
  /** The Desktop text panel toggle: auto-fit on or off for the label being edited or selected. */
  const textFitOn = (() => {
    if (inputMode !== 'desktop') return null
    if (textEditor) return !textEditor.fitOff
    return selectedTextItem() ? strokesRef.current.some((candidate) => candidate.kind === 'text' && candidate.id === selectedTextId && candidate.fit !== 'off') : null
  })()
  const toggleTextFit = () => {
    const editor = textEditorRef.current
    if (editor) {
      const next = editor.fitOff ? { ...editor, fitOff: false, pickedSize: editor.fontSize } : { ...editor, fitOff: true }
      textEditorRef.current = next
      setTextEditor(next)
      return
    }
    const item = selectedTextItem()
    if (!item) return
    if (item.fit !== 'off') { replaceTextItem(buildEditedLabel(item, item.text, { itemId: item.id, x: item.x, y: item.y, fontSize: item.fontSize, fontFamily: item.fontFamily, initialText: item.text, fitOff: true }, createTextMeasure)); return }
    const on = prepareEditorFit({ itemId: item.id, x: item.x, y: item.y, fontSize: item.fontSize, fontFamily: item.fontFamily, initialText: '' }, strokesRef.current, true)
    replaceTextItem(buildEditedLabel(item, item.text, on, createTextMeasure))
  }

  const changeTextFontChoice = (fontId: TextFontId) => {
    setTextFontId(fontId)
    const targetId = selectedTextId
    if (targetId === null) return
    void loadTextFont(fontId).then(() => {
      const index = strokesRef.current.findIndex((item) => item.kind === 'text' && item.id === targetId)
      const item = index === -1 ? null : strokesRef.current[index]
      if (!item || item.kind !== 'text' || (item.fontFamily ?? LEGACY_TEXT_FONT) === fontId) return
      saveHistory()
      strokesRef.current = strokesRef.current.map((candidate, candidateIndex) => (candidateIndex === index ? changeTextFont(item, fontId, createTextMeasure(item.fontSize, fontId)) : candidate))
      renderAll()
    })
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
    // A code block being edited is drawn by its (transparent) editor overlay only, like a label being edited.
    const editingCodeId = codeEditorRef.current?.id ?? null
    const nothingEdited = editingTextId === null && editingCodeId === null
    const items = strokesRef.current
    const liveStroke = activeStrokeRef.current
    const penStrokeFrame = !benchmarkBackground && nothingEdited && liveStroke !== null && liveStroke.kind === 'stroke' && !liveStroke.erase
    const gestureFrame = !benchmarkBackground && nothingEdited && viewportGestureRef.current
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
    const cacheAllowed = !benchmarkBackground && nothingEdited && PAGE_CACHE_ENABLED && drawMode === 'cached'
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
        historyContext.rect(workspaceBoundsRef.current.x, workspaceBoundsRef.current.y, workspaceBoundsRef.current.width, workspaceBoundsRef.current.height)
        historyContext.clip()
        for (const added of appendedItemsForRendering(routeConnectors(items))) drawItem(historyContext, added)
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
      drawLiveStrokeFrame({ page: ctx, base, live, stroke: liveStroke, predicted: PEN_PREDICTION_ENABLED ? predictedPointsRef.current : [], state: liveStateRef.current, transform: liveTransform, clip: workspaceBoundsRef.current })
      if (measureFrame) diagnostics?.recordActiveStrokeRender(performance.now() - activeStrokeRenderStartedAt)
    }
    if (incrementalLive && liveState && liveState.strokeId === liveStroke!.id
      && liveBaseRef.current?.width === canvas.width && liveBaseRef.current.height === canvas.height) {
      drawLiveFrame()
      // No minimap refresh while writing.
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
        pageSpacing,
      ))
    }
    if (benchmarkBackground) benchmarkBackground.onBackgroundRendered(performance.now() - backgroundStartedAt)
    const drawSheetBorders = () => {
      ctx.save()
      ctx.strokeStyle = '#d9dce2'
      ctx.lineWidth = 1
      ctx.strokeRect(sheetBoundsRef.current.x + 0.5, sheetBoundsRef.current.y + 0.5, SHEET_WIDTH - 1, sheetHeightRef.current - 1)
      ctx.restore()
    }
    if (!oneLayer) drawSheetBorders()
    ctx.save()
    ctx.beginPath()
    ctx.rect(workspaceBoundsRef.current.x, workspaceBoundsRef.current.y, workspaceBoundsRef.current.width, workspaceBoundsRef.current.height)
    ctx.clip()
    routeConnectors(strokesRef.current).forEach((item) => {
      if (!selectedKeysRef.current.has(canvasItemKey(item))) return
      if (item.kind === 'rectangle') {
        ctx.save()
        ctx.strokeStyle = '#5574ed'
        ctx.lineWidth = 3
        ctx.setLineDash([7, 4])
        if (itemAngle(item) !== 0) { ctx.translate(item.x + item.width / 2, item.y + item.height / 2); ctx.rotate(itemAngle(item)); ctx.strokeRect(-item.width / 2 - 5, -item.height / 2 - 5, item.width + 10, item.height + 10) }
        else ctx.strokeRect(item.x - 5, item.y - 5, item.width + 10, item.height + 10)
        ctx.restore()
      } else if (item.kind === 'text' || item.kind === 'code') {
        ctx.save()
        ctx.strokeStyle = '#5574ed'
        ctx.lineWidth = 2
        ctx.setLineDash([7, 4])
        if (itemAngle(item) !== 0) { ctx.translate(item.x + item.width / 2, item.y + item.height / 2); ctx.rotate(itemAngle(item)); ctx.strokeRect(-item.width / 2 - 6, -item.height / 2 - 6, item.width + 12, item.height + 12) }
        else ctx.strokeRect(item.x - 6, item.y - 6, item.width + 12, item.height + 12)
        ctx.restore()
      } else if (item.kind === 'connector') {
        drawConnector(ctx, item, '#5574ed', item.strokeWidth + 8)
      } else if (item.kind === 'stroke' && !item.erase) {
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
    target.rect(workspaceBoundsRef.current.x, workspaceBoundsRef.current.y, workspaceBoundsRef.current.width, workspaceBoundsRef.current.height)
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
      const redrawStartedAt = DRAW_READOUT_ENABLED && cacheAllowed ? performance.now() : 0
      canvasItemsForRendering(routeConnectors(items)).forEach((item) => { if (!isItemVisible(item, view)) return; if ((editingTextId === null || item.kind !== 'text' || item.id !== editingTextId) && (editingCodeId === null || item.kind !== 'code' || item.id !== editingCodeId)) drawItem(target, item) })
      if (redrawStartedAt) {
        // Time of this full redraw (zoom, pan, undo, erase, opening a diagram): JS drawing time, and time until the next frame starts.
        const redrawJs = performance.now() - redrawStartedAt
        requestAnimationFrame(() => {
          redrawTrackerRef.current.record(redrawJs, performance.now() - redrawStartedAt)
          if (redrawReadoutRef.current) redrawReadoutRef.current.textContent = formatRedrawSummary(redrawTrackerRef.current.stats, Number(canvas.dataset.visiblePoints ?? 0))
        })
      }
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
      // the stroke eraser never cuts a connector: draw them again over the live erase stroke
      if (!preview && activeStrokeRef.current.erase) for (const item of routeConnectors(items)) if (item.kind === 'connector') drawItem(target, item)
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
      const targetBox = activeConnector.endAttachment ? strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === activeConnector.endAttachment?.rectangleId) : undefined
      if (targetBox) drawSideMidpointDots(ctx, targetBox, viewport.scale)
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
    const hoverKey = hoverKeyRef.current
    if (hoverKey !== null && !selectedKeysRef.current.has(hoverKey) && hoverKey !== `rectangle:${selectedRectangleIdRef.current}`) {
      const hovered = routeConnectors(strokesRef.current).find((item) => canvasItemKey(item) === hoverKey)
      if (hovered) {
        ctx.save()
        ctx.strokeStyle = 'rgba(83, 111, 224, 0.55)'
        ctx.lineWidth = 1.5 / viewport.scale
        if (hovered.kind === 'rectangle') ctx.strokeRect(hovered.x - 4, hovered.y - 4, hovered.width + 8, hovered.height + 8)
        else if (hovered.kind === 'text' || hovered.kind === 'code') ctx.strokeRect(hovered.x - 4, hovered.y - 4, hovered.width + 8, hovered.height + 8)
        else if (hovered.kind === 'connector') drawConnector(ctx, hovered, 'rgba(83, 111, 224, 0.3)', hovered.strokeWidth + 6)
        ctx.restore()
      }
    }
    const handleConnector = soleConnectorWithHandles()
    if (handleConnector) {
      // Excalidraw-style connector handles: a dot on each end, a smaller one mid-path (all a constant size on screen); the box an end would attach to is outlined.
      const scale = viewportRef.current.scale
      const handles = connectorHandlePositions(handleConnector)
      const target = activeEndpointRef.current?.target
      const box = target === null || target === undefined ? undefined : strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === target)
      ctx.save()
      if (box) {
        ctx.strokeStyle = '#5269df'
        ctx.lineWidth = 3 / scale
        ctx.strokeRect(box.x - 4 / scale, box.y - 4 / scale, box.width + 8 / scale, box.height + 8 / scale)
        drawSideMidpointDots(ctx, box, scale)
      }
      ctx.strokeStyle = '#5269df'
      ctx.fillStyle = '#ffffff'
      ctx.lineWidth = 2 / scale
      for (const [dot, radius] of [[handles.start, 6], [handles.end, 6], [handles.middle, 4]] as const) {
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, radius / scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }
    const rotatableSelected = (selectionMode || lassoMode) ? soleRotatable() : null
    const rotatedSelected = rotatableSelected !== null && itemAngle(rotatableSelected) !== 0
    const selected = strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === selectedRectangleIdRef.current)
    if (selected) {
      ctx.save()
      ctx.strokeStyle = '#5269df'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      if (itemAngle(selected) !== 0) { ctx.translate(selected.x + selected.width / 2, selected.y + selected.height / 2); ctx.rotate(itemAngle(selected)); ctx.strokeRect(-selected.width / 2 - 5, -selected.height / 2 - 5, selected.width + 10, selected.height + 10) }
      else ctx.strokeRect(selected.x - 5, selected.y - 5, selected.width + 10, selected.height + 10)
      ctx.restore()
    }
    const soleSelectedRectangle = selectedRectangleIdRef.current !== null
      ? strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === selectedRectangleIdRef.current)
      : selectedKeysRef.current.size === 1
        ? strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && selectedKeysRef.current.has(canvasItemKey(item)))
        : undefined
    const groupBounds = !soleSelectedRectangle && selectedKeysRef.current.size > 1
      ? getCanvasSelectionBounds(routeConnectors(strokesRef.current), selectedKeysRef.current)
      : null
    const soleTextKey = !soleSelectedRectangle && selectedKeysRef.current.size === 1 ? [...selectedKeysRef.current][0] : null
    const textBounds = soleTextKey?.startsWith('text:') || soleTextKey?.startsWith('code:') ? getCanvasSelectionBounds(strokesRef.current, selectedKeysRef.current) : null
    const resizeBounds = rotatedSelected ? undefined : soleSelectedRectangle ?? groupBounds ?? textBounds ?? undefined
    if (rotatableSelected) {
      // Excalidraw-style rotate handle above the item; a rotated item is outlined rotated and has no resize handles.
      const handle = rotateHandle(rotatableSelected, viewportRef.current.scale)
      ctx.save()
      ctx.strokeStyle = '#5269df'
      ctx.fillStyle = '#ffffff'
      ctx.lineWidth = 2 / viewportRef.current.scale
      if (handle) {
        ctx.beginPath()
        ctx.moveTo(handle.anchor.x, handle.anchor.y)
        ctx.lineTo(handle.point.x, handle.point.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(handle.point.x, handle.point.y, 7 / viewportRef.current.scale, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }
    if (groupBounds) {
      ctx.save()
      ctx.strokeStyle = '#5269df'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(groupBounds.x - 5, groupBounds.y - 5, groupBounds.width + 10, groupBounds.height + 10)
      ctx.restore()
    }
    if (soleSelectedRectangle?.inkBox) {
      // Move grip above the top edge: pressing it always moves the whole box, whatever tool is active.
      const grip = inkBoxMoveGrip(soleSelectedRectangle, viewportRef.current.scale)
      ctx.save()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#5269df'
      ctx.lineWidth = 2 / viewportRef.current.scale
      ctx.beginPath()
      ctx.arc(grip.x, grip.y, grip.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      const arm = grip.radius * 0.6
      const tip = grip.radius * 0.28
      ctx.beginPath()
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(grip.x - dx * arm, grip.y - dy * arm)
        ctx.lineTo(grip.x + dx * arm, grip.y + dy * arm)
        ctx.moveTo(grip.x + dx * arm - (dx + dy) * tip * (dx !== 0 ? 1 : 1), grip.y + dy * arm - (dy - dx) * tip)
        ctx.lineTo(grip.x + dx * arm, grip.y + dy * arm)
        ctx.lineTo(grip.x + dx * arm - (dx - dy) * tip, grip.y + dy * arm - (dy + dx) * tip)
      }
      ctx.stroke()
      ctx.restore()
      // Grips on the two dividers: drag them up or down to resize the name, variables and methods sections.
      ctx.save()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#5269df'
      ctx.lineWidth = 2
      for (const dividerY of soleSelectedRectangle.hldShape ? [] : [soleSelectedRectangle.inkBox.top, soleSelectedRectangle.inkBox.mid]) {
        ctx.beginPath()
        ctx.arc(soleSelectedRectangle.x + soleSelectedRectangle.width, dividerY, 7, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
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
    const quickSource = quickConnectSource()
    if (quickSource) {
      // Desktop quick-connect buttons: round, a constant size on screen, with an arrow pointing out; the hovered one is filled stronger and shows a hint.
      const scale = viewportRef.current.scale
      const hovered = activeQuickRef.current?.direction ?? quickHoverRef.current
      ctx.save()
      ctx.lineWidth = 1.5 / scale
      ctx.strokeStyle = '#5269df'
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const button of quickConnectButtons(quickSource, scale, quickInsideSheet)) {
        const { x, y } = button.center
        const r = button.radius
        const k = r * 0.4
        const [dx, dy] = button.direction === 'right' ? [1, 0] : button.direction === 'left' ? [-1, 0] : button.direction === 'up' ? [0, -1] : [0, 1]
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = button.direction === hovered ? 'rgba(83, 111, 224, 0.92)' : 'rgba(255, 255, 255, 0.92)'
        ctx.fill()
        ctx.stroke()
        // Chevron pointing outward: tip at +k along the direction, the two tails behind it.
        ctx.beginPath()
        ctx.strokeStyle = button.direction === hovered ? '#ffffff' : '#5269df'
        ctx.moveTo(x - dx * k - dy * k, y - dy * k - dx * k)
        ctx.lineTo(x + dx * k, y + dy * k)
        ctx.lineTo(x - dx * k + dy * k, y - dy * k + dx * k)
        ctx.stroke()
        ctx.strokeStyle = '#5269df'
        if (button.direction === hovered) {
          const text = quickConnectHint(button.direction)
          ctx.font = `${12 / scale}px system-ui, sans-serif`
          ctx.textBaseline = 'middle'
          const w = ctx.measureText(text).width
          const pad = 6 / scale
          const h = 20 / scale
          const left = view.x + 4 / scale
          const right = view.x + view.width - 4 / scale
          const bx = Math.max(left, Math.min(x - w / 2 - pad, right - w - 2 * pad))
          const by = button.direction === 'down' ? y + r + 6 / scale : y - r - 6 / scale - h
          ctx.fillStyle = 'rgba(30, 36, 60, 0.92)'
          ctx.fillRect(bx, by, w + 2 * pad, h)
          ctx.fillStyle = '#ffffff'
          ctx.textAlign = 'left'
          ctx.fillText(text, bx + pad, by + h / 2)
        }
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
    const guides = guidesRef.current
    if (guides.length > 0) {
      ctx.save()
      ctx.strokeStyle = '#e0245e'
      ctx.lineWidth = 1 / viewport.scale
      ctx.setLineDash([5 / viewport.scale, 3 / viewport.scale])
      ctx.beginPath()
      for (const guide of guides) {
        if (guide.axis === 'x') { ctx.moveTo(guide.position, guide.start); ctx.lineTo(guide.position, guide.end) }
        else { ctx.moveTo(guide.start, guide.position); ctx.lineTo(guide.end, guide.position) }
      }
      ctx.stroke()
      ctx.restore()
    }
    const marqueeNow = activeMarqueeRef.current
    if (marqueeNow) {
      const box = rectFromPoints(marqueeNow.start, marqueeNow.current)
      ctx.save()
      ctx.fillStyle = 'rgba(83, 111, 224, 0.08)'
      ctx.fillRect(box.x, box.y, box.width, box.height)
      ctx.strokeStyle = '#536fe0'
      ctx.lineWidth = 1.5 / viewport.scale
      ctx.setLineDash([6 / viewport.scale, 4 / viewport.scale])
      ctx.strokeRect(box.x, box.y, box.width, box.height)
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
    // Never while a stroke is being written. Otherwise the viewport box moves at once (pinch, pan, minimap drag), using the saved ink
    // picture; the ink itself is redrawn MINIMAP_IDLE_DELAY_MS after the last change (dropped when a stroke starts).
    if (minimapIdleTimerRef.current !== null) {
      window.clearTimeout(minimapIdleTimerRef.current)
      minimapIdleTimerRef.current = null
    }
    if (!activeStrokeRef.current) {
      renderNavigator(false)
      if (!gestureFrame) {
        minimapIdleTimerRef.current = window.setTimeout(() => {
          minimapIdleTimerRef.current = null
          if (activeStrokeRef.current !== null || activePointerRef.current !== null) return
          minimapRenderedAtRef.current = performance.now()
          renderNavigator(true)
        }, MINIMAP_IDLE_DELAY_MS)
      }
    }
    if (measureFrame) diagnostics?.recordMinimapRender(performance.now() - minimapStartedAt)
    if (measureFrame) diagnostics?.recordRenderComplete(performance.now() - renderStartedAt, performance.now())
  }, [color, drawConnector, drawItem, drawStroke, pageBackground, pageSpacing, pageTemplate, renderNavigator, selectionMode, lassoMode, strokeDisplayMode, width])
  const renderAllRef = useRef(renderAll)
  renderAllRef.current = renderAll
  // Excalifont is a web font: load it at start and repaint (dropping the cached ink layer, which may hold fallback letters) when fonts finish loading.
  useEffect(() => {
    const refresh = () => { historyCacheRef.current = null; renderAllRef.current() }
    void loadTextFont(DEFAULT_TEXT_FONT).then(refresh)
    const fonts = typeof document === 'undefined' ? undefined : document.fonts
    fonts?.addEventListener?.('loadingdone', refresh)
    return () => fonts?.removeEventListener?.('loadingdone', refresh)
  }, [])

  /** Sets the page height (ref first, so the very next draw uses it) and keeps the view inside the new page. */
  const applySheetHeight = (next: number) => {
    if (next === sheetHeightRef.current && next === sheetBoundsRef.current.height) return
    sheetHeightRef.current = next
    sheetBoundsRef.current = sheetBoundsFor(next)
    workspaceBoundsRef.current = workspaceBoundsFor(next)
    setSheetHeight(next)
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect && rect.width > 0 && rect.height > 0) viewportRef.current = clampViewportToSheet(viewportRef.current, rect.width, rect.height, next, DESK_MARGIN_PX)
    renderAll()
  }

  /** After a pen lift (or any change): if the newest item ends near the bottom of the page, add a strip, up to the limit. Never shrinks. */
  const growSheetForNewestItem = () => {
    if (pagesRef.current.length > 1) return // growing and several pages stay apart for now: every page keeps the diagram's height
    if (sheetHeightRef.current >= nextSheetHeight(SHEET_MIN_HEIGHT, Infinity)) return
    const newest = strokesRef.current[strokesRef.current.length - 1]
    if (!newest) return
    const next = nextSheetHeight(sheetHeightRef.current, itemBottom(newest))
    if (next === sheetHeightRef.current) return
    applySheetHeight(next)
    scheduleAutosaveBase()
  }

  const cancelSpringBack = () => {
    if (springFrameRef.current === null) return
    cancelAnimationFrame(springFrameRef.current)
    springFrameRef.current = null
    viewportGestureRef.current = false
  }

  /** The pen landed while the view was still springing back: jump to where it was heading so the ink goes where the pen is. */
  const finishSpringBackNow = () => {
    if (springFrameRef.current === null) return
    cancelSpringBack()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect && rect.width > 0 && rect.height > 0) viewportRef.current = clampViewportToSheet(viewportRef.current, rect.width, rect.height, sheetHeightRef.current, DESK_MARGIN_PX)
    renderAll()
  }

  /** After a finger drag stretched the view past its limit (rubber band), eases it back inside, then redraws sharply. */
  const settleViewportGesture = () => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const from = viewportRef.current
    const target = rect && rect.width > 0 && rect.height > 0
      ? clampViewportToSheet(from, rect.width, rect.height, sheetHeightRef.current, DESK_MARGIN_PX)
      : from
    if (Math.abs(from.offsetX - target.offsetX) < 0.5 && Math.abs(from.offsetY - target.offsetY) < 0.5) {
      viewportGestureRef.current = false
      renderAll()
      return
    }
    cancelSpringBack()
    const startedAt = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / SPRING_BACK_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      if (t < 1) {
        viewportRef.current = { ...target, offsetX: from.offsetX + (target.offsetX - from.offsetX) * eased, offsetY: from.offsetY + (target.offsetY - from.offsetY) * eased }
        springFrameRef.current = requestAnimationFrame(step)
        scheduleRender()
        return
      }
      springFrameRef.current = null
      viewportRef.current = target
      viewportGestureRef.current = false
      renderAll()
    }
    springFrameRef.current = requestAnimationFrame(step)
  }

  const applyViewport = (viewport: Viewport, gesture = false) => {
    if (textEditorRef.current) commitTextEditor()
    cancelSpringBack()
    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    // A finger drag may stretch the view a little past its limit (it springs back on release); everything else is held inside.
    const boundedViewport = rect
      ? (gesture
        ? rubberBandViewport(viewport, rect.width, rect.height, sheetHeightRef.current, DESK_MARGIN_PX)
        : clampViewportToSheet(viewport, rect.width, rect.height, sheetHeightRef.current, DESK_MARGIN_PX))
      : viewport
    viewportRef.current = boundedViewport
    setZoomPercent(Math.round(boundedViewport.scale * 100))
    if (gesture) {
      // Pinch and pan: at most one cheap frame per display frame, then one sharp redraw when the fingers settle.
      viewportGestureRef.current = true
      if (gestureSettleTimerRef.current !== null) window.clearTimeout(gestureSettleTimerRef.current)
      gestureSettleTimerRef.current = window.setTimeout(() => {
        gestureSettleTimerRef.current = null
        settleViewportGesture()
      }, GESTURE_SETTLE_MS)
      scheduleRender()
      return
    }
    renderAll()
  }

  const applyViewportRef = useRef(applyViewport)
  applyViewportRef.current = applyViewport

  // Wheel pan / Ctrl + wheel zoom, Space held for pan. The wheel listener is not passive so the page does not scroll or zoom.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const anyGestureBusy = () => activeQuickRef.current !== null || activeMarqueeRef.current !== null || activePointerRef.current !== null || activeConnectorRef.current !== null || activeDragRef.current !== null || activeResizeRef.current !== null || activeRotateRef.current !== null || activeEndpointRef.current !== null || activeDividerRef.current !== null || activeLassoRef.current !== null || lassoDragRef.current !== null || mousePanRef.current !== null
    const setPanCursor = () => applyCursorRef.current()
    const onWheel = (event: WheelEvent) => {
      if (inputModeRef.current !== 'desktop') return
      event.preventDefault()
      if (anyGestureBusy() || touchNav.touchCount() > 0) return
      clickPairRef.current = null
      const rect = canvas.getBoundingClientRect()
      const zoomAllowed = !navigationSettingsRef.current.zoomLocked
      if (event.ctrlKey && !zoomAllowed) return
      const next = wheelViewport(viewportRef.current, event, { x: event.clientX - rect.left, y: event.clientY - rect.top }, rect.height, zoomAllowed)
      if (next !== viewportRef.current) applyViewportRef.current(next, true)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!spaceIsPanKey(event.key, target?.tagName ?? 'BODY', Boolean(target?.isContentEditable), inputModeRef.current)) return
      if (textEditorRef.current) return
      event.preventDefault()
      spaceHeldRef.current = true
      setPanCursor()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ') return
      spaceHeldRef.current = false
      setPanCursor()
    }
    const onBlur = () => { spaceHeldRef.current = false; setPanCursor() }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      viewportRef.current = getInitialViewport(rect.width, rect.height, sheetHeightRef.current)
    }
    viewportRef.current = clampViewportToSheet(viewportRef.current, rect.width, rect.height, sheetHeightRef.current, DESK_MARGIN_PX)
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
      if (springFrameRef.current !== null) cancelAnimationFrame(springFrameRef.current)
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
      if (minimapIdleTimerRef.current !== null) window.clearTimeout(minimapIdleTimerRef.current)
    }
  }, [resizeCanvas])

  useEffect(() => {
    renderAll()
  }, [navigatorMinimized, renderAll])

  // The map box grows with the page; redraw it once the new size is laid out.
  useEffect(() => {
    renderNavigator(true)
  }, [renderNavigator, sheetHeight])

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
    historyCacheRef.current = null
    renderAll()
    scheduleAutosave()
  }, [sketchy, renderAll])

  useEffect(() => {
    savePageSpacing(pageSpacing)
    renderAll()
    scheduleAutosave()
  }, [pageSpacing, renderAll])

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
      const estimatedHeight = 250
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, anchor.right - width))
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
      pressure: pointerPressure(event.pointerType, event.pressure),
    }
  }

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => screenToCanvasPoint(getScreenPoint(event), viewportRef.current)

  const getBoundedPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => clampPointToBounds(getPoint(event), workspaceBoundsRef.current)

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
    setShapeMode(false); setShapeTool(null)
    setSelectionMode(false)
    setLassoMode(false)
    setEraser(false)
    setEraserMenuOpen(false)
    clearLassoSelection()
  }

  const translateWithinWorkspace = (items: CanvasItem[], keys: Set<string>, dx: number, dy: number): CanvasItem[] => {
    const bounds = getCanvasSelectionBounds(routeConnectors(items), keys)
    if (!bounds) return translateSelectedItems(items, keys, dx, dy)
    const translation = clampTranslationToBounds(bounds, dx, dy, workspaceBoundsRef.current)
    return translateSelectedItems(items, keys, translation.dx, translation.dy)
  }

  const snapConnectorEndpointWithinWorkspace = (point: Point) => {
    const snapped = snapConnectorEndpoint(point, strokesRef.current, CONNECTOR_SNAP_TOLERANCE / viewportRef.current.scale, inputModeRef.current === 'desktop')
    return snapped && isPointWithinBounds(snapped.point, workspaceBoundsRef.current) ? snapped : null
  }

  const fitCanvasView = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    applyViewport({ scale: getCoverScale(rect.width, rect.height, sheetBoundsRef.current), offsetX: 0, offsetY: 0 })
  }

  const openAtDefaultView = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    applyViewport(getInitialViewport(rect.width, rect.height, sheetHeightRef.current))
  }

  const fitDrawingView = () => {
    if (navigationSettingsRef.current.zoomLocked) return
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = getCanvasSelectionBounds(routeConnectors(strokesRef.current), new Set(strokesRef.current.map(canvasItemKey)))
    if (!bounds) {
      fitCanvasView()
      return
    }
    const rect = canvas.getBoundingClientRect()
    applyViewport(fitViewportToBounds(bounds, rect.width, rect.height, 48))
  }

  /** Desktop Shift+2: fit the selection with padding (zoom clamped to the limits). With nothing selected, do nothing. */
  const zoomToSelection = (): boolean => {
    if (navigationSettingsRef.current.zoomLocked) return false
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return false
    const keys = currentSelectionKeys()
    if (keys.size === 0) return false
    const bounds = getCanvasSelectionBounds(routeConnectors(strokesRef.current), keys)
    if (!bounds) return false
    applyViewport(fitViewportToBoundsInset(bounds, rect.width, rect.height, DESKTOP_FIT_INSETS, 2))
    return true
  }

  /** Desktop Shift+1: fit the whole drawing into the area clear of the panel and dock, never above 100%. */
  const zoomToFitDesktop = () => {
    if (navigationSettingsRef.current.zoomLocked) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const bounds = getCanvasSelectionBounds(routeConnectors(strokesRef.current), new Set(strokesRef.current.map(canvasItemKey)))
    if (!bounds) {
      fitCanvasView()
      return
    }
    applyViewport(fitViewportToBoundsInset(bounds, rect.width, rect.height, DESKTOP_FIT_INSETS, 1))
  }

  /** Desktop Ctrl+0 and the % readout: 100% zoom around the centre of the current view. */
  const zoomToActualSize = () => {
    if (navigationSettingsRef.current.zoomLocked) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const viewport = viewportRef.current
    const center = { x: rect.width / 2, y: rect.height / 2, pressure: 1 }
    const anchor = screenToCanvasPoint(center, viewport)
    applyViewport({ scale: DEFAULT_ZOOM, offsetX: center.x - anchor.x * DEFAULT_ZOOM, offsetY: center.y - anchor.y * DEFAULT_ZOOM })
  }

  const resetView = () => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    applyViewport({ scale: DEFAULT_ZOOM, offsetX: rect.width / 2 - SHEET_WIDTH / 2 * DEFAULT_ZOOM, offsetY: rect.height / 2 - SHEET_MIN_HEIGHT / 2 * DEFAULT_ZOOM })
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

  const updateTouchPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const next = touchNav.move(event.pointerId, getScreenPoint(event), performance.now(), viewportRef.current)
    if (next) applyViewport(next, true)
  }

  const finishTouchPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    // A cancelled pointer never counts as a tap. Only real touch pointers up can complete a two- or three-finger tap.
    if (event.type !== 'pointerup' || event.pointerType !== 'touch') { touchNav.up(event.pointerId); return }
    const tap = touchNav.up(event.pointerId, performance.now())
    if (!tap || !tapUndoRef.current) return
    // A tap under an open editor or panel must not undo: the editor would later commit its text as an orphan step.
    if (editingBlocksCanvas()) return
    if (tap.fingers === 2) { if (historyRef.current.canUndo) { undo(); showTapToast('Undo') } } else if (historyRef.current.canRedo) { redo(); showTapToast('Redo') }
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
      const inkBoxId = activeStrokeBoxRef.current
      if (!stroke && inkBoxId !== null) stroke = activeStrokeRef.current
      if (!stroke && shapeToolRef.current !== null) {
        stroke = activeStrokeRef.current
      } else if (!stroke && mouseGestureRef.current && !shapeMode) {
        // A mouse is often held still while the user thinks: no hold-to-snap for it (the Shapes tool still recognises shapes).
        stroke = activeStrokeRef.current
      } else if (!stroke) {
        const heldStroke = activeStrokeRef.current
        const heldForMs = performance.now() - lastSignificantMoveAtRef.current
        const heldLongEnough = heldForMs >= SHAPE_RECOGNITION_HOLD_MS
        const recognizedShape = shapeMode
          ? recognizeShape(heldStroke)
          : recognizeClosedShapeOnHold(heldStroke, heldForMs, nextRectangleIdRef.current) ?? heldStroke
        if (!shapeMode && recognizedShape.kind === 'rectangle') nextRectangleIdRef.current += 1
        stroke = recognizedShape.kind === 'rectangle' || (recognizedShape.kind === 'stroke' && recognizedShape.shape)
          ? recognizedShape
          : heldLongEnough ? recognizeLine(heldStroke) : heldStroke
      }
      const lineTool = shapeToolRef.current === 'line' || shapeToolRef.current === 'arrow' ? shapeToolRef.current : null
      // Desktop Arrow tool with a mouse: a drag that starts or ends on a plain or HLD shape makes an attached arrow connector instead of a stroke.
      let arrowConnector: ConnectorObject | null = null
      if (lineTool === 'arrow' && inputModeRef.current === 'desktop' && mouseGestureRef.current && stroke.kind === 'stroke' && !stroke.erase && stroke.points.length >= 2) {
        const first = stroke.points[0]
        const last = stroke.points[stroke.points.length - 1]
        if (Math.hypot(last.x - first.x, last.y - first.y) >= 4) {
          arrowConnector = arrowToolConnector(strokesRef.current, first, last, { id: nextConnectorIdRef.current, color: stroke.color, width: stroke.width, dash: lineDashDefaultRef.current === 'solid' ? undefined : lineDashDefaultRef.current }, CONNECTOR_SNAP_TOLERANCE / viewportRef.current.scale)
          if (arrowConnector) nextConnectorIdRef.current += 1
        }
      }
      if (arrowConnector) {
        // handled below: the connector replaces the stroke
      } else if (lineTool && stroke.kind === 'stroke' && !stroke.erase) {
        // Straight line or arrow from the press point to the release point; a click without a drag adds nothing.
        const first = stroke.points[0]
        const last = stroke.points[stroke.points.length - 1]
        stroke = Math.hypot(last.x - first.x, last.y - first.y) < 4 ? { ...stroke, points: [first] } : { ...stroke, shape: lineTool, points: [first, last], ...(lineDashDefaultRef.current !== 'solid' ? { dash: lineDashDefaultRef.current } : {}) }
      } else if (stroke.kind === 'stroke' && STROKE_THINNING_ENABLED) stroke = thinStroke(stroke)
      const targetBox = inkBoxId !== null && stroke.kind === 'stroke'
        ? strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === inkBoxId && item.inkBox !== undefined)
        : undefined
      if (targetBox && stroke.kind === 'stroke') {
        // The box keeps its own ink: it is one item, so move, undo and erase treat box and writing together.
        const grown = addStrokeToInkBox(targetBox, stroke)
        // The box just written in comes to the front, so its grown area and ink are never hidden under a neighbouring box.
        strokesRef.current = [...strokesRef.current.filter((item) => item !== targetBox), grown]
      } else if (arrowConnector) {
        strokesRef.current.push(arrowConnector)
        if (!toolLockRef.current) selectNewConnectorRef.current(canvasItemKey(arrowConnector))
      } else {
        strokesRef.current.push(stroke)
        if (stroke.kind === 'stroke' && stroke.erase) strokesRef.current = compactAfterErase(strokesRef.current, () => nextStrokeIdRef.current++)
      }
      setHasInk(true)
    }
    activeStrokeBoxRef.current = null
    activeStrokeRef.current = null
    predictedPointsRef.current = []
    activeConnectorRef.current = null
    shapePreviewRef.current = null
    activePointerRef.current = null
    activeDragRef.current = null
    holdAnchorRef.current = null
    lastSignificantMoveAtRef.current = 0
    scheduleRender()
  }, [performanceDiagnosticsOpen, scheduleRender, shapeMode])

  const appendStrokeSample = (pointerId: number, point: Point): boolean => {
    const stroke = activeStrokeRef.current
    if (!stroke) return false
    const previous = stroke.points[stroke.points.length - 1]
    const clippedPoint = clipSegmentToBounds(previous, point, sheetBoundsRef.current)
    if (clippedPoint && shouldAppendStrokeSample(previous, clippedPoint)) {
      stroke.points.push(clippedPoint)
      // The line and arrow tools show a straight segment from the press point while dragging.
      if (shapeToolRef.current === 'line' || shapeToolRef.current === 'arrow') stroke.points = [stroke.points[0], clippedPoint]
    }
    if (!isPointWithinBounds(point, workspaceBoundsRef.current)) {
      finishStroke(pointerId)
      return false
    }
    return true
  }

  /** A circle at the pen tip shows what the eraser will remove: it follows the pen while it hovers and while it erases. It is a plain element moved directly, so it costs no canvas redraw. */
  const hideEraserCursor = () => {
    const cursor = eraserCursorRef.current
    if (cursor) cursor.style.display = 'none'
  }
  const moveEraserCursor = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const cursor = eraserCursorRef.current
    if (!cursor) return
    const ringPointer = event.pointerType === 'pen' || (event.pointerType === 'mouse' && inputModeRef.current === 'desktop')
    if ((!eraser && !isPenButtonHeld(event)) || !ringPointer) {
      cursor.style.display = 'none'
      return
    }
    // Different looks: the stroke eraser is a round circle of its real width; the whole eraser is a small square with an X.
    cursor.classList.toggle('whole', objectEraser)
    const rect = event.currentTarget.getBoundingClientRect()
    const diameter = eraserCursorDiameter(eraserSize, viewportRef.current.scale, objectEraser)
    cursor.style.display = 'block'
    cursor.style.width = `${diameter}px`
    cursor.style.height = `${diameter}px`
    cursor.style.transform = `translate(${event.clientX - rect.left - diameter / 2}px, ${event.clientY - rect.top - diameter / 2}px)`
    // Lifting the pen away sends no event, so the circle also hides after a short quiet moment (never while the pen is erasing).
    if (eraserCursorTimerRef.current !== null) window.clearTimeout(eraserCursorTimerRef.current)
    eraserCursorTimerRef.current = window.setTimeout(() => {
      eraserCursorTimerRef.current = null
      if (activePointerRef.current === null && activeObjectEraserRef.current === null) hideEraserCursor()
    }, ERASER_CURSOR_QUIET_MS)
  }

  const showPenButtonState = (type: string, event: React.PointerEvent<HTMLCanvasElement>) => {
    const readout = penButtonReadoutRef.current
    if (readout && event.pointerType === 'pen') readout.textContent = describePenEvent(type, event.nativeEvent)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    showPenButtonState('down', event)
    // Any press ends a pending click pair unless it is the second plain click of one (decided below, once the press is known to start a gesture).
    const priorClickPair = clickPairRef.current
    clickPairRef.current = null
    lastPointerTypeRef.current = event.pointerType
    // A pen landing ends a mouse marquee still being dragged (the pen always wins over the mouse).
    if (event.pointerType === 'pen' && activeMarqueeRef.current) { activeMarqueeRef.current = null; renderAll() }
    moveEraserCursor(event)
    // A pen landing cancels a connector handle gesture a finger owns (palm rejection: the pen wins).
    if (event.pointerType === 'pen' && activeEndpointRef.current?.pointerType === 'touch') cancelConnectorHandleGesture()
    if (event.pointerType === 'pen') touchNav.penDown()
    if (event.pointerType === 'touch') {
      event.preventDefault()
      const touchHandle = activeEndpointRef.current?.pointerType === 'touch' ? activeEndpointRef.current : null
      if (touchHandle) {
        // A second finger ends the handle drag (originals restored, no history step) and both fingers go to navigation (pinch, three-finger pan).
        const firstId = touchHandle.pointerId
        const firstStart = touchHandle.startScreen
        cancelConnectorHandleGesture()
        touchNav.down(firstId, firstStart, performance.now())
        touchNav.cancelTap() // the cancelled handle drag must not turn into an undo
      } else if (touchNav.touchCount() === 0 && activeEndpointRef.current === null && !touchNav.penNear(performance.now()) && startConnectorHandleGesture(event, getPoint(event))) {
        // A single finger on a handle of the selected connector drags it (Select / lasso) when no pen is near or down; every other touch is navigation.
        return
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      touchNav.down(event.pointerId, getScreenPoint(event), performance.now())
      // Laser: one finger draws the trail; a second finger ends it and both fingers go to navigation (pinch, three-finger pan).
      if (laserModeRef.current) {
        const laserAction = laserOnTouchDown(laserPointerRef.current === null ? null : laserPointerTypeRef.current, touchNav.touchCount(), touchNav.penNear(performance.now()))
        if (laserAction === 'start') { laserPointerRef.current = event.pointerId; laserPointerTypeRef.current = 'touch'; pushLaserPoints([event]) } else if (laserAction === 'clear') { laserPointerRef.current = null; laserPointerTypeRef.current = null }
      }
      return
    }
    const penGestureActive = activePointerRef.current !== null || activeConnectorRef.current !== null || activeDragRef.current !== null || activeResizeRef.current !== null || activeRotateRef.current !== null || activeEndpointRef.current !== null || activeDividerRef.current !== null || activeLassoRef.current !== null || lassoDragRef.current !== null || activeQuickRef.current !== null
    const anyGestureActive = penGestureActive || textTapRef.current !== null || classTapRef.current !== null || activeObjectEraserRef.current !== null || minimapDragPointerRef.current !== null || umlToolboxDragRef.current !== null || mousePanRef.current !== null || activeMarqueeRef.current !== null
    if (startsMousePan(event.pointerType, event.button, inputModeRef.current, spaceHeldRef.current)) {
      // Middle button, or Space + left button: drag the view instead of using a tool. Refused while any other gesture or finger is active.
      if (anyGestureActive || mousePanRef.current !== null || touchNav.touchCount() > 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      finishSpringBackNow()
      if (textEditorRef.current) commitTextEditor()
      mousePanRef.current = { pointerId: event.pointerId, start: getScreenPoint(event), startViewport: viewportRef.current }
      touchNav.mouseDown()
      event.currentTarget.style.cursor = 'grabbing'
      return
    }
    // Laser pointer: handled before any drawing, selection or editing logic, and only while the laser is on. Pen and mouse (main button) draw the trail; touch is handled in the touch branch above.
    if (laserModeRef.current && (event.pointerType === 'pen' || (event.pointerType === 'mouse' && event.button === 0))) {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      if (event.pointerType === 'mouse') touchNav.mouseDown()
      laserPointerRef.current = event.pointerId
      laserPointerTypeRef.current = event.pointerType
      pushLaserPoints([event])
      return
    }
    if (!canStartCanvasGesture(event.pointerType, event.button, inputModeRef.current, penGestureActive, anyGestureActive, touchNav.touchCount() > 0)) return
    mouseGestureRef.current = event.pointerType === 'mouse'
    if (mouseGestureRef.current) touchNav.mouseDown()
    lastNudgeAtRef.current = null
    event.preventDefault()
    finishSpringBackNow()
    const rawPoint = getPoint(event)
    // The desk around the page is not writable: a pen landing there does nothing.
    if (!isPointWithinBounds(rawPoint, sheetBoundsRef.current)) return
    const point = getBoundedPoint(event)
    // Holding the S Pen button turns this stroke into an erase with the eraser used last (mode and size); letting go goes back to the pen.
    const buttonErase = !eraser && isPenButtonHeld(event.nativeEvent)
    penButtonEraseRef.current = buttonErase
    if (textEditorRef.current) commitTextEditor()
    if (event.pointerType === 'mouse' && inputModeRef.current === 'desktop' && event.button === 0 && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const { pair, continued } = clickPairOnDown(priorClickPair, { x: event.clientX, y: event.clientY, at: performance.now(), context: `${pageIndexRef.current}:${clickToolName()}:${viewportRef.current.scale}:${viewportRef.current.offsetX}:${viewportRef.current.offsetY}` })
      clickPairRef.current = pair
      if (!continued) clickBeforeRef.current = { items: strokesRef.current.slice(), history: historyRef.current.capture(), owner: historyRef.current }
    }
    if (event.pointerType === 'mouse') setMouseHover(null)
    if (selectionMode && startQuickConnectPress(event, point)) return
    if ((selectionMode || lassoMode) && (event.pointerType !== 'mouse' || event.button === 0) && startConnectorHandleGesture(event, point)) return
    if (event.pointerType === 'mouse' && inputModeRef.current === 'desktop') {
      if (event.shiftKey && !eraser) {
        // Shift + click adds or removes one item (a stroke too) without starting anything else.
        const shiftHit = shiftClickTarget(routeConnectors(strokesRef.current), point, viewportRef.current.scale)
        if (shiftHit) {
          applySelectionState(normalizeSelection(toggleGroupKeys(strokesRef.current, selectionKeysWithBox(), shiftHit.key)))
          return
        }
      }
      // Desktop: a left click selects the box, connector or text under it with any tool but the eraser, and dragging moves it.
      const clicked = clickSelectTarget(routeConnectors(strokesRef.current), point, viewportRef.current.scale, clickToolName(), selectedKeysRef.current.size > 0, selectedRectangleIdRef.current, event.altKey)
      if (clicked && selectedKeysRef.current.size > 1 && selectedKeysRef.current.has(clicked.key)) {
        // Pressing on a member of a group selection moves the whole group.
        startGroupDrag(event, point)
        return
      }
      const clickedItem = clicked ? selectHitTarget(clicked) : null
      if (clicked && clickedItem && selectedKeysRef.current.size > 1 && selectedKeysRef.current.has(clicked.key)) {
        // The click selected a whole group: dragging it moves every member.
        startGroupDrag(event, point)
        return
      }
      if (clicked && clickedItem) {
        event.currentTarget.setPointerCapture(event.pointerId)
        activeDragRef.current = { pointerId: event.pointerId, itemKey: clicked.key, start: point, originalItems: strokesRef.current.slice(), moved: false, editTextId: null, editClassBoxId: null, ...(duplicatePress(event) ? { duplicate: true } : {}) }
        return
      }
    }
    const boxShape = shapeTool === 'rectangle' || shapeTool === 'diamond' || shapeTool === 'ellipse' ? shapeTool : null
    if (boxShape) {
      // Press where the shape starts and drag to size it (Shift keeps it square); a plain click makes a default-sized shape.
      event.currentTarget.setPointerCapture(event.pointerId)
      saveHistory()
      const plainBox = createShapeBox(nextRectangleIdRef.current++, point.x, point.y, 4, 4, color, width, boxShape)
      const dashedBox = lineDashDefaultRef.current !== 'solid' ? { ...plainBox, dash: lineDashDefaultRef.current } : plainBox
      const box = sketchyRef.current ? withSketchSeed(dashedBox) : dashedBox
      strokesRef.current.push(box)
      setHasInk(true)
      activeResizeRef.current = {
        pointerId: event.pointerId,
        rectangleId: box.id,
        selectedKeys: null,
        handle: 'se',
        start: { x: box.x + box.width, y: box.y + box.height, pressure: 1 },
        originalBounds: { x: box.x, y: box.y, width: box.width, height: box.height },
        originalItems: strokesRef.current.slice(),
        moved: false,
        created: true,
      }
      renderAll()
      return
    }
    if (textMode) {
      event.currentTarget.setPointerCapture(event.pointerId)
      textTapRef.current = { pointerId: event.pointerId, point }
      return
    }
    if (classMode && inkClassTool) {
      // Press where the box's top-left corner goes, then drag to size it; a plain tap makes a default-sized box.
      event.currentTarget.setPointerCapture(event.pointerId)
      saveHistory()
      const newBox = hldShapeTool
        ? createHldShape(nextRectangleIdRef.current++, point.x, point.y, INK_BOX_MIN_WIDTH, INK_BOX_MIN_HEIGHT, color, CLASS_BOX_DEFAULT_STROKE_WIDTH, hldShapeTool)
        : createInkClassBox(nextRectangleIdRef.current++, point.x, point.y, INK_BOX_MIN_WIDTH, INK_BOX_MIN_HEIGHT, color, CLASS_BOX_DEFAULT_STROKE_WIDTH)
      const box = sketchyRef.current ? withSketchSeed(newBox) : newBox
      strokesRef.current.push(box)
      setHasInk(true)
      activeResizeRef.current = {
        pointerId: event.pointerId,
        rectangleId: box.id,
        selectedKeys: null,
        handle: 'se',
        start: { x: box.x + box.width, y: box.y + box.height, pressure: 1 },
        originalBounds: { x: box.x, y: box.y, width: box.width, height: box.height },
        originalItems: strokesRef.current.slice(),
        moved: false,
        created: true,
      }
      renderAll()
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
    if (selectionMode || lassoMode) {
      const rotating = soleRotatable()
      if (rotating && hitRotateHandle(rotating, point, viewportRef.current.scale)) {
        event.currentTarget.setPointerCapture(event.pointerId)
        activeRotateRef.current = { pointerId: event.pointerId, key: canvasItemKey(rotating), originalItems: strokesRef.current.slice(), moved: false }
        return
      }
    }
    if (lassoMode) {
      const selectedItems = routeConnectors(strokesRef.current).filter((item) => selectedKeysRef.current.has(canvasItemKey(item)))
      const singleSelectedRectangle = selectedItems.length === 1 && selectedItems[0].kind === 'rectangle' ? selectedItems[0] : null
      const selectedBounds = singleSelectedRectangle
        ? { x: singleSelectedRectangle.x, y: singleSelectedRectangle.y, width: singleSelectedRectangle.width, height: singleSelectedRectangle.height }
        : (selectedItems.length > 1 || (selectedItems.length === 1 && selectedItems[0].kind === 'text') || (selectedItems.length === 1 && selectedItems[0].kind === 'code')) ? getCanvasSelectionBounds(routeConnectors(strokesRef.current), selectedKeysRef.current) : null
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
      const lassoInkBox = singleSelectedRectangle?.inkBox ? singleSelectedRectangle : null
      if (lassoInkBox && hitInkBoxMoveGrip(lassoInkBox, point, viewportRef.current.scale)) {
        event.currentTarget.setPointerCapture(event.pointerId)
        lassoDragRef.current = { pointerId: event.pointerId, start: point, keys: new Set(selectedKeysRef.current), originalItems: strokesRef.current.slice(), moved: false }
        return
      }
      const lassoDividerHit = lassoInkBox ? hitInkBoxDivider(lassoInkBox, point, 14 / viewportRef.current.scale) : null
      if (lassoInkBox && lassoDividerHit) {
        event.currentTarget.setPointerCapture(event.pointerId)
        activeDividerRef.current = { pointerId: event.pointerId, rectangleId: lassoInkBox.id, which: lassoDividerHit, originalItems: strokesRef.current.slice(), moved: false }
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
      const soleTextKey = selectedKeysRef.current.size === 1 ? [...selectedKeysRef.current][0] : null
      if (selectedKeysRef.current.size > 1 || soleTextKey?.startsWith('text:') || soleTextKey?.startsWith('code:')) {
        // A group selection (Shift + click, marquee, Select all): its handles resize it and pressing a member moves it, as with the lasso.
        const routed = routeConnectors(strokesRef.current)
        const groupBounds = getCanvasSelectionBounds(routed, selectedKeysRef.current)
        const groupHandle = groupBounds ? hitTestRectangleResizeHandle(groupBounds, point, 14 / viewportRef.current.scale) : null
        if (groupBounds && groupHandle) {
          event.currentTarget.setPointerCapture(event.pointerId)
          activeResizeRef.current = { pointerId: event.pointerId, rectangleId: null, selectedKeys: new Set(selectedKeysRef.current), handle: groupHandle, start: point, originalBounds: { ...groupBounds }, originalItems: strokesRef.current.slice(), moved: false }
          return
        }
        if (selectedKeysRef.current.size > 1 && routed.some((item) => selectedKeysRef.current.has(canvasItemKey(item)) && itemHitTest(item, point, 12 / viewportRef.current.scale))) {
          startGroupDrag(event, point)
          return
        }
      }
      // Alt + click with the mouse looks through code blocks, so a shape or label under a block can still be reached.
      const passThroughCode = event.altKey && event.pointerType === 'mouse' && inputModeRef.current === 'desktop'
      if (event.pointerType === 'mouse' && inputModeRef.current === 'desktop' && !hitTarget(routeConnectors(strokesRef.current), point, viewportRef.current.scale, passThroughCode)) {
        // Empty space with the mouse: a marquee (Shift keeps the old selection); released, it selects what is fully inside.
        const before = selectionKeysWithBox()
        const base = event.shiftKey ? before : new Set<string>()
        if (!event.shiftKey) applySelectionState({ keys: [], rectangleId: null })
        event.currentTarget.setPointerCapture(event.pointerId)
        activeMarqueeRef.current = { pointerId: event.pointerId, start: point, current: point, shift: event.shiftKey, base, before }
        return
      }
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
          labelKeys: resizeLabelKeys(event, strokesRef.current, currentlySelectedRectangle),
        }
        return
      }
      const selectedInkBox = currentlySelectedRectangle?.inkBox ? currentlySelectedRectangle : null
      if (selectedInkBox && hitInkBoxMoveGrip(selectedInkBox, point, viewportRef.current.scale)) {
        event.currentTarget.setPointerCapture(event.pointerId)
        activeDragRef.current = { pointerId: event.pointerId, itemKey: canvasItemKey(selectedInkBox), start: point, originalItems: strokesRef.current.slice(), moved: false, editTextId: null, editClassBoxId: null }
        return
      }
      const dividerHit = selectedInkBox ? hitInkBoxDivider(selectedInkBox, point, 14 / viewportRef.current.scale) : null
      if (selectedInkBox && dividerHit) {
        event.currentTarget.setPointerCapture(event.pointerId)
        activeDividerRef.current = { pointerId: event.pointerId, rectangleId: selectedInkBox.id, which: dividerHit, originalItems: strokesRef.current.slice(), moved: false }
        return
      }
      const previouslySelectedRectangleId = selectedRectangleIdRef.current
      // Same order as hitTarget: label, code block, box, connector.
      const textHit = hitTestText(point)
      const codeHit = textHit || passThroughCode ? null : hitTestCode(point)
      const rectangle = textHit || codeHit ? null : hitTestRectangle(point)
      const connector = textHit || codeHit || rectangle ? null : hitTestConnector(point)
      const textWasSelected = textHit !== null && selectedKeysRef.current.has(canvasItemKey(textHit))
      setSelectedRectangle(rectangle?.id ?? null)
      updateSelectedItems(textHit ? [canvasItemKey(textHit)] : codeHit ? [canvasItemKey(codeHit)] : connector ? [canvasItemKey(connector)] : [])
      renderAll()
      // A press on the label of a connector that was not selected selects it and starts the label drag (a plain click only selects).
      if (connector && !textHit && !codeHit && !rectangle && (event.pointerType !== 'mouse' || event.button === 0) && !duplicatePress(event) && expandSelectionState({ keys: [canvasItemKey(connector)], rectangleId: null }).keys.length === 1 && startConnectorHandleGesture(event, point, true)) return
      const selectedItem = textHit ?? codeHit ?? rectangle ?? connector
      if (!selectedItem) return
      // A member of a group selects the whole group and a drag moves every member (mouse, pen and touch alike).
      const pressedGroup = expandSelectionState({ keys: [canvasItemKey(selectedItem)], rectangleId: null })
      if (pressedGroup.keys.length > 1) {
        applySelectionState(pressedGroup)
        startGroupDrag(event, point)
        return
      }
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
        ...(duplicatePress(event) ? { duplicate: true } : {}),
      }
      return
    }
    if (!eraser && !buttonErase && !shapeMode && shapeTool === null && selectedRectangleIdRef.current !== null) {
      // A selected ink class box: its handles, dividers and border come first, so resizing or moving never draws ink. Only presses inside write.
      const selectedBox = strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === selectedRectangleIdRef.current && item.inkBox !== undefined)
      if (selectedBox) {
        const tolerance = 14 / viewportRef.current.scale
        if (hitInkBoxMoveGrip(selectedBox, point, viewportRef.current.scale)) {
          event.currentTarget.setPointerCapture(event.pointerId)
          activeDragRef.current = { pointerId: event.pointerId, itemKey: canvasItemKey(selectedBox), start: point, originalItems: strokesRef.current.slice(), moved: false, editTextId: null, editClassBoxId: null }
          return
        }
        const handle = hitTestRectangleResizeHandle(selectedBox, point, tolerance)
        if (handle) {
          event.currentTarget.setPointerCapture(event.pointerId)
          activeResizeRef.current = {
            pointerId: event.pointerId,
            rectangleId: selectedBox.id,
            selectedKeys: null,
            handle,
            start: point,
            originalBounds: { x: selectedBox.x, y: selectedBox.y, width: selectedBox.width, height: selectedBox.height },
            originalItems: strokesRef.current.slice(),
            moved: false,
            labelKeys: resizeLabelKeys(event, strokesRef.current, selectedBox),
          }
          return
        }
        const divider = hitInkBoxDivider(selectedBox, point, tolerance)
        if (divider) {
          event.currentTarget.setPointerCapture(event.pointerId)
          activeDividerRef.current = { pointerId: event.pointerId, rectangleId: selectedBox.id, which: divider, originalItems: strokesRef.current.slice(), moved: false }
          return
        }
        const band = 26 / viewportRef.current.scale
        const nearBorder = point.x >= selectedBox.x - band && point.x <= selectedBox.x + selectedBox.width + band
          && point.y >= selectedBox.y - band && point.y <= selectedBox.y + selectedBox.height + band
          && (point.x <= selectedBox.x + band || point.x >= selectedBox.x + selectedBox.width - band
            || point.y <= selectedBox.y + band || point.y >= selectedBox.y + selectedBox.height - band)
        if (nearBorder) {
          event.currentTarget.setPointerCapture(event.pointerId)
          activeDragRef.current = { pointerId: event.pointerId, itemKey: canvasItemKey(selectedBox), start: point, originalItems: strokesRef.current.slice(), moved: false, editTextId: null, editClassBoxId: null }
          return
        }
        // Writing somewhere else puts the box away (no handles) so they never get in the way of the page.
        if (!findInkBoxAt([selectedBox], point)) {
          setSelectedRectangle(null)
          renderAll()
        }
      }
    }
    if ((eraser || buttonErase) && objectEraser) {
      event.currentTarget.setPointerCapture(event.pointerId)
      activeObjectEraserRef.current = { pointerId: event.pointerId, lastPoint: point, changed: false }
      if (deleteWholeObjectAtPoint(point)) renderAll()
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointerRef.current = event.pointerId
    lastSignificantMoveAtRef.current = performance.now()
    activeStrokeBoxRef.current = shapeMode || shapeTool !== null ? null : findInkBoxAt(strokesRef.current, point)?.id ?? null
    activeStrokeRef.current = eraser || buttonErase
      ? createEraserStroke(nextStrokeIdRef.current++, point, color, eraserSize)
      : { kind: 'stroke', id: nextStrokeIdRef.current++, points: [point], color, width, erase: false }
    const diagnostics = performanceDiagnosticsRef.current
    if (!eraser && !buttonErase && diagnostics?.isCapturing()) {
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
    cancelEdgeHold()
    if (event.pointerType === 'pen' && !eraser && !buttonErase && !shapeMode && shapeTool === null) {
      const edgeBox = edgeBandBox(strokesRef.current, point, viewportRef.current.scale)
      if (edgeBox && edgeBox.id !== selectedRectangleIdRef.current && !selectedKeysRef.current.has(canvasItemKey(edgeBox))) {
        const pointerId = event.pointerId
        edgeHoldRef.current = { pointerId, boxId: edgeBox.id, start: point, startedAt: performance.now(), timer: window.setTimeout(() => fireEdgeHold(pointerId), EDGE_HOLD_MS) }
      }
    }
    if (activeStrokeBoxRef.current === null) scheduleShapePreview(point)
    scheduleRender()
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (PEN_BUTTON_DEBUG) showPenButtonState('move', event)
    if (event.pointerType === 'pen') touchNav.penSeen(performance.now())
    moveEraserCursor(event)
    if (laserPointerRef.current === event.pointerId) {
      if (event.pointerType !== 'touch' || touchNav.touchCount() === 1) pushLaserPoints(event.nativeEvent.getCoalescedEvents?.().length ? event.nativeEvent.getCoalescedEvents() : [event])
      else laserPointerRef.current = null
      if (event.pointerType !== 'touch') { event.preventDefault(); return }
    }
    if (event.pointerType === 'mouse' && inputModeRef.current === 'desktop') cursorPointRef.current = getScreenPoint(event)
    if (clickPairRef.current && event.pointerType === 'mouse') clickPairRef.current = clickPairOnMove(clickPairRef.current, event.clientX, event.clientY)
    const mousePan = mousePanRef.current
    if (mousePan && mousePan.pointerId === event.pointerId) {
      event.preventDefault()
      const now = getScreenPoint(event)
      applyViewport(panViewport(mousePan.startViewport, now.x - mousePan.start.x, now.y - mousePan.start.y), true)
      return
    }
    if (activeEndpointRef.current?.pointerId === event.pointerId) { moveConnectorHandleGesture(event); return }
    if (activeQuickRef.current?.pointerId === event.pointerId) { moveQuickConnectPress(event); return }
    if (touchNav.tracks(event.pointerId) || event.pointerType === 'touch') {
      event.preventDefault()
      updateTouchPoint(event)
      return
    }
    if (event.pointerType === 'mouse' && event.buttons === 0 && inputModeRef.current === 'desktop') setMouseHover(getPoint(event))
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
          if (isPointWithinBounds(sweepPoint, workspaceBoundsRef.current) && deleteWholeObjectAtPoint(sweepPoint)) changed = true
        }
        objectEraseGesture.lastPoint = point
      }
      if (changed) renderAll()
      return
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
    const activeDivider = activeDividerRef.current
    if (activeDivider?.pointerId === event.pointerId) {
      event.preventDefault()
      const point = getBoundedPoint(event)
      const original = activeDivider.originalItems.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === activeDivider.rectangleId)
      if (!original) return
      const moved = moveInkBoxDivider(original, activeDivider.which, point.y)
      if (moved === original) return
      if (!activeDivider.moved) {
        saveHistory()
        activeDivider.moved = true
      }
      strokesRef.current = activeDivider.originalItems.map((item) => (item === original ? moved : item))
      renderAll()
      return
    }
    const activeRotate = activeRotateRef.current
    if (activeRotate?.pointerId === event.pointerId) {
      event.preventDefault()
      const original = activeRotate.originalItems.find((item) => canvasItemKey(item) === activeRotate.key)
      if (!original) return
      const point = getPoint(event)
      let angle = angleFromCenter(original, point)
      if (event.shiftKey) angle = snapAngle(angle, 15)
      if (!activeRotate.moved) { saveHistory(); activeRotate.moved = true }
      strokesRef.current = setItemAngle(activeRotate.originalItems, activeRotate.key, angle)
      renderAll()
      bumpSelectionColor((n) => n + 1)
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
      if (activeResize.created && event.shiftKey && activeResize.rectangleId !== null && shapeToolRef.current !== null) {
        const side = Math.max(bounds.width, bounds.height)
        bounds.width = side
        bounds.height = side
      }
      const original = activeResize.originalBounds
      const unchanged = bounds.x === original.x && bounds.y === original.y
        && bounds.width === original.width && bounds.height === original.height
      if (!activeResize.moved && unchanged) return
      const nextItems = activeResize.rectangleId !== null
        ? (() => {
          const resized = resizeRectangleItems(activeResize.originalItems, activeResize.rectangleId, bounds)
          return activeResize.labelKeys ? followResizeLabels(resized, activeResize.rectangleId, original, bounds, activeResize.labelKeys, createTextMeasure) : resized
        })()
        : activeResize.selectedKeys?.size === 1 && [...activeResize.selectedKeys][0].startsWith('text:')
          ? resizeTextItem(activeResize.originalItems, Number([...activeResize.selectedKeys][0].slice('text:'.length)), original, bounds, activeResize.handle)
          : resizeSelectedItems(activeResize.originalItems, activeResize.selectedKeys ?? new Set(), bounds)
      if (!activeResize.moved) {
        if (!activeResize.created) saveHistory()
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
      const lassoDup = lassoDrag.duplicate ? beginDuplicate(lassoDrag, lassoDrag.originalItems, lassoDrag.keys, event) : null
      const lassoBase = lassoDup?.items ?? lassoDrag.originalItems
      const lassoKeys = lassoDup ? lassoDup.copyKeys : withCarriedLabels(event, lassoDrag.originalItems, lassoDrag.keys)
      const lassoSnap = snapDragDelta(event, lassoBase, lassoKeys, deltaX, deltaY)
      const nextItems = translateWithinWorkspace(lassoBase, lassoKeys, lassoSnap.dx, lassoSnap.dy)
      if (!lassoDrag.moved && nextItems.every((item, index) => item === lassoBase[index])) return
      if (!lassoDrag.moved) {
        saveHistory()
        lassoDrag.moved = true
      }
      strokesRef.current = nextItems
      if (lassoDup && !lassoDup.selected) { lassoDup.selected = true; applySelectionState(normalizeSelection(lassoDup.selectedKeys)) }
      renderAll()
      return
    }
    const activeLasso = activeLassoRef.current
    if (activeLasso?.pointerId === event.pointerId) {
      event.preventDefault()
      const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
      for (const sample of samples) {
        const rect = event.currentTarget.getBoundingClientRect()
        const point = clampPointToBounds(screenToCanvasPoint({ x: sample.clientX - rect.left, y: sample.clientY - rect.top, pressure: sample.pressure }, viewportRef.current), workspaceBoundsRef.current)
        const previous = activeLasso.points[activeLasso.points.length - 1]
        if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 1.5) activeLasso.points.push(point)
      }
      scheduleRender()
      return
    }
    const marquee = activeMarqueeRef.current
    if (marquee?.pointerId === event.pointerId) {
      event.preventDefault()
      marquee.current = getBoundedPoint(event)
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
      const dragDup = drag.duplicate ? beginDuplicate(drag, drag.originalItems, new Set([drag.itemKey]), event) : null
      const dragBase = dragDup?.items ?? drag.originalItems
      const dragKeys = dragDup ? dragDup.copyKeys : withCarriedLabels(event, drag.originalItems, new Set([drag.itemKey]))
      const dragSnap = snapDragDelta(event, dragBase, dragKeys, deltaX, deltaY)
      const nextItems = translateWithinWorkspace(dragBase, dragKeys, dragSnap.dx, dragSnap.dy)
      if (!drag.moved && nextItems.every((item, index) => item === dragBase[index])) return
      if (!drag.moved) {
        saveHistory()
        drag.moved = true
      }
      strokesRef.current = nextItems
      if (dragDup && !dragDup.selected) { dragDup.selected = true; applySelectionState(normalizeSelection(dragDup.selectedKeys)) }
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
        pressure: pointerPressure(sample.pointerType, sample.pressure),
      }, viewportRef.current)
      if (!appendStrokeSample(event.pointerId, point)) return
    }
    // Where the browser expects the pen next: drawn just ahead of the ink so it keeps up with the tip, never saved.
    const liveNow = activeStrokeRef.current
    predictedPointsRef.current = PEN_PREDICTION_ENABLED && liveNow?.kind === 'stroke' && !liveNow.erase
      ? getPredictedPoints(event.nativeEvent, (clientX, clientY) => {
        const point = screenToCanvasPoint({ x: clientX - rect.left, y: clientY - rect.top, pressure: 0 }, viewportRef.current)
        return isPointWithinBounds(point, sheetBoundsRef.current) ? point : null
      }, liveNow.points[liveNow.points.length - 1], MAX_PREDICTION_DISTANCE_SCREEN_PX / viewportRef.current.scale)
      : []
    const latestPoint = activeStrokeRef.current.points[activeStrokeRef.current.points.length - 1]
    const edgeHold = edgeHoldRef.current
    if (edgeHold?.pointerId === event.pointerId && edgeHoldDecision(edgeHold.start, latestPoint, 0, viewportRef.current.scale) === 'draw') cancelEdgeHold()
    if (!holdAnchorRef.current || Math.hypot(latestPoint.x - holdAnchorRef.current.x, latestPoint.y - holdAnchorRef.current.y) >= SHAPE_HOLD_JITTER_PX) {
      shapePreviewRef.current = null
      lastSignificantMoveAtRef.current = performance.now()
      scheduleShapePreview(latestPoint)
    }
    scheduleRender()
  }

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (clickPairRef.current && event.pointerType === 'mouse') clickPairRef.current = clickPairOnUp(clickPairRef.current, performance.now())
    if (snapStateRef.current?.pointerId === event.pointerId) clearSnapGuides()
    if (edgeHoldRef.current?.pointerId === event.pointerId) cancelEdgeHold()
    if (event.pointerType === 'pen') touchNav.penUp(performance.now())
    else if (event.pointerType === 'mouse') touchNav.mouseUp()
    if (laserPointerRef.current === event.pointerId) { laserPointerRef.current = null; if (event.pointerType !== 'touch') return }
    if (mousePanRef.current?.pointerId === event.pointerId) {
      mousePanRef.current = null
      applyCanvasCursor()
      return
    }
    if (activeEndpointRef.current?.pointerId === event.pointerId) { finishConnectorHandleGesture(); return }
    if (activeQuickRef.current?.pointerId === event.pointerId) { finishQuickConnectPress(); return }
    if (touchNav.tracks(event.pointerId) || event.pointerType === 'touch') {
      finishTouchPointer(event)
      return
    }
    if (textTapRef.current?.pointerId === event.pointerId) {
      // The editor opens on pen-up (the end of the tap) so the on-screen keyboard is allowed to appear.
      const tap = textTapRef.current
      textTapRef.current = null
      const existing = hitTestText(tap.point)
      if (existing) editTextItem(existing)
      else openNewTextEditorAt(tap.point)
      return
    }
    if (classTapRef.current?.pointerId === event.pointerId) {
      // Like text, the dialog opens on pen-up so the keyboard is allowed to appear.
      const tap = classTapRef.current
      classTapRef.current = null
      const hitRectangle = hitTestRectangle(tap.point)
      // An ink class box keeps its own writing and an oval has no sections, so a tap on either starts a new class box.
      const existing = hitRectangle?.inkBox || hitRectangle?.ellipse ? null : hitRectangle
      if (existing) openClassBoxEditor({ rectangleId: existing.id, x: existing.x, y: existing.y, content: existing.classBox ?? EMPTY_CLASS_BOX })
      else openClassBoxEditor({ rectangleId: null, x: tap.point.x, y: tap.point.y, content: EMPTY_CLASS_BOX })
      return
    }
    if (activeMarqueeRef.current?.pointerId === event.pointerId) {
      const marquee = activeMarqueeRef.current
      activeMarqueeRef.current = null
      marquee.current = getBoundedPoint(event)
      const box = rectFromPoints(marquee.start, marquee.current)
      // A bare click (no real drag) just leaves the selection as the press set it.
      if (Math.max(box.width, box.height) * viewportRef.current.scale >= 4) applySelectionState(expandSelectionState(marqueeSelection(routeConnectors(strokesRef.current), box, marquee.base, marquee.shift)))
      else renderAll()
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
    if (activeDividerRef.current?.pointerId === event.pointerId) {
      activeDividerRef.current = null
      renderAll()
      return
    }
    if (activeRotateRef.current?.pointerId === event.pointerId) {
      activeRotateRef.current = null
      renderAll()
      return
    }
    if (activeResizeRef.current?.pointerId === event.pointerId) {
      const finished = activeResizeRef.current
      activeResizeRef.current = null
      if (finished.created && finished.rectangleId !== null) {
        const createdBox = strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === finished.rectangleId)
        if (createdBox && !createdBox.inkBox && !createdBox.classBox) {
          // A direct shape (rectangle, diamond, ellipse): a click makes a default size; then Select takes over with the shape selected.
          if (!finished.moved) {
            const size = createdBox.ellipse ? { width: 160, height: 110 } : createdBox.diamond ? { width: 140, height: 140 } : { width: 160, height: 100 }
            const x = Math.min(finished.originalBounds.x, workspaceBoundsRef.current.x + workspaceBoundsRef.current.width - size.width)
            const y = Math.min(finished.originalBounds.y, workspaceBoundsRef.current.y + workspaceBoundsRef.current.height - size.height)
            strokesRef.current = resizeRectangleItems(strokesRef.current, finished.rectangleId, { x, y, width: size.width, height: size.height })
          }
          if (toolLockRef.current) {
            // Tool lock: the shape tool stays active for the next one and the new shape is not left selected.
            setSelectedRectangle(null)
            updateSelectedItems([])
            renderAll()
            return
          }
          setShapeTool(null)
          setSelectionMode(true)
          setSelectedRectangle(finished.rectangleId)
          updateSelectedItems([])
          renderAll()
          return
        }
        const createdNow = strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === finished.rectangleId)
        if (!finished.moved || (createdNow?.hldShape && isHldTapCreate(finished.originalBounds, createdNow, viewportRef.current.scale))) {
          const createdShape = createdNow?.hldShape
          const size = createdShape ? HLD_DEFAULT_SIZE[createdShape] : { width: INK_BOX_DEFAULT_WIDTH, height: INK_BOX_DEFAULT_HEIGHT }
          const x = Math.min(finished.originalBounds.x, workspaceBoundsRef.current.x + workspaceBoundsRef.current.width - size.width)
          const y = Math.min(finished.originalBounds.y, workspaceBoundsRef.current.y + workspaceBoundsRef.current.height - size.height)
          strokesRef.current = resizeRectangleItems(strokesRef.current, finished.rectangleId, { x, y, width: size.width, height: size.height })
        }
        // A new box is empty, so its sections start at the standard 15 / 70 / 15 split of its final size.
        strokesRef.current = strokesRef.current.map((item) => (item.kind === 'rectangle' && item.id === finished.rectangleId && item.inkBox ? { ...item, inkBox: newInkBoxContent(item.y, item.height) } : item))
        // The new box is ready to write in: back to the pen, with the box selected.
        setClassMode(false)
        setInkClassTool(false)
        setHldShapeTool(null)
        setSelectedRectangle(finished.rectangleId)
        updateSelectedItems([])
      }
      renderAll()
      return
    }
    const activeLasso = activeLassoRef.current
    if (activeLasso?.pointerId === event.pointerId) {
      const finalPoint = getBoundedPoint(event)
      const previous = activeLasso.points[activeLasso.points.length - 1]
      if (Math.hypot(finalPoint.x - previous.x, finalPoint.y - previous.y) >= 1.5) activeLasso.points.push(finalPoint)
      activeLassoRef.current = null
      updateSelectedItems([...expandToGroups(strokesRef.current, selectItemsByLasso(routeConnectors(strokesRef.current), activeLasso.points))])
      setSelectedRectangle(null)
      renderAll()
      return
    }
    if (lassoDragRef.current?.pointerId === event.pointerId) {
      const lassoDrag = lassoDragRef.current
      lassoDragRef.current = null
      if (lassoDrag.moved) switchConnectorSides(lassoDrag.dup ? lassoDrag.dup.copyKeys : lassoDrag.keys)
      return
    }
    if (activeDragRef.current?.pointerId === event.pointerId) {
      const drag = activeDragRef.current
      activeDragRef.current = null
      if (drag.moved) switchConnectorSides(drag.dup ? drag.dup.copyKeys : new Set([drag.itemKey]))
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
    clickPairRef.current = clickPairOnEnd(clickPairRef.current, event.type)
    if (snapStateRef.current?.pointerId === event.pointerId) clearSnapGuides()
    if (edgeHoldRef.current?.pointerId === event.pointerId) cancelEdgeHold()
    if (event.pointerType === 'pen') touchNav.penUp(performance.now())
    else if (event.pointerType === 'mouse') touchNav.mouseUp()
    if (laserPointerRef.current === event.pointerId) { laserPointerRef.current = null; if (event.pointerType !== 'touch') return }
    if (mousePanRef.current?.pointerId === event.pointerId) {
      mousePanRef.current = null
      applyCanvasCursor()
      return
    }
    if (activeEndpointRef.current?.pointerId === event.pointerId) { cancelConnectorHandleGesture(); return }
    if (activeQuickRef.current?.pointerId === event.pointerId) { cancelQuickConnectPress(); return }
    if (touchNav.tracks(event.pointerId) || event.pointerType === 'touch') {
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
    if (activeMarqueeRef.current?.pointerId === event.pointerId) {
      activeMarqueeRef.current = null
      renderAll()
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
    if (activeDividerRef.current?.pointerId === event.pointerId) {
      activeDividerRef.current = null
      renderAll()
      return
    }
    if (activeRotateRef.current?.pointerId === event.pointerId) {
      activeRotateRef.current = null
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
    const strokes = createTestInk(viewRectOf(viewportRef.current, rect.width, rect.height), sheetBoundsRef.current, targetPoints, nextStrokeIdRef.current)
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
    activeDividerRef.current = null
    activeStrokeBoxRef.current = null
    shapePreviewRef.current = null
    activeLassoRef.current = null
    lassoDragRef.current = null
    updateSelectedItems([])
    activePointerRef.current = null
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

  // Switching tool or eraser mode/size hides the circle until the pen moves again.
  useEffect(() => { eraserCursorRef.current?.style.setProperty('display', 'none') }, [eraser, objectEraser, eraserSize])

  const onPointerLeave = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'pen') touchNav.penGone()
    if (event.pointerType === 'mouse') { setMouseHover(null); cursorPointRef.current = null }
    hideEraserCursor()
  }

  const toggleShapeTool = () => { setOptionsFor(null); setShapeMode((value) => !value); setTextMode(false); setClassMode(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); clearLassoSelection(); setEraser(false) }
  const toggleShapeDrawTool = (kind: ShapeKind | 'arrow' | 'line') => {
    const next = shapeTool !== kind
    setShapeTool(next ? kind : null)
    setOptionsFor(null); setShapeMode(false); setTextMode(false); setClassMode(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); setEraser(false); setEraserMenuOpen(false)
    if (next) { clearLassoSelection(); setSelectedRectangle(null) }
  }
  const toggleToolLock = () => { const next = !toolLockRef.current; toolLockRef.current = next; setToolLock(next); saveToolLock(next) }
  selectNewConnectorRef.current = (key) => { toggleSelectTool(); setSelectedRectangle(null); updateSelectedItems([key]) }
  const toggleSelectTool = () => { const next = !selectionMode; setSelectionMode(next); setTextMode(false); setClassMode(false); setLassoMode(false); setConnectorMode(false); setShapeMode(false); setShapeTool(null); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }
  const openTextOptions = () => { setTextMode(true); setClassMode(false); setShapeMode(false); setShapeTool(null); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); setEraser(false); clearLassoSelection(); setOptionsFor('text') }
  const toggleTextTool = () => { const next = !textMode; setTextMode(next); setClassMode(false); setShapeMode(false); setShapeTool(null); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }
  const toggleHldShapeTool = (shape: HldShape) => { const next = !(classMode && inkClassTool && hldShapeTool === shape); setHldShapeTool(next ? shape : null); setInkClassTool(next); setClassMode(next); setTextMode(false); setShapeMode(false); setShapeTool(null); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }
  const toggleInkClassTool = () => { const next = !(classMode && inkClassTool && hldShapeTool === null); setHldShapeTool(null); setInkClassTool(next); setClassMode(next); setTextMode(false); setShapeMode(false); setShapeTool(null); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }
  const toggleClassTool = () => { const next = !(classMode && !inkClassTool); setHldShapeTool(null); setInkClassTool(false); setClassMode(next); setTextMode(false); setShapeMode(false); setShapeTool(null); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }
  const toggleLassoTool = () => { const next = !lassoMode; setLassoMode(next); setTextMode(false); setClassMode(false); setSelectionMode(false); setConnectorMode(false); setShapeMode(false); setShapeTool(null); setEraser(false); setEraserMenuOpen(false); setSelectedRectangle(null); clearLassoSelection() }
  const toggleConnectorTool = () => { const next = !connectorMode; setConnectorMode(next); setTextMode(false); setClassMode(false); setLassoMode(false); setSelectionMode(false); setShapeMode(false); setShapeTool(null); setEraser(false); setEraserMenuOpen(false); clearLassoSelection() }
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
      setTextMode(false); setClassMode(false); setShapeMode(false); setShapeTool(null); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); clearLassoSelection()
      setEraser(true)
      setOptionsFor('eraser')
      return
    }
    setTextMode(false); setClassMode(false); setShapeMode(false); setShapeTool(null); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); clearLassoSelection()
    setEraser((value) => !value)
    setOptionsFor(null)
  }
  const selectColor = (value: string) => { setColor(value); setEraser(false); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); clearLassoSelection() }

  const zoomBy = (factor: number) => {
    if (navigationSettingsRef.current.zoomLocked) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const viewport = viewportRef.current
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.scale * factor))
    const center = { x: rect.width / 2, y: rect.height / 2, pressure: 1 }
    const anchor = screenToCanvasPoint(center, viewport)
    applyViewport({ scale, offsetX: center.x - anchor.x * scale, offsetY: center.y - anchor.y * scale })
  }

  // Keyboard shortcuts (Desktop mode only). The window listener below calls the latest version of this, so it always sees current state.
  // Escape during a drag, resize, divider drag, marquee or lasso: put the original items (and selection) back and forget the step the drag recorded.
  const cancelActiveGesture = (): boolean => {
    let restored: CanvasItem[] | null = null
    let discardStep = false
    let handled = false
    let restoredSelection: SelectionState | null = null
    const drag = activeDragRef.current
    if (drag) { activeDragRef.current = null; handled = true; if (drag.moved) { restored = drag.originalItems; discardStep = true; restoredSelection = drag.dup?.before ?? null } }
    const lassoDrag = lassoDragRef.current
    if (lassoDrag) { lassoDragRef.current = null; handled = true; if (lassoDrag.moved) { restored = lassoDrag.originalItems; discardStep = true; restoredSelection = lassoDrag.dup?.before ?? null } }
    const divider = activeDividerRef.current
    if (divider) { activeDividerRef.current = null; handled = true; if (divider.moved) { restored = divider.originalItems; discardStep = true } }
    const rotate = activeRotateRef.current
    if (rotate) { activeRotateRef.current = null; handled = true; if (rotate.moved) { restored = rotate.originalItems; discardStep = true } }
    if (activeEndpointRef.current) { cancelConnectorHandleGesture(); handled = true }
    if (activeQuickRef.current) { cancelQuickConnectPress(); handled = true }
    const resize = activeResizeRef.current
    if (resize) {
      activeResizeRef.current = null
      handled = true
      if (resize.created && resize.rectangleId !== null) {
        // A box being sized out is not made at all; its history step was recorded when the press began.
        restored = resize.originalItems.filter((item) => !(item.kind === 'rectangle' && item.id === resize.rectangleId))
        discardStep = true
      } else if (resize.moved) { restored = resize.originalItems; discardStep = true }
    }
    if (activeLassoRef.current) { activeLassoRef.current = null; handled = true }
    const marquee = activeMarqueeRef.current
    if (marquee) {
      activeMarqueeRef.current = null
      handled = true
      const before = normalizeSelection(marquee.before)
      applySelectionState(before)
    }
    if (!handled) return false
    clearSnapGuides(false)
    if (restored) strokesRef.current = restored
    // A duplicating drag put the selection on the copies: Escape removes them and selects the originals again.
    if (restoredSelection) applySelectionState(restoredSelection)
    if (discardStep) {
      historyRef.current.discardLast()
      setCanUndo(historyRef.current.canUndo)
      setCanRedo(historyRef.current.canRedo)
    }
    if (restored) {
      setHasInk(strokesRef.current.length > 0)
      reconcileSelectedItems()
      scheduleAutosave()
    }
    renderAll()
    return true
  }

  const copySelection = (): boolean => {
    const copied = copyItems(strokesRef.current, selectionKeysWithBox())
    if (copied.length === 0) return false
    clipboardRef.current = copied
    pasteCountRef.current = 0
    setClipboardCount(copied.length)
    return true
  }
  // Desktop wrappers: the same actions, with a toast.
  const copyWithToast = (): boolean => { const done = copySelection(); if (done) showToast('Copied'); return done }
  const cutWithToast = (): boolean => { const done = cutSelection(); if (done) showToast('Cut'); return done }
  const pasteWithToast = (at?: Point | null): boolean => {
    const empty = clipboardRef.current.length === 0
    const done = pasteClipboard(at)
    if (done) showToast('Pasted')
    else if (empty) showToast('Nothing to paste')
    return done
  }
  const duplicateWithToast = (): boolean => { const done = duplicateSelection(); if (done) showToast('Duplicated'); return done }
  // Copy as PNG: the selection, or the whole page when nothing is selected. Called straight from the key or click so the clipboard write keeps the gesture.
  // Copy style / Paste style (Ctrl+Alt+C / Ctrl+Alt+V, right-click menu): the stored style is session memory only.
  const copiedStyleRef = useRef<StyleSnapshot | null>(null)
  const soleStyleSource = (): CanvasItem | null => {
    const keys = currentSelectionKeys()
    if (keys.size === 0) return null
    if (keys.size === 1) return strokesRef.current.find((item) => keys.has(canvasItemKey(item))) ?? null
    return groupStyleSource(strokesRef.current, keys)
  }
  const copyStyleWithToast = (): boolean => {
    const item = soleStyleSource()
    const style = item ? captureStyle(item) : null
    if (!style) return false
    copiedStyleRef.current = style
    showToast('Style copied')
    return true
  }
  const pasteStyleWithToast = (): boolean => {
    const style = copiedStyleRef.current
    if (!style) { showToast('Copy a style first'); return true }
    const keys = currentSelectionKeys()
    if (keys.size === 0) return false
    const pageAtPress = pageIndexRef.current
    const run = () => {
      // The font may take a moment: do nothing if a gesture started or the page changed meanwhile.
      if (pageIndexRef.current !== pageAtPress || activePointerRef.current !== null || activeConnectorRef.current !== null || activeDragRef.current !== null || activeResizeRef.current !== null || activeRotateRef.current !== null || activeEndpointRef.current !== null || activeDividerRef.current !== null || activeLassoRef.current !== null || lassoDragRef.current !== null || activeMarqueeRef.current !== null || mousePanRef.current !== null || touchNav.touchCount() > 0) return
      const next = applyStyle(strokesRef.current, keys, style, { measureFor: createTextMeasure })
      if (next === strokesRef.current) { showToast('Style pasted'); return }
      saveHistory()
      strokesRef.current = next
      historyCacheRef.current = null
      renderAll()
      bumpSelectionColor((n) => n + 1)
      showToast('Style pasted')
    }
    // A label font is loaded before its text is measured.
    if (style.fontFamily) void loadTextFont(style.fontFamily).then(run, run)
    else run()
    return true
  }

  const copyAsPng = (): boolean => {
    const keys = selectionKeysWithBox()
    void copyPngToClipboard(keys.size > 0 ? keys : null).then((error) => showToast(error ?? 'Copied as PNG'))
    return true
  }
  const exportSelectionAs = (kind: 'png' | 'svg') => {
    const keys = selectionKeysWithBox()
    if (keys.size === 0) return
    void (kind === 'png' ? exportPngFile(2, keys) : exportSvgFile(keys)).then((error) => { if (error) showToast(error) })
  }
  // Cut = copy + delete: one undo step (deleteSelection records it).
  const cutSelection = (): boolean => copySelection() && deleteSelection()
  // Adds fresh clones (new ids, +24 units per consecutive paste, kept inside the workspace) as one undo step and selects them.
  const pasteClipboard = (at?: Point | null): boolean => {
    const clip = clipboardRef.current
    if (clip.length === 0) return false
    const result = pasteItems(clip, { stroke: nextStrokeIdRef.current, rectangle: nextRectangleIdRef.current, connector: nextConnectorIdRef.current, text: nextTextIdRef.current }, PASTE_OFFSET * (pasteCountRef.current + 1), workspaceBoundsRef.current, at, strokesRef.current)
    if (!result) return false
    if (!at) pasteCountRef.current += 1
    return insertPasted(result)
  }
  const insertPasted = (result: PasteResult | null): boolean => {
    if (!result) return false
    saveHistory()
    nextStrokeIdRef.current = result.counters.stroke
    nextRectangleIdRef.current = result.counters.rectangle
    nextConnectorIdRef.current = result.counters.connector
    nextTextIdRef.current = result.counters.text
    strokesRef.current = [...strokesRef.current, ...result.items]
    setHasInk(true)
    // A group is moved and resized with the select or lasso tool, so one of them is switched on first (as Select all does).
    if (!selectionMode && !lassoMode) toggleSelectTool()
    applySelectionState(normalizeSelection(result.keys))
    return true
  }
  // Duplicate = copy + paste at +24 in one step.
  // Duplicate = paste the selection straight away at +24 without touching the in-app clipboard.
  const duplicateSelection = (): boolean => {
    const copied = copyItems(strokesRef.current, selectionKeysWithBox())
    return copied.length > 0 && insertPasted(pasteItems(copied, { stroke: nextStrokeIdRef.current, rectangle: nextRectangleIdRef.current, connector: nextConnectorIdRef.current, text: nextTextIdRef.current }, PASTE_OFFSET, workspaceBoundsRef.current, null, strokesRef.current))
  }

  // Insert template: the template's items go through the paste path (new ids, counters, groups, workspace bounds), centred in the view, as one undo step, selected afterwards.
  const insertTemplate = (id: string): boolean => insertTemplateItems(buildTemplate(id))
  // "My templates" use the same path: the saved items are plain canvas items with local ids, so pasteItems gives them fresh ones.
  const insertUserTemplate = (id: string): boolean => insertTemplateItems(userTemplates.find((template) => template.id === id)?.items ?? null)
  const insertTemplateItems = (items: CanvasItem[] | null, at: Point | null = null, fitToView = true): boolean => {
    const canvas = canvasRef.current
    setTemplateChooserOpen(false)
    if (!canvas || !items) return false
    if (textEditorRef.current) commitTextEditor()
    if (codeEditorRef.current) commitCodeEditor()
    const rect = canvas.getBoundingClientRect()
    const centre = at ?? screenToCanvasPoint({ x: rect.width / 2, y: rect.height / 2, pressure: 1 }, viewportRef.current)
    const result = pasteItems(items, { stroke: nextStrokeIdRef.current, rectangle: nextRectangleIdRef.current, connector: nextConnectorIdRef.current, text: nextTextIdRef.current }, PASTE_OFFSET, workspaceBoundsRef.current, centre, strokesRef.current)
    if (!result) return false
    const done = insertPasted(sketchyRef.current ? { ...result, items: withSketchSeeds(result.items) } : result)
    if (done) {
      // A template larger than the view is zoomed out to fit (never zoomed in), so the whole layout is visible at once.
      const bounds = getCanvasSelectionBounds(routeConnectors(strokesRef.current), new Set(result.keys))
      if (fitToView && bounds && !navigationSettingsRef.current.zoomLocked) {
        const insets = inputModeRef.current === 'desktop' ? DESKTOP_FIT_INSETS : { top: 72, right: 24, bottom: 96, left: 24 }
        applyViewport(fitViewportToBoundsInset(bounds, rect.width, rect.height, insets, viewportRef.current.scale))
      }
      renderAll()
    }
    return done
  }

  // Insert from Mermaid (dialog, command palette and pasted Mermaid text): the same insert path as templates. Returns an error message, or null when inserted.
  const importMermaid = (text: string, at: Point | null = null): string | null => {
    const built = buildMermaidDiagram(text)
    if (!built.ok) return built.error
    if (!insertTemplateItems(built.items, at)) return 'Could not insert the diagram.'
    setMermaidOpen(false) // closed only after a successful insert; on failure the dialog stays open with the message
    showToast(mermaidInsertMessage(built.boxes, built.links, built.ignoredLines, built.kind, built.frames ?? 0))
    return null
  }
  // Desktop paste with an empty in-app clipboard: the browser's paste event carries the system clipboard text. Mermaid text becomes a diagram, other text one label.
  // Returns true when the paste was handled (including a shown error), false when there was nothing to paste.
  const pasteSystemText = (raw: string, at: Point | null): boolean => {
    const full = normalizeText(raw).trim()
    if (full === '') return false
    // Mermaid is detected and parsed on the whole text (capped at MAX_MERMAID_TEXT); only the plain label below is cut to 2000 characters.
    const mermaidText = full.slice(0, MAX_MERMAID_TEXT)
    if (isMermaidText(mermaidText)) {
      const parsed = buildMermaidDiagram(mermaidText)
      // A flowchart needs at least one link, otherwise it is just text that starts with "graph"; any other diagram header is unambiguous.
      if (parsed.ok && (parsed.links > 0 || (parsed.kind !== 'flowchart' && parsed.boxes > 0))) {
        const error = importMermaid(mermaidText, at)
        if (error) showToast(error)
        return true
      }
    }
    const text = full.slice(0, 2000)
    const label = createTextObject(1, 0, 0, text, color, textSize, createTextMeasure(textSize, textFontId), textFontId)
    const done = insertTemplateItems([label], at, false)
    if (done) showToast('Pasted text')
    return done
  }

  // Ctrl+Arrow with one plain or HLD shape selected: a new empty shape of the same kind in that direction, joined by an arrow. One undo step.
  const quickCreateShape = (direction: FlowDirection): boolean => {
    const keys = selectionKeysWithBox()
    if (keys.size !== 1) return false
    const source = strokesRef.current.find((item): item is RectangleObject => item.kind === 'rectangle' && keys.has(canvasItemKey(item)))
    if (!source || !isFlowBox(source)) return false
    const made = quickCreateConnected(strokesRef.current, source, direction, workspaceBoundsRef.current, { rectangle: nextRectangleIdRef.current, connector: nextConnectorIdRef.current }, newInkBoxContent)
    if (!made) return true
    saveHistory()
    nextRectangleIdRef.current += 1
    nextConnectorIdRef.current += 1
    strokesRef.current = [...strokesRef.current, sketchyRef.current ? withSketchSeed(made.box) : made.box, made.connector]
    setHasInk(true)
    setSelectedRectangle(made.box.id)
    updateSelectedItems([])
    renderAll()
    return true
  }

  // Arrow keys: move the selection 1 unit (Shift 10) inside the workspace; connectors follow their boxes. A burst of presses is one undo step.
  const nudgeSelection = (dx: number, dy: number): boolean => {
    const keys = selectionKeysWithBox()
    if (keys.size === 0) return false
    const next = translateWithinWorkspace(strokesRef.current, keys, dx, dy)
    if (next.every((item, index) => item === strokesRef.current[index])) return true
    const now = performance.now()
    if (nudgeStartsNewStep(lastNudgeAtRef.current, now)) saveHistory()
    else scheduleAutosave()
    lastNudgeAtRef.current = now
    strokesRef.current = next
    renderAll()
    return true
  }

  // Code blocks (Desktop): create one at the mouse (or the middle of the view), edit it in an overlay, and change its language, theme and text size.
  const soleCode = (): CodeObject | null => {
    const keys = currentSelectionKeys()
    if (keys.size !== 1) return null
    const key = [...keys][0]
    const item = key.startsWith('code:') ? strokesRef.current.find((candidate) => canvasItemKey(candidate) === key) : undefined
    return item?.kind === 'code' ? item : null
  }
  /** True while the code editor is open on a block that still exists; an editor whose block was deleted or undone away is closed here, so shortcuts and autosave never stay blocked. */
  function liveCodeEditor(): boolean {
    if (codeEditorIsLive(strokesRef.current, codeEditorRef.current)) return true
    if (codeEditorRef.current) { codeEditorRef.current = null; setCodeEditor(null) }
    return false
  }
  const commitCodeEditor = () => {
    const editor = codeEditorRef.current
    if (!editor) return
    codeEditorRef.current = null
    setCodeEditor(null)
    const next = setCodeText(strokesRef.current, editor.id, codeEditorValueRef.current)
    if (next !== strokesRef.current) { saveHistory(); strokesRef.current = next }
    renderAll()
  }
  const openCodeEditor = (id: number): boolean => {
    if (inputModeRef.current !== 'desktop') return false
    const item = strokesRef.current.find((candidate) => candidate.kind === 'code' && candidate.id === id)
    if (!item) return false
    if (textEditorRef.current) commitTextEditor()
    if (codeEditorRef.current) commitCodeEditor()
    codeEditorRef.current = { id }
    codeEditorValueRef.current = item.kind === 'code' ? item.text : ''
    setCodeEditor({ id })
    renderAll() // the block's canvas copy steps aside for the transparent editor
    return true
  }
  const insertCodeBlock = () => {
    const canvas = canvasRef.current
    if (!canvas || inputModeRef.current !== 'desktop') return
    if (codeEditorRef.current) commitCodeEditor()
    const rect = canvas.getBoundingClientRect()
    // At the mouse when it is over the canvas (K key); from the menu button, the middle of the view.
    const mouse = cursorPointRef.current
    const anchor = screenToCanvasPoint(mouse ?? { x: rect.width / 2, y: rect.height / 2, pressure: 1 }, viewportRef.current)
    const { x, y } = newCodeBlockOrigin(anchor, mouse !== null, workspaceBoundsRef.current)
    saveHistory()
    const block = createCodeObject(nextTextIdRef.current++, x, y)
    strokesRef.current = [...strokesRef.current, block]
    setHasInk(true)
    if (!selectionMode && !lassoMode) toggleSelectTool()
    setSelectedRectangle(null)
    updateSelectedItems([canvasItemKey(block)])
    openCodeEditor(block.id)
    renderAll()
  }
  // Sticky note: a plain yellow rectangle. Desktop (N key or More shapes): at the mouse, or the view centre from the menu, with the text editor opened inside it. Tablet (Insert tray): at the view centre, selected; the user writes in it with the pen as in any box.
  const insertStickyNote = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const desktop = inputModeRef.current === 'desktop'
    if (textEditorRef.current) commitTextEditor()
    if (codeEditorRef.current) commitCodeEditor()
    const rect = canvas.getBoundingClientRect()
    const mouse = desktop ? cursorPointRef.current : null
    const anchor = screenToCanvasPoint(mouse ?? { x: rect.width / 2, y: rect.height / 2, pressure: 1 }, viewportRef.current)
    // At the mouse the note's top-left corner sits on the pointer (as a code block does); from a menu it is centred.
    const centre = mouse ? { x: anchor.x + STICKY_WIDTH / 2, y: anchor.y + STICKY_HEIGHT / 2 } : anchor
    saveHistory()
    const plain = createStickyNote(nextRectangleIdRef.current++, centre, width, workspaceBoundsRef.current)
    const note = sketchyRef.current ? withSketchSeed(plain) : plain
    strokesRef.current = [...strokesRef.current, note]
    setHasInk(true)
    if (!selectionMode && !lassoMode) toggleSelectTool()
    updateSelectedItems([])
    setSelectedRectangle(note.id)
    if (desktop) {
      const middle = { x: note.x + note.width / 2, y: note.y + note.height / 2 }
      openTextEditor({ itemId: null, x: middle.x, y: middle.y - textSize * 0.65, fontSize: textSize, fontFamily: textFontId, color, initialText: '', centerOn: middle, mergeHistory: true })
      setSelectedRectangle(note.id)
    }
    renderAll()
  }
  const changeCode = (change: (items: CanvasItem[], id: number) => CanvasItem[]) => {
    const block = soleCode()
    if (!block) return
    const next = change(strokesRef.current, block.id)
    if (next === strokesRef.current) return
    saveHistory()
    strokesRef.current = next
    renderAll()
    bumpSelectionColor((n) => n + 1)
  }
  const codeForPanel = inputMode === 'desktop' ? soleCode() : null
  const codePanel = codeForPanel ? {
    language: codeForPanel.language,
    dark: codeForPanel.theme === 'dark',
    fontSize: codeFontSize(codeForPanel),
    canSmaller: codeFontSize(codeForPanel) > MIN_CODE_FONT_SIZE,
    canLarger: codeFontSize(codeForPanel) < MAX_CODE_FONT_SIZE,
    onLanguage: (language: string) => changeCode((items, id) => setCodeLanguage(items, id, language)),
    onTheme: (dark: boolean) => changeCode((items, id) => setCodeTheme(items, id, dark ? 'dark' : 'light')),
    onFontSize: (direction: 1 | -1) => changeCode((items, id) => setCodeFontSize(items, id, stepCodeFontSize(codeForPanel, direction))),
    onEdit: () => { openCodeEditor(codeForPanel.id) },
  } : null

  // Opens the editor of a text label or class box: the same editors and commit rules as a tap in the select tool.
  const openEditTarget = (target: { kind: 'text' | 'classBox' | 'code' | 'connector'; id: number }): boolean => {
    if (target.kind === 'connector') return editConnectorLabel(target.id)
    if (target.kind === 'code') return openCodeEditor(target.id)
    const item = strokesRef.current.find((candidate) => candidate.kind === (target.kind === 'text' ? 'text' : 'rectangle') && candidate.id === target.id)
    if (item?.kind === 'text') { editTextItem(item); return true }
    if (item?.kind === 'rectangle' && item.classBox) { openClassBoxEditor({ rectangleId: item.id, x: item.x, y: item.y, content: item.classBox }); return true }
    return false
  }
  const onCanvasDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (inputModeRef.current !== 'desktop' || lastPointerTypeRef.current !== 'mouse' || event.button !== 0 || textEditorRef.current || classBoxEditor) return
    // The second click of a double-click on a quick-connect button already made its shape: no undo, no label editor.
    if (performance.now() - quickClickAtRef.current < QUICK_CONNECT_DOUBLE_CLICK_MS) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point = screenToCanvasPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top, pressure: 1 }, viewportRef.current)
    const routed = routeConnectors(strokesRef.current)
    const target = doubleClickTarget(routed, point, viewportRef.current.scale)
    const pair = clickPairRef.current
    const before = clickBeforeRef.current
    clickPairRef.current = null
    clickBeforeRef.current = null
    if (target) {
      // The two clicks of a double-click on a connector's middle dot toggled its routing: put back what they did and their history steps, then edit the label.
      if (target.kind === 'connector' && before && before.owner === historyRef.current && !clickItemsUnchanged(before.items, strokesRef.current)) {
        historyRef.current.restore(before.history)
        setCanUndo(historyRef.current.canUndo)
        setCanRedo(historyRef.current.canRedo)
        strokesRef.current = before.items
        reconcileSelectedItems()
        scheduleAutosave()
        renderAll()
      }
      openEditTarget(target)
      return
    }
    // Select tool on a plain or HLD shape: edit the label already inside it, or start a new one centred in the shape (auto-fit as for any label inside a shape).
    const shapeHit = selectionMode ? hitTarget(routed, point, viewportRef.current.scale) : null
    const shapeAction = shapeHit?.kind === 'rectangle' ? shapeDoubleClick(strokesRef.current, shapeHit.id) : null
    if (shapeAction) {
      clickPairRef.current = null
      if (shapeAction.kind === 'editLabel') openEditTarget({ kind: 'text', id: shapeAction.id })
      else openTextEditor({ itemId: null, x: shapeAction.centre.x, y: shapeAction.centre.y - textSize * 0.65, fontSize: textSize, fontFamily: textFontId, color, initialText: '', centerOn: { x: shapeAction.centre.x, y: shapeAction.centre.y } })
      return
    }
    const anyGesture = activePointerRef.current !== null || activeConnectorRef.current !== null || activeDragRef.current !== null || activeResizeRef.current !== null || activeRotateRef.current !== null || activeEndpointRef.current !== null || activeDividerRef.current !== null || activeLassoRef.current !== null || lassoDragRef.current !== null || textTapRef.current !== null || classTapRef.current !== null || activeObjectEraserRef.current !== null || minimapDragPointerRef.current !== null || umlToolboxDragRef.current !== null || mousePanRef.current !== null || activeMarqueeRef.current !== null || activeQuickRef.current !== null || touchNav.touchCount() > 0
    if (anyGesture || !before || before.owner !== historyRef.current || !isPointWithinBounds(point, sheetBoundsRef.current)) return
    // Empty canvas, any tool: a new label, as one undo step (the label) or nothing. The two single clicks already ran through the tool.
    const itemsChanged = !clickItemsUnchanged(before.items, strokesRef.current)
    const decision = labelDoubleClickDecision({
      pair, routedItems: routed, point, scale: viewportRef.current.scale, tool: clickToolName(),
      toolOpensEditor: textMode || (classMode && !inkClassTool), selectedKeys: selectedKeysRef.current, selectedRectangleId: selectedRectangleIdRef.current, itemsChanged,
    })
    if (!decision.create) return
    // Put back what the two clicks did (dot stroke, tiny shape, ...) and their history steps.
    historyRef.current.restore(before.history)
    setCanUndo(historyRef.current.canUndo)
    setCanRedo(historyRef.current.canRedo)
    if (decision.revert) {
      strokesRef.current = before.items
      setHasInk(strokesRef.current.length > 0)
      reconcileSelectedItems()
      scheduleAutosave()
      renderAll()
    }
    openNewTextEditorAt(point)
  }
  const closeContextMenu = () => setContextMenu(null)
  // Right-click (Desktop mouse): selects the item under the pointer when it is not already selected, then opens the menu there.
  const onCanvasContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const native = event.nativeEvent as MouseEvent & { pointerType?: string }
    if (inputModeRef.current !== 'desktop' || native.pointerType === 'touch' || native.pointerType === 'pen') return
    if (textEditorRef.current || classBoxEditor) return
    if (activePointerRef.current !== null || activeDragRef.current !== null || activeResizeRef.current !== null || activeRotateRef.current !== null || activeEndpointRef.current !== null || lassoDragRef.current !== null || activeMarqueeRef.current !== null || touchNav.touchCount() > 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point = screenToCanvasPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top, pressure: 1 }, viewportRef.current)
    const routed = routeConnectors(strokesRef.current)
    const target = hitTarget(routed, point, viewportRef.current.scale)
    if (target && !selectionKeysWithBox().has(target.key)) selectHitTarget(target)
    // A locked item cannot be selected; right-clicking it offers Unlock for that item (the hit test here looks through the lock).
    const lockedKey = target ? null : hitTarget(routed, point, viewportRef.current.scale, false, true)?.key ?? null
    setMouseHover(null)
    contextMenuPointRef.current = point
    setContextMenu({ x: event.clientX, y: event.clientY, lockedKey })
  }
  const runContextMenuAction = (action: ContextMenuAction, lockedKey: string | null = null) => {
    setContextMenu(null)
    switch (action) {
      case 'cut': cutWithToast(); break
      case 'copy': copyWithToast(); break
      case 'paste': pasteWithToast(inputModeRef.current === 'desktop' ? contextMenuPointRef.current : null); break
      case 'duplicate': duplicateWithToast(); break
      case 'copyPng': copyAsPng(); break
      case 'copyStyle': copyStyleWithToast(); break
      case 'pasteStyle': pasteStyleWithToast(); break
      case 'arrowBothEnds': setSelectedArrowEnds(true); break
      case 'arrowOneEnd': setSelectedArrowEnds(false); break
      case 'cornersRound': setSelectedCorners(true); break
      case 'cornersSharp': setSelectedCorners(false); break
      case 'exportPng': exportSelectionAs('png'); break
      case 'exportSvg': exportSelectionAs('svg'); break
      case 'saveTemplate': openSaveTemplate(); break
      case 'delete': deleteSelection(); break
      case 'selectAll': selectAllItems(); break
      case 'selectSimilar': selectSimilarItems(); break
      case 'selectConnected': selectConnectedItems(false); break
      case 'addBoundary': addBoundaryAroundSelection(); break
      case 'sameWidth': sameSizeSelection('width'); break
      case 'sameHeight': sameSizeSelection('height'); break
      case 'sameSize': sameSizeSelection('both'); break
      case 'numberSteps': numberFlowSteps(); break
      case 'clearSteps': clearFlowSteps(); break
      case 'bringToFront': moveSelectionLayer('front'); break
      case 'sendToBack': moveSelectionLayer('back'); break
      case 'editText': { const target = editTargetForSelection(strokesRef.current, selectedKeysRef.current, selectedRectangleIdRef.current); if (target) openEditTarget(target); break }
      case 'zoomSelection': zoomToSelection(); break
      case 'lock': lockSelection(); break
      case 'group': groupSelection(); break
      case 'ungroup': ungroupSelection(); break
      case 'unlock': if (lockedKey) unlockItems(new Set([lockedKey])); break
      case 'unlockAll': unlockItems(null); break
      default: if (action.startsWith('shape:')) changeShapeSelection(action.slice('shape:'.length))
    }
  }
  // Menu keyboard: arrows (and Home/End) move focus between the enabled rows; Enter runs the focused row (a button click); Escape is handled with the other keys.
  const onContextMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    if (buttons.length === 0) return
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % buttons.length : (current <= 0 ? buttons.length - 1 : current - 1)
    buttons[next].focus()
  }
  // The height estimate can be a little low (chip wrapping, fonts): after layout, a menu that still runs past the bottom edge is moved up to fit.
  useLayoutEffect(() => {
    const menu = contextMenuElementRef.current
    if (!contextMenu || !menu) return
    const rect = menu.getBoundingClientRect()
    const overflow = rect.bottom - (window.innerHeight - 8)
    if (overflow > 0) menu.style.top = `${Math.max(8, rect.top - overflow)}px`
  }, [contextMenu])
  // Opening the menu puts focus on its first enabled row so the keyboard works at once.
  useEffect(() => {
    if (contextMenu) contextMenuElementRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [contextMenu])
  // The menu closes on an outside press, scrolling, losing focus, or leaving Desktop mode (Escape is handled with the other keys).
  useEffect(() => {
    if (!contextMenu) return
    const onPointerDown = (event: PointerEvent) => { if (!contextMenuElementRef.current?.contains(event.target as Node)) setContextMenu(null) }
    const close = () => setContextMenu(null)
    // Scrolling inside a tall menu (short windows) must not close it.
    const closeOutside = (event: Event) => { if (!contextMenuElementRef.current?.contains(event.target as Node)) setContextMenu(null) }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('wheel', closeOutside, true)
    window.addEventListener('scroll', closeOutside, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('wheel', closeOutside, true)
      window.removeEventListener('scroll', closeOutside, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [contextMenu])
  useEffect(() => { if (inputMode !== 'desktop') setContextMenu(null) }, [inputMode])

  useEffect(() => { if (inputMode !== 'desktop') commitCodeEditor() }, [inputMode])
  // The small sizes (10-16) exist in Desktop mode only: leaving it must not keep a size the tablet panel cannot show or change.
  useEffect(() => { if (inputMode !== 'desktop') setTextSize((size) => (TEXT_FONT_SIZES.includes(size) ? size : DEFAULT_TEXT_FONT_SIZE)) }, [inputMode])
  // When the highlighter library finishes loading, the saved picture of the page is stale (code drawn plain): draw it again.
  // Never a full redraw while a pen/touch stroke or pointer is active: wait until it ends.
  useEffect(() => {
    let timer: number | null = null
    const redrawWhenIdle = () => {
      timer = null
      if (activeStrokeRef.current !== null || activePointerRef.current !== null) { timer = window.setTimeout(redrawWhenIdle, 150); return }
      historyCacheRef.current = null
      renderAll()
    }
    const off = onCodeHighlighterReady(() => { if (timer === null) redrawWhenIdle() })
    return () => { off(); if (timer !== null) window.clearTimeout(timer) }
  }, [renderAll])

  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [templateChooserOpen, setTemplateChooserOpen] = useState(false)
  const [mermaidOpen, setMermaidOpen] = useState(false)
  // "My templates": saved on this device only (localStorage). Re-read each time the chooser opens; `templateSaveMode` opens it with the name field showing.
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>(() => loadUserTemplates())
  const [templateSaveMode, setTemplateSaveMode] = useState(false)
  useEffect(() => {
    if (templateChooserOpen) setUserTemplates(loadUserTemplates())
    else setTemplateSaveMode(false)
  }, [templateChooserOpen])
  const openSaveTemplate = () => {
    if (selectionKeysWithBox().size === 0) { showToast('Select something first to save it as a template'); return }
    setTemplateSaveMode(true)
    setTemplateChooserOpen(true)
  }
  // Returns an error message for the chooser to show, or null when the template was saved.
  const saveSelectionAsTemplate = (name: string): string | null => {
    const blocked = userTemplatesBlockedMessage()
    if (blocked) return blocked
    const copied = copyItems(strokesRef.current, selectionKeysWithBox())
    const stored = loadUserTemplates()
    const result = addUserTemplate(stored, name, copied, newTemplateId(), new Date().toISOString())
    if (!result.ok) return result.message
    if (!saveUserTemplates(result.templates)) return 'Could not save on this device (storage is full or blocked).'
    setUserTemplates(result.templates)
    setTemplateChooserOpen(false)
    showToast(`Saved template “${result.template.name}” on this device`)
    return null
  }
  const deleteUserTemplate = (id: string) => {
    const blocked = userTemplatesBlockedMessage()
    if (blocked) { showToast(blocked); return }
    const next = removeUserTemplate(loadUserTemplates(), id)
    if (saveUserTemplates(next)) setUserTemplates(next)
    else showToast('Could not update the saved templates on this device')
  }
  const toggleLibrary = () => {
    void refreshLibrary()
    if (!libraryOpen) window.setTimeout(() => void captureThumbnail(), 250) // after the Library has painted
    setLibraryOpen((open) => !open)
  }
  // Command palette (Desktop, Ctrl/Cmd+K). The ref is cleared the moment the palette closes so the command it runs is not refused as "a dialog is open".
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteOpenRef = useRef(false)
  const openPalette = () => { paletteOpenRef.current = true; setPaletteOpen(true) }
  const closePalette = () => { paletteOpenRef.current = false; setPaletteOpen(false) }
  // The "Open: <title>" rows come from the Library list: each time the palette opens, the list is refreshed (rows appear when it arrives).
  useEffect(() => { if (paletteOpen) void refreshLibraryIfStale() }, [paletteOpen])
  // Text outline (Markdown) of the whole diagram: copied to the clipboard or downloaded as a .md file.
  const currentOutline = (): string => buildDiagramOutline(docTitle, pagesRef.current.map((slot, index) => (index === pageIndexRef.current ? strokesRef.current : slot.items)), pagesRef.current.map((slot) => slot.name ?? ''))
  const copyOutline = () => {
    const text = currentOutline()
    const done = () => showToast('Outline copied')
    const failed = () => showToast('Could not copy the outline')
    try {
      navigator.clipboard.writeText(text).then(done, failed)
    } catch {
      failed()
    }
  }
  // Current page as a Mermaid flowchart on the clipboard.
  const copyMermaid = () => {
    const result = buildMermaid(strokesRef.current)
    const text = result.text
    const noun = result.kind === 'class' ? (result.boxes === 1 ? 'class' : 'classes') : result.boxes === 1 ? 'box' : 'boxes'
    const done = () => showToast(`Copied ${result.boxes} ${noun} and ${result.links} ${result.links === 1 ? 'link' : 'links'} as Mermaid${result.skipped ? '; text and ink skipped' : ''}`)
    const failed = () => showToast('Could not copy Mermaid')
    try {
      navigator.clipboard.writeText(text).then(done, failed)
    } catch {
      failed()
    }
  }
  const downloadOutline = () => {
    downloadBlob(new Blob([currentOutline()], { type: 'text/markdown' }), outlineFileName(docTitle))
    showToast('Outline downloaded')
  }
  /** Extra palette entries beyond the keyboard shortcuts. Add one line here to make a new command searchable (a later template list can append its own). */
  const paletteExtras = (): Array<PaletteEntry & { run: () => void }> => [
    ...HLD_SHAPES.map((shape) => ({ id: `hld:${shape}`, label: HLD_SHAPE_LABELS[shape], group: 'Shapes', keywords: 'hld system design add', run: () => toggleHldShapeTool(shape) })),
    ...DIAGRAM_TEMPLATES.map((template) => ({ id: `template:${template.id}`, label: `Template: ${template.name}`, group: 'Templates', keywords: `insert starter layout ${template.description}`, run: () => { insertTemplate(template.id) } })),
    ...(alignTargetKeys().size > 0 ? (['left', 'center', 'right'] as const).map((align) => ({ id: `align:${align}`, label: `Align text ${align === 'center' ? 'centre' : align}`, group: 'Edit', keywords: 'text label alignment justify', run: () => pickTextAlign(align) })) : []),
    { id: 'mermaid:insert', label: 'Insert from Mermaid…', group: 'Templates', keywords: 'import flowchart graph diagram text paste', run: () => setMermaidOpen(true) },
    { id: 'template:choose', label: 'Insert template…', group: 'Templates', keywords: 'starter layout my templates saved', run: () => setTemplateChooserOpen(true) },
    ...(selectionKeysWithBox().size > 0 ? [{ id: 'template:save', label: 'Save selection as template…', group: 'Templates', keywords: 'my templates store reuse', run: openSaveTemplate }] : []),
    { id: 'export:png', label: 'Export PNG', group: 'Export', keywords: 'image picture download', run: () => void exportPngFile(2).then((error) => { if (error) showToast(error) }) },
    { id: 'export:svg', label: 'Export SVG', group: 'Export', keywords: 'vector download', run: () => void exportSvgFile().then((error) => { if (error) showToast(error) }) },
    { id: 'page:overview', label: 'Page overview', group: 'Pages', keywords: 'pages thumbnails grid reorder move jump', run: () => setPageOverviewOpen(true) },
    { id: 'page:duplicate', label: 'Duplicate page', group: 'Pages', keywords: 'copy page clone', run: duplicatePage },
    ...pagesRef.current.flatMap((slot, index) => (slot.name ? [{ id: `page:go:${index}`, label: `Go to page: ${slot.name}`, group: 'Pages', keywords: `jump open ${index + 1}`, run: () => goToPage(index) }] : [])),
    ...(soleSelectedKey() !== null ? [{ id: 'select:similar', label: 'Select similar', group: 'Select', keywords: 'same kind shape matching', run: () => { if (!selectSimilarItems()) showToast('No similar items') } }] : []),
    ...(canSameSize(strokesRef.current, currentSelectionKeys()) ? [
      { id: 'arrange:same-width', label: 'Same width', group: 'Arrange', keywords: 'size equal resize boxes match', run: () => { sameSizeSelection('width') } },
      { id: 'arrange:same-height', label: 'Same height', group: 'Arrange', keywords: 'size equal resize boxes match', run: () => { sameSizeSelection('height') } },
      { id: 'arrange:same-size', label: 'Same size', group: 'Arrange', keywords: 'width height equal resize boxes match', run: () => { sameSizeSelection('both') } },
    ] : []),
    ...(() => {
      const corners = cornersChoice(strokesRef.current, currentSelectionKeys())
      return corners === null ? [] : [corners === 'round'
        ? { id: 'corners:round', label: 'Corners: round', group: 'Edit', keywords: 'rounded rectangle corner radius box', run: () => { setSelectedCorners(true) } }
        : { id: 'corners:sharp', label: 'Corners: sharp', group: 'Edit', keywords: 'square rectangle corner box', run: () => { setSelectedCorners(false) } }]
    })(),
    ...(() => {
      const choice = arrowEndsChoice(strokesRef.current, selectedKeysRef.current)
      return choice === null ? [] : [
        ...(choice === 'both' ? [{ id: 'arrow:both-ends', label: 'Arrow: both ends', group: 'Edit', keywords: 'arrowhead two way bidirectional double connector', run: () => { setSelectedArrowEnds(true) } }] : []),
        ...(choice === 'one' ? [{ id: 'arrow:one-end', label: 'Arrow: one end', group: 'Edit', keywords: 'arrowhead one way single direction connector', run: () => { setSelectedArrowEnds(false) } }] : []),
      ]
    })(),
    ...(currentSelectionKeys().size > 0 ? [{ id: 'arrange:boundary', label: 'Add boundary', group: 'Arrange', keywords: 'frame group box around zone region trust', run: () => { addBoundaryAroundSelection() } }] : []),
    ...(canSelectConnected(strokesRef.current, currentSelectionKeys()) ? [
      { id: 'select:connected', label: 'Select connected', group: 'Select', keywords: 'neighbours arrows linked attached boxes', run: () => { selectConnectedItems(false) } },
      { id: 'select:linked', label: 'Select all linked', group: 'Select', keywords: 'transitive reachable chain connected everything arrows', run: () => { selectConnectedItems(true) } },
    ] : []),
    ...(stepTargets(strokesRef.current, currentSelectionKeys()).length > 0 ? [
      { id: 'flow:number', label: 'Number steps', group: 'Select', keywords: 'flow order sequence connectors arrows label 1 2 3', run: () => { numberFlowSteps() } },
      { id: 'flow:clear', label: 'Clear step numbers', group: 'Select', keywords: 'flow order sequence connectors arrows remove', run: () => { clearFlowSteps() } },
    ] : []),
    { id: 'export:outline-copy', label: 'Copy as text outline', group: 'Export', keywords: 'markdown summary list copy', run: copyOutline },
    { id: 'export:mermaid-copy', label: 'Copy as Mermaid', group: 'Export', keywords: 'flowchart diagram text copy markdown', run: copyMermaid },
    { id: 'export:outline-download', label: 'Download outline (.md)', group: 'Export', keywords: 'markdown text summary file', run: downloadOutline },
    { id: 'export:notebooklm', label: 'Export for NotebookLM', group: 'Export', keywords: 'notebook lm google', run: () => void exportToNotebookLm() },
    { id: 'setting:snapping', label: 'Toggle snapping', group: 'Settings', keywords: 'snap guides align', run: () => updateSnapping(!snappingRef.current) },
    { id: 'setting:sketchy', label: 'Toggle hand-drawn style', group: 'Settings', keywords: 'sketchy rough', run: toggleSketchy },
    // Always last: equal search scores keep list order, so commands stay above diagrams. Opening goes through the Library's own open function (the open diagram is saved first).
    ...diagramPaletteEntries(library, folders, currentDocId).map((entry) => ({ ...entry, run: () => { const id = diagramIdFromEntry(entry.id); if (id) void openStoredDiagram(id) } })),
  ]
  const runPaletteEntry = (id: string) => {
    const row = DESKTOP_SHORTCUTS.find((entry) => shortcutEntryId(entry) === id)
    if (row) {
      const input = shortcutKeyInput(row)
      if (input) { const command = keyCommand(input, 'desktop'); if (command) keyActionsRef.current(command) }
      return
    }
    paletteExtras().find((entry) => entry.id === id)?.run()
  }
  // Find on the canvas (both modes): the bar, the query and which match is shown. Matches are searched again on every step, so edits and undo never leave stale ones.
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(-1)
  const [findFocusTick, setFindFocusTick] = useState(0)
  const findQueryRef = useRef('')
  const findIndexRef = useRef(-1)
  const [findReplaceOpen, setFindReplaceOpen] = useState(false)
  const [findReplacement, setFindReplacement] = useState('')
  const findReplacementRef = useRef('')
  const openFind = (withReplace = false) => { setFindOpen(true); if (withReplace) setFindReplaceOpen(true); setFindFocusTick((tick) => tick + 1) }
  const closeFind = () => setFindOpen(false)
  const findMatches = (query: string): SearchMatch[] => searchCanvas(pagesRef.current.map((slot, index) => (index === pageIndexRef.current ? strokesRef.current : slot.items)), query)
  // The bar's count is memoised on the query and a fingerprint of the searchable text of every page, so an ordinary re-render does not search again but an in-place label edit refreshes the count.
  const findCountCacheRef = useRef<{ query: string; fingerprint: string[]; count: number } | null>(null)
  const findCount = (query: string): number => {
    if (!query.trim()) return 0
    const sources = pagesRef.current.map((slot, index) => (index === pageIndexRef.current ? strokesRef.current : slot.items))
    const fingerprint = searchFingerprint(sources)
    const cache = findCountCacheRef.current
    if (cache && cache.query === query && sameSearchFingerprint(cache.fingerprint, fingerprint)) return cache.count
    const count = searchCanvas(sources, query).length
    findCountCacheRef.current = { query, fingerprint, count }
    return count
  }
  /** Shows the match: switches page, centres the view on the item (zooming out only when it does not fit) and selects it (a locked item is only shown). */
  const goToFindMatch = (match: SearchMatch): boolean => {
    if (match.pageIndex !== pageIndexRef.current) goToPage(match.pageIndex)
    if (pageIndexRef.current !== match.pageIndex) return false
    const canvas = canvasRef.current
    const item = strokesRef.current.find((candidate) => canvasItemKey(candidate) === match.key)
    if (!canvas || !item) return false
    const bounds = getCanvasSelectionBounds(routeConnectors(strokesRef.current), new Set([match.key]))
    if (bounds) {
      const rect = canvas.getBoundingClientRect()
      const insets = inputModeRef.current === 'desktop' ? DESKTOP_FIT_INSETS : { left: 16, top: 120, right: 16, bottom: 96 }
      const viewport = viewportRef.current
      const freeWidth = rect.width - insets.left - insets.right
      const freeHeight = rect.height - insets.top - insets.bottom
      const fits = bounds.width * viewport.scale <= freeWidth && bounds.height * viewport.scale <= freeHeight
      if (!fits && !navigationSettingsRef.current.zoomLocked && freeWidth >= 120 && freeHeight >= 120) {
        applyViewport(fitViewportToBoundsInset(bounds, rect.width, rect.height, insets, viewport.scale))
      } else {
        const targetX = (insets.left + rect.width - insets.right) / 2
        const targetY = (insets.top + rect.height - insets.bottom) / 2
        applyViewport({ scale: viewport.scale, offsetX: targetX - (bounds.x + bounds.width / 2) * viewport.scale, offsetY: targetY - (bounds.y + bounds.height / 2) * viewport.scale })
      }
    }
    if (isItemLocked(item)) { renderAll(); return true }
    // Selecting needs the Select tool (as Select all and paste do).
    if (!selectionMode && !lassoMode) toggleSelectTool()
    applySelectionState(normalizeSelection(expandToGroups(strokesRef.current, new Set([match.key]))))
    return true
  }
  const setFindCurrent = (index: number) => { findIndexRef.current = index; setFindIndex(index) }
  const changeFindQuery = (query: string) => {
    findQueryRef.current = query
    setFindQuery(query)
    const matches = findMatches(query)
    if (matches.length === 0) { setFindCurrent(-1); return }
    setFindCurrent(0)
    goToFindMatch(matches[0])
  }
  const changeFindReplacement = (text: string) => { findReplacementRef.current = text; setFindReplacement(text) }
  /** Replaces on all pages, or in one item. Each changed page gets one undo step on its own history (the current page through the normal history path); the result refreshes Find. */
  const runReplace = (only?: { pageIndex: number; key: string }): { replacements: number; changedItems: number } => {
    const query = findQueryRef.current
    if (!query.trim() || penBusy()) return { replacements: 0, changedItems: 0 }
    if (textEditorRef.current) commitTextEditor()
    pagesRef.current[pageIndexRef.current].items = strokesRef.current
    const result = replaceAcrossPages(pagesRef.current, pageIndexRef.current, strokesRef.current, query, findReplacementRef.current, { measureFor: createTextMeasure, fontMeasure: createFontMeasure(), ...(only ? { only } : {}) })
    if (result.replacements === 0) return { replacements: 0, changedItems: 0 }
    if (result.currentItems !== strokesRef.current) {
      saveHistory()
      strokesRef.current = result.currentItems
      historyCacheRef.current = null
      reconcileSelectedItems()
      setHasInk(strokesRef.current.length > 0)
    } else {
      scheduleAutosave() // only other pages changed
    }
    renderAll()
    bumpSelectionColor((n) => n + 1)
    return { replacements: result.replacements, changedItems: result.changedItems }
  }
  const replaceAllFind = () => {
    const done = runReplace()
    showToast(replaceToast(done.replacements, done.changedItems))
    if (done.replacements === 0) return
    const matches = findMatches(findQueryRef.current)
    setFindCurrent(matches.length === 0 ? -1 : 0)
    if (matches.length > 0) goToFindMatch(matches[0])
  }
  const replaceCurrentFind = () => {
    const matches = findMatches(findQueryRef.current)
    if (matches.length === 0) return
    const at = findIndexRef.current >= 0 && findIndexRef.current < matches.length ? findIndexRef.current : 0
    const current = matches[at]
    const done = runReplace({ pageIndex: current.pageIndex, key: current.key })
    showToast(replaceToast(done.replacements, done.changedItems))
    // The replaced item usually left the list, so the same index is the next match; when it still matches (its replacement contains the query) move on one.
    const next = findMatches(findQueryRef.current)
    if (next.length === 0) { setFindCurrent(-1); return }
    const stay = next[at]
    const index = stay && stay.key === current.key && stay.pageIndex === current.pageIndex ? (at + 1) % next.length : at % next.length
    setFindCurrent(index)
    goToFindMatch(next[index])
  }
  const stepFind = (delta: 1 | -1) => {
    const matches = findMatches(findQueryRef.current)
    if (matches.length === 0) { setFindCurrent(-1); return }
    const from = findIndexRef.current
    const next = from < 0 || from >= matches.length ? (delta > 0 ? 0 : matches.length - 1) : (from + delta + matches.length) % matches.length
    setFindCurrent(next)
    goToFindMatch(matches[next])
  }
  // A panel, dialog or text editor is open: shortcuts and Desktop paste leave the canvas alone.
  const overlayOpen = (): boolean => paletteOpenRef.current || shortcutHelpOpen || templateChooserOpen || mermaidOpen || pageOverviewOpen || filePanelOpen || storagePanelOpen || libraryOpen || performanceDiagnosticsOpen || Boolean(textEditor) || textEditorRef.current !== null || Boolean(classBoxEditor)
  const editingBlocksCanvas = (): boolean => overlayOpen() || Boolean(codeEditor && liveCodeEditor())
  const canvasGestureActive = (): boolean => activePointerRef.current !== null || activeConnectorRef.current !== null || activeDragRef.current !== null || activeResizeRef.current !== null || activeRotateRef.current !== null || activeEndpointRef.current !== null || activeDividerRef.current !== null || activeLassoRef.current !== null || lassoDragRef.current !== null || textTapRef.current !== null || classTapRef.current !== null || activeObjectEraserRef.current !== null || minimapDragPointerRef.current !== null || umlToolboxDragRef.current !== null || mousePanRef.current !== null || activeQuickRef.current !== null
  // Shared by the keyboard commands and the Desktop paste event: an overlay or editor, an open context menu, any canvas gesture or marquee, or fingers down.
  const canvasCommandBlocked = (): boolean => editingBlocksCanvas() || Boolean(contextMenuRef.current) || canvasGestureActive() || activeMarqueeRef.current !== null || touchNav.touchCount() > 0
  // Desktop Ctrl+V with an empty in-app clipboard is not handled on keydown (so the browser still fires its paste event): this reads the system clipboard text from that event.
  const pasteEventRef = useRef<(event: ClipboardEvent) => void>(() => undefined)
  pasteEventRef.current = (event) => {
    if (inputModeRef.current !== 'desktop' || event.defaultPrevented || clipboardRef.current.length > 0) return
    const target = event.target as HTMLElement | null
    if (isTypingTarget(target?.tagName ?? 'BODY', Boolean(target?.isContentEditable))) return
    // Same guards as the Ctrl+V keydown path: no paste under a dialog, editor, context menu, gesture, marquee or fingers on the canvas (and then no preventDefault).
    if (canvasCommandBlocked()) return
    event.preventDefault()
    const at = cursorPointRef.current ? screenToCanvasPoint(cursorPointRef.current, viewportRef.current) : null
    if (!pasteSystemText(event.clipboardData?.getData('text/plain') ?? '', at)) showToast('Nothing to paste')
  }
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => pasteEventRef.current(event)
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])
  const keyActionsRef = useRef<(command: KeyCommand) => boolean>(() => false)
  keyActionsRef.current = (command) => {
    if (command.kind === 'library' && libraryOpen) return true // the Library is already open: only keep the browser's open dialog away
    // Nothing runs under a panel or dialog, while text is being edited, or in the middle of any canvas gesture.
    if (editingBlocksCanvas()) return false
    const gestureActive = canvasGestureActive()
    if (contextMenuRef.current) {
      // While the menu is open Escape closes it and no other shortcut runs.
      if (command.kind === 'deselect') { closeContextMenu(); return true }
      return false
    }
    const cancelableGesture = activeDragRef.current !== null || activeResizeRef.current !== null || activeRotateRef.current !== null || activeEndpointRef.current !== null || activeDividerRef.current !== null || activeLassoRef.current !== null || lassoDragRef.current !== null || activeMarqueeRef.current !== null || activeQuickRef.current !== null
    if (command.kind === 'deselect') {
      // Esc leaves the laser first (it has no selection or gesture of its own).
      if (laserModeRef.current && !cancelableGesture) { leaveLaser(); return true }
      const action = escapeAction({ cancelableGesture, anyGesture: gestureActive || touchNav.touchCount() > 0, hasSelection: selectedKeysRef.current.size > 0 || selectedRectangleIdRef.current !== null })
      if (action === 'cancelGesture') return cancelActiveGesture()
      if (action === 'none') {
        // Nothing to cancel or deselect: Esc shows the toolbars again, but never under a stroke, a drag or a pinch.
        if (presentModeRef.current && !gestureActive && touchNav.touchCount() === 0) { setPresentMode(false); return true }
        return false
      }
    }
    if (gestureActive || activeMarqueeRef.current !== null || touchNav.touchCount() > 0) return false
    if (command.kind !== 'nudge') lastNudgeAtRef.current = null
    switch (command.kind) {
      case 'undo': undo(); return true
      case 'redo': redo(); return true
      case 'library': toggleLibrary(); return true
      case 'palette': openPalette(); return true
      case 'find': openFind(); return true
      case 'findReplace': openFind(true); return true
      case 'zoomIn': if (!navigationSettingsRef.current.zoomLocked) zoomBy(ZOOM_STEP); return true
      case 'zoomOut': if (!navigationSettingsRef.current.zoomLocked) zoomBy(1 / ZOOM_STEP); return true
      case 'zoomReset': zoomToActualSize(); return true
      case 'zoomFit': zoomToFitDesktop(); return true
      case 'zoomSelection': zoomToSelection(); return true
      case 'pagePrev': goToPage(pageIndexRef.current - 1); return true
      case 'pageNext': goToPage(pageIndexRef.current + 1); return true
      case 'presentMode': togglePresentMode(); return true
      case 'help': setShortcutHelpOpen((open) => !open); return true
      case 'deselect':
        if (selectedKeysRef.current.size === 0 && selectedRectangleIdRef.current === null) return false
        clearLassoSelection()
        return true
      case 'quickCreate': return quickCreateShape(command.direction)
      case 'nudge': return nudgeSelection(command.dx, command.dy)
      case 'edit': { const target = editTargetForSelection(strokesRef.current, selectedKeysRef.current, selectedRectangleIdRef.current); return target ? openEditTarget(target) : false }
      case 'copy': return copyWithToast()
      case 'cut': return cutWithToast()
      case 'copyPng': return copyAsPng()
      case 'copyStyle': return copyStyleWithToast()
      case 'pasteStyle': return pasteStyleWithToast()
      case 'paste':
        // Desktop, nothing copied in the app: no preventDefault, the browser's paste event brings the system clipboard text (see pasteEventRef).
        if (inputModeRef.current === 'desktop' && clipboardRef.current.length === 0) return false
        return pasteWithToast(inputModeRef.current === 'desktop' && cursorPointRef.current ? screenToCanvasPoint(cursorPointRef.current, viewportRef.current) : null)
      case 'duplicate': return duplicateWithToast()
      case 'deleteSelection': return deleteSelection()
      case 'selectAll': return selectAllItems()
      case 'layer': return moveSelectionLayer(command.move)
      case 'lock': return lockSelection()
      case 'toolLock': toggleToolLock(); return true
      case 'fontSize': return stepSelectedFontSize(command.direction)
      case 'group': return groupSelection()
      case 'ungroup': return ungroupSelection()
      case 'tool':
        setOptionsFor(null)
        switch (command.tool) {
          case 'pen': selectPenMode(); break
          case 'select': if (!selectionMode) toggleSelectTool(); break
          case 'eraser':
            setTextMode(false); setClassMode(false); setShapeMode(false); setShapeTool(null); setSelectionMode(false); setLassoMode(false); setConnectorMode(false); setUmlConnectorType(null); clearLassoSelection()
            setEraser(true)
            break
          case 'text': if (!textMode) toggleTextTool(); break
          case 'code': insertCodeBlock(); break
          case 'sticky': insertStickyNote(); break
          case 'laser': toggleLaserTool(); break
          case 'lasso': if (!lassoMode) toggleLassoTool(); break
          case 'connector': if (!connectorMode) toggleConnectorTool(); break
          case 'classBox': if (!(classMode && inkClassTool && hldShapeTool === null)) toggleInkClassTool(); break
          case 'rectangle': case 'diamond': case 'ellipse': case 'arrow': case 'line': if (shapeTool !== command.tool) toggleShapeDrawTool(command.tool); break
        }
        return true
    }
  }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      clickPairRef.current = null
      const command = keyCommand(event, inputModeRef.current)
      if (!command) return
      const target = event.target as HTMLElement | null
      if (isTypingTarget(target?.tagName ?? 'BODY', Boolean(target?.isContentEditable))) {
        if (command.kind === 'palette' || command.kind === 'find' || command.kind === 'findReplace') event.preventDefault() // Chrome's Ctrl+K (search bar) and Ctrl+F (find bar) never win, even inside a text field
        return
      }
      // Enter on a focused button or link activates it: only a canvas-level Enter edits.
      if (command.kind === 'edit' && ['BUTTON', 'A'].includes((target?.tagName ?? '').toUpperCase())) return
      const handled = keyActionsRef.current(command)
      // Group, Ungroup, Library and the style shortcuts never fall through to the browser (Ctrl+G opens Chrome's find bar), even when they do nothing.
      if (handled || alwaysPreventsDefault(command, inputModeRef.current)) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <main className={`app-shell${presentMode ? ' ui-hidden' : ''}`}>
      <section className="canvas-stage" aria-label="Drawing canvas">
        <div ref={sheetLayerRef} className="sheet-layer" aria-hidden="true" style={{ width: SHEET_WIDTH, height: sheetHeight }} />
        <div ref={eraserCursorRef} className="eraser-cursor" aria-hidden="true" />
        {laserMode && <canvas ref={laserCanvasRef} className="laser-overlay" aria-hidden="true" />}
        {PEN_BUTTON_DEBUG && <div ref={penButtonReadoutRef} className="pen-button-readout" role="status">pen button: waiting for the pen</div>}
        <canvas
          ref={canvasRef}
          className={`drawing-canvas${selectionMode ? ' selecting' : ''}${connectorMode || umlConnectorType !== null ? ' connecting' : ''}`}
          aria-label="White drawing canvas. Use an S Pen to draw."
          onPointerDown={onPointerDown}
          onContextMenu={onCanvasContextMenu}
          onDoubleClick={onCanvasDoubleClick}
          onMouseDown={(event) => { if (event.button === 1 && inputModeRef.current === 'desktop') event.preventDefault() }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onPointerLeave={onPointerLeave}
        />
        {contextMenu && inputMode === 'desktop' && (() => {
          const hasSelection = selectedItemCount > 0 || hasSelectedRectangle
          const styleSource = soleStyleSource()
          const entries = contextMenuEntries({
            canCopyStyle: styleSource !== null && captureStyle(styleSource) !== null,
            canPasteStyle: copiedStyleRef.current !== null && hasSelection,
            hasSelection,
            clipboardHasItems: clipboardCount > 0,
            pageHasItems: hasInk,
            canEditText: editTargetForSelection(strokesRef.current, selectedKeysRef.current, selectedRectangleIdRef.current) !== null,
            lockedTarget: contextMenu.lockedKey !== null,
            anyLocked: strokesRef.current.some(isItemLocked),
            canGroup: canGroup(strokesRef.current, currentSelectionKeys()),
            canUngroup: canUngroup(strokesRef.current, currentSelectionKeys()),
            changeShapes: changeShapeChoices(strokesRef.current, currentSelectionKeys())?.choices ?? [],
            canNumberSteps: stepTargets(strokesRef.current, currentSelectionKeys()).length > 0,
            canSameSize: canSameSize(strokesRef.current, currentSelectionKeys()),
            canSelectConnected: canSelectConnected(strokesRef.current, currentSelectionKeys()),
            arrowEnds: arrowEndsChoice(strokesRef.current, selectedKeysRef.current),
            corners: cornersChoice(strokesRef.current, currentSelectionKeys()),
            canSelectSimilar: (() => { const key = soleSelectedKey(); return key !== null && similarItemKeys(strokesRef.current, key).length > 0 })(),
          })
          const position = clampMenuPosition(contextMenu.x, contextMenu.y, CONTEXT_MENU_WIDTH, contextMenuHeight(entries), window.innerWidth, window.innerHeight)
          return (
            <div ref={contextMenuElementRef} className="canvas-context-menu" role="menu" aria-label="Canvas actions" style={{ left: position.x, top: position.y }} onContextMenu={(event) => event.preventDefault()} onKeyDown={onContextMenuKeyDown}>
              {contextMenuRows(entries).map((row, index) => row.separator
                ? <div key={`separator-${index}`} className="canvas-context-separator" role="separator" />
                : row.chips ? (
                  <div key={`chips-${row.chips[0].chipGroup}`} className={chipBlockLayout(row.chips).inline ? 'canvas-context-chips inline' : 'canvas-context-chips'} role="group" aria-label={row.chips[0].chipGroup}>
                    <span className="canvas-context-chips-caption">{row.chips[0].chipGroup}</span>
                    <div className="canvas-context-chips-row">
                      {row.chips.map((chip) => (
                        <button key={chip.action} type="button" role="menuitem" className="canvas-context-chip" disabled={chip.disabled} title={chip.hint ? `${chip.label} (${chip.hint})` : chip.label} aria-label={chip.hint ? `${chip.label} (${chip.hint})` : chip.label} onClick={() => runContextMenuAction(chip.action, contextMenu.lockedKey)}>{chip.chip}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button key={row.entry.action} type="button" role="menuitem" disabled={row.entry.disabled} onClick={() => runContextMenuAction(row.entry.action, contextMenu.lockedKey)}>
                    <span>{row.entry.label}</span>
                    {row.entry.hint && <kbd className="canvas-context-hint">{row.entry.hint}</kbd>}
                  </button>
                ))}
            </div>
          )
        })()}
        <div className={`app-toast${toast ? ' app-toast-visible' : ''}`} role="status" aria-live="polite">{toast?.text ?? ''}</div>
        {DRAW_READOUT_ENABLED && (
          <div className="draw-readouts" aria-hidden="true">
            <div className="draw-readout">{DRAW_FLAGS_TEXT}</div>
            <div ref={frameReadoutRef} className="draw-readout">last stroke: write a stroke to see frame timing</div>
            <div ref={redrawReadoutRef} className="draw-readout">page redraw (zoom/pan/undo/open): none yet</div>
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
        {codeEditor && inputMode === 'desktop' && (() => {
          const block = strokesRef.current.find((candidate) => candidate.kind === 'code' && candidate.id === codeEditor.id)
          return block?.kind === 'code' ? <CodeEditorOverlay key={codeEditor.id} item={block} viewport={viewportRef.current} onChange={(value) => { codeEditorValueRef.current = value }} onCommit={commitCodeEditor} /> : null
        })()}
        {!hasInk && !textEditor && !codeEditor && !classBoxEditor && !libraryOpen && !filePanelOpen && !storagePanelOpen && !shortcutHelpOpen && !templateChooserOpen && !mermaidOpen && <EmptyCanvasHint desktop={inputMode === 'desktop'} onTemplates={() => setTemplateChooserOpen(true)} />}
        <aside
          ref={umlToolboxRef}
          className={`uml-toolbox${umlToolboxMinimized ? ' minimized' : ''}${inputMode === 'desktop' ? ' desktop' : ''}`}
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
          <PageControls index={pageIndex} count={pageCount} canAdd={canAddPage(pageCount) && hasInk} addHint={!canAddPage(pageCount) ? 'Page limit reached' : hasInk ? 'Add page after this one' : 'Write something on this page first'} onPrevious={() => goToPage(pageIndex - 1)} onNext={() => goToPage(pageIndex + 1)} onAdd={addPage} onDuplicate={duplicatePage} canDuplicate={canAddPage(pageCount)} duplicateHint={canAddPage(pageCount) ? 'Duplicate page: copy this page right after it' : 'Page limit reached'} onDelete={deletePage} onOverview={() => setPageOverviewOpen(true)} name={pagesRef.current[pageIndex]?.name ?? ''} />
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
                    style={{ height: 108 + (sheetHeight - SHEET_MIN_HEIGHT) * 0.06 }}
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
      {/* With the zoom lock on the screen is in focus mode: the menu, folders, title and account hide; undo/redo, the dock, the pen colours and the zoom controls stay. */}
      {!zoomLockActive && (
        <TopLeftBar
          title={docTitle}
          onRenameTitle={renameDiagram}
          pageTemplate={pageTemplate}
          onPageTemplate={setPageTemplate}
          pageSpacing={pageSpacing}
          onPageSpacing={setPageSpacing}
          sketchy={sketchy}
          onSketchy={toggleSketchy}
          pageBackground={pageBackground}
          onPageBackground={setPageBackground}
          inputMode={inputMode}
          onInputMode={updateInputMode}
          snapping={snapping}
          onSnapping={updateSnapping}
          onShortcutHelp={() => setShortcutHelpOpen(true)}
          oneFingerPan={navigationSettings.oneFingerPan}
          onOneFingerPan={(value) => updateNavigationSettings({ oneFingerPan: value })}
          tapUndo={tapUndo}
          onTapUndo={(value) => { setTapUndo(value); saveTapUndo(value) }}
          hasInk={hasInk}
          filePanelOpen={filePanelOpen}
          onToggleFilePanel={() => setFilePanelOpen((open) => !open)}
          onClear={clearCanvas}
          onSlimInk={slimInk}
          libraryOpen={libraryOpen}
          statusText={statusLabel(saveStatus, storage.kind)}
          statusOk={saveStatus === 'saved'}
          onOpenLibrary={toggleLibrary}
          storage={storage}
          onOpenStorage={() => setStoragePanelOpen(true)}
          diagnostics={{ enabled: PERFORMANCE_DIAGNOSTICS_ENABLED, open: performanceDiagnosticsOpen, onToggle: () => setPerformanceDiagnosticsOpen((open) => !open), onFillTestInk: fillTestInk, onRemoveTestInk: removeTestInk }}
        />
      )}
      <HistoryBar desktop={inputMode === 'desktop'} canUndo={canUndo} canRedo={canRedo} onUndo={undo} onRedo={redo} />
      <AccountButton profile={driveProfile} needsReconnect={storage.kind === 'drive' && storage.locked} onReconnect={() => void reconnectDeviceFolder()} hideAccount={zoomLockActive} onOpenStorage={() => setStoragePanelOpen(true)} leading={penModeActive && inputMode !== 'desktop' ? <PenColors color={color} onColor={selectColor} /> : undefined} />
      <ContextPanel
        desktop={inputMode === 'desktop'}
        showDisplayMode={shapeTool === null}
        showSelectionColor={inputMode === 'desktop' && (selectedItemCount > 0 || hasSelectedRectangle)}
        selectionColor={selectionColor(strokesRef.current, currentSelectionKeys())}
        onSelectionColor={recolorSelection}
        fill={inputMode === 'desktop' && selectionHasFillable(strokesRef.current, currentSelectionKeys())
          ? { color: selectionFillColor(strokesRef.current, currentSelectionKeys()), onFill: fillSelection, onMatchOutline: (hex) => recolorSelection(hex, true), outlineFor: matchingOutline }
          : null}
        showEraser={inputMode === 'desktop' && eraser}
        selectionWidth={inputMode === 'desktop' && selectionHasOutlineWidth(strokesRef.current, currentSelectionKeys())
          ? { value: selectionStrokeWidth(strokesRef.current, currentSelectionKeys()), onChange: changeSelectionWidth, onEnd: endWidthChange }
          : null}
        lineStyle={inputMode === 'desktop'
          ? (currentSelectionKeys().size > 0
            ? (strokesRef.current.some((item) => currentSelectionKeys().has(canvasItemKey(item)) && hasLineDash(item)) ? { value: selectionDash(strokesRef.current, currentSelectionKeys()), label: 'Line style', onChange: changeLineDash } : null)
            : (shapeTool !== null ? { value: lineDashDefault, label: 'Line style for new shapes', onChange: changeLineDash } : null))
          : null}
        arrowheads={inputMode === 'desktop' && selectionHasArrowheads(strokesRef.current, currentSelectionKeys())
          ? { value: selectionArrowheads(strokesRef.current, currentSelectionKeys()), onChange: changeArrowheads }
          : null}
        corners={(() => { const choice = cornersChoice(strokesRef.current, currentSelectionKeys()); return choice === null ? null : { rounded: choice === 'sharp', onChange: setSelectedCorners } })()}
        changeShape={(() => { const offered = changeShapeChoices(strokesRef.current, currentSelectionKeys()); return offered ? { choices: offered.choices, onChange: (id) => { changeShapeSelection(id) } } : null })()}
        sameSize={canSameSize(strokesRef.current, currentSelectionKeys()) ? { onSameSize: (mode) => { sameSizeSelection(mode) } } : null}
        boundaryTools={currentSelectionKeys().size > 0 ? { onAddBoundary: () => { addBoundaryAroundSelection() }, onSelectConnected: canSelectConnected(strokesRef.current, currentSelectionKeys()) ? () => { selectConnectedItems(false) } : null } : null}
        selectionTools={inputMode !== 'desktop' && currentSelectionKeys().size > 0 ? (() => {
          const keys = currentSelectionKeys()
          const sole = soleSelectedKey()
          const source = soleStyleSource()
          return {
            onSelectSimilar: sole !== null && similarItemKeys(strokesRef.current, sole).length > 0 ? () => { selectSimilarItems() } : null,
            onCopyStyle: source !== null && captureStyle(source) !== null ? () => { copyStyleWithToast() } : null,
            onPasteStyle: () => { pasteStyleWithToast() },
            canPasteStyle: copiedStyleRef.current !== null,
            onNumberSteps: stepTargets(strokesRef.current, keys).length > 0 ? () => { numberFlowSteps() } : null,
          }
        })() : null}
        layer={inputMode === 'desktop' && (selectedItemCount > 0 || hasSelectedRectangle) ? { onMove: (move) => { moveSelectionLayer(move) } } : null}
        arrange={inputMode === 'desktop' && canAlign(strokesRef.current, currentSelectionKeys())
          ? { canAlign: true, canDistribute: canDistribute(strokesRef.current, currentSelectionKeys()), onAlign: alignSelection, onDistribute: distributeSelection }
          : null}
        group={(canGroup(strokesRef.current, currentSelectionKeys()) || canUngroup(strokesRef.current, currentSelectionKeys()))
          ? { canGroup: canGroup(strokesRef.current, currentSelectionKeys()), canUngroup: canUngroup(strokesRef.current, currentSelectionKeys()), onGroup: () => { groupSelection() }, onUngroup: () => { ungroupSelection() } }
          : null}
        rotation={rotationPanel}
        code={codePanel}
        objectEraser={objectEraser}
        eraserSize={eraserSize}
        onEraserMode={(whole) => { setObjectEraser(whole); setEraser(true) }}
        onEraserSize={(size) => { setEraserSize(size); setObjectEraser(false); setEraser(true) }}
        showStyle={inputMode === 'desktop' ? ((penModeActive || shapeTool !== null) && selectedItemCount === 0 && !hasSelectedRectangle) : optionsFor === 'pen' && penModeActive}
        color={color}
        onColor={selectColor}
        width={width}
        onWidth={setWidth}
        strokeDisplayMode={strokeDisplayMode}
        onStrokeDisplayMode={setStrokeDisplayMode}
        showTextSizes={(optionsFor === 'text' || inputMode === 'desktop') && textMode}
        textSize={textSize}
        onTextSize={pickTextSize}
        textSizeChoices={inputMode === 'desktop' ? TEXT_FONT_SIZES_DESKTOP : undefined}
        textAlign={textAlignPanel}
        connectorLabelSize={selectedConnectorLabel && selectedItemCount === 1 && selectedConnectorId !== null ? (() => { const c = selectedLabelledConnector(); return c && !c.locked ? { size: connectorLabelFontSize(c), onPick: pickConnectorLabelSize } : undefined })() : undefined}
        textFit={textFitOn === null ? undefined : { on: textFitOn, onToggle: toggleTextFit }}
        showTextFonts={((optionsFor === 'text' || inputMode === 'desktop') && textMode) || (selectedTextId !== null && selectedItemCount === 1)}
        textFontId={selectedTextFont ?? textFontId}
        onTextFont={changeTextFontChoice}
        selectedItemCount={selectedItemCount}
        onClearSelection={clearLassoSelection}
        canDelete={selectedItemCount > 0 || hasSelectedRectangle}
        onDeleteSelection={() => { deleteSelection() }}
        canCopy={selectedItemCount > 0 || hasSelectedRectangle}
        canPaste={clipboardCount > 0}
        onCopy={() => { copySelection() }}
        onPaste={() => { pasteClipboard() }}
        onDuplicate={() => { duplicateSelection() }}
        relationship={selectedConnectorId !== null && selectedConnectorType !== null
          ? { type: selectedConnectorType, reversed: selectedConnectorReversed, elbow: selectedConnectorElbow, hasLabel: selectedConnectorLabel, twoWay: selectedConnectorTwoWay, onTwoWay: setSelectedArrowEnds, onEditLabel: () => { if (selectedConnectorId !== null) editConnectorLabel(selectedConnectorId) }, onChange: changeSelectedConnectorType, onReverse: reverseSelectedConnector, onElbow: changeSelectedConnectorRouting, ...endLabelProps(selectedConnectorId) }
          : null}
      />
      {pageOverviewOpen && <PageOverview count={pageCount} current={pageIndex} names={pagesRef.current.map((slot) => slot.name ?? '')} onRename={renamePage} loadThumbnail={renderPageThumbnail} onGo={(index) => { goToPage(index); setPageOverviewOpen(false) }} onMove={movePageTo} onClose={() => setPageOverviewOpen(false)} />}
      {deletedPageNumber !== null && <PageUndoBar pageNumber={deletedPageNumber} onUndo={undoDeletePage} />}
      {findOpen && <FindBar query={findQuery} onQueryChange={changeFindQuery} count={findCount(findQuery)} index={findIndex} onNext={() => stepFind(1)} onPrevious={() => stepFind(-1)} onClose={closeFind} focusTick={findFocusTick} desktop={inputMode === 'desktop'} replaceOpen={findReplaceOpen} onToggleReplace={() => setFindReplaceOpen((open) => !open)} replacement={findReplacement} onReplacementChange={changeFindReplacement} onReplace={replaceCurrentFind} onReplaceAll={replaceAllFind} />}
      {shortcutHelpOpen && inputMode === 'desktop' && <ShortcutHelp onClose={() => setShortcutHelpOpen(false)} />}
      {paletteOpen && inputMode === 'desktop' && <CommandPalette entries={[...shortcutPaletteEntries(), ...paletteExtras()]} onRun={runPaletteEntry} onClose={closePalette} />}
      {mermaidOpen && <MermaidDialog onInsert={importMermaid} onClose={() => setMermaidOpen(false)} />}
      {templateChooserOpen && <TemplateChooser onChoose={insertTemplate} onClose={() => setTemplateChooserOpen(false)} onMermaid={() => { setTemplateChooserOpen(false); setMermaidOpen(true) }} userTemplates={userTemplates} onChooseUser={insertUserTemplate} onDeleteUser={deleteUserTemplate} canSave={selectedItemCount > 0 || hasSelectedRectangle} startSaving={templateSaveMode} onSave={saveSelectionAsTemplate} />}
      <ZoomControls desktop={inputMode === 'desktop'} onResetZoom={zoomToActualSize} zoomPercent={zoomPercent} locked={zoomLockActive} onToggleLock={() => updateNavigationSettings({ zoomLocked: !zoomLockActive })} onZoomIn={() => zoomBy(ZOOM_STEP)} onZoomOut={() => zoomBy(1 / ZOOM_STEP)} />
      <ToolDock
        desktop={inputMode === 'desktop'}
        dockRef={toolbarRef}
        eraserControlRef={eraserControlRef}
        penActive={penModeActive}
        eraserActive={eraser}
        eraserMenuOpen={eraserMenuOpen}
        selectionActive={selectionMode}
        lassoActive={lassoMode}
        connectorActive={connectorMode || umlConnectorType !== null}
        textActive={textMode}
        classActive={classMode && !inkClassTool}
        inkClassActive={classMode && inkClassTool && hldShapeTool === null}
        hldShapeActive={classMode && inkClassTool ? hldShapeTool : null}
        onHldShape={toggleHldShapeTool}
        shapeActive={shapeMode}
        shapeTool={shapeTool}
        onShapeTool={toggleShapeDrawTool}
        onPen={tapPenTool}
        onEraser={tapEraserTool}
        onSelect={toggleSelectTool}
        onLasso={toggleLassoTool}
        onConnector={toggleConnectorTool}
        onText={toggleTextTool}
        onTextOptions={openTextOptions}
        onClass={toggleClassTool}
        onInkClass={toggleInkClassTool}
        onShapes={toggleShapeTool}
        tidyLabel={tidyScope(strokesRef.current, selectedKeysRef.current).selection ? 'Tidy selected' : 'Tidy all'}
        onTidy={tidyDiagram}
        onCode={insertCodeBlock}
        onFind={openFind}
        onSticky={insertStickyNote}
        toolLock={toolLock}
        onToolLock={toggleToolLock}
        onTemplates={() => setTemplateChooserOpen(true)}
        onMermaid={() => setMermaidOpen(true)}
        laserActive={laserMode}
        onLaser={toggleLaserTool}
        presentActive={presentMode}
        onPresent={togglePresentMode}
        onDuplicatePage={duplicatePage}
        onPageOverview={() => setPageOverviewOpen(true)}
        canDuplicatePage={canAddPage(pageCount)}
      />
      {presentMode && <button className="show-toolbars-pill" type="button" title="Show the toolbars (Alt+Z or Esc)" onClick={() => setPresentMode(false)}>Show toolbars</button>}
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
      {libraryOpen && <HomeScreen
        library={library}
        folders={folders}
        currentId={currentDocId}
        thumbnails={thumbnails}
        starredIds={starredIds}
        onToggleStar={(id) => void toggleStar(id)}
        starsSync={storage.kind === 'drive'}
        notice={fileNotice}
        storageText={storageLabel(storage)}
        storageLocked={storage.locked}
        showConnectHint={storage.kind === 'browser'}
        onClose={() => setLibraryOpen(false)}
        onOpenDiagram={(id) => { setLibraryOpen(false); void openStoredDiagram(id) }}
        onNewDiagram={(folderId, template) => { setLibraryOpen(false); void newDiagramIn(folderId, template) }}
        onImportFile={(file) => void importDocumentFile(file)}
        onCreateFolder={(name, parentId) => createFolder(name, parentId)}
        onRenameFolder={(id, name) => renameFolder(id, name)}
        onRenameDiagram={(id, title) => renameStoredDiagram(id, title)}
        onMakeCopy={(id) => copyStoredDiagram(id)}
        onDeleteFolder={(id, confirmed) => deleteFolder(id, confirmed)}
        onFolderDeleteScheduled={(id) => releaseFolderTarget(id)}
        onMoveDiagram={(docId, folderId) => moveDiagram(docId, folderId)}
        onDeleteDiagram={(id) => deleteStoredDiagram(id)}
        onChangeStorage={() => { setLibraryOpen(false); setStoragePanelOpen(true) }}
        desktop={inputMode === 'desktop'}
      />}
      {filePanelOpen && <FilePanel
        title={docTitle}
        saveStatus={saveStatus}
        notice={fileNotice}
        canExport={hasInk}
        canOutline={hasInk || pagesRef.current.some((slot, index) => index !== pageIndex && slot.items.some((item) => !(item.kind === 'stroke' && item.erase)))}
        storage={storage}
        onClose={() => setFilePanelOpen(false)}
        onTitleChange={renameDiagram}
        onNew={() => void newDiagram()}
        onExportDocument={exportDocumentFile}
        onImportFile={(file) => void importDocumentFile(file)}
        onCopyOutline={copyOutline}
        onCopyMermaid={copyMermaid}
        onDownloadOutline={downloadOutline}
        onExportSvg={() => void exportSvgFile()}
        onExportPng={(scale) => void exportPngFile(scale)}
        transparent={transparentExport}
        onTransparentChange={setTransparentExport}
        onExportNotebookLm={() => void exportToNotebookLm()}
        exportBusy={exportBusy}
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
      {eraserMenuOpen && inputMode !== 'desktop' && eraserPopoverPosition && createPortal(
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
