# InkPad UI round 5 (2026-11-27), branch ui-polish

**Push blocked for the fifth time.** This scheduled run still has no access to kaifk468/ink_pad ("not in this session's authorized repository set"), and origin/ui-polish does not exist on GitHub. This run re-applied the round-4 patch onto desktop-20x 8d43019 (unchanged), built round 5 on top, and saved the whole branch (rounds 1–5) as one patch series in the claude.ai project: `claude/inkpad-ui-polish-2026-11-27-round5.patch` (screenshots left out). Apply with:
`git fetch && git checkout -b ui-polish 8d43019 && git am inkpad-ui-polish-2026-11-27-round5.patch`
This supersedes the round-4 patch.

## 1. What changed (Desktop mode only unless noted)
- **Colours in the options panel are easier to read.** The section titles are now short: "Stroke", "Fill", "Width". The fill colours are small rounded squares, so they no longer look like the stroke colours (circles). "No fill" is a square with a grey line through it instead of a red slash that looked like an error. The width presets and the px slider now sit together under one "Width" title.
- **The folded options panel is smaller.** When you fold it, it shrinks to just its name and arrow instead of keeping its full width.
- **The panel names what you are editing.** While you type a text or a label it says "Text" or "Label" (it used to say "Pen"). The text-size row now highlights only one size.
- **Keyboard shortcuts fit the screen.** The dialog no longer runs off the bottom. The title stays put and the list scrolls, with a soft shadow showing there is more.
- **Messages appear on top.** The "PNG downloaded" message is no longer dimmed behind the Export dialog.
- **Small windows get a compact dock.** Below 900px wide the dock buttons shrink a little. Below 740px the system-design shapes move into the "More" tray, which gets shape search and the sticky note too, so nothing is lost.
- **Library thumbnails show the whole diagram.** They used to be cut off on the right with the star button sitting on the drawing. The star now sits next to the title.
- **The menu shows when there is more below.** A soft shadow at the bottom hints that the Help rows are further down.
- **Shared change: fonts work offline.** DM Sans and Manrope now ship with the app instead of loading from Google. Nothing should look different on a connected device. Offline, the fonts now look right, and the only console error is gone. Accented letters outside basic Latin (ł, ő, Vietnamese) use the system font.

## 2. Before and after screenshots
Before: `docs/ui-shots/2026-11-27-r5-before/` · After: `docs/ui-shots/2026-11-27-r5-after/`
- Options panel: `1440-panel-shape-selected.png`, `1440-toolbar-pen.png`, `1024-panel-shape-selected.png`
- Shortcut dialog: `1440-shortcuts.png`, `1024-shortcuts.png`
- Menu: `1440-menu-open.png`, `1024-menu-open.png`
- Console errors: `console.txt` in each folder (before: blocked font request; after: none)

## 3. Device checklist
Laptop, real mouse, Desktop mode:
1. Draw a box and select it. The panel reads Stroke, Width, Fill. The fill swatches are squares. Click "No fill": one grey-lined square is ringed and nothing else is.
2. Fold the panel with its arrow. It becomes a small pill. Unfold it.
3. Double-click a box and type a label. The panel header says "Label" and only one text size is highlighted.
4. Press `?` (or open Keyboard shortcuts from the menu) on a laptop screen. The whole dialog is visible and the list scrolls.
5. Export a PNG. The "PNG downloaded" message is bright, not dimmed.
6. Narrow the browser window to about 850px, then about 700px. The dock shrinks, then the cylinder and queue shapes move into "More". Open More and search "redis".
7. Open the Library after saving a diagram with a box near the right edge. The whole drawing shows and the star sits next to the title.
8. Open the menu on a short window. A shadow at the bottom shows more rows; scroll to Keyboard shortcuts.

Tablet (must be unchanged): dock, options panel, menu, library and toasts look and behave as before; S Pen drawing, palm rejection, pinch zoom. Fonts should look identical, because the tablet already loaded DM Sans from Google.

## 4. Held back for next run (and why)
- **Connecting boxes is still the biggest friction.** The circles around a selected box look like drag handles, but they only spawn a new box on click. The Arrow tool attaches only when you release, with no preview. This is connector behaviour, which belongs to the feature round (owner decision below).
- **The selected arrow looks wrong.** Its highlight is a thick soft band with an oversized arrowhead. This is canvas drawing code, so it needs a careful look at drawing speed.
- **Saving and tools.** There is no visible "Save" for people who look for one (only the pill and Ctrl+S). The tool goes back to Select after every shape. Both need a small design decision.
- **The connector panel uses UML terms** ("Directed association", "End labels 1 / *") that a casual user won't follow. It needs a plain-language pass.
- Later: Library recent/pinned rows and card menu, dark theme, merging the floating buttons on the right edge, accented-letter font subset.
- One walk item could not be reproduced: double-clicking an arrow opens its label editor correctly. A regression test now pins it. The walker probably clicked more than 12px off the line.

## 5. Owner decisions needed
- **Push access (blocking, 5 runs now):** add kaifk468/ink_pad to the scheduled task's repositories. In a new claude.ai chat, ask Claude to add every repository the task needs, then replace this scheduled task. Until then each run only produces a patch, and the patch grows every run.
- **Connectors:** should the quick-connect circles become drag-to-connect, Excalidraw style, and should the Arrow tool show a target highlight while dragging? Feature round or this job?
- **Bundled fonts** is a shared change, though tablet looks the same. Reverse it by restoring the Google import in `src/styles.css` line 1.
- Still open: First-visit Desktop default (round 4), labels following "Hand-drawn style", ink-blue accent, dark paper in dark theme.

## Checks run
- npm test: 1846/1846 pass. npm run build: ok (dist about 130 KB larger for 8 woff2 files).
- Headless Chromium desktop capture at 1440x900 and 1024x700: all states, no console errors. The toast state skips in the script, as before; the toast was checked manually by the builder.
- Tablet: pixel-identical for all non-font tasks. After the font bundle, sandbox tablet shots differ only because the sandbox could not reach Google Fonts before. Repeat captures of unchanged builds show small random noise in two states.
- Compact dock measured at 860, 899, 740, 739 and 640 wide with no overlaps. More tray checked at 700x700.
- First-time-user walk (Sonnet): all 6 steps succeeded (three boxes, arrows that follow, labels, rename, save and find in Library, PNG export). 14 friction items: 4 fixed, 1 not reproduced, the rest held back above.
- Independent Opus review: 0 serious, 3 minor and 1 nit, all fixed. These were sticky and shape search lost below 740px, no active cue on More, and a double selected ring on More colours.
- NOT verified on a real tablet, S Pen or physical mouse.
