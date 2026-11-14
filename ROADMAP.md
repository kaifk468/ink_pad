# InkPad roadmap

Pending work, grouped and in priority order. Tablet first: the Galaxy Tab S9 FE+ with S Pen is the main target. Desktop mode is planned as a separate mode later.

Built status is taken from `project-context.md`. Items marked "verify" are built but not yet confirmed on the tablet or with a real Google account.

## 1. Next up

1. **Loading indicator when switching diagrams.** When a diagram is not in the browser copy yet, dim the canvas and show a small loading indicator until it appears. Cached diagrams keep switching instantly with no flicker.

## 2. Before sharing the app more widely

2. **Privacy policy page.** Google sign-in is limited to about 100 test users until this exists. Needed before others sign in.
3. **Verify on the tablet (verify).** Items built but not yet confirmed on the device:
   - Drive sign-in on the deployed site with a real Google account: refresh while signed in, close and reopen the browser, photo and initials on the avatar.
   - Diagram switching speed with Drive (cached and first open).
   - Erase cleanup: dense ink, then erase, then write (fixed on the laptop; confirmed by you).
   - Bottom dock, Insert tray, eraser popover and context panel placement.
   - UML class boxes and the UML toolbox (dragging, minimizing, restoring).
   - Hover erasing, whole-object rubbing, three-finger panning, minimap input.
   - Palm rejection while writing.

## 3. Diagram content

4. **HLD shapes: Database, Queue, Service.** These entries are shown as "soon" and disabled in the Insert tray. They need connector snapping like class boxes.
5. **HLD and LLD documents.** Planned after the HLD shapes.

## 4. Editing features

6. **Duplicate and delete.** Done on desktop (keys, right-click menu) and as Copy/Paste/Duplicate/Delete buttons (2026-11-13). Needs checking on the tablet.
7. **Copy and paste.** Done (2026-11-13), in-app clipboard only (not the system clipboard). Needs checking on the tablet.
8. **Box fill colour.** Fill rectangles and class boxes.
9. **Resize an existing text label's font.** Done (2026-11-13): a selected label has resize handles that scale the font; a fixed list of four fonts (Hand-drawn Excalifont default, Clean, Serif, Code) is chosen in the options panel (optional `fontFamily` field). SVG export falls back to a cursive font (not embedded yet).
10. **Hold-to-straighten for circles and ellipses.** Done (2026-11-11): a closed round stroke held at the end snaps to a perfect circle or an upright oval; tilt is not kept yet. Needs checking with the S Pen.

## 5. Organising diagrams

11. **Move a folder into another folder.** Diagrams can be moved; folders cannot yet.
12. **Real search** across diagram titles (and possibly text labels).

## 6. Pages

13. **Multiple sheets per diagram and page sizes.** A later batch; the current sheet is a fixed 2500 × 1500 canvas.

## 7. Export

14. **PDF export.**
15. **Mermaid and PlantUML export.**
16. **Sketch-to-object recognition.** Turn a rough drawing into a clean shape. Lines, rectangles, ovals, circles and arrows are recognized today.

## 8. Polish and tools

17. **Pinch and pan polish.** Pinch and pan use a saved picture while moving and redraw sharply when they stop; it can look soft mid-gesture.
18. **Dotted template frame spikes.** The last tablet capture showed two long frames on the dotted template. Recheck after the next capture.
19. **One-button pen replay test.** A developer tool that replays a recorded pen session, to compare builds the same way every time. Discussed but not built.
20. **Link the avatar to Storage.** Done (tapping it opens the Storage panel); listed here only for completeness.

## 9. Google Drive, later

21. **Real refresh token.** Only needed if the quiet sign-in does not hold up on the tablet. It requires a small backend (for example a Cloudflare Worker) that keeps the token safely.
22. **Drive sync beyond app data, and GitHub storage.** Planned after local storage and Drive are stable.

## 10. Desktop mode (in progress, 2026-11-14)

23. **Mode switch: tablet or desktop.** Done: per-device setting in the menu, default Tablet. Tablet behaviour is unchanged.
24. **Mouse and trackpad input** in desktop mode. Done: mouse drives every tool, wheel/trackpad pan and Ctrl+wheel zoom, Space and middle-button pan, hover, click-select, edge-only select for boxes you write in, Shift+click, marquee, group drag, nudge, snapping and guides, right-click menu, double-click and Enter to edit.
25. **Keyboard shortcuts and an Excalidraw-like toolbar.** Done: tool keys (P V E T L C B and R D O A I for shapes), Delete, Ctrl+A/Z/Y/C/X/V/D; desktop dock with one-click Text, Rectangle, Diamond, Ellipse, Arrow, Line, Database, Queue, Service; left options panel for the active tool (pen, shapes, text, eraser, selection); full colour picker and recolouring of a selected object.
26. **Rotation.** Done: text labels and plain shapes (rectangle, diamond, ellipse) rotate with an Excalidraw-style handle above the item; "Align to line" and Reset in the panel. HLD shapes and class boxes do not rotate yet.
27. **Still open for desktop:** the canvas feels small next to the tablet (lower opening zoom, fit-width key, smaller defaults, slimmer toolbar: waiting on the user); change the stroke width of an existing selection; hide tablet-only controls (zoom lock); embed Excalifont in SVG export; Alt-drag duplicate; everything above is untested on a real mouse and on the tablet (see the checklists in project-context.md).

Mouse and keyboard behaviour was verified in code, unit tests and scripted Chromium runs only, never with real hardware.
