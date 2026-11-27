# InkPad UI round 3 (2026-11-27), branch ui-polish

**Push blocked for the third time.** This scheduled run is still not authorised for kaifk468/ink_pad (git proxy: "not in this session's authorized repository set"). Nothing reached GitHub. The whole branch (rounds 1–3, rebased onto the newest desktop-20x 8d43019) is saved as one patch series in the claude.ai project: `claude/inkpad-ui-polish-2026-11-27-round3.patch` (screenshots left out). Apply with:
`git fetch && git checkout -b ui-polish 8d43019 && git am inkpad-ui-polish-2026-11-27-round3.patch`
This supersedes the round-2 patch.

## 1. What changed (plain language, Desktop mode only)
- **Export is easy to find.** The Export window is now called "Export" and starts with two big tiles, **PNG** ("Best for docs and chat") and **SVG** ("Sharp at any size"), then a 1x / 2x size switch and a Transparent background switch. The .inkpad file buttons sit in one small row below. Mermaid, text outline, Excalidraw and NotebookLM are tucked into a "Text and other apps" section you can open. The duplicate title box is gone (rename in the top bar).
- **New command palette (Ctrl+K).** Search icon, "Search commands and diagrams", commands grouped under small headings (Tools, Edit, View…). Long names no longer get cut off: the explanation moves to a grey second line. The keyboard shortcuts window (?) has the same look and shows two columns on a wide screen.
- **Ctrl+S does something.** It saves straight away, shows a "Saved" toast and the status pill flashes once. (Before, the browser's "Save page" dialog opened.) It also works while typing a label or the title, and never interrupts a pen stroke.
- **A one-time tip.** The first time a shape tool hands back to Select, a toast says "Tip: press Q (Keep tool) to draw several in a row".
- **Library cards** have rounded corners, a paper-coloured picture area, a gentle lift on hover, and clearer titles. Pictures no longer show labels in a serif font (the thumbnail now includes the hand-writing font).
- **Small fixes from a new-visitor test:** a stray drag on a panel no longer paints blue text selection over the toolbar and panels; the title tooltip says "Click to rename" on a computer; menu descriptions wrap to two lines instead of being cut.
- Tablet is unchanged (screenshots byte-identical before and after).

## 2. Before and after screenshots
Before: `docs/ui-shots/2026-11-27-r3-before/` · After: `docs/ui-shots/2026-11-27-r3-after/`
- Export dialog: `1440-export-panel.png`, `1024-export-panel.png`
- Command palette: `1440-command-palette.png`
- Shortcuts dialog: `1440-shortcuts.png`
- Menu sheet: `1440-menu-open.png`

## 3. Device checklist
Laptop, Desktop mode, real mouse:
1. Draw a box, click Export (top right): PNG tile is focused; switch 1x/2x and Transparent; click PNG → file downloads and "PNG downloaded" appears. Open "Text and other apps" → Copy as Mermaid works.
2. Press Ctrl+S: "Saved" toast, the status dot pulses once; on a brand-new empty page: "Nothing to save yet". Hold Ctrl+S: one toast, no browser dialog. Press Ctrl+S while renaming the title: no browser dialog.
3. Press R, draw one box: tip toast about Q appears once; draw another: no second tip.
4. Ctrl+K: grouped list, arrow keys move through it, Enter runs; type "laser" → one row with a grey explanation line. Press ? → two-column shortcut list.
5. Open the Library with a few diagrams: cards lift on hover, titles truncate with a tooltip, labels in pictures look hand-written (pictures refresh after the next edit).
6. Drag from a panel onto the canvas: no blue selection over the UI. Title input, labels and notices can still be selected.
7. OS "reduce motion" on: no dialog slide, no card lift, no pill flash.
Tablet (must be unchanged): Export panel still has the title field and the old order; palette not used; dock, S Pen drawing, palm rejection, pinch zoom, Library pictures as before.

## 4. Held back for next run (and why)
- **Options panel covers the canvas when a drawing tool is picked** (new visitor's first drag landed on it). Needs a real rethink (contextual mini toolbar near the selection, or a collapsible panel), too big to do well this round.
- Library beyond cards: recent/pinned rows, an "open" affordance, the uneven 3+1 card action buttons.
- Status pill reads "Not saved yet" for a while during drawing although autosave will run: wording change ("Saving soon…") needs a look at the save timing.
- Page counter "1 / 1" looks cryptic; dark theme; bundling DM Sans locally (the only console error is the blocked Google Fonts request); dock compact mode under ~900px.
- Handwriting font on labels while "Hand-drawn style" is off looks inconsistent to a new visitor: a product decision (see 5).

## 5. Owner decisions needed
- **Push access (blocking):** add kaifk468/ink_pad to the scheduled task's repositories (in a new claude.ai chat, ask Claude to add every repository the task needs, then replace the scheduled task). Until then each run only produces a patch, and each run re-applies the previous patch onto the newer desktop-20x.
- Desktop Export dialog **no longer has a Title field** (top bar owns the title). Reverse if you want it back.
- Library picture font fix is **desktop only** for now (tablet must not change). The serif bug exists on tablet too; say if the fix should apply there.
- Should labels follow "Hand-drawn style" (plain font when it is off)?
- Still open: ink-blue accent, Excalifont headlines, dark paper in dark theme, icon-only dock, Esc commits labels.

## Checks run
- npm test: 1815/1815 pass. npm run build: ok.
- Headless Chromium 1440x900 and 1024x700 desktop capture: all states, no page errors (one blocked external request). Tablet shots byte-identical to the round-2 code.
- First-time-user walk (Sonnet): task completable first try; 14 friction items, 4 fixed this round, the rest held back above.
- Independent Opus review: 3 serious (Ctrl+S in text fields opened the browser dialog, held Ctrl+S flooded saves, "Saved" toast when nothing saved) + 9 minor (thumbnail double build and tablet leak, palette a11y and O(n²) index, export dialog labelling/focus, card tokens, paint transitions, user-select gaps); all fixed, plus Ctrl+S never saves mid-stroke.
- NOT verified on a real tablet, S Pen or physical mouse.
