# Desktop mode 20x usability plan (2026-11-19)

Goal: make Desktop mode (mouse + keyboard, behind the Tablet/Desktop switch) far easier and faster to use for HLD diagrams. Usability only; no performance work.

## Rules for every item
- Tablet mode unchanged: never branch pen or touch code on desktop mode; new UI and keys are gated on `inputMode === 'desktop'`.
- Saved format additive only, version unchanged, old files load and re-save identically. Every new field: canvasModel type, documentFormat `sanitizeItem`, canvasRenderer (+ sketchyRender), sheetExport, round-trip test.
- Out of scope: class boxes, Mermaid, code block.
- New logic in pure modules (desktopInput.ts, canvasModel.ts or a new src/*.ts) with node tests; App.tsx stays thin wiring with regex wiring tests.
- `npm test` and `npm run build` pass before each commit.

## Sources
- Code inventory of the current desktop mode (Opus, read-only pass over src/, file:line map).
- Excalidraw / tldraw desktop behaviour (keys, panel, binding, flowchart keys, export), from known public behaviour; the web-research pass was cut short, so details are from Excalidraw's documented shortcuts.

## Ranked items (impact first, risk second)

### Batch A: find things and move around (low risk)
1. **Keyboard shortcut help** (`?` key, and "Keyboard shortcuts" in the menu): grouped dialog (Tools, Edit, View, Arrange, Pages) built from one `SHORTCUTS` table that a test checks against `keyCommand`. Accept: `?` opens, Escape closes, every listed key really works.
2. **Zoom keys like Excalidraw**: Shift+1 zoom to fit the drawing, Shift+2 zoom to selection, Ctrl+0 back to 100% (centred on the current view centre). Clicking the % readout resets to 100%. Accept: each key changes the view as described; zoom stays within limits.
3. **Pages by keyboard**: PageUp / PageDown go to the previous / next page (decision from the original plan: pages, because the wheel already scrolls). Accept: works on multi-page diagrams, no-op at the ends.
4. **Hide tablet-only controls on desktop**: zoom lock (which also hid the menu, a trap) and the One-finger pan menu row are not shown in Desktop mode. Accept: tablet shows them exactly as before.
5. **Tooltips with shortcuts everywhere**: undo/redo, zoom buttons, HLD tools, panel actions.

### Batch B: edit what is selected (medium)
6. **Stroke width of a selection** (panel shows width presets + slider when something is selected; one undo step per drag).
7. **Line style**: solid / dashed / dotted for lines, arrows, plain shapes, HLD shapes and connectors (new optional `dash: 'dashed' | 'dotted'`; a connector's own dash wins over its relationship type). Works in sketchy mode and in SVG/PNG export.
8. **Arrowheads** for line/arrow strokes: none / end / start / both (new optional `arrowheads` on strokes; missing = today's look).
9. **Layer order**: Bring forward / Send backward / To front / To back (Ctrl+] / Ctrl+[ / Ctrl+Shift+] / Ctrl+Shift+[), panel buttons and context menu. One undo step.
10. **Align and distribute** for 2+ selected items (left, centre, right, top, middle, bottom; distribute horizontally/vertically with 3+), connectors follow. One undo step.

### Batch C: draw diagrams faster (medium-high)
11. **Arrows that stick to shapes**: Desktop Arrow tool: when the drag starts or ends on/inside a box, it creates an arrow connector (directed) attached to that box, so it follows the box. Free arrows elsewhere stay plain strokes.
12. **Quick-create connected shape**: with one box selected, Ctrl+Arrow key creates a copy of the shape (same kind, size, colours, empty) in that direction with a gap, joined by an arrow connector, and selects it. Repeated presses fan out without overlapping.
13. **Type inside a shape**: double-click a plain shape or HLD shape with the Select tool opens a label centred inside it (auto-fit as today). Desktop drag of a box carries labels whose box lies fully inside it.
14. **Duplicate keeps the clipboard** (Ctrl+D no longer overwrites what was copied).

### Batch D: get diagrams out (medium)
15. **Copy as PNG** to the system clipboard (Shift+Alt+C, context menu; Ctrl+Shift+C is reserved by Chrome for DevTools): the selection, or the whole page when nothing is selected. Toast "Copied as PNG".
16. **Export selection**: context menu "Export selection as PNG / SVG".
17. **Excalifont embedded in SVG export** when a label uses it, so SVG and PNG look like the canvas.

### Batch E: polish (low-medium)
18. **Better right-click menu**: grouped with separators, shortcut hints on the right, plus Edit text, Bring to front / Send to back, Copy as PNG, Zoom to selection, Select all; size measured instead of the fixed 184x236 clamp.
19. **Toasts** for clipboard and arrange actions (Copied, Pasted, Nothing to paste, Copied as PNG).
20. **Lock** (Ctrl+Shift+L, context menu Lock / Unlock all): locked items are not selected by click or marquee and cannot be moved or erased by the select tools (new optional `locked: true`).

## Not in this round (and why)
- Group/ungroup: needs group ids remapped through paste and every selection path; too risky for one session.
- Arrow labels bound to connectors and fully bound container text: new linked objects; next round.
- Alt-drag duplicate: Alt already means "no snapping" and "look through code blocks".
- Icon library (person, Redis, CDN): new item kind or drawing set; next round.

## Status (2026-11-19)
All 20 items built on branch `desktop-20x` (batches A-E), reviewed by an independent Opus pass, review defects fixed, plus three fixes from a headless Chrome run. Details and the manual checklist: project-context.md, 2026-11-19 entry.
