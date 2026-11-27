# InkPad UI round 2 (2026-11-27), branch ui-polish

**Push blocked again.** The scheduled run is still not authorised for kaifk468/ink_pad (git proxy: "not in this session's authorized repository set"). Nothing reached GitHub. The whole branch (round 1 + round 2, 10 commits on top of desktop-20x c2f2f68; the PNG screenshots are left out of the patch to keep it small, so the screenshot paths below exist only in the run's workspace) is saved as one patch series in the claude.ai project: `claude/inkpad-ui-polish-2026-11-27-round2.patch`. Apply with:
`git fetch && git checkout -b ui-polish c2f2f68 && git am inkpad-ui-polish-2026-11-27-round2.patch`
(This supersedes the round-1 patch; round 1 was re-applied onto the newer desktop-20x in commit "UI round 1 (restored …)".)

## 1. What changed (plain language, Desktop mode only)
- **One tidy header.** Menu, Library, the diagram name and Undo/Redo now sit together in one rounded bar at the top left (Undo/Redo are icons with tooltips). At the top right: a save status pill (green dot = saved, yellow = not yet, red = problem; it pulses once when it saves), an **Export** button, and your account. The lonely "Not saved yet" text in the bottom-right corner (which was hidden behind the toolbar on small windows) is gone.
- **Cleaner toolbar.** The bottom dock is now icons only, smaller and centred, with tiny tick marks between groups. Hover a tool (or tab to it) and a dark tooltip shows its name and keys, e.g. "Rectangle R 2 / Shift: square". The selected tool is tinted blue.
- **Calmer options panel.** Width, line style, layer, change shape are now matching segmented controls; layer uses icons; colour swatches fit on one line; the panel never runs off the screen (it scrolls, with a soft shadow at the bottom).
- **Right-click menu** uses the same type sizes and styling, has a visible keyboard focus ring, and no longer covers the toolbar.
- **Zoom, page and map buttons** match the new style and line up with the toolbar row.
- **First-time fixes** (from a "new visitor" test): the app now starts on the Select tool on a computer (it started on Pen, so the first drag scribbled); select a box and press **Enter** to type its label; **Esc** now keeps the label you typed instead of throwing it away (it still restores if you cleared an existing label); the empty page mentions "Double-click to label"; PNG/SVG export shows "PNG downloaded".
- **Bug fix (both modes):** renaming a diagram from the header could be undone on the next reload ("Restored changes kept on this device" brought back the old name). The rename now refreshes the device safety copy too (bounded, never waits more than ~3 s).

## 2. Before and after screenshots
Before: `docs/ui-shots/2026-11-27-r2-before/` · After: `docs/ui-shots/2026-11-27-r2-after/`
- Header + dock: `1440-mixed-diagram.png`, `1024-mixed-diagram.png`
- Options panel: `1440-panel-shape-selected.png`, `1024-panel-shape-selected.png`
- Right-click menu: `1440-context-menu.png`
- Menu sheet: `1440-menu-open.png`
- Tablet (byte-identical before/after): `…/tablet/*.png`
Capture script for later rounds: `node scripts/ui-capture.mjs <outDir> --mode desktop|tablet` (serve dist on :4173 first).

## 3. Device checklist
Laptop, Desktop mode, real mouse:
1. Fresh tab: the Select tool is active. Draw a box with R + drag, press Enter, type "API", press Esc: the label stays.
2. Hover each dock icon for half a second: tooltip with name and keys; no tooltip flicker while drawing.
3. Rename the diagram in the header, press Enter, reload: the new name stays.
4. Watch the top-right pill go yellow → green after an edit; click Export → export dialog opens; PNG → "PNG downloaded" toast.
5. Select a box: options panel fits, scrolls at a small window (1024x700), swatches on one line. Right-click near the bottom of the screen: menu stays above the dock; Tab/arrow keys show a blue ring.
6. Resize to ~1024 wide: zoom controls lift above the dock, nothing overlaps the header.
7. Draw fast pen/mouse strokes with the menu and panel open/closed: no lag. OS "reduce motion" on: no pulses or slides.
Tablet (must be unchanged): dock with text labels and corner digits as before, Undo/Redo pill at top centre, top-right shows pen colours in Pen mode and nothing extra with other tools, Esc/labels behave as before, S Pen drawing, palm rejection, pinch zoom. One shared change to verify on the tablet: rename a diagram, reload, the name stays.

## 4. Held back for next run (and why)
- **Library redesign** (thumbnail cards, recent/pinned, open affordance; tester also saw a serif font in thumbnails and a new blank diagram missing from the list): big piece, needs its own round.
- **Visible Save / Ctrl+S feedback**: Ctrl+S does nothing visible; decide whether to flash the status pill.
- **Export dialog order** (image formats first): tester found PNG buried under Mermaid/Excalidraw/NotebookLM.
- **Arrow tool resets to Select** after one use with no hint ("double-click a tool to keep it").
- **Contextual mini toolbar near the selection** (idea bank) could replace the left options panel that covers the canvas.
- **Dark theme**, **bundle DM Sans** locally (Google Fonts is blocked in the sandbox: the only console error), command palette and shortcut dialog restyle, dock compact mode under ~900px.
- Context-menu Order/Selection chip rows still wrap at 248px width.

## 5. Owner decisions needed
- **Push access (blocking):** add kaifk468/ink_pad to the scheduled task's repositories (in a new claude.ai chat, ask Claude to add every repository the task needs and recreate the task). Until then each run only produces a patch.
- Dock is now **icon-only** on desktop (the brief said labelled groups). Reason: 19 tiny 9px labels made a 1170px strip; tooltips now carry names and keys. Reverse if you want labels.
- **Esc commits a label** on desktop (Excalidraw-like). Reverse to "Esc cancels" if you prefer.
- The rename fix touches shared storage code (`src/app/useDocuments.ts`), so it also changes tablet behaviour (for the better). OK?
- Still open from round 1: ink-blue accent, Excalifont for headlines, dark paper or light paper in dark theme.

## Checks run
- npm test: 1728/1728 pass. npm run build: ok.
- Headless Chromium 1440x900 and 1024x700, desktop: all states captured, no page errors (one blocked Google Fonts request). Tablet shots byte-identical to before; tablet top-right with Select tool byte-identical to pre-round code.
- First-time-user walk (Sonnet agent): all steps completed; friction list drove the fixes above.
- Independent Opus review: 2 serious (tablet leak of the status pill, unbounded rename flush) + 9 minor; all 11 fixed.
- NOT verified on a real tablet, S Pen or physical mouse.
