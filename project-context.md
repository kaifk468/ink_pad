# InkPad Project Context

## Current Status — 2026-11-01

- **Canvas:** the white sheet is 2500 × 1500 units at (0, 0); the drawable workspace is 2750 × 1650, from (-125, -75) to (2625, 1575). Existing items remain in canvas coordinates.
- **Viewport:** default zoom 1×, limits 0.1×–3×. Two-finger touch is pinch zoom; three-finger touch pans; one-finger touch is ignored for drawing/navigation. S Pen input is converted to canvas coordinates.
- **Toolbar:** reference-inspired grouped layout shows Undo/Redo first, stacks tool icons above labels on wide screens, and orders Pen, Eraser, Lasso, Connector, Shapes, and Select before the existing Raw/Smooth, color, thickness, page-template, and page-color controls. Narrow screens hide captions and keep controls horizontally scrollable. Active tools and stroke display mode remain clearly selected.
- **Erasers:** standard erasing uses a continuous 8–96 canvas-unit size slider plus 14, 28, 48, and 72 quick presets; the popover presents Stroke Eraser and Whole Eraser as clearly selected mode cards. Partial erase strokes support S Pen hover plus contact. Whole Eraser removes complete hit items along an S Pen contact/rub path; removing a rectangle detaches its connector endpoints. Erasure is composited on transparent ink layers so the sheet/workspace background remains visible. Touch-based whole-object deletion was not verified on device.
- **Stroke display and input:** toolbar offers Smooth (default) and Raw display modes, persisted in local storage. Smooth retains midpoint quadratic segments and its One Euro display copy. Raw uses centripetal Catmull–Rom spans converted to cubic Bézier segments, interpolating every captured point; straight corner fallback is limited to turns of 135° or more. Freehand input consumes coalesced pointer events in order, includes the dispatched event if it is missing from that list, and retains every distinct canvas coordinate or pressure change (including subpixel movement). The saved `Point` remains `{x, y, pressure}`; native sample timestamps are not persisted, so Smooth still assumes 120 Hz.
- **Development diagnostics:** DEV builds expose an opt-in Perf capture panel with Start/Stop and Export JSON. A compact latency focus compares P95 pointer-event-to-handler, RAF wait, main canvas, minimap, page overview, and latest-sample-to-render timings, with maximums and observation counts; it labels the largest measured stage as indicative. The detailed table and export also include P50/P95/max/counts for native sample intervals, rendering stages, scene complexity, and browser stalls. Up to 40 strokes per Raw/Smooth and short (≤120 retained points)/long (>120) bucket and 512 percentile samples per metric per stroke are retained. A separate DEV-only synthetic render benchmark supports Controlled and Native modes using identical seeded 25/250/1,000 item scenes, Blank/Lined/Dotted templates, 8 warm-up and 40 measured frames per scenario; benchmark JSON records environment and effective settings plus separate background timing. Controlled overrides are temporary and restored after the run. JSON exports include timestamps and device/browser metadata, never handwriting coordinates, pressure samples or canvas content. Capture is DEV-only and off unless explicitly started. Browser timings stop before compositor/display scanout.
- **Page templates:** toolbar offers Blank (default), Lined, and Dotted templates at 32 canvas-unit spacing. On the main canvas the sheet color, template marks and sheet shadow are a CSS layer (`.sheet-layer`, positioned by a `translate3d`/`scale` transform from the viewport) behind a transparent canvas, so the canvas no longer repaints a patterned sheet each frame. Workspace minimap and page overview still draw their own cached compact, visible-scale canvas patterns. The choice persists in local storage; this app currently has no diagram file save/load format to store it in.
- **Page background:** a separate toolbar setting offers White (default), Warm, Blue, Yellow, and Green sheet colors. It is persisted independently from the template, and applied only beneath ink on the white sheet and in both page overview renderings.
- **UML toolbox:** a narrower, draggable floating panel on the left provides Association, Directed association, Inheritance, Realization, Aggregation, Composition, and Dependency connector tools. It can collapse to a small draggable restore button. These create first-class connector objects and reuse rectangle boundary snapping and attachment updates. The existing top toolbar remains in place; its relationship editor recognizes the added connector types.
- **Minimap:** compact workspace overview is shown by default with the current viewport indicator and navigation. Expand reveals a separate fixed-scale white-page overview. Both render erased ink over their own backgrounds.
- **Decisions:** keep persisted item coordinates stable; do not migrate/rebase diagrams. Keep viewport gestures separate from S Pen drawing and preserve snapshot-based undo/redo.
- **Code layout:** `src/App.tsx` (about 2214 lines) still holds the canvas state, pointer handling and the tool handlers. Extracted into `src/app/`: `appConfig.ts`, `canvasRenderer.ts` (item drawing), `performanceFormat.ts`, `UmlConnectorIcon.tsx`, `useDocuments.ts` (autosave, library, import/export), and the layout components `ToolDock.tsx`, `InsertTray.tsx`, `ContextPanel.tsx`, `TopLeftBar.tsx` (menu, folders, title), `HistoryBar.tsx`, `AccountButton.tsx`, `ZoomControls.tsx`. Wiring tests read App.tsx plus `src/app/*` through `tests/helpers/appSource.mjs`.
- **Text labels (new):** a `text` item (id, x, y, measured width/height, text, fontSize, color) with its own id counter. Text tool in the toolbar (S Pen tap places a label; tapping a label edits it; size buttons 18/24/32/48 appear in Text mode), Select tool selects/moves labels (tap an already-selected label to edit), lasso select/move/resize and the object eraser handle them (covered by unit tests of the model and hit-testing; not yet exercised in a browser or on the tablet), and they persist in `.inkpad` files and export to SVG/PNG. Geometry is shared by canvas, SVG and hit-testing through `src/textLayout.ts`.
- **Zoom and pen width:** the app opens at 110% (`INITIAL_ZOOM`, centered on the sheet; session only, nothing saved). Reset and the zoom buttons use 100% as the default, so Reset goes to 100%. A saved diagram now also opens at 110% (Fit drawing in the minimap still fits to the drawing). The pen starts at the thinnest preset (2 px). A Width slider (1 to 24 px, 44 px touch height) sits next to the four presets; width is not saved between sessions.
- **Batch 2 (new, 2026-11-01):** (1) The eraser popover closes when you tap anywhere outside it. (2) Double-tap rule: a single tap on Pen/Eraser selects the tool with its last settings; a double tap (within 400 ms) opens that tool's options (`optionsFor` state in App.tsx: pen colors/widths/slider/Smooth-Raw, eraser size/mode, text sizes via double-tap on Insert while Text is active). Tapping outside, Escape or choosing another tool closes them. Clear selection and the connector relationship controls still appear automatically with a selection. (3) No gray around the sheet: the view is clamped to the sheet (`clampViewportToSheet`, `getCoverScale` in viewport.ts); zoom-out stops where the sheet exactly covers the screen (about 48% on a 1204x700 window, roughly 50-60% expected on the tablet). Stored coordinates are unchanged; items drawn earlier in the old margin outside the sheet are still saved and exported but can no longer be reached on screen. The minimap shows the sheet. (4) Opening a saved diagram (or a fresh start) uses `getInitialViewport` (110%, centered). (5) The menu is a one-column icon list with dividers: File…, Page (Blank/Lined/Dotted buttons), Color (swatches), Clear canvas, Perf (dev only). Also fixed: the Folders sidebar now refreshes its saved-diagram list when opened (it was empty until the File panel had been opened).
- **Folders and rename fix (new, 2026-11-01):** The Folders sidebar (`src/app/FoldersSidebar.tsx`) is now a real folder browser: a path bar (All diagrams / LLD / Payments), subfolders and diagrams of the current level, + New folder (inside the folder you are viewing, any depth), Rename, Delete, Move (picker with the whole folder tree, or back to All diagrams), and + New diagram here (the new diagram is saved into that folder on its first save). Deleting a folder shows a warning with the number of diagrams inside; confirming deletes the folder, its subfolders and all diagrams in them (Cancel keeps everything). Storage: IndexedDB `inkpad` is now version 2 with extra `folders` and `placements` stores; the `documents` store and the `.inkpad` file format are unchanged, so existing diagrams stay at the top level (verified by upgrading a real v1 database). Folder logic is in `src/folderTree.ts`. Moving folders themselves between folders is not built yet. Rename: the File panel title now has a Save button (and Enter), and the name is also saved when you close the panel by Close, tapping outside, or Escape (before, tapping outside lost the change).
- **Device folder storage (new, 2026-11-01):** Diagrams can now live in a real folder on the device instead of the browser. File panel, Storage section: "Save to a device folder…" picks a folder (File System Access API, `showDirectoryPicker`); InkPad folders are real directories and each diagram is a `<title>.inkpad` file inside, so the hierarchy on disk is identical to the hierarchy in the app (a diagram id is its relative path, e.g. `LLD/Payments/Order flow.inkpad`). Renaming a title renames the file; Move moves the file; folder Rename copies the directory then removes the old one; folder Delete removes the directory tree (warning shown first). "Copy browser diagrams here" copies the whole browser hierarchy into the device folder and keeps the browser copies. "Use browser storage" switches back (the device files are left alone). The chosen folder handle is remembered in IndexedDB database `inkpad-device`; after a restart Chrome may need a tap, so the File panel opens by itself with "Reconnect folder", autosave stays off until then (status "Device folder locked — not saving"), and a sheet drawn meanwhile is saved as a new diagram after reconnecting. Code: `src/deviceStore.ts` (device backend, helpers, handle memory), `src/storageBackend.ts` (backend interface, browser backend, copy-all), `src/app/useDocuments.ts` (switching, locking, serialized saves). The browser backend and the `.inkpad` format are unchanged. Tablet findings: the dev address `http://192.168.0.7:5173` is not a secure context, so every storage feature is off until Chrome's flag "Insecure origins treated as secure" lists that address (or the app is served over https); with the flag, the tablet probe (`public/fs-probe.html`) showed folder picking, private app storage (OPFS) and persistent storage all working. The device backend is only supported when `isSecureContext` and `showDirectoryPicker` exist. Not verified: remembering the folder across a browser restart on the tablet (headless Chromium here cannot restore stored folder handles, so that path was tested with a stand-in). Not built: moving a folder into another folder; Google Drive/GitHub sync (planned later, after local storage).
- **Google Drive storage (new, 2026-11-01, built and tested with a fake Drive; not yet tried against real Google):** File panel, Storage section: "Save to Google Drive…" signs in with Google Identity Services (token flow, client id in `src/googleDrive.ts`, scope `drive.appdata`) and keeps folders and diagrams in the hidden app-data area of the person's own Drive, same hierarchy as the browser and device storage. Folders are Drive folders, diagrams are `<title>.inkpad` files, ids are Drive file ids (they do not change on rename or move). If another device changed a diagram since this device loaded or saved it, that version is kept as `<name> (other device <time>).inkpad` before the save overwrites it. Access tokens live only in memory and last about an hour: the app renews on a tap (pointerup) within 10 minutes of expiry, and when sign-in lapses it stops autosaving, shows status "Storage locked — not saving" and a "Sign in again" button, and keeps the sheet and saves it after sign-in. After a restart it tries a quiet sign-in for 6 seconds, then opens the File panel with Sign in again. "Disconnect Google Drive" revokes the token and returns to browser storage (Drive files stay). Code: `src/googleDrive.ts` (backend, DriveAuthError), `src/googleAuth.ts` (sign-in), `src/app/useDocuments.ts`, `src/FilePanel.tsx`; tests `tests/googleDrive.test.mjs` with `tests/helpers/fakeDrive.mjs`. Deployed app: https://ink-pad.kaifk468.workers.dev (Cloudflare Workers). Needs checking on a real device: that origin must be listed under Authorized JavaScript origins for the client id, and the Drive API must be enabled; sign-in popup on the tablet, silent renewal, and cross-device conflict copy. Not built: privacy policy page (needed before other people use it), moving a folder into another folder.
- **Start state:** the UML connector toolbox and the workspace map both start minimized. The map's Page overview section (second canvas, its expand button and drag handling) was removed; only the workspace map remains.
- **Bottom-dock layout (new, not yet tried on the tablet):** canvas-first screen with floating panels (layout B from the mockup). Bottom center dock: Pen, Eraser | Select, Lasso | Connector, Insert (tray opens upward: Text label, Shapes and arrows, Class box, and disabled "soon" entries for Database, Queue, Service). Top left: Menu (File… panel entry, Page template, Sheet color, Clear canvas, dev Perf), Folders (placeholder sidebar marked soon; lists diagrams saved in this browser and opens them), diagram title (opens the File panel). Top center: Undo/Redo. Top right: avatar placeholder ("Sign in, coming soon"). Bottom left: Zoom out / percentage / Zoom in (new `zoomBy`, 1.25x steps around the view center). Bottom right: workspace map with Fit/Reset and the save status; it starts minimized (a small button) and can be minimized again with its − button. A contextual panel (top right, below the avatar) shows color, stroke width and Smooth/Raw only while a drawing tool is active (hidden for Eraser, Select, Lasso; the eraser keeps its own popover, which now opens above the dock), text sizes in Text mode, and Clear selection / connector relationship controls when relevant. Select and Lasso stay two separate buttons. Search is out of scope. Below 980 px wide the zoom control, minimap and perf panel sit above the dock; below 720 px dock labels are hidden.
- **UML class boxes (new, not yet tried on the tablet):** a class box is a rectangle with an optional `classBox` {name, attributes, methods}, so moving, resizing, lasso, object eraser and UML connector snapping work exactly as for plain rectangles. Class tool in the toolbar: S Pen tap on the sheet opens a dialog (name / attributes / methods, one entry per line, `«interface»` can go on a first name line); tapping an existing box or rectangle in Class mode edits it; in Select mode, tapping an already-selected class box edits it. Boxes size to their content, grow when edited (attached connectors follow) and never shrink on their own; text is clipped to the box. Persisted in `.inkpad` (additive, no version bump; malformed content is dropped on load) and exported to SVG/PNG. Geometry is shared by canvas, SVG and hit-testing through `src/classBoxLayout.ts`; the dialog is `src/ClassBoxDialog.tsx`.
- **Documents (new):** the app now has a versioned document model (`src/documentFormat.ts`, format `inkpad-document` v1: title, timestamps, page template, sheet color, items), a browser library in IndexedDB with autosave (`src/documentStore.ts`), a File panel (`src/FilePanel.tsx`: title, New, Open, Delete, Import/Export `.inkpad`) and SVG/PNG/PNG@2x export cropped to the drawing (`src/sheetExport.ts`). The last diagram reopens on launch. Undo history, viewport and selection are not saved.
- **Known issues:** after the CSS sheet layer change the Galaxy Tab S9 FE+ captures show Lined at Blank-level frame gap with 0 long animation frames and Dotted at Blank-level frame gap with 2 long frames (~53–58 ms) in 1,017 frames (single captures; pen feel and Dotted residual long frames not yet judged beyond that); the sheet shadow now scales with zoom instead of staying a fixed device-pixel blur; Smooth filtering assumes a fixed 120 Hz interval because Point has no timestamp; actual capture results from the Galaxy Tab S9 FE+ have not yet been collected. Browser capture cannot measure digitizer-to-photon latency; long-task APIs may be unavailable depending on the tablet browser. Latest checks (2026-10-31, text labels): `npm test` passed (175 tests); `npm run build` passed (56 modules, real React types) from a clean `npm ci` in a temporary Linux copy; headless Chromium: 17 text-workflow checks, the 22 document checks and the draw/erase/undo check on all three templates passed. Tablet status: see the 2026-10-31 tablet test entry below. Still not verified on the tablet: Samsung handwriting-to-text specifically, object eraser and lasso on labels, and the effect of label placement on pen feel beyond what the user reported. Earlier check (App.tsx split stage 1): `npm test` passed (162 tests); `npm run build` passed (54 modules) from a clean `npm ci` in a temporary Linux copy; headless Chromium screenshots of ink, erase, undo and both views on Blank/Lined/Dotted were pixel-identical before and after the split (15 comparisons), and the 22 document checks still passed. Earlier check (document save/load and export change): `npm test` passed (162 tests) and `npm run build` passed (tsc -b and Vite 5.4.21, 49 modules) from a clean `npm ci` in a temporary Linux copy; a headless Chromium end-to-end run (22 checks: autosave, reload restore, SVG/PNG/PNG@2x/.inkpad export, New, Import, invalid file, rename, delete) passed on a production bundle. Not verified on the tablet: touch/pen use of the File panel and download behavior in the tablet browser. These do not verify tablet measurements or rendering responsiveness.
- **Unverified:** Galaxy Tab S9 FE+ behavior for hover erasing, whole-object rubbing/capture, three-finger panning, minimap input, and dragging/minimizing/restoring the UML toolbox remains to be checked.
- **Next on-device test:** run the Native benchmark on the tablet and compare per-template frame gap with the pre-change export; repeat the Dotted capture to see whether the 2 long frames recur. Then start Perf capture on the Galaxy Tab S9 FE+ and use the focused P95 cards to compare pointer delivery, RAF wait, main canvas, minimap, and page overview stages for repeated Raw/Smooth short/long strokes. Export JSON across small/large diagrams and page-inset states. If pointer delivery dominates, investigate tablet/browser input scheduling; if RAF wait dominates, inspect main-thread frame scheduling; if canvas or navigator time dominates, investigate rendering cost. These indicate browser-side stages only; use a browser trace or high-speed video for unresolved digitizer-to-photon lag. Phase 3 remains pending approval.

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

## Pointer input accuracy — 2026-10-31

- Kept checkpoint `e04cd2a` (`Checkpoint InkPad before stroke input improvements`) as the rollback point. Freehand now processes native coalesced pointer events in order, adds the dispatched event if it is absent from the coalesced list, and no longer drops distinct movements below 0.5 screen pixels. Distinct pressure-only samples at an unchanged coordinate are retained. The stored `Point` format remains `{x, y, pressure}`; event timestamps remain transient browser input metadata and are not saved.
- Verification: `npm test` passed (121 tests); `npm run build` passed. Tablet behavior and visual/performance impact have not been verified on the Galaxy Tab S9 FE+.
- Next: test Raw-mode small writing and fast/slow strokes at multiple zoom levels on device. After approval, proceed to the separate natural-rendering phase.

## Raw natural stroke rendering — 2026-10-31

- Changed only freehand Raw display: it now renders centripetal Catmull–Rom spans as cubic Bézier curves that pass through each captured point. Turns above the 50.4° corner threshold use straight spans on both sides of the corner. Per-span pressure width remains active. Smooth rendering, saved `Point` data, sampling, shape recognition, erasing, selection, connectors, history, and gestures were not changed.
- Verification: `npm test` passed (126 tests); `npm run build` passed. The Galaxy Tab S9 FE+ has not been tested after this rendering change, so handwriting fidelity and latency remain unverified.
- Next: compare Raw and Smooth on English text, small letters, curves, straight lines, sharp UML corners, and connectors at several zoom levels on the Tab S9 FE+. Then review rendering costs before starting Phase 3, after approval.

## Advanced drawing latency diagnostics — 2026-10-31

- Made the existing DEV-only Perf capture opt-in with explicit Start/Stop controls. It now measures coalesced sample-to-handler timing and per-sample intervals, RAF request wait and scheduled-callback gaps, total/main/history/active/composite/minimap/page render durations, latest/oldest pending sample age at render completion, and scene complexity at pen-down. Dashboard metrics include P95, maximum, and observation counts. Timing sample buffers are bounded (512 per metric per retained stroke); maxima and total counts stay exact for retained strokes. Long Task and Long Animation Frame observers are feature-detected, capture-only, and bounded.
- Did not change pointer sampling, drawing, or scheduling behavior. Browser render completion is pre-compositor and cannot measure digitizer-to-photon latency.
- Verification: `npm test` passed (128 tests); `npm run build` passed. No post-change Galaxy Tab capture has been collected yet.
- Next: collect repeated Raw/Smooth short/long samples on the Tab S9 FE+ across diagram complexity and page-inset states. Wait for approval before proceeding to Phase 3.

## Diagnostics JSON export — 2026-10-31

- Added an Export JSON button beside the diagnostics capture controls. Versioned JSON includes capture start/stop/export timestamps, device/browser metadata, exact completed stroke counts, retained group summaries, scene/mode/zoom data, P50/P95/max and observation counts for each timing metric, and Long Task/Long Animation Frame summaries. The export contains no stroke coordinates, pressure samples, or canvas content. Existing sample and history limits are unchanged.
- Verification: `npm test` passed (130 tests); `npm run build` passed. The tablet download flow and captured Galaxy Tab metrics have not yet been checked on device.
- Next: collect controlled Tab S9 FE+ captures, export the JSON files, and compare them before Phase 3; phase advancement still requires approval.

## Pointer and RAF latency focus — 2026-10-31

- Added a compact per-mode/length dashboard focus showing P95, maximum, and observation counts for pointer event→handler, render request→RAF, main canvas, minimap, page overview, and latest sample→render completion. It identifies the largest measured component as an indicative clue, not a causal or digitizer-to-screen result. Existing instrumentation, capture limits, and JSON export remain available; drawing/input/scheduling behavior was not changed.
- Verification: `npm test` passed (131 tests); `npm run build` passed. No new Galaxy Tab capture has been collected.
- Next: use the focused P95 cards on the Galaxy Tab S9 FE+, export JSON, and interpret the largest measured stage. Keep Phase 3 on hold pending approval.

## Raw curve corner classification — 2026-10-31

- Sharp corner fallback now requires a large direction change to persist across a neighboring sample, preventing isolated high-angle samples on curved handwriting from forcing adjoining Catmull–Rom spans into straight lines. The interpolation method and sampling workload are unchanged.
- Added regression coverage for circular and O/P/Q/R/S-like paths, an isolated sharp sample turn, and persistent angular turns.
- Verification: `npm test` passed (134 tests); `npm run build` passed. Visual handwriting quality still needs confirmation on the Galaxy Tab S9 FE+.
- Next: compare Raw mode on circular letters and intentional corners at high zoom on the tablet.

## Raw curve artifact correction — 2026-10-31

- Restricted straight-span fallback to direction changes of 135° or more. This keeps ordinary bends on the existing Catmull–Rom-to-Bézier path without adding smoothing or curve sampling. Circle and cursive O/P/Q/R/S regression cases remain in the curve test suite.
- Verification: `npm test` passed (134 tests); `npm run build` passed; `git diff --check` passed. No tablet measurement was performed.
- Next: inspect the same circle and cursive letters at high zoom on the Galaxy Tab S9 FE+ and confirm intentional sharp corners still look acceptable.

## Synthetic render benchmark — 2026-10-31

- Added a DEV-only benchmark runner with seeded 25, 250, and 1,000 object scenes, 8 warm-up frames and 40 measured RAF renders each. It temporarily swaps scene refs, measures actual production `renderAll` stages, then restores the live document state. Synthetic results export separately with median, P95, maximum, and counts, including long-animation-frame observations when supported.
- Added execution and comparison instructions in `PERFORMANCE_BENCHMARK.md`.
- Verification: pending `npm test`, lint availability, and `npm run build` for this implementation.
- Next: execute on a desktop browser and Galaxy Tab S9 FE+; compare repeated JSON exports and verify S Pen input after the benchmark restores the scene.

## Template rendering benchmark comparison — 2026-10-31

- Extended each synthetic scene size to compare Blank, Lined, and Dotted page templates with White sheet color. A scene is generated once per size and reused for all template variants; viewport, zoom, DPR, warm-up count, and measured frame count remain fixed. Added a benchmark-only background duration callback around the existing main canvas sheet-fill/template paint block; normal render calls and production drawing behavior are unchanged.
- Updated benchmark instructions and tests for the nine-scenario matrix and separate background timing.
- Verification: pending test and build checks. Browser/device benchmark captures have not yet been collected.
- Next: run all nine scenarios on desktop and Tab S9 FE+, export JSON, and compare background P95 against historical ink and other stage costs.

## Controlled and Native benchmark modes — 2026-10-31

- Added separate DEV benchmark actions for Controlled (1200×800 backing store, DPR 1, zoom 1, zero offsets) and Native (actual browser viewport, canvas backing store, DPR, zoom, and offsets). Both reuse the same scene generator, object composition/seed, templates, and frame counts. Controlled canvas dimensions are restored after the run; the browser viewport and production viewport ref are not changed.
- Versioned benchmark JSON now identifies the mode and records actual/configured viewport, actual/effective DPR and backing dimensions, zoom/offsets, browser/platform/device metadata, scene composition, and existing render distributions.
- Added mode/config and override restoration tests; updated usage documentation. Verification: pending `npm test`, `npm run build`, and `git diff --check`.
- Next: run and export both modes on laptop Chrome and Tab S9 FE+ Chrome; compare like-for-like Controlled results separately from Native results.

## Lined/Dotted frame-gap fix: CSS sheet layer — 2026-10-31

- Tablet captures (Galaxy Tab S9 FE+, Raw, zoom 1) showed render time unchanged across templates (~2.5 ms) but frame gap 11.1 ms (Blank) vs 22.1 ms (Lined, Dotted), about a third fewer pen samples/s, and 35 (Lined) / 48 (Dotted) Long Animation Frames of ~55 ms versus none on Blank; no Long Tasks. The synthetic Native benchmark showed the same doubling for Lined/Dotted at 25, 250 and 1,000 objects. Cause is after the JS render path; it is not confirmed beyond that. Code note: the old path filled the sheet and then the template pattern inside a canvas context that still had the sheet shadow (`shadowBlur` 14) enabled.
- Main canvas is now transparent where there is no ink. `renderAll` no longer fills the sheet, draws the template or sets a shadow; it calls `applySheetLayer` with `getSheetLayerState(template, sheet color, viewport)` to position a `.sheet-layer` div (2500×1500, behind the canvas, `pointer-events: none`) and set its color/template. Lined/Dotted are CSS gradients on the shared 32-unit spacing (same colors/offsets as before); style properties are written only when they change. `.drawing-canvas` is now `position: absolute; inset: 0` so it stacks above the layer. Removed the unused canvas page-pattern code (`drawPageTemplate` and its tile variant); minimap and page overview patterns are unchanged. Stored coordinates, erasing, selection, connectors, history and gestures were not changed.
- The synthetic benchmark's `backgroundRenderMs` now times only the sheet-layer style update; paint/compositor cost shows in frame gap and Long Animation Frames. Benchmarks before this change are not comparable on that metric.
- Verification: `npm test` passed (144 tests) and `npm run build` passed (`tsc -b` then Vite 5.4.21; 45 modules transformed) from a clean `npm ci` of the lockfile in a temporary Linux copy of the project, TypeScript 5.6.3; new tests cover template CSS, layer transform, minimal style writes, layer/canvas stacking, and that the old canvas fill/pattern path is gone. The project's own `dist` folder was not regenerated by that build. Separately, in a cloud workspace, headless Chromium checks showed Lined grid-line rows pixel-identical to the old rendering at 1×, Dotted/Fit-view differences only at mark edges (0.3–1.9% of pixels), and pen ink, eraser and undo behaving the same as before. Headless software rendering says nothing about tablet speed.
- Tablet re-captures after the change (Galaxy Tab S9 FE+, Raw, short strokes, zoom 1, viewport 932×612, DPR 2.125; Perf JSON exports do not record template, so templates are as labelled by the tester). Median / 95th percentile frame gap: Blank 11.1 / 22.1 ms, 0 long frames (unchanged from before); Lined 11.1 / 22.1 ms (was 22.1 / 44.3), pen ~89 samples/s (was ~61), 0 long animation frames (was 35); Dotted 11.2 / 22.1 ms (was 22.1 / 44.4), pen ~87 samples/s (was ~66), 2 long animation frames of 53–58 ms in 1,017 frames (was 48). Render time in our code stayed ~2–2.5 ms median throughout. Each is one capture of 40 retained strokes; scenes held 30–48 strokes. Not measured: digitizer-to-photon latency, Native benchmark after the change.
- Next: optionally run `npm run build` in the project folder to refresh `dist`. Optionally add the active template and sheet color to the Perf export metadata so captures are self-describing. If Dotted long frames recur, take a Chrome trace of raster/compositor time on the sheet layer.

## Document format, autosave and export — 2026-10-31
- Added `src/documentFormat.ts` (versioned `.inkpad` JSON; `parseDocument` validates every item, clamps pressure, drops malformed or duplicate-id items and reports the count, removes connector attachments to missing rectangles, falls back to blank/white for unknown page settings, refuses files from a newer format version, has a migration table for future versions; `getNextIds` restores the three independent id counters on load).
- Added `src/documentStore.ts` (IndexedDB `inkpad`/`documents`, current-diagram id in localStorage `inkpad.currentDocument`), `src/FilePanel.tsx` (File button at the end of the toolbar opens a dialog), and `src/sheetExport.ts` (SVG builder: erasers become per-run masks over earlier items so the result matches canvas erasing; crop to content bounds with padding; PNG by rasterizing that SVG).
- `App.tsx`: autosave is debounced 1.2 s after any history-recording change, undo/redo, clear, page template or color change; it waits until no pen is down; an untouched empty sheet never creates a stored diagram; autosave stays off until the last diagram has been read so an empty sheet cannot overwrite it; flushes on page hide. Opening or importing resets undo history and restores id counters. Imports always get a new id so they never overwrite an existing diagram.
- Tests: `tests/documentFormat.test.mjs` (10), `tests/sheetExport.test.mjs` (8); total 162.
- Still to do on the roadmap: split `App.tsx` into modules (document handlers in App.tsx are a first candidate), text labels, UML class boxes, HLD shapes with connector snapping, PDF export, and the HLD/LLD documents.

## App.tsx split, stage 1 — 2026-10-31
- No behavior change. Moved constants, all canvas drawing (`drawStroke`, `drawRectangle`, `drawConnector`, `drawItem`, `drawMinimapItems`), diagnostics formatting, the UML connector icon and the whole document layer out of `App.tsx` into `src/app/`. App keeps thin `useCallback` wrappers so existing dependency arrays and render order are unchanged.
- `useDocuments(host)` owns which diagram is open, autosave, library, import/export; the canvas side is reached only through `DocumentHost` (`getItems`, `getPage`, `isInputActive`, `loadDocument`).
- Tests that assert on source wiring now read App.tsx plus `src/app/*` via `tests/helpers/appSource.mjs`, so code can move between those files without rewriting assertions.
- Remaining large blocks in App.tsx for later stages: pointer handlers (`onPointerDown/Move/Up`), `renderAll`/`resizeCanvas`, the synthetic benchmark runner, and the toolbar/performance-panel JSX.
- Lesson: a filtered type check in the cloud workspace missed a syntax error (stray `type type` in an import); the clean-copy `npm run build` caught it. Always run the full build after mechanical edits.

## Text labels — 2026-10-31
- New item kind `text` (additive; `.inkpad` format stays v1 because older files still open unchanged and a reader that predates labels would report them as skipped items). Model in `canvasModel.ts` (bounds, move, resize scales font with the selection, clone, key `text:<id>`), shared layout in `src/textLayout.ts` (font, line height, per-line baselines, measurement with an estimate fallback), drawing in `app/canvasRenderer.ts`, SVG export as one `<text>` per line using the same baselines, `lassoSelection.ts` hit-test and lasso by center, `documentFormat.ts` validation (font size 4-400, text up to 2000 characters, drops damaged items).
- Editing uses a plain `<textarea>` overlay (`src/TextEditorOverlay.tsx`) so the system keyboard and handwriting input apply. The editor opens on pen-up so the keyboard is allowed to appear. It commits on blur, on another tap, on Ctrl/Cmd+Enter, and on any pan or zoom; Escape cancels; blank text creates nothing and deletes an existing label. The label being edited is not drawn on the canvas underneath.
- Size is fixed at creation from the toolbar (changing the size of an existing label is done by resizing a lasso selection). Labels are not attachable by connectors yet; connector snapping to boxes comes with the HLD shapes.
- Tests: `tests/textLabels.test.mjs` (13) plus `tests/helpers/loadModule.mjs`, which loads src modules that import each other so tests need no copy-pasted transpile code.
- A stray `src/App-1.tsx` (copy of an earlier upload) appeared on the laptop after syncing and broke the build; it was moved to `_to_delete/App-1.tsx.stray`. You can delete that folder.

## Tablet test by the user (Galaxy Tab S9 FE+) — 2026-10-31
- Reported by the user after testing on the tablet: the Text tool works (an S Pen tap places a label and the on-screen keyboard opens), and the File panel, autosave, New diagram and the exports (SVG, PNG, PNG @2x, `.inkpad`) work. This is the user's report; no captures or measurements were taken.
- The App.tsx split, stage 1 (see the entry above) is in place and unchanged in behavior: constants, canvas drawing, diagnostics formatting, the UML connector icon and the document layer live in `src/app/`; the pointer handlers, `renderAll`/`resizeCanvas`, the benchmark runner and the toolbar markup remain in `App.tsx` until a feature needs them.
- Next on the roadmap: UML class boxes (one object with name, attributes and methods that moves, resizes and saves as a unit and snaps connectors), then HLD shapes (database, queue, service), then the HLD/LLD documents.

## UML class boxes — 2026-10-31

- Added `classBox` content to rectangles (`canvasModel.ts`), pure layout in `src/classBoxLayout.ts` (compartments, grow-to-fit, `createClassBox`), canvas drawing in `app/canvasRenderer.ts`, SVG export in `sheetExport.ts`, validation in `documentFormat.ts`, `ClassBoxDialog.tsx`, and the Class tool wiring in `App.tsx`. Dialog opens on pen-up (same reason as text: the keyboard may appear).
- Checks run: `npm test` 186/186 on the laptop copy; clean `npm ci && npm run build` (58 modules) in a temp copy; headless Chromium (software rendering, simulated pen): tool toggle, dialog opens focused, create, cancel creates nothing, edit prefilled and grows, undo restores size and content, SVG export contains the text, persists across reload, no page errors.
- Not verified on the tablet: dialog and keyboard behavior with S Pen, handwriting-to-text in the fields, connector snapping to a class box by pen, moving/resizing a class box by pen, and how the text looks at real zoom levels.
- Known limits: no per-box font size; a plain rectangle edited in Class mode becomes a class box (no way back except undo); long lines widen the box rather than wrap.
- Next on the roadmap: HLD shapes (database, queue, service) with connector snapping, then the HLD/LLD documents.

## Layout decision: bottom tool dock — 2026-10-31

- User reviewed the layout mockup (artboards A top toolbar, B bottom toolbar) and chose **B**: floating, canvas-first layout with the tool strip as a bottom dock (bottom center, easier thumb reach on the Galaxy Tab S9 FE+).
- Zones: tool strip bottom center (Pen, Eraser | Select, Lasso | Connectors, Insert tray with Text, Class box, later HLD shapes Database/Queue/Service); menu button top left (file actions and settings); folders button top left (placeholder, "soon"); document title top left; undo/redo top center; avatar/sign-in top right (placeholder); zoom bottom left; minimap bottom right; stroke/eraser panel appears only when relevant (in B it sits at the right, clear of the dock).
- Search was left out of the first mockup on purpose. Folders, search and sign-in are to be built later; the UI shell may come first with "soon" placeholders.
- Open: whether Select and Lasso merge into one button. Nothing in the app code has changed for this yet.
- Inspiration sites: tldraw.com, excalidraw.com, app.diagrams.net, figma.com/figjam, miro.com; Samsung Notes, Goodnotes, Notability for pen-first apps.

## Bottom-dock layout — 2026-10-31

- Rebuilt the screen layout to the approved layout B (details in Current Status). The old top toolbar (`.toolbar`) is gone. Tool handlers were moved out of inline JSX into named functions in `App.tsx` (`toggleShapeTool`, `toggleSelectTool`, `toggleTextTool`, `toggleClassTool`, `toggleLassoTool`, `toggleConnectorTool`, `toggleEraserTool`, `selectColor`) with the same bodies; drawing, erasing, selection, connectors, text, class boxes, save, load and export code was not touched. The one new behavior is the zoom in/out buttons.
- The Shapes toggle (straight lines/rectangles on hold, arrows) was not in the mockup; it lives in the Insert tray as "Shapes and arrows". Colors/widths no longer show in Select or Lasso mode (clicking a swatch there previously dropped the mode, and colors never recolored selected items).
- Small a11y fix: the color and thickness groups now have `role="group"`. FilePanel exports `STATUS_LABEL` for the minimap status line.
- Checks run: `npm test` 195/195 on the laptop copy (toolbarLayout tests rewritten for the new structure, 13 tests; pageBackground wiring test updated); clean `npm ci && npm run build` (65 modules) in a temp copy; headless Chromium with a simulated pen (software rendering, `smoke6`): every moved control works (pen/color/width/raw-smooth, undo/redo, eraser popover above the dock and Whole/Stroke modes, Select/Lasso/Connector toggles, Insert tray open/Escape/outside-tap, Text and Class box via the tray, Shapes toggle, soon entries do nothing, zoom in/out/Reset, menu page template and sheet color, File… and title open the File panel, folders placeholder, avatar note, Clear canvas), no overlaps between dock, zoom and minimap at 1204, 800 and 600 px wide, no page errors. Canvas pixels for a fixed pen scene are byte-identical before and after (same md5 for Blank, Lined, Dotted) and the sheet layer geometry/style is unchanged.
- Not verified on the tablet: S Pen taps on the dock, tray, context panel and menu; thumb reach of the bottom dock; eraser popover position on the tablet; whether the corner panels overlap anything in portrait; Lined/Dotted pen feel (should be unchanged); pinch zoom and three-finger pan with the panels on screen.
- Known limits: the UML connector toolbox is still the floating left panel (not folded into the dock); the minimap buttons keep their small size; Folders is a placeholder with no real folders or search.
- Next on the roadmap: HLD shapes (database, queue, service) enabling the tray entries, then the HLD/LLD documents.

## Claude Code model routing — 2026-11-01

- Added configuration only; no application code or tests changed. Files: `.claude/settings.json` (main model `claude-sonnet-5-5`, `effortLevel` medium), `.claude/agents/` (`codebase-explorer` and `documentation-agent` on `claude-haiku-5-5`, low effort; `engineering-agent` on `claude-sonnet-5-5`, medium; `debugging-agent` on `claude-sonnet-5-5`, high; `architecture-reviewer` on `claude-opus-5-5`, high, read-only), and `CLAUDE.md` (imports AGENTS.md, routing table, escalation rules, token discipline).
- Checked: JSON and agent frontmatter parse and agent names match file names. Not verified: that the installed Claude Code version accepts these model IDs and `effort` field, or that delegation happens; the `claude` CLI is not runnable in the session that wrote this. Check with `/agents`, `/model` and `/status` in Claude Code on the laptop. If an ID is rejected, use the aliases `haiku`, `sonnet`, `opus`.

## Minimized start state, Page overview removed — 2026-11-01

- UML connector toolbox now starts minimized (`umlToolboxMinimized` default true). The workspace map gained a minimize/restore state (`navigatorMinimized`, default true): minimized it shows a 48 px map button plus the save-status line; expanded it shows the Workspace map, Fit canvas / Fit drawing / Reset and the status. Its minimize button is 44 px.
- Removed the Page overview: `renderPageOverview`, its canvas and ink layer ref, drag handlers, expand state and CSS. `getPageOverviewGeometry`/`getNavigatorPanels` (viewport.ts) and the diagnostics metric `pageOverviewMs` remain in their modules (unused by the UI; the metric now stays empty). Scene complexity now always receives `false` for the page overview.
- Checks run: `npm test` 196/196 on the laptop copy (inkLayerRendering, pageTemplates, pageBackground, performanceDiagnostics wiring tests updated, one umlToolbox test added); clean `npm ci && npm run build` in a temp copy; headless Chromium (`smoke7`, `smoke6`): both panels start minimized, map restores with a single canvas, tapping the map moves the view, Fit/Reset work, minimize/restore for both panels, a connector can still be picked, no Page text or canvas anywhere, no overlap with the dock at 1204/800/600 px, no page errors; canvas pixels for the fixed pen scene still identical to before (same md5 for Blank, Lined, Dotted).
- Not verified on the tablet: S Pen taps on the minimized buttons and the 44 px minimize button; whether the minimized state should be remembered across reloads (currently resets to minimized on every load).

## Default zoom 110% and stroke width slider — 2026-11-01

- `INITIAL_ZOOM = 1.1` in `viewport.ts` seeds the viewport ref and zoom readout; `DEFAULT_ZOOM` stays 1 for Reset. Initial stroke width is `WIDTHS[0]` (2 px). Added `MIN_STROKE_WIDTH` 1 and `MAX_STROKE_WIDTH` 24 in `appConfig.ts` and a range input ("Stroke width", with a px readout) in `ContextPanel.tsx` beside the preset buttons. No change to drawing code; strokes simply carry the chosen width.
- Checks run: `npm test` 199/199 on the laptop copy (new `zoomAndWidth.test.mjs`, 3 tests); clean `npm ci && npm run build` in a temp copy; headless Chromium: opens at 110% with the sheet layer at scale 1.1, 2 px preset selected by default, slider and presets stay in sync, strokes saved with widths 2, 9, 7, 24, zoom in/out from 110%, width back to 2 px after reload, Reset goes to 100%, no page errors. The fixed-scene canvas hash changed, as expected (new zoom and width).
- Open question for the user: a reload with saved strokes fits the drawing (so the zoom shows e.g. 300%, not 110%). Decide whether opening a saved diagram should keep fitting or use the last/initial zoom.
- Not verified on the tablet: slider feel with the S Pen, whether 1 to 24 px is the right range, how 110% looks in portrait.

## Batch 2: double-tap options, sheet-fit view, menu cleanup — 2026-11-01
- Implemented items 1-5 of the Batch 2 change list (details in Current Status). Files: `src/App.tsx`, `src/viewport.ts`, `src/app/TopLeftBar.tsx`, `ToolDock.tsx`, `InsertTray.tsx`, `useDocuments.ts` (exports `refreshLibrary`), `src/styles.css`.
- Tests: `tests/batch2.test.mjs` added; pageBackground, toolbarLayout and zoomAndWidth wiring tests updated. 204/204 pass in the cloud and on the laptop; a clean `npm ci`, `npm test` and `npm run build` (tsc -b + vite) pass on the laptop. A headless browser smoke (1204x700) passed for the double-tap rule, outside-tap close, remembered pen width and eraser size, minimum zoom with no gray, reopening at 110%, and the new menu. Not yet checked on the tablet.
- Pages (several sheets per diagram and page sizes) is still a later batch.

## Folders, move and rename save — 2026-11-01
- Built the folder browser, folder delete with warning, move between folders and the title Save button (details in Current Status). Files: `src/documentStore.ts`, `src/folderTree.ts`, `src/FilePanel.tsx`, `src/app/FoldersSidebar.tsx`, `src/app/TopLeftBar.tsx`, `src/app/useDocuments.ts`, `src/App.tsx`, `src/styles.css`.
- Tests: `tests/folders.test.mjs` added, toolbarLayout updated. 211/211 pass in the cloud and on the laptop; clean `npm ci`, `npm test` and `npm run build` pass on the laptop. A headless smoke covered the v1 to v2 upgrade, create/nest/rename/move/delete folders, new diagram in a folder, and rename by Save button and by tapping outside. Not yet checked on the tablet.

## Device folder storage — 2026-11-01
- Built the device-folder backend (details in Current Status). Tests: `tests/deviceStore.test.mjs` (uses an in-memory directory, `tests/helpers/fakeDirectory.mjs`), `tests/folders.test.mjs` updated. 223/223 pass in the cloud and on the laptop; clean `npm ci`, `npm test` and `npm run build` (tsc -b + vite) pass on the laptop. A headless smoke covered choosing a folder, copying browser diagrams, creating nested folders and diagrams as real files, title rename, move, folder rename, folder delete, the locked/reconnect path, and switching back to browser storage.
- Folders panel now closes on an outside tap or Escape (2026-11-01); the Folders button still toggles it.

## Google Drive storage — 2026-11-01

- Added the Drive backend behind the same storage interface (`StorageBackend.kind` now `'browser' | 'device' | 'drive'`), Google sign-in module, File panel buttons and locked/reconnect handling shared with the device folder. The current-diagram id is remembered per storage (`inkpad.currentDocument.drive`), storage mode `drive` in `inkpad.storageMode`.
- Verified: 234 tests passing on the cloud copy and the laptop (10 new Drive tests using an in-memory fake of the Drive API, including hierarchy, move, rename, delete, paging, token refresh, conflict copy); laptop `tsc -b` clean and `vite build` passes (in a clean copy, because the laptop shell cannot use the Windows `node_modules`).
- Not verified: anything against real Google (sign-in popup, real API responses, token renewal on the tablet).

## Storage moved out of the File panel — 2026-11-01

- Storage is an app-wide choice, so it no longer lives in the per-diagram File panel. New `src/StoragePanel.tsx` (opened from the hamburger menu row "Storage…", which shows the current place, or "Sign in needed" when locked) holds: Connect Google Drive, Use a device folder, Copy browser diagrams here, Use browser storage / Disconnect Google Drive, Reconnect folder / Sign in again. The Folders panel shows a line "Saved in: <place>" with Change (Fix when locked) and, on browser storage, a hint to connect Drive. A locked storage at startup now opens the Storage panel. The File panel keeps title, new, import, export, and the diagram list.
- Planned, not built: link the top-right account avatar (placeholder) to the same Storage panel / sign-in state.
- Verified: 235 tests pass on the cloud copy and the laptop; laptop `tsc -b` clean; `vite build` passes in a clean copy. Tablet check still to do.

## Lag over dense writing — 2026-11-01

- Symptom (tablet, deployed app): after roughly 40-50 words the ink lagged behind the pen; blank areas and fresh diagrams were smooth, and it came back as the page filled.
- Cause: every frame of a pen stroke redrew every item on the page into the ink layer, and also redrew the whole minimap. Cost grew with the amount of ink.
- Fix (`src/App.tsx`, `renderAll`): while a plain pen stroke is in progress, everything already on the page is painted once into `historyLayerRef` and reused each frame (valid only for the same items array and count, viewport, pixel density and canvas size; dropped as soon as no pen stroke is active; never used for erasers, benchmark runs or text editing). The minimap is refreshed at most every 300 ms while writing (`MINIMAP_LIVE_REFRESH_MS`).
- Measured in headless Chromium (pen events, mean ms per pointer move, empty page / 500 / 1500 / 3000 strokes): before 33 / 34 / 65 / 98 (p95 134); after 33 / 34 / 34 / 35 (p95 39). The final canvas pixels, mid-stroke and after the stroke, are identical to the old build.
- Not measured: the tablet itself. Check by filling a page with writing and watching whether the ink keeps up with the pen. Tests `tests/denseInkCache.test.mjs`; 237 tests pass on the cloud copy and the laptop; laptop `tsc -b` clean, `vite build` passes in a clean copy.
- Still possible if lag remains: shrink the cost of the active stroke itself (it is redrawn whole each frame) and avoid redrawing the whole canvas for pan/zoom with lots of ink.

## Lag, round 2: repaint only the stroke area, cheap pinch and pan — 2026-11-01

- After the first fix the tablet still felt short of smooth in Raw mode (Smooth mode is not being optimized). Measured at 1280×800 with device pixel ratio 2.5 (closer to the tablet) in headless Chromium, 3000 strokes on the page, Raw mode.
- Writing (`src/App.tsx`, `renderAll` + `getDirtyRect`): while a plain pen stroke grows, only the canvas area around that stroke (its bounding box + line width + curve overshoot, in device pixels) is cleared, copied from the saved page picture and composited; the rest of the screen canvas is left as it was. Not used for shapes, held-shape previews, erasers, text editing or benchmark runs. Render time per frame (250-point stroke): 12.7 ms → 4.4 ms; a 900-point stroke averages 7.8 ms (p95 14.6 ms).
- Pinch and three-finger pan: `applyViewport(viewport, true)` now draws at most one frame per display frame by moving and scaling a saved picture of the page straight onto the canvas (one copy), the minimap refresh is throttled, and one sharp full redraw runs 140 ms after the last touch move (`GESTURE_SETTLE_MS`). Before, every touch event redrew every item synchronously (about 226 ms per step with 3000 strokes). Now about 8 ms per frame; the first frame of a gesture still does one full draw to make the picture.
- Known trade-offs: during a gesture the picture is a bitmap, so it is slightly soft and blank edges can show where the view reveals area that was off screen at the gesture start; both fix themselves on the sharp redraw. Mid-stroke pixels differ from before only by faint fringe pixels (alpha ≤ 7/255); after the stroke, after pinch and after pan the canvas is pixel-identical to the previous build.
- Not measured on the tablet. Not done: zoom buttons and minimap drags still redraw synchronously; the live stroke is still redrawn from its first point each frame (cost grows with stroke length); no low-latency canvas hint yet. 239 tests pass on the cloud copy and the laptop; laptop `tsc -b` clean; `vite build` passes in a clean copy.

## Lag, round 3: no full-page redraw at stroke start or end — 2026-11-01

- Tablet captures (Raw mode, Chrome on the Galaxy Tab, DPR 2.125, viewport 1204×612): dense page (about 267 strokes, 52k points) vs blank diagram. Dense: 101 long tasks (median 78 ms), 179 long animation frames, frame gap median 44 ms, sample-to-handler median 19–27 ms (p95 about 68 ms); `historyInkMs` was about 1 ms most frames but 65–80 ms once at the start of each stroke. Blank: 0 long tasks, frame gap median 22 ms, sample-to-handler median 13–15 ms, no frame over 17 ms of ink work.
- Reading: the 101 long tasks are 2 per stroke (51 strokes). Round 1 and 2 dropped the page picture whenever a stroke ended, so each stroke paid a full redraw of all 52k points when it started (to rebuild the picture) and again when it was committed. About 70 ms each on the tablet, which is exactly what the capture shows.
- Fix (`src/App.tsx`, `renderAll`): the saved page picture (`historyLayerRef` + `historyCacheRef`) now persists between strokes. It is valid while the items are the same objects in the same order (`sameItems`), same display mode, pixel density, canvas size and viewport. When exactly one pen stroke has been added since, only that stroke is drawn onto the picture. Anything else (undo, erase, move, import, text edit, mode or size change) rebuilds it on the next render. Never used for benchmark runs or while a text label is being edited.
- Measured in headless Chromium (3000 strokes, DPR 2.5, 8 short strokes): long tasks 16 (max 153 ms) before, 0 after. Canvas pixels are identical to the round-1 build after each stroke, after an undo, after a stroke following an undo, and after pinch and pan.
- Still unexplained / next: blank frame gap median is 22 ms (about 45 fps on a 90 Hz panel) while ink work is about 1 ms, so the remaining cost is probably canvas compositing at this resolution, not JavaScript. Ideas, in order: draw the live stroke on its own small canvas above the page so nothing full-screen is copied per frame; request a low-latency (desynchronized) canvas. Needs a new tablet capture after this build to confirm the stalls are gone.
- 239 tests pass (cloud and laptop); laptop `tsc -b` clean; `vite build` passes in a clean copy.


## Lag, round 4 — fast autosave (2026-11-01)
- Tablet capture after round 3: renderAll p95 1.5 ms, dense page ≈ blank page, but 16 long tasks (p50 55 ms) remained; profiling traced them to autosave (IndexedDB structured clone of 70k+ points + JSON work).
- `documentFormat.ts`: `stringifyDocument` caches each stroke's JSON in a WeakMap (strokes are immutable once committed), `shareStrokes` option avoids deep-cloning strokes when building the document.
- `documentStore.ts`: documents are stored as one JSON string (put of a string ≈ 8 ms vs ≈ 58 ms for the object); legacy object records still load (`documentFromRecord`), summaries come from record fields.
- Verified: old-format page opens in the new build, new-format page reopens after reload, 243 tests pass, `tsc -b` clean.
- Device-only check still needed: redeploy, capture Perf on a dense page; expect long tasks to fall from 16 toward 0.

## Live stroke on its own overlay canvas (2026-11-01)
- Why: after the history-cache rounds, the tablet felt slightly worse on blank pages than the original build (frame gap ~22 ms with ~1 ms of ink work), suspected to be full-screen layer copies per frame.
- `App.tsx`: a transparent `<canvas class="live-canvas">` (pointer-events none) sits above the page canvas. The first frame of a pen stroke paints the page once without the stroke and draws the stroke on the overlay; later frames only clear and redraw the stroke's dirty rect on the overlay and return before touching the page canvas (minimap still refreshed every 300 ms). The overlay is cleared in the same render that stops using it (pen-up, eraser, shape preview, pinch, item change), so hand-off is one paint. Eraser, shape strokes, held-shape previews, text editing, gestures and benchmark runs keep the old page-canvas path.
- Checks run: 244 tests pass, `tsc -b` clean, build OK on laptop. Pixel comparison against the previous build (Playwright, DSF 2, pen events): mid-stroke and after-pen-up screenshots identical (0 differing pixels). Timing in headless: with the software compositor the overlay build was slower (an extra full-size layer is costly there), with the GPU-style canvas path it was equal or better (blank 25.8 -> 18.8 ms/frame, dense 20.2 -> 19.7, fewer long tasks). Headless cannot confirm tablet GPU behaviour.
- Device-only check needed: redeploy and compare blank-page and dense-page writing feel plus a Perf capture. If it is not better, revert this commit alone (it is self-contained).

## On-device comparison switches and first original-vs-current capture (2026-11-01)
- `App.tsx`: `?overlay=off` disables the live-stroke overlay canvas and `?cache=off` disables the page-picture cache (full redraw every frame, like the original build), so one build can be compared against itself on the tablet. Default behaviour unchanged.
- Original build (commit 7e89f53, exported to git-ignored `_compare/original`, run on port 5174) vs current build, Perf captures on the tablet (DPR 2.125), both on a page of ~230 strokes:
  - Current: renderAll p50 0.3 ms, active stroke 0.2 ms, latest-sample-to-render p50 5 ms, frame gap p50 22 ms / p95 33 ms, 0 long tasks, 35 long animation frames (58-72 ms), pen delivered at ~360 Hz with ~6 samples per move.
  - Original: renderAll p50 5.7-11.9 ms, latest-sample-to-render p50 9-16 ms, frame gap p50 11-17 ms / p95 17-22 ms, 0 long tasks, 1 long animation frame, pen delivered at ~74-92 Hz with 1 sample per move.
  - Input handling code is identical between the builds, so the different pen rate comes from the device/session, not our code. Not yet explained why the current build's frame cadence is slower despite far less JS work (suspects: browser paint/composite cost of the extra layers, or the device lowering clocks/refresh when the page does little work).
- Next: capture the current build with default, `?overlay=off`, `?cache=off` on equal empty pages and compare frame gap and long animation frames.

## Three-way capture on the tablet: default vs ?overlay=off vs ?cache=off (2026-11-01)
- Equal-ish pages (25-80 strokes), Raw mode, DPR 2.125, pen at ~360 Hz in all three:
  - default: renderAll p50 0.3-0.4 ms, latest-sample-to-render p50 ~5 ms, frame gap p50 22 ms (p95 33), 0 long tasks, 8 long animation frames.
  - ?overlay=off: renderAll 0.6-0.9 ms, latest-sample-to-render ~5.5 ms, frame gap p50 16.7 (short) / 22 (long), 16 long animation frames.
  - ?cache=off (full redraw each frame, like the original): renderAll 7-10 ms, latest-sample-to-render 11-14 ms, frame gap p50 11 ms (~90 Hz), 2 long tasks, 21 long animation frames.
- Reading: the less work a frame does, the slower the browser/tablet delivers frames (cadence halves to ~45 Hz). Latency to screen is best in the default build but ink updates only every other display frame. Cause of the halved cadence is outside our JS (compositor/GPU/OS frame pacing) - not proven.
- Added `?desync=on` (opt-in): requests Chrome's low-latency canvas path for the live-stroke overlay. Rendering unchanged (pixel hash identical). Device-only check needed.

## Adaptive drawing path: original-style direct drawing on light views, cache on dense views (2026-11-01)
- Why: on the tablet, by feel the original-style path (`?cache=off`) was best on light pages, the cache+overlay path was worse there, but the cache is needed on dense pages. Original code has NO off-screen culling: it walks every stroke every frame (one canvas stroke() per segment).
- `src/app/visibleInk.ts` (new): cached per-stroke bounds (padded for width, curve overshoot, arrow heads), `viewRectOf`, `isItemVisible` (only pen strokes are skipped), `countVisiblePoints`, `chooseDrawMode` (hysteresis: leave 'direct' above the limit, return below 65% of it).
- `App.tsx` renderAll: draw path ('direct' | 'cached') is chosen from the points of ink visible in the current view (default limit 12000, `?direct=N` to tune; 0 = always cached, huge = always direct), re-evaluated only when no stroke is being written. 'direct' = page redrawn every frame like the original (no cache, no overlay); 'cached' = page picture + overlay as before. Full redraws now skip strokes outside the view in both modes. Current mode is exposed as `data-draw-mode` on the drawing canvas (unset = direct).
- Checks run: 252 tests pass, `tsc -b` clean, build OK (laptop). Pixel compare (Playwright, DSF 2): default vs `?direct=huge` identical; direct vs cached differ by 11 faint anti-alias pixels (max 41/255) out of ~3M; skipping off-screen strokes changed nothing. Headless timing (GPU-style canvas, unthrottled, 390 strokes x 190 pts = 74k points): ink off-screen: original build 80 ms/frame -> 11.5 ms/frame; ink in view: original did not finish in 170 s -> 3.2 ms/frame (cached). 
- Not verified on device: feel on the tablet (light page should match `?cache=off`), the 12000-point limit (chosen from ~1 ms per 1k visible points on the tablet and the 8-10k-point pages that felt best), and the one-time hitch when the path switches to cached.

## Dev-only test ink (2026-11-01)
- Menu (developer block, next to Perf; only when `import.meta.env.DEV`): "Test ink: light" (~6,000 points) and "Test ink: dense" (~30,000 points) fill the current view with handwriting-like strokes; "Remove test ink" deletes them. All three go through undoable history.
- `src/testInk.ts`: `createTestInk(view, page, targetPoints, firstId, seed)` (deterministic, kept inside the view and the sheet), reserved ink colour `#1f2023` (not in the palette) marks test strokes for `isTestInk`.
- Test ink is real document content, so it is autosaved with the diagram: use a new diagram, then "Remove test ink" (or Undo) before keeping it.
- Checks run: 256 tests pass, `tsc -b` clean, build OK (laptop). Developer build in headless Chrome: light fill stays in direct mode, dense fill switches to cached, writing over it works, remove returns to direct, no page errors.
