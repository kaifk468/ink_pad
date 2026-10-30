# InkPad Project Context

## Current Status — 2026-10-30

- **Canvas:** the white sheet is 2500 × 1500 units at (0, 0); the drawable workspace is 2750 × 1650, from (-125, -75) to (2625, 1575). Existing items remain in canvas coordinates.
- **Viewport:** default zoom 1×, limits 0.1×–3×. Two-finger touch is pinch zoom; three-finger touch pans; one-finger touch is ignored for drawing/navigation. S Pen input is converted to canvas coordinates.
- **Toolbar:** reference-inspired grouped layout shows Undo/Redo first, stacks tool icons above labels on wide screens, and orders Pen, Eraser, Lasso, Connector, Shapes, and Select before the existing Raw/Smooth, color, thickness, page-template, and page-color controls. Narrow screens hide captions and keep controls horizontally scrollable. Active tools and stroke display mode remain clearly selected.
- **Erasers:** standard erasing uses a continuous 8–96 canvas-unit size slider plus 14, 28, 48, and 72 quick presets; the popover presents Stroke Eraser and Whole Eraser as clearly selected mode cards. Partial erase strokes support S Pen hover plus contact. Whole Eraser removes complete hit items along an S Pen contact/rub path; removing a rectangle detaches its connector endpoints. Erasure is composited on transparent ink layers so the sheet/workspace background remains visible. Touch-based whole-object deletion was not verified on device.
- **Stroke display:** toolbar offers Smooth (default) and Raw display modes, persisted in local storage. Smooth uses midpoint quadratic segments and a One Euro display copy; Raw uses straight segments. New raw-point sampling retains points more than 0.5 screen pixels apart by converting that threshold to canvas units using current zoom. Stored points remain authoritative; small strokes bypass filtering and corner neighborhoods are protected. Point timestamps are not stored; Smooth still assumes 120 Hz.
- **Development diagnostics:** DEV builds expose an optional Perf panel. It groups completed strokes by pen-down mode and retained point count, and reports pointer rate/interval, coalesced batch size, RAF wait/merged requests, whole render and active-item render time, minimap/page overview cost, and handler-entry-to-render-complete estimate. Metrics update after pen-up and retain up to 40 strokes per group. Production has no panel or collector instance.
- **Page templates:** toolbar offers Blank (default), Lined, and Dotted templates at 32 canvas-unit spacing. Stronger opaque marks render as a cached background pattern clipped to the white sheet. Workspace minimap and page overview use a compact, visible-scale preview. The choice persists in local storage; this app currently has no diagram file save/load format to store it in.
- **Page background:** a separate toolbar setting offers White (default), Warm, Blue, Yellow, and Green sheet colors. It is persisted independently from the template, and applied only beneath ink on the white sheet and in both page overview renderings.
- **UML toolbox:** a narrower, draggable floating panel on the left provides Association, Directed association, Inheritance, Realization, Aggregation, Composition, and Dependency connector tools. It can collapse to a small draggable restore button. These create first-class connector objects and reuse rectangle boundary snapping and attachment updates. The existing top toolbar remains in place; its relationship editor recognizes the added connector types.
- **Minimap:** compact workspace overview is shown by default with the current viewport indicator and navigation. Expand reveals a separate fixed-scale white-page overview. Both render erased ink over their own backgrounds.
- **Decisions:** keep persisted item coordinates stable; do not migrate/rebase diagrams. Keep viewport gestures separate from S Pen drawing and preserve snapshot-based undo/redo.
- **Known issues:** page template and color settings are not attached to a diagram file because the app has no file save/load model. Smooth filtering assumes a fixed 120 Hz interval because Point has no timestamp; actual device sampling intervals and render costs have not been measured on hardware. Automated checks after development diagnostics: `npm test` passed (118 tests) and `npm run build` passed. This does not verify real-device appearance or tablet ergonomics.
- **Unverified:** Galaxy Tab S9 FE+ behavior for hover erasing, whole-object rubbing/capture, three-finger panning, minimap input, and dragging/minimizing/restoring the UML toolbox remains to be checked.
- **Next on-device test:** run `npm run dev` on a desktop reachable from the Galaxy Tab S9 FE+, open the Perf panel, then draw short and long Raw and Smooth strokes. Record the four groups, especially moves/s, RAF wait, render-all vs minimap/page-view cost, and event-to-render estimate. Repeat with the page inset expanded and with a larger existing diagram; these metrics do not include digitizer/OS/display scanout latency.

## Canvas and viewport

- White sheet: 2500 × 1500 canvas units, origin (0, 0).
- Drawable workspace: 2750 × 1650 units, bounds (-125, -75) to (2625, 1575), giving a 5% gray margin around the sheet.
- Stored strokes, rectangles, and connectors use canvas coordinates. View transforms affect display/input conversion only.
- Default zoom is 1×; limits are 0.1×–3×. Two-finger touch pinches to zoom; three-finger touch pans. S Pen remains the drawing/editing pointer.

## Drawing and editing

- Freehand strokes, hold-recognized rectangles/lines, UML connectors, selection/lasso, object movement/resizing, and snapshot undo/redo are implemented.
- Standard eraser stores partial erase paths and clears ink on the transparent ink layer, preserving the white sheet and gray background. Eraser widths are selectable.
- Delete Whole Shape removes the complete hit stroke, rectangle, or connector. S Pen contact/rubbing sweeps are sampled along the pointer path; deleting a rectangle detaches its connector endpoints.
- Main canvas, workspace minimap, and optional page overview use separate persistent transparent ink layers for correct erase compositing.

## Minimap

- Compact workspace overview is shown by default and maps the fixed drawable workspace with a viewport indicator.
- Expand reveals the separate page overview, which maps the full white sheet at a fixed scale.
- Minimap navigation changes the viewport, not drawing coordinates; navigator controls are isolated from drawing gestures.

## Decisions, known checks, and next steps

- Keep diagram coordinates and existing saved data stable; no migration is currently required.
- Current automated checks: `npm test` and `npm run build` (latest eraser update: 81 tests passed; production build passed).
- No confirmed code bug is currently recorded. Real-device behavior still needs checking on the Galaxy Tab S9 FE+ with S Pen, especially whole-object eraser rubbing/pointer capture, pen hover erase, and three-finger pan reliability.
- Next: validate those gestures on-device; if issues appear, record the device/browser and exact gesture before adjusting pointer handling.

## Stroke readability adjustment — 2026-10-30

- Reduced One Euro filtering with 8 Hz minimum cutoff and beta 0.2; strokes with a bounding box under 40 units bypass the filter, and sharp-turn samples plus neighbors remain raw. First/last points remain exact.
- Confirmed midpoint curve segments start/end at source endpoints; per-segment rounded caps can soften dense small handwriting, so the renderer remains available for direct comparison using `DEBUG_DISABLE_FILTER`.
- Verification: `npm test` passed (91 tests); `npm run build` passed.
- Next: compare small lettering, corners, slow/fast strokes, and zoom levels on the Galaxy Tab S9 FE+ with filtering enabled and disabled.

## Raw/Smooth display mode — 2026-10-30

- Added a compact toolbar toggle, defaulting to Smooth and persisting the choice in local storage. Raw redraws existing freehand strokes as original straight pressure-weighted segments; switching modes does not alter points or history.
- Removed the temporary filter debug constant.
- Verification: `npm test` passed (95 tests); `npm run build` passed.
- Next: verify readability comparison and persistence across reloads on the Galaxy Tab S9 FE+.

## Page templates — 2026-10-30

- Added Blank, Lined, and Dotted page background choices with a shared 32-unit spacing for lined and dotted patterns. The toolbar selection persists in local storage and renders only over the white sheet in the main canvas, workspace minimap, and page overview; it does not change canvas items or undo/redo.
- This repository has no diagram file save/load feature, so the selected template cannot currently be serialized with a diagram file.
- Verification: `npm test` passed (98 tests); `npm run build` passed.
- Next: check template readability and S Pen responsiveness on the Galaxy Tab S9 FE+; add template metadata to a document format if file save/load is introduced.

## Sheet background colors — 2026-10-30

- Added a separate page color setting with White, Warm, Blue, Yellow, and Green choices. It persists under its own local-storage key and changes only the sheet fill in the main canvas, workspace minimap, and page overview; the template pattern remains independent, and no canvas items or undo/redo snapshots are changed.
- Verification: `npm test` passed (101 tests); `npm run build` passed.
- Next: verify color/pattern combinations, reload persistence, and pen responsiveness on the Galaxy Tab S9 FE+.

## Page template visibility — 2026-10-30

- Increased lined-template contrast and changed dotted marks to opaque, darker dots with a larger radius. Added a separately cached overview pattern at readable minimap scale for the workspace and page overview; the sheet patterns and background color remain independent. Canvas items and undo/redo remain untouched.
- Verification: `npm test` passed (102 tests); `npm run build` passed.
- Next: verify line and dot visibility on the Galaxy Tab S9 FE+ at normal and zoomed views, including the minimap and different sheet colors.

## Floating UML connector toolbox — 2026-10-30

- Added a draggable floating left-side toolbox with seven connector choices. Directed association is represented as a solid open-arrow connector; realization is a dashed hollow-triangle connector. Both are first-class `ConnectorObject` relationship types and use the existing S Pen connector gesture, rectangle snapping, attachment updates, selection, and history path. Existing top toolbar remains in place, with its relationship editor supporting the added types.
- Verification: `npm test` passed (106 tests); `npm run build` passed.
- Next: verify toolbox dragging and all seven S Pen connector tools, snapping, and gesture coexistence on the Galaxy Tab S9 FE+.

## UML toolbox compact controls — 2026-10-30

- Reduced horizontal width and padding while retaining all connector icons and labels. Added a minimize control that collapses to a draggable floating restore button; dragging that button suppresses its restore click, while tapping restores the list. Connector engine, drawing, snapping, and history code were unchanged.
- Verification: `npm test` passed (108 tests); `npm run build` passed.
- Next: check expanded/minimized dragging and tap-to-restore on the Galaxy Tab S9 FE+ with S Pen and touch.

## Main toolbar redesign — 2026-10-30

- Reorganized the existing toolbar controls into a tighter order, reduced gaps and outer padding, and moved Undo/Redo to the leading edge. Added a Pen mode button for the existing freehand mode, made Connector active styling reflect the floating UML connector selection, and split Raw/Smooth into two explicit selected choices. Existing settings remain reachable through horizontal scrolling; Clear selection no longer occupies space without a selection. No canvas rendering, drawing, gesture, document, or history logic was changed.
- Verification: `npm test` passed (109 tests); `npm run build` passed.
- Next: inspect spacing and touch comfort on the Galaxy Tab S9 FE in landscape and split-screen, and verify active states during S Pen use.

## Reference toolbar layout refinement — 2026-10-30

- Refined the toolbar toward the provided reference by stacking tool icons and captions on wider screens, adding Undo/Redo captions, moving Eraser before Lasso, and placing Smooth/Raw before color and thickness. Narrow layouts remain horizontally scrollable and use icon-only controls. Kept only implemented controls; no drawing, document, or gesture behavior changed.
- Verification: `npm test` passed (110 tests); `npm run build` passed.
- Next: compare layout and touch comfort on the Galaxy Tab S9 FE in landscape and split-screen.

## Dynamic eraser size controls — 2026-10-30

- Added a continuous 8–96 canvas-unit size slider while retaining the 14, 28, 48, and 72 quick presets. Replaced the single whole-shape toggle presentation with selected Stroke Eraser and Whole Eraser cards; both continue to use the existing erasing behaviors and state.
- Verification: `npm test` passed (112 tests); `npm run build` passed.
- Next: check slider touch accuracy, eraser width response, and whole-object rubbing with the S Pen on the Galaxy Tab S9 FE+.

## Zoom-independent freehand sampling — 2026-10-30

- Changed the minimum distance for retaining freehand pointer samples from a fixed 0.5 canvas units to 0.5 screen pixels converted through the current viewport zoom. Raw still renders unfiltered stored points; Smooth's filter, stored Point format, existing strokes, pressure handling, and history snapshots are unchanged.
- Existing points do not record sample timestamps, and the Smooth filter assumes 120 Hz. Using actual intervals could improve time-dependent filtering when browser event rates vary, but adopting it would require a compatible timing representation and was left out of this sampling-only change.
- Verification: `npm test` passed (115 tests); `npm run build` passed.
- Next: on the Galaxy Tab S9 FE+, compare Raw and Smooth at 0.1×, 1×, and 3× zoom, checking slow curves, tiny lettering, apparent smoothness, and S Pen responsiveness.

## Development stroke performance diagnostics — 2026-10-31

- Added an optional Perf toolbar control and diagnostics panel gated by Vite development mode. Completed strokes are grouped by Raw/Smooth mode and short (≤120 retained points)/long (>120) length, with a rolling maximum of 40 per group. Metrics include pointer event interval/rate and coalesced batch size, RAF request coalescing and wait, whole render duration, live-stroke render duration, minimap/page overview duration, and handler-entry-to-render-completion estimate. Drawing, storage, smoothing, and scheduling behavior were not changed.
- Added unit coverage for metric aggregation, group bounds/reset, and development-only UI wiring. Verification: `npm test` passed (118 tests); `npm run build` passed.
- Next: collect actual Tab S9 FE+ values in a Vite dev session for short/long Raw and Smooth strokes, with page overview collapsed and expanded. Event-to-render excludes hardware digitizer, OS, compositor, and display scanout latency.
