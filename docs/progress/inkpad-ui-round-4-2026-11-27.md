# InkPad UI round 4 (2026-11-27), branch ui-polish

**Push blocked for the fourth time.** This scheduled run is still not authorised for kaifk468/ink_pad (git proxy: "not in this session's authorized repository set"), and origin/ui-polish does not exist on GitHub. This run re-applied the round-3 patch onto desktop-20x 8d43019 (unchanged since round 3), built round 4 on top, and saved the whole branch (rounds 1–4) as one patch series in the claude.ai project: `claude/inkpad-ui-polish-2026-11-27-round4.patch` (screenshots left out). Apply with:
`git fetch && git checkout -b ui-polish 8d43019 && git am inkpad-ui-polish-2026-11-27-round4.patch`
This supersedes the round-3 patch.

## 1. What changed (plain language, Desktop mode only unless noted)
- **The options panel can fold away.** It now has a header line: a dot in the current colour, the name of what you are editing ("Pen", "Shape", "3 objects") and an arrow. Click it and the panel shrinks to that one line, so it no longer sits on the canvas where you want to draw. It remembers your choice next time.
- **Colour is always first.** For every tool and selection the panel now goes colour, then width, then style, then arrange. Rarely used actions (Change shape, Focus, Add boundary, Select connected, rotation, Use as default) sit behind a "More actions" button. The panel for a selected shape is much shorter.
- **The save pill speaks plainly.** An empty new page says "Autosave on" with a grey dot instead of a worrying amber "Not saved yet". While autosave is about to run it says "Saving soon". Saved and error messages are unchanged.
- **Page counter reads "1 / 1"** on one line (screen readers hear "Page 1 of 1") instead of two stacked numbers.
- **Library matches the canvas.** Same warm paper colours and ink-blue accent as the editor; one blue button (+ New diagram); quieter Back and Import; a proper grid/list switch; a styled Sort control; "Saved in: This browser" on one line.
- **Small fixes:** a blank grey pill that flashed above the dock (an empty toast) is gone; the lone top-right button now explains itself on hover ("UML connector tools"); menu descriptions show up to three lines instead of being cut.
- **Shared, first visit only:** a brand-new visitor on a mouse-only computer now starts in Desktop mode (our new-visitor test opened in Tablet mode and could not find Desktop mode). Tablets, phones, touch laptops and anyone who has used InkPad before keep exactly what they had.
- Tablet is unchanged (tablet screenshots byte-identical before and after).

## 2. Before and after screenshots
Before: `docs/ui-shots/2026-11-27-r4-before/` · After: `docs/ui-shots/2026-11-27-r4-after/`
- Options panel: `1440-toolbar-pen.png`, `1024-panel-shape-selected.png`, `1440-panel-shape-selected.png`; collapsed: `after/1440-options-collapsed.png`
- Library: `1440-library.png`, `1024-library.png`
- Save pill and page chip: `1440-empty-page.png`, `1440-mixed-diagram.png`
- Tablet check: `2026-11-27-r4-before-tablet/` vs `2026-11-27-r4-after-tablet/`

## 3. Device checklist
Laptop, real mouse, Desktop mode:
1. Press P: the panel shows "Pen" with an arrow. Click the arrow: it folds to one line. Reload: still folded. Click again: it opens with a short fade.
2. Draw a box and select it: colour row is at the top; "More actions" is closed; open it and try Change shape and Focus. Select two boxes: Flip and Same size are there.
3. On a new empty page the pill says "Autosave on" (grey dot). Draw something: "Saving soon" for about a second, then "Saved".
4. Add a second page: the counter reads "1 / 2"; hover gives "Page 1 of 2".
5. Open the Library: warm background, one blue button, grid/list switch, Sort dropdown works with the keyboard.
6. In a fresh browser profile (or private window) on the laptop: InkPad opens in Desktop mode by itself.
7. OS "reduce motion" on: the panel opens and folds without movement.
Tablet (must be unchanged): options panel looks and orders as before (no header, no fold), page counter stacked, library colours as before, opens in Tablet mode (also in a fresh browser), S Pen drawing, palm rejection, pinch zoom.

## 4. Held back for next run (and why)
- **Connecting boxes (highest friction for new visitors).** The new-visitor test dragged the round quick-connect handle onto another box and nothing was created, and arrows drawn with A did not follow the boxes when moved. This may be how a headless mouse drives it, or a real gap; it touches connector behaviour, which belongs to the feature round, so it was not changed here.
- Fill vs "Colour of this object" rows look alike; the "no fill" slash swatch is easy to misread. Needs a small design pass on the panel's colour section.
- Collapsed panel keeps its full 240px width; it could shrink to its content.
- Text size row shows two active values while editing a label; shortcut dialog is clipped at 900px tall; the Export toast appears behind the dialog scrim.
- Library recent/pinned rows and a card action menu; dark theme; bundling DM Sans locally (the only console error is the blocked Google Fonts request); dock compact mode under ~900px.

## 5. Owner decisions needed
- **Push access (blocking):** add kaifk468/ink_pad to the scheduled task's repositories (in a new claude.ai chat, ask Claude to add every repository the task needs, then replace the scheduled task). Until then each run only produces a patch.
- **First-visit Desktop default** is the one shared change: mouse-only computers with no InkPad data start in Desktop. Reverse it if you want Tablet to stay the default everywhere (one function, `defaultInputModeFor` in `src/desktopInput.ts`).
- Should the connector issue above be taken up by the feature round?
- Still open from earlier rounds: labels following "Hand-drawn style", Library font fix on tablet, ink-blue accent, dark paper in dark theme.

## Checks run
- npm test: 1839/1839 pass. npm run build: ok.
- Headless Chromium 1440x900 and 1024x700 desktop capture: all states, no page errors (one blocked external font request). Tablet shots byte-identical to before.
- Headless check: panel collapses, the choice survives a reload, no page errors.
- First-time-user walk (Sonnet): every task step completed; 13 friction items (2 fixed this round: Desktop mode not found, menu descriptions cut; the panel-covering item addressed by the fold; the rest held back above).
- Independent Opus review: 2 serious (Flip and Same size lost from the desktop panel; the first-visit default would have switched existing users to Desktop) + 2 minor + 3 nits; all fixed.
- NOT verified on a real tablet, S Pen or physical mouse.
