# InkPad UI round 7 (2026-11-28)

Push access works again this run: ui-polish and desktop-20x are pushed directly (no patch).

## 1. What changed
- **Insert logo dialog (desktop) is easier to scan.** Each logo is now a tile with its name under it, in a wider dialog. A line above the grid says how many logos match, and while you type it reminds you that Enter inserts the first one, which is outlined in blue. "Show name" sits on the same line. When nothing matches, it says so and suggests a product name to try. Long "Apache …" names drop the "Apache" word on the tile so they fit (the full name stays in the tooltip and for screen readers).
- The tablet Insert tray logo grid is unchanged.

## 2. Screenshots
Before: `docs/ui-shots/desktop-logo-dialog.png` (from the feature round). After: `docs/ui-shots/2026-11-28-r7-after/` (`1440-logo-all.png`, `1440-logo-post.png`, `1024-logo-none.png`, and 1024 versions). No console errors.

## 3. Device checklist
1. Desktop mode, Ctrl+K, "Insert logo". Tiles show names; the count says "134 logos".
2. Type "post": "3 matches · Enter inserts the first", PostgreSQL outlined. Press Enter: a PostgreSQL box appears.
3. Type nonsense: a friendly "No logo for …" message, no count.
4. With reduced motion on, tiles do not lift on hover.
5. Tablet: Insert tray logos look exactly as before.

## 4. Held back for next run
- Board section review against the brief on Chalkboard: the menu, dock and pills stay light cards on the dark board. They read well, but a dark chrome variant for Chalkboard is worth a design decision first.
- Same labelled tiles for the desktop More shapes tray logo results.
- Still open from round 6: drag-to-connect circles, shorter right-click menu with "More", options panel covering the first drawing spot, dock captions, Export preview.

## 5. Owner decisions
- Should chrome (menu, dock, top bar) turn dark on the Chalkboard board, or stay light cards as now?
- Round 6 decisions (connectors, UML disclosure, first-visit Desktop default) are still open.

## Checks run
- npm test: 1942/1942 pass. npm run build: ok.
- Headless Chromium capture of the dialog at 1440x900 and 1024x700: all states, no console errors.
- Small round by design: one focused change, reviewed by screenshot. NOT verified on a real tablet or physical mouse.
