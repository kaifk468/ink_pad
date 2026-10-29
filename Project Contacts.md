# Project Contacts

## InkPad viewport update — 2026-10-30

- Added an A4-sized starting page and a navigable viewport with two-finger pan and pinch zoom; the page is now expanded below.
- Kept diagram objects in canvas coordinates; pen input is converted from viewport coordinates before it reaches drawing, selection, resizing, or connector logic.
- Zoom is anchored to the fingers' midpoint and limited to 0.1×–3×. One-finger touch remains ignored.
- Connector snapping and selection/resize hit targets account for the current zoom. Viewport gestures do not add drawing-history entries.
- Verification: `npm test` passed (49 tests); `npm run build` passed.
- Next step: try two-finger navigation and S Pen drawing on the Galaxy Tab S9 FE+, then check connector snapping, rectangle/group resizing, and undo/redo at minimum and maximum zoom.

## Canvas navigator update — 2026-10-30

- Expanded the white page to 2382 × 2246 canvas units (three A4 widths by two A4 heights), keeping its origin at (0, 0) and leaving stored drawing coordinates unchanged.
- Added a bottom-right minimap that expands to include the page, drawings outside the page, and the current viewport. Clicking or dragging in it recenters the viewport without creating history entries.
- Added a live zoom percentage, Fit canvas, Fit drawing, and Reset controls. Default/reset view stays at 100% at the canvas origin; zoom-out now reaches 10% so the full page can fit on smaller screens.
- Added tests for expanded workspace dimensions, fit calculations, minimap-to-canvas mapping, and existing connector/resizing/history behavior through viewport transforms.
- Verification: `npm test` passed (53 tests); `npm run build` passed.
- Next step: verify minimap drag and touch behavior, then check the controls and S Pen interactions on the Galaxy Tab S9 FE+.

## Minimap extent correction — 2026-10-30

- Found that the minimap used fixed page-only bounds and clipped drawings to the white page.
- Changed minimap bounds to include the expanded page, all drawn item bounds, and the current visible viewport. Drawings on gray workspace and viewports outside the page now appear in the minimap.
- Minimap drag holds its map geometry steady while navigating, and clamps the viewport center so its outline remains inside the captured map extent.
- Verification: `npm test` passed (53 tests); `npm run build` passed.
- Next step: verify off-page drawing and minimap dragging on-device.

## Page overview inset — 2026-10-30

- Kept the dynamic Workspace overview for off-page drawings and the full viewport outline.
- Added a separate fixed-scale Page overview inset for the entire 2382 × 2246 page, showing page-contained ink and the viewport intersection.
- Page inset click/drag navigation uses its own page-to-canvas mapping and does not send pointer events to the drawing canvas.
- Added regression coverage for drawings inside and far outside the page and verified the page overview scale remains fixed.
- Verification: `npm test` passed (54 tests); `npm run build` passed.
- Next step: check workspace and page overview navigation on the Galaxy Tab S9 FE+.

## Compact navigator — 2026-10-30

- The navigator now opens in a compact workspace-only state. A separate expand/collapse button reveals or hides the Page inset.
- Workspace navigation and off-page drawing coordinates remain unchanged in either state; resizing the panel redraws the workspace overview for its current dimensions.
- The expand button has isolated pointer handling, and the Page inset is a separate canvas target from the drawing surface.
- Added coverage for expanded and collapsed panel states and off-page viewport navigation.
- Verification: `npm test` passed (55 tests); `npm run build` passed.
- Next step: check the compact and expanded navigator on the Galaxy Tab S9 FE+.

## Fixed drawing workspace — 2026-10-30

- The drawable workspace is fixed at 2382 × 2246 canvas units; the white page retains its current origin and dimensions. Stored item coordinates are not translated.
- Viewport pan, pinch zoom, minimap navigation, and resize handling clamp to the workspace. When the viewport is larger than the workspace, it stays centered on the workspace.
- New pen strokes stop at workspace edges, and a pen press in the surrounding gray area is ignored. Selected-object movement is constrained to the workspace. Connector endpoints and lasso/resize input are bounded as well.
- The compact workspace minimap now uses the fixed workspace bounds, clips item rendering to that rectangle, and keeps the viewport outline in the same coordinate frame. The optional page overview remains behind the expand button.
- Verification: `npm test` passed (60 tests); `npm run build` passed; `git diff --check` passed.
- Next step: verify boundary drawing, panning at all edges, and minimap navigation on the Galaxy Tab S9 FE+.

## Sheet size and gray margin — 2026-10-30

- Set the white sheet to 2500 × 1500 canvas units at its existing origin. Added a 5% gray margin on every side, represented by workspace bounds (-125, -75) to (2625, 1575).
- Canvas items and snapshot history remain in the same canvas coordinate system; no stored stroke, rectangle, or connector coordinates are shifted.
- The main canvas draws and outlines the larger sheet inside the bounded gray workspace. The compact minimap maps the full workspace and shows the sheet inset; the optional Page inset maps the sheet itself.
- Verification: `npm test` passed (60 tests); `npm run build` passed.
