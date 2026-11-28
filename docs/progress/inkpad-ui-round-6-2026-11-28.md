# InkPad UI round 6 (2026-11-28), branch ui-polish

**Push blocked for the sixth time.** This run could clone kaifk468/ink_pad but not push to it ("not in this session's authorized repository set"), and origin/ui-polish still does not exist on GitHub. This run re-applied the round-5 patch onto desktop-20x 8d43019 (unchanged since round 5), built round 6 on top, and saved the whole branch (rounds 1–6) as one patch series in the claude.ai project: `claude/inkpad-ui-polish-2026-11-28-round6.patch` (screenshots left out). Apply with:
`git fetch && git checkout -b ui-polish 8d43019 && git am inkpad-ui-polish-2026-11-28-round6.patch`
This supersedes the round-5 patch.

## 1. What changed (Desktop mode only)
- **Arrow options are in plain words.** When you select an arrow, the panel now shows "Line" (Straight, Elbow, Curved), "Arrowheads" (End or Both, plus a Reverse button), and "Add label" / "Insert box". The UML terms ("Directed association", "End labels 1 / *") moved into a closed "Diagram notation (UML)" section, with plain names next to each term ("Inherits from (inheritance)"). It opens by itself when an arrow already uses a UML type.
- **A selected arrow looks like itself.** It used to get a thick blue band and a giant arrowhead that looked broken. Now it gets a soft blue glow along the line, and the real arrowhead stays visible.
- **The right-click menu is tidy.** Each group of small buttons has a distinct name (no more two "Style" groups), and all the buttons start in one straight column. Rows have even spacing. The menu no longer covers the top bar. When it is too tall, it stops above the dock and scrolls, with a soft shadow showing there is more. It opens with a quick, calm fade. Left and right arrow keys move between the small buttons.
- **You can click to save.** The save status in the top bar ("Saving soon", "Saved in this browser") is now a button. Clicking it saves right away, the same as Ctrl+S.
- **Export: settings first, then the button.** "PNG scale" and "Transparent" now sit above the PNG and SVG buttons, so you set them before you click. Each button shows the file name it will download, for example `Untitled-diagram@2x.png`.
- **Small fixes:** shortcut keys in the Keyboard shortcuts dialog no longer break over two or three lines. Menu descriptions stay on one line. The Library search box reads "Search diagrams" with a small "/" key hint, instead of a cut-off sentence. The selected eraser mode is clearly highlighted. The panel heading for new shapes says "Line style" instead of "Line style for new shapes".

## 2. Before and after screenshots
Before: `docs/ui-shots/2026-11-28-r6-before/` · After: `docs/ui-shots/2026-11-28-r6-after/`
- Selected arrow and its panel: before `extra-connector-selected.png`; after `extra-1440-connector-panel.png`, `extra-1440-connector-uml.png`
- Right-click menu: `1440-context-menu.png`, `1024-context-menu.png` in both folders; after also `extra-1024-context-low.png`, `extra-1024-context-top.png`
- Export: `1440-export-panel.png`, `1024-export-panel.png` (after also `extra-1440-export.png`)
- Shortcuts: `1440-shortcuts.png` · Menu: `1440-menu-open.png` · Library: `1024-library.png`
- Console errors: `console.txt` in each folder (none in either)

## 3. Device checklist
Laptop, real mouse, Desktop mode:
1. Draw two boxes and an arrow between them, then click the arrow. It shows a soft blue glow, not a thick band. The panel shows Line, Arrowheads, Add label / Insert box, and a closed "Diagram notation (UML)" row.
2. Click "Both", and Reverse greys out. Click "End", then Reverse, and the head moves to the other box.
3. Open "Diagram notation (UML)" and pick "Inherits from (inheritance)". Click another arrow and then back: the section is open for the UML arrow.
4. Right-click the arrow. Group names are all different and the small buttons line up in one column. On a short window (about 1024x700) the menu starts below the top bar, stops above the dock and scrolls. Try the arrow keys, including Left and Right on a button row.
5. Right-click near the very top of the canvas. The menu does not cover the save pill or Export.
6. Draw something, then click the "Saving soon" or "Not saved yet" pill. A "Saved" message appears and the pill flashes. Press Tab to the pill and press Enter: focus stays on it.
7. Open Export. PNG scale and Transparent are above the PNG/SVG buttons, and the buttons show file names.
8. Press `?`. No key chip wraps. Open the menu: every description is one line.
9. Open the Library on a narrow window (about 1024 wide). The search box reads "Search diagrams" with a "/" hint.

Tablet (must be unchanged): dock, options panel (including the arrow section with the Relationship dropdown), menu, library, export and toasts look and behave as before; S Pen drawing, palm rejection, pinch zoom. In sandbox captures, every tablet state matched the baseline apart from tiny anti-alias noise that also shows between two captures of the old build.

## 4. Held back for next run (and why)
- **Connecting boxes** is still the main friction: the circles around a box look draggable but only spawn a box on click, and the Arrow tool has no attach preview. This changes connector behaviour, so it waits for your decision (below).
- **The right-click menu is long** (about 790px for an arrow). It is tidy now, but it should become a short first level with a "More" submenu. That is a bigger redesign, best done in its own round.
- **The options panel can cover the spot where a new user starts drawing.** The first-time walk lost its first box under the panel. Options: open the panel folded when a shape tool is picked with nothing selected, or move it. This needs a careful look at how often people use the panel before drawing.
- **The dock is 17 icon-only buttons.** Ideas: group captions on hover, or a one-time labelled dock for first visits.
- The empty-canvas hint chips look clickable but are not. The Export dialog has no preview.
- Later: Library recent/pinned rows and card menu, dark theme, merging the floating buttons on the right edge, accented-letter font subset.

## 5. Owner decisions needed
- **Push access (blocking, 6 runs now):** the scheduled task needs kaifk468/ink_pad with push access. In a new claude.ai chat, ask Claude to add every repository the task needs, then replace this scheduled task. Until then, each run only produces a patch, and the patch grows every run.
- **Connectors:** should the quick-connect circles become drag-to-connect (Excalidraw style), with a target highlight while dragging the Arrow tool? Should this job or the feature round do it?
- **UML behind a disclosure:** UML users now need one extra click the first time (it then opens by itself for UML arrows). To reverse it, show the disclosure open by default in `ContextPanel.tsx`.
- **Context menu width** grew from 248 to 296px so the button rows don't wrap.
- Still open: First-visit Desktop default (round 4), labels following "Hand-drawn style", ink-blue accent, dark paper in dark theme, bundled fonts (round 5).

## Checks run
- npm test: 1867/1867 pass. npm run build: ok.
- Headless Chromium desktop capture at 1440x900 and 1024x700: all states, no console errors. The toast state skips in the script, as before.
- Tablet capture before and after: identical apart from anti-alias noise (max 4/255 on 48 pixels, top-right). The same noise appears between two captures of the unchanged baseline build.
- Haiku defect pass over 32 screenshots, then an Opus check. Fixed: context menu over the top bar, ragged and duplicate captions, shortcut chip wrap, menu description wrap, library placeholder, eraser contrast. Expected rather than bugs: the shortcut dialog and menu sheet are cut off at the bottom because they scroll.
- First-time-user walk (Sonnet): all 5 steps succeeded (three boxes, arrows, labels, title and save, PNG export). 8 friction items: fixed the UML jargon, the selected-arrow look, the missing Save, and export settings coming after the button. The rest are held back above.
- Independent Opus review: 3 serious, 10 minor, 2 nits. Fixed: the menu could still overlap the top bar on short windows, the menu height did not match the dock clearance, and the save button lost keyboard focus on click. All minor and nit items fixed except the longer library placeholder, which does not fit at 1024.
- NOT verified on a real tablet, S Pen or physical mouse.
