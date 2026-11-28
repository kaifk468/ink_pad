# InkPad UI round 8 (2026-11-28)

Short run. Branches were already in sync (desktop-20x had no new commits). Baseline: npm test and npm run build passed.

## 1. What changed
- **Empty page on Chalkboard and Dark boards is readable.** The "Start your diagram" title and the shortcut hints were dark text on a dark board, nearly invisible. They now turn light on dark boards; the white key caps and buttons stay as they were. Clean board unchanged.
- **More shapes tray (desktop dock) shows named logo tiles.** The logo grid in the tray now uses the same named tiles as the Insert logo dialog (icon plus name, result count, Show name switch), four to a row so nothing is cut off at the right edge.

## 2. Screenshots
- docs/ui-shots/2026-11-28-r8/before-chalk-empty.png → after-chalk-empty.png
- docs/ui-shots/2026-11-28-r8/before-chalk-tray.png → after-chalk-tray.png

## 3. Device checklist
- Laptop: switch to Chalkboard (menu → Board, or Ctrl+K "Chalkboard") on an empty page; the title and hints should be easy to read.
- Laptop: open More shapes (dock, grid icon); scroll to Tech logos; tiles show names, four per row; type "kafka" in the tray search; click a tile to insert.
- Tablet: nothing changed (both changes are desktop-only); confirm the Insert tray logo grid looks as before.

## 4. Held back for next run
- Dark chrome variant for Chalkboard/Dark (menu, dock, pills stay white cards). Still waiting on the owner decision below.
- From round 6/7: drag-to-connect circles, shorter right-click menu with "More", options panel covering the first drawing spot, dock captions, Export preview.

## 5. Owner decisions
- Should the floating chrome turn dark on Chalkboard and Dark boards, or stay as light cards? Current default: light cards (they read well and keep one look).

## Checks run
- npm test: 1944 pass, 0 fail. npm run build: passed.
- Headless desktop walk at 1440x900 (Clean, Chalkboard, More shapes tray): no console errors.
