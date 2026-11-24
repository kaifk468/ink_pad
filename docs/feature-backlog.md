# InkPad feature backlog

The memory between autonomous feature rounds. Every idea has a status: **done** (round and commit), **in progress** (next round finishes it first), **skipped** (and why), or **idea**. Never rebuild a done item; prefer items that extend earlier rounds.

Users: developers drawing HLD/LLD diagrams for study, design and interviews, on a Galaxy Tab with an S Pen and on a laptop with mouse and keyboard.

Earlier work (before this file): desktop 20x round 2026-11-19 (docs/desktop-20x-plan.md: shortcut help, zoom keys, line style, arrowheads, layer order, align/distribute, sticky arrows, Ctrl+Arrow quick create, type inside shapes, copy as PNG, export selection, lock, right-click menu).

## Round 1 — 2026-11-24 (branch desktop-20x)

### User journeys walked (friction found)
1. Open the app, find a diagram: library has search and stars, but no "recently opened" row; renaming a diagram is only possible from inside it; folder actions (create, rename, move, delete) give no confirmation that they happened; nested folders show no path.
2. Start a new diagram: an empty sheet gives no hint of what to do (which keys, double-click to type, how to pan on the tablet).
3. Draw boxes, label, connect: tool keys are letters only and are hidden in tooltips; HLD only has Database, Queue, Service, so users, browsers, caches, load balancers and CDNs are drawn by hand; arrows cannot carry a label ("REST", "publishes"), so a free text label is placed near the arrow and is left behind when things move.
4. Rearrange as it grows: a connector attached to the wrong side or box can only be deleted and redrawn; boxes with their labels cannot be grouped; resizing a box leaves its labels where they were; duplicating while dragging needs Ctrl+D then a drag.
5. Restyle: making ten boxes look like one other box means setting colour, fill, width and dash on each.
6. Tablet and laptop: the same diagram must keep working on both; pen writing and pinch/pan are not touched.

### Candidates (problem · who/how often · benefit · risk · size · decision)
| # | Idea | User problem | Who / how often | Benefit | Risk | Size | Decision |
|---|---|---|---|---|---|---|---|
| 1 | Connector endpoint handles | Re-attaching a connector to another side/box means delete and redraw | everyone, every diagram | high | medium (select pointer paths) | M | **done** 3072e34 (+fixes cc30931) |
| 2 | Shortcut badges on dock + number keys 1-0 | Tool keys are invisible; reaching tools needs the mouse | desktop, constantly | medium-high | low | S | **done** 6fb6829 |
| 3 | Library: recent row, rename card, breadcrumb, feedback, empty-folder CTA, `/` search, Ctrl+O | Finding and organising diagrams is slow and silent | everyone, daily | high | low | M | **done** 4290fc5 (+fixes 9938789, 1759f05) |
| 4 | Labels on connectors | Arrow labels drift away when boxes move | HLD users, every diagram | high | medium (new field, editor) | M | **done** 91b9216 |
| 5 | HLD icon shapes (user, browser, mobile, cache, load balancer, CDN) | Common HLD parts must be hand drawn | HLD users, every diagram | high | low-medium (new hldShape values) | M | **done** 9861515 (+tap size fix cc30931) |
| 6 | Group / ungroup (Ctrl+G) | A box + its labels/icons can't move as one unit | growing diagrams, often | high | high (all selection paths, paste) | L | **done** 1cee701 (+click/pen fix cc30931) |
| 7 | Empty-canvas hint | New users don't know keys/gestures | first use, each new diagram | medium | low | S | **done** 1432e3a |
| 8 | Copy / paste style | Restyling many items is repetitive | desktop, often | medium | low | S | **done** 39ae82b |
| 9 | Labels inside a box follow its resize | Resizing leaves labels outside the box | everyone, often | medium | medium | S-M | **done** ff47d04 |
| 10 | Ctrl+drag duplicates | Duplicating then moving is two steps | desktop, often | medium | low-medium | S | **done** 1b96306 |
| 11 | Alt+drag duplicate (Excalidraw) | same as 10 | | | Alt already = no snapping / look through code | | skipped: would rework round 2026-11-19 Alt meaning; Ctrl+drag instead |
| 12 | Elbow bend handle (drag the middle segment) | Elbow paths can't be adjusted | LLD users | medium | medium (new saved bend field) | M | idea (this round: middle dot toggles straight/elbow) |
| 13 | Command palette Ctrl+K | Commands hidden in menus | power users | medium | low | M | idea |
| 14 | Duplicate a diagram from the library | Reusing an interview template | sometimes | medium | medium (store, Drive) | M | idea |
| 15 | Drag diagrams onto folders | Move dialog is a detour | sometimes | low-medium | medium (touch DnD) | M | idea |
| 16 | Eyedropper | match a colour | sometimes | low | low | S | idea (copy/paste style covers most) |
| 17 | Scribble-to-erase pen gesture | erase without switching tools | tablet, often | medium | high (writing path) | M | skipped: touches the pen writing path; needs device testing |
| 18 | Shape recognition on desktop | | rare on desktop | low | low | S | skipped: desktop has direct shape tools |
| 19 | Diagram starter templates (client-server-db) | Interview warm-up | sometimes | medium | low | M | idea |
| 20 | Snap target highlight while drawing connectors | Unsure where the end attaches | everyone | medium | low | S | **done** (part of 1) |
| 21 | Frames / sections | large diagrams | sometimes | medium | high | L | idea |
| 22 | Sticky notes | brainstorming | sometimes | low-medium | low | S | idea |
| 23 | Text bound inside shapes as one object | label is a separate item | everyone | medium | high (format) | L | idea (9 covers resize) |
| 24 | Move folders into other folders | restructure | rare | low | medium (Drive) | M | idea |
| 25 | Pinned/collapsible folder tree | many folders | rare | low | low | S | idea |
| 26 | Mermaid / PlantUML import | text-first users | rare | medium | medium | L | idea |
| 27 | Keyboard focus ring cycling with Tab | accessibility | rare | low | low | S | idea |

### Acceptance criteria (picked items)
1. **Connector endpoint handles**: with the Select tool, the user selects a connector and sees a round dot on each end and a small dot in the middle. Dragging an end dot moves that end; the box under the pointer is highlighted and the end snaps to its outline (attached, follows the box afterwards); dropping on empty canvas leaves the end free (detached). Clicking the middle dot switches straight / elbow. Each change is one undo step; Esc during a drag cancels. Works with mouse, pen and touch; drawing and pinch/pan unchanged.
2. **Shortcut badges / number keys**: in Desktop mode each dock tool button shows a small key hint in its corner and its tooltip says "Rectangle — R or 2". Keys 1 Select, 2 Rectangle, 3 Diamond, 4 Ellipse, 5 Arrow, 6 Line, 7 Pen, 8 Text, 9 Connector, 0 Eraser switch tools; the `?` help lists them. Tablet dock unchanged.
3. **Library**: the user sees a "Recent" row of the last opened/edited diagrams at the top of All diagrams; can rename a diagram from its card; sees the folder path (Parent › Child) as the heading; gets a short confirmation after creating, renaming, moving and deleting; an empty folder offers "New diagram here"; `/` focuses search; Ctrl+O on the desktop canvas opens the library.
4. **Connector labels**: the user double-clicks a connector (or presses Enter / uses "Add label" in the panel) and types; the label sits in the middle of the connector with a gap in the line, moves with it, is saved, exported (SVG/PNG) and undoable in one step; empty text removes the label.
5. **HLD icons**: the user can add User, Browser, Mobile, Cache, Load balancer and CDN shapes (desktop dock "More shapes" popover and tablet Insert tray); each behaves like Database/Queue/Service (write or type inside, connect, resize, export).
6. **Group**: the user selects several items, presses Ctrl+G (or panel/menu "Group"); clicking any member then selects the whole group; moving, deleting, copying and pasting act on the group; Ctrl+Shift+G ungroups. One undo step each.
7. **Empty hint**: on an empty page a faint hint shows what to do (desktop: tools/keys, double-click to type, `?`; tablet: write with the pen, two fingers zoom, three fingers pan); it disappears on the first item and never blocks input.
8. **Copy / paste style**: Ctrl+Alt+C on a selected item copies its style; Ctrl+Alt+V applies colour, fill, width, line style, arrowheads, font to the selection (only what each item can take). Also in the right-click menu. One undo step; toast confirms.
9. **Labels follow resize**: resizing a box with its handles keeps the labels that were inside it inside, at the same relative position. One undo step with the resize.
10. **Ctrl+drag duplicate**: holding Ctrl while starting to drag a selection (desktop mouse) leaves the original and drags a copy; one undo step; connectors between copied boxes are copied too.

### Round 1 result (2026-11-24)
All 10 picked items built, reviewed (independent Opus review: 11 defects, all fixed) and walked through in headless Chromium (desktop 1440x900 / 1024x700 / 1024x600, tablet 1280x800 with touch+pen emulation). Details and manual checklist: project-context.md, 2026-11-24 entry.

Follow-ups found this round (ideas for the next round):
- Elbow bend handle (#12): drag the middle segment of an elbow connector (needs a saved bend offset).
- Connector label overlaps the middle dot on diagonal connectors; consider offsetting the dot or hiding it under a label.
- Labels inside a box are not refitted after the box is resized smaller (text can spill out of a tiny box).
- Pen/touch tablet: labels inside boxes do not follow drag/resize (desktop-mouse only, same as earlier rounds' drag carry).
- Tablet tap on a group member selects the group, but the tablet has no Group/Ungroup control yet (desktop keys/menu/panel only).
- Older InkPad builds drop connector `label`, `group` and the new HLD shapes on save: keep the tablet PWA updated before mixed use.
- Rename of a not-opened diagram refuses when the file has damaged items or unknown top-level fields (safe, but the user must open it first).

## Round 2 — 2026-11-24 (branch desktop-20x)

### User journeys walked (friction found, on top of round 1)
1. Open the app and find a diagram: the Library is only sorted by last edit; there is no way to start from a copy of an existing diagram (interview template, last week's design) without exporting and importing.
2. Start a new diagram: every diagram starts blank; the common interview skeletons (client → LB → service → cache/DB, a queue-based pipeline, a class diagram, a requirements/API/HLD board) are drawn by hand every time.
3. Draw boxes, label, connect: arrows end anywhere on a side, so lines that should be straight and centred end up slightly off; adding the next box needs Ctrl+Arrow, which nobody discovers; there is no quick "note" for requirements or assumptions.
4. Rearrange as it grows: an elbow connector's middle segment cannot be moved, so two elbows overlap or run through a label; the connector label hides the middle dot; shrinking a box leaves the text inside spilling out; finding "Redis" in a 40-box diagram means panning around; restyling all connectors means clicking each.
5. Desktop power use: commands live in menus, panels and the ? list, but there is no single place to type a command name.
6. Tablet: the Group / Ungroup buttons are desktop-only although tablet taps already select whole groups.

### Candidates (problem · who/how often · benefit · risk · size · decision)
| # | Idea | User problem | Who / how often | Benefit | Risk | Size | Decision |
|---|---|---|---|---|---|---|---|
| 28 | Command palette (Ctrl+K) | Commands hidden in menus; shortcuts must be memorised | desktop, daily | high | low (overlay, reuses key commands) | M | **done** a21f2ae |
| 29 | Find on canvas (Ctrl+F) | Finding a label in a big diagram means panning | everyone with big diagrams | high | low (pure search + zoom) | M | **done** 4ee0328 |
| 30 | Diagram templates (insert a starter layout) | Same skeleton drawn every interview | HLD/LLD users, every new diagram | high | low (plain items via paste path) | M | **done** 577af9a (+fit 17233f5) (was #19) |
| 31 | Sticky note (N) | No quick note for requirements/assumptions | everyone, often | medium | low (filled rectangle + label, no new kind) | S | **done** c91eac2 (was #22) |
| 32 | Elbow bend handle | Elbow middle segment cannot be moved; overlapping elbows | LLD users, often | medium-high | medium (new saved field) | M | **done** 819d1c6 (+relative drag 0d77109) (was #12, + label/middle-dot overlap follow-up) |
| 33 | Connectors snap to side midpoints + anchor dots | Arrow ends slightly off-centre, crooked lines | everyone, every connector | high | low-medium (snap behaviour, tablet too) | S | **done** 590f9a3 |
| 34 | Quick-connect buttons around a selected shape | Ctrl+Arrow is undiscoverable | desktop, every diagram | high | medium (select pointer path) | M | **done** b1228d3 (+fixes 9aec479) |
| 35 | Library: Make a copy | Reusing a diagram needs export+import | sometimes, interview prep | medium-high | medium (store/Drive create) | M | **done** 987fdd8 (+fixes 84fdb92) (was #14) |
| 36 | Library: sort by edited / name / created | Only "last edited" order | many diagrams | medium | low | S | **done** da33588 |
| 37 | Select similar (right-click) | Restyling all connectors/boxes means clicking each | desktop, often | medium | low | S | **done** 5695ab6 |
| 38 | Tablet Group / Ungroup buttons | Groups can't be made on the tablet | tablet, sometimes | medium | low | S | **done** f760e46 (round 1 follow-up) |
| 39 | Refit text after a box shrinks | Text spills out of a box made smaller | everyone, often | medium | medium (resize path) | S-M | **done** bf258c7 (+shrink-only 0d77109) (round 1 follow-up) |
| 40 | Recent colours in the colour picker | — | | | | | skipped: already built (ColorPicker recent row) |
| 41 | Laser pointer for interviews (fading trail, not saved) | Pointing at parts while screen sharing | interviews | medium | low-medium (new tool, overlay) | M | idea (next round) |
| 42 | Undo toast naming the action ("Undid: Move") | Unsure what undo did | everyone | low-medium | high (every history call site) | M | skipped: touches every saveHistory site |
| 43 | Drag diagram cards onto folders | Move dialog is a detour | sometimes | low-medium | medium (touch DnD) | M | idea (#15) |
| 44 | Move folders into folders | restructure | rare | low | medium (Drive) | M | idea (#24) |
| 45 | Shape search inside More shapes | many shapes | rare today (12 shapes) | low | low | S | idea |
| 46 | Flow step numbers on connectors (1, 2, 3) | request-flow order | HLD, sometimes | medium | medium (format) | M | idea (labels can say "1") |
| 47 | Frames / sections | large boards | sometimes | medium | high | L | idea (#21) |
| 48 | Scribble-to-erase | tablet | | | high (writing path) | | skipped again (#17) |
| 49 | Mermaid import | text-first users | rare | medium | medium | L | idea (#26) |
| 50 | Floating mini toolbar near selection | panel is far from the item | desktop | medium | high (layout) | L | idea |
| 51 | Font size keys (Ctrl+Shift+< / >) | resizing text needs the panel | desktop | low-medium | low | S | idea |
| 52 | Swap the two ends of a connector (reverse) for all kinds | — | | | | | skipped: reverse exists for UML kinds; arrowheads cover plain arrows |
| 53 | Template from the current diagram ("save as template") | own skeletons | sometimes | medium | medium (storage) | M | idea (Make a copy covers most) |
| 54 | Hover quick preview of a diagram in the Library | which one is it | rare | low | low | S | skipped: cards already show thumbnails |

### Acceptance criteria (picked items)
28. **Command palette**: in Desktop mode Ctrl+K (Cmd+K) opens a centred box with a search field; the user types part of a name ("zoom", "group", "redis", "export") and sees matching commands with their shortcut on the right; arrow keys move, Enter runs, Esc or a click outside closes. It lists every keyboard command from the ? table plus tools, HLD shapes, templates, Find, export and library actions. Listed in the ? help. Tablet unchanged.
29. **Find**: Ctrl+F (desktop) or "Find" in the More menu (both modes) opens a small find bar; typing shows "2 of 5"; Enter / Shift+Enter (or the arrows) go to the next/previous match on any page: the page is switched, the view centres on it and the item is selected. Text labels, connector labels, class boxes (name, attributes, methods) and code blocks are searched, case-insensitive. Esc closes. The browser's own find bar does not open.
30. **Templates**: "Insert template" (More menu, command palette, and a button on the empty-page hint) offers Client–server–DB, Cache + queue microservice, Class diagram and Interview board; choosing one places the items in the middle of the view, selected, as one undo step; they are ordinary boxes, labels and connectors (connectors attached) that the user edits normally.
31. **Sticky note**: N (desktop), the More shapes popover and the tablet Insert tray add a yellow note (filled box) at the pointer / view centre; on desktop the text editor opens inside it at once. One undo step. Saved as an ordinary filled rectangle with a label (no new kind).
32. **Elbow bend**: with an elbow connector selected, dragging its middle dot moves the middle segment sideways (it stays moved when a box is moved, as an offset); a click still toggles straight/elbow; double-click on the middle dot or the label opens the label. One undo step, Esc cancels. A connector label no longer covers the middle dot (the dot sits just beside the label). Saved as an additive `bend` number on elbow connectors; old files unchanged.
33. **Midpoint snap**: drawing a connector or dragging its end near the middle of a box side snaps exactly to that midpoint; while the end is over a box its four side midpoints show as small dots. Works for pen, touch and mouse. Existing connectors are not moved.
34. **Quick-connect**: in Desktop Select mode, with one plain or HLD box selected, four small arrow buttons appear just outside its sides; hovering one shows a hint, clicking it creates a connected copy in that direction exactly like Ctrl+Arrow (one undo step). They don't appear on the tablet, while dragging, or for locked items.
35. **Make a copy**: each Library card has "Make a copy"; the user gets "<title> (copy)" in the same folder with all pages and items, a toast, and the original untouched (works for local, device-folder and Drive storage).
36. **Sort**: the Library has a Sort control (Last edited, Name, Created); the choice is remembered on the device.
37. **Select similar**: right-click an item → "Select similar" selects every unlocked item on the page of the same kind (all connectors; all rectangles of that shape; all labels; all pen strokes). One click, no undo entry.
38. **Tablet group**: on the tablet, selecting several items with the lasso shows Group / Ungroup buttons in the selection panel; they work as on desktop (one undo step).
39. **Refit after shrink**: resizing a box smaller (desktop) makes a wrapped/auto-fitted label inside it rewrap or shrink so it stays inside the box; making it bigger again doesn't blow the text up beyond its chosen size. Same undo step as the resize.

### Round 2 result (2026-11-24)
All 12 picked items built (#28-#39), plus an independent Opus review (9 findings, all fixed in 84fdb92 / 0d77109; three were data-safety fixes, one of them pre-existing: device-folder rename could drop unknown/damaged data because the lossy-file guard never fired for device files) and a second Opus pass over the fixes and quick-connect (1 defect + 3 minor, fixed in 9aec479). Headless walk found the oversized template (fixed 17233f5). Details and checklist: project-context.md, 2026-11-24 round 2 entry.

Follow-ups found this round (ideas for the next round):
- Laser pointer for interviews (#41) — not started.
- Template labels are placed with estimated text widths; HLD templates are large (the view zooms out to fit). Consider smaller default HLD template sizes.
- Elbow bend: a bend pushed through the end box snaps back to the default route instead of clamping; a bend only applies to Z-shaped routes.
- Find count is cached on page-array identity + length; an in-place edit keeping both could show a stale count until the next query.
- Library copy toast names "X (copy)" even when a device folder numbers the file "X (copy) (2)".
- Tablet lasso does not expand to whole groups (tap does).
- Select similar has no shortcut; consider adding it to the command palette list explicitly (it is reachable only via right-click).
- Older builds drop connector `bend` on save (like round-1 fields): keep the tablet PWA updated.

## Round 3 — 2026-11-24 (branch desktop-20x)

### User journeys walked (friction found, on top of rounds 1-2)
1. Open the app and find a diagram: deleting a diagram or folder is instant and permanent ("cannot be undone"), so one wrong click loses work; moving a diagram into a folder always goes through the Move dialog, even with a mouse; a "Make a copy" into a device folder can name the toast wrongly.
2. Start a new diagram: templates exist, but the HLD templates are large and the view zooms out to fit.
3. Draw boxes, label, connect: after each rectangle/diamond/ellipse the tool falls back to Select, so drawing five service boxes means pressing R five times; a box drawn as a rectangle that should be a Database/Cache must be deleted and redrawn (losing its label position and connectors); text size changes need the panel.
4. Rearrange and grow: a design that evolves (v1 → v2 → scaled) is drawn again on a new page instead of starting from a copy of the current page; on the tablet a lasso catches half a group.
5. Interviews and screen sharing: there is no way to point at a part of the diagram without drawing on it, and the toolbars take space on a shared screen.
6. Export for notes (NotebookLM): only pictures (PNG/SVG/PDF) leave the app; NotebookLM and plain notes work far better with text (components, connections, labels, class members).
7. Desktop power use: "Select similar" is only reachable by right-click; the find count can go stale after an in-place edit.

### Candidates (problem · who/how often · benefit · risk · size · decision)
| # | Idea | User problem | Who / how often | Benefit | Risk | Size | Decision |
|---|---|---|---|---|---|---|---|
| 55 | Library: Undo after delete | A wrong delete click loses a diagram or folder for good | everyone, occasionally (high cost) | high (data safety) | low-medium (deferred delete) | S-M | **done** 4b56094 (+fixes baab0f2) |
| 56 | Tool lock (Q / dock lock button) | Drawing several boxes means re-picking the tool each time | everyone, every diagram | high | low-medium (shape finish path) | S | **done** 4f407ed (+cf84484: "Keep tool" pin) |
| 57 | Laser pointer (X, More menu, tablet More tray) (was #41) | Can't point at parts while presenting without drawing | interviews, weekly | high for interviews | medium (new pointer branch, overlay) | M | **done** e3b9e90 (+palm fix dbffcf3) |
| 58 | Hide toolbars / present mode (Alt+Z) | UI chrome takes space when screen sharing | interviews | medium | low | S | **done** 6e1c693 (+dbffcf3) |
| 59 | Duplicate page | Evolving a design (v1 → v2) means redrawing on a new page | HLD users, often | high | low-medium (id remap) | S-M | **done** 28518ad (+dbffcf3) |
| 60 | Change shape (rectangle ↔ diamond ↔ ellipse; HLD shape ↔ HLD shape) | Wrong shape must be deleted and redrawn, losing connectors | everyone, often | medium-high | medium (shape flags) | M | **done** 65be2df (+dbffcf3, cf84484) |
| 61 | Text outline export (Markdown, copy or download) | NotebookLM/notes get only pictures, no searchable text | NotebookLM users, every study diagram | high | low (pure module) | M | **done** a33c337 (+dbffcf3) |
| 62 | Drag diagram cards onto folders (desktop mouse) (was #43/#15) | Move dialog is a detour | desktop, often while organising | medium | medium (DnD, mouse only) | M | **done** 5070c55 |
| 63 | Font size keys Ctrl+Shift+. / Ctrl+Shift+, (was #51) | Text size needs the panel | desktop, often | medium | low | S | **done** 608e062 (+boxes dbffcf3) |
| 64 | Tablet lasso expands to whole groups (round 2 follow-up) | Lasso catches half a group on the tablet | tablet, sometimes | medium | low (selection only) | S | already done in round 1 (1cee701); stale item |
| 65 | Round 2 follow-ups: Select similar in the palette, find count refresh, exact copy toast name, smaller HLD template sizes | small paper cuts | | low-medium | low | S | **done** a7ab0ea, a33c337, 25602f6 |
| 66 | Hover outline in Desktop Select (what a click will pick) | thin connectors and groups are hard to predict | desktop | medium | medium (redraw per mouse move, perf) | S-M | idea (needs a cheap overlay first) |
| 67 | Page names / page overview grid | many pages are just "3 / 7" | sometimes | medium | medium (format field) | M | idea |
| 68 | Number connectors 1..n (flow steps) via labels | request order | HLD, sometimes | low-medium | low | S | idea (labels already do it by hand) |
| 69 | Elbow bend clamps instead of snapping back | — | LLD | low | medium | S | idea (round 2 follow-up) |
| 70 | Tablet long-press opens the right-click menu | tablet lacks Select similar, copy style, lock | tablet | medium | high (touch pan/pinch timing) | M | skipped: risks touch navigation; needs device testing |
| 71 | Eyedropper (was #16) | — | | low | | S | skipped again: copy/paste style covers it |
| 72 | Save the current diagram as a template (was #53) | own skeletons | sometimes | medium | medium (storage) | M | idea (Make a copy covers most) |
| 73 | Library content search (labels inside diagrams) | find "the one with Kafka" | sometimes | medium | high (loads every file, Drive) | L | idea |
| 74 | Library multi-select (bulk move/delete) | reorganising many diagrams | rare | low-medium | medium | M | idea |
| 75 | Frames / sections (was #21/#47) | large boards | sometimes | medium | high | L | idea |
| 76 | Mermaid import (was #26/#49) | text-first users | rare | medium | medium | L | idea |
| 77 | Curved connectors | nicer arrows | sometimes | low-medium | medium (format, routing) | M | idea |
| 78 | Scribble-to-erase (was #17/#48) | tablet | | | high (writing path) | | skipped again |
| 79 | Undo toast naming the action (was #42) | | | | high | | skipped again |
| 80 | Export PNG scale choice (1x/2x/3x) | sharper slides | rare | low | low | S | idea (export is already 2x) |
| 81 | Move folders into folders (was #24/#44) | restructure | rare | low | medium (Drive) | M | idea |

### Acceptance criteria (picked items)
55. **Undo delete in the Library**: after confirming Delete on a diagram card or a folder, the item disappears at once and a toast says "Deleted “X”" with an **Undo** button for about 8 s; Undo brings it back exactly as it was (nothing was removed from storage); when the toast ends (or another delete starts) the delete really happens. Closing the tab during the toast keeps the item (it is never half-deleted). Works for browser, device-folder and Drive storage (the store call is unchanged, only delayed).
56. **Tool lock**: a lock button at the end of the dock (both modes, tooltip "Keep the tool after drawing (Q)") and the Q key (desktop) toggle it; while on, drawing a rectangle/diamond/ellipse/arrow/line keeps that tool active for the next one (the new shape is still created normally, one undo step each); off (default) behaves exactly as before. Remembered on the device. Pen writing is unaffected.
57. **Laser pointer**: X (desktop), the command palette and the More menu/tray (both modes) pick the laser; moving the mouse with the button down, or the pen/one finger, draws a short red glowing trail that fades within about a second; nothing is saved, no undo entry, no item is selected or moved. Two-finger pinch and three-finger pan still work; Esc or picking another tool leaves it.
58. **Hide toolbars**: Alt+Z (desktop), the command palette and the More menu toggle a clean view: dock, panels, top bar, minimap and page controls hide; a small "Show toolbars" pill in a corner brings them back (and Alt+Z / Esc). Drawing, zoom and pan keep working; the laser works in it.
59. **Duplicate page**: a "Duplicate page" button in the page controls (and the More menu / command palette) inserts a copy of the current page right after it and switches to it; all items, labels, connectors (still attached) and groups are copied with new ids; the original is unchanged; the copy can be deleted with the usual page delete (with its Undo bar).
60. **Change shape**: right-clicking a plain rectangle/diamond/ellipse shows "Change shape → Rectangle / Diamond / Ellipse"; for an HLD box, the other HLD shapes. The box keeps its position, size, colour, fill, label and connectors (re-routed to the new outline). One undo step. Several selected boxes of one family change together. The desktop panel shows the same choice as small buttons.
61. **Text outline**: Export menu → "Copy as text outline" and "Download outline (.md)" produce Markdown: the diagram title, one section per page, the boxes with their labels (and HLD kind, e.g. "Redis (cache)"), connections as "A → B: label", free text notes, class boxes with attributes and methods, and code blocks fenced with their language. Ink handwriting is listed as "(handwriting)" count only. A toast confirms copy.
62. **Drag to folder**: on the desktop with a mouse, dragging a diagram card onto a folder in the folder list (or the "All diagrams"/root entry) moves it there; the folder highlights while hovered; a toast confirms ("Moved “X” to Y"). Touch/pen Library is unchanged (Move dialog).
63. **Font size keys**: with text, a label, a shape with a label or a connector label selected, Ctrl+Shift+. makes the text one step larger and Ctrl+Shift+, one step smaller (same steps as the panel); one undo step per press; listed in ? help and the palette.
64. **Tablet lasso groups**: on the tablet, a lasso that catches any member of a group selects the whole group (as a tap already does); Group/Ungroup buttons show as before.
65. **Follow-ups**: "Select similar" appears in the command palette (acts on the selected item); the Find count updates after editing a label in place; the "Make a copy" toast names the real new title; the HLD templates use smaller default sizes so they fit at a readable zoom.

### Round 3 result (2026-11-24)
10 picked items built (#55-#63, #65); #64 was already done in round 1. Independent Opus review: 13 defects, all fixed (baab0f2, dbffcf3). Headless walk fixes in cf84484. Details and checklist: project-context.md, 2026-11-24 round 3 entry.

Follow-ups found this round (ideas for the next round):
- Leaving the laser returns to Pen instead of the previous tool.
- The HLD right-click menu shows 8 "Change shape" rows; consider a submenu or a compact chip row.
- Connector labels have no font size (needs an additive `labelFontSize` field) — font keys skip them.
- Outline: ink inside HLD boxes is not counted; the panel's outline buttons are disabled when the current page is empty even if other pages have content.
- Laser shows no active state in the dock (only in the More tray).
- Hover outline in Desktop Select (#66), page names/overview (#67), elbow bend clamp (#69) remain ideas.

## Round 4 — 2026-11-24 (branch desktop-20x)

### User journeys walked (friction found, on top of rounds 1-3)
1. Open the app and find a diagram: on the desktop, switching to another diagram always goes through the Library (Ctrl+O, scroll, click), even when the user knows its name.
2. Start a new diagram: the four built-in templates are generic; the user's own skeleton (their interview board, their usual client → gateway → services layout) must be copied from an old diagram.
3. Draw boxes, label, connect: a two-line label inside a box ("Order\nService") is drawn left-aligned and looks ragged; connector labels have one fixed size, so "publishes" on a big HLD reads tiny and the font keys skip them; request-flow order (1, 2, 3 …) is typed into each connector label by hand.
4. Rearrange and restyle: the HLD right-click menu lists 8 "Change shape" rows, so the menu is tall and scrolls; on the tablet there is no Change shape, Select similar or copy/paste style (desktop right-click only).
5. Pages: a diagram with v1/v2/v3 pages (round 3 Duplicate page) is navigated with up/down arrows and "2 / 5"; pages cannot be reordered; there is no overview of what is on which page.
6. Presenting: after using the laser the tool falls back to Pen instead of the tool used before; the dock shows no laser state.
7. NotebookLM export: handwriting inside HLD boxes is not counted; the outline buttons are disabled when the current page is empty although other pages have content.

### Candidates (problem · who/how often · benefit · risk · size · decision)
| # | Idea | User problem | Who / how often | Benefit | Risk | Size | Decision |
|---|---|---|---|---|---|---|---|
| 82 | Laser returns to the previous tool + dock laser state (round 3 follow-up) | After pointing, the user is dropped into Pen and must re-pick the tool | interviews, every use of the laser | medium | low | S | picked |
| 83 | Connector label font size (`labelFontSize`, additive) + font keys + panel sizes (round 3 follow-up) | Arrow labels are fixed-size: tiny on large HLDs, font keys skip them | HLD users, every diagram with labels | medium-high | medium (new saved field) | M | picked |
| 84 | Compact "Change shape" row in the right-click menu (round 3 follow-up) | 8 rows make the HLD menu tall and scroll | desktop, often | medium | low | S | picked |
| 85 | Outline follow-ups: count ink in HLD boxes, buttons enabled when any page has content | NotebookLM outline misses handwriting; buttons look broken on an empty page | NotebookLM users | low-medium | low | S | picked |
| 86 | Number flow steps on connectors (#68) | Request-flow order is typed into every arrow label by hand | HLD users, interviews | medium-high | low (labels only) | S-M | picked |
| 87 | My templates: save the selection as a template, insert it from the chooser (#72/#53) | Own skeletons must be copied from old diagrams | interview prep, weekly | high | low-medium (local storage size) | M | picked |
| 88 | Page overview: thumbnails of every page, jump, move a page earlier/later (#67 without names) | Many pages are just "2 / 5"; pages cannot be reordered | multi-page users, often | medium-high | medium (page undo history) | M | picked |
| 89 | Open a diagram from the command palette by name | Switching diagrams always goes through the Library | desktop, daily | medium-high | low | S-M | picked |
| 90 | Tablet selection panel: Change shape, Select similar, Copy/Paste style | These are desktop right-click only | tablet, often | medium | low (buttons only, no new gestures) | S-M | picked (instead of long-press #70) |
| 91 | Text alignment (left / centre / right) for text labels; new labels typed inside a shape are centred | Multi-line labels in boxes look ragged | everyone, every multi-line label | medium-high | medium (new saved field `align`) | M | picked |
| 92 | Hover outline in Desktop Select (#66) | — | | | | | already built (ac80e0d "hover outline"); stale item |
| 93 | Elbow bend clamps instead of snapping back (#69) | bend pushed through the end box resets | LLD, rare | low | medium | S | idea |
| 94 | Page names (needs a page-level saved field) | pages have no titles | sometimes | medium | medium (document keys) | M | idea (overview first) |
| 95 | Curved connectors (#77) | nicer arrows | sometimes | low-medium | medium-high (routing, hit test, export) | M-L | idea |
| 96 | Library multi-select (#74) | bulk move/delete | rare | low-medium | medium (pending delete) | M | idea |
| 97 | Move folders into folders (#81) | restructure | rare | low | medium (Drive) | M | idea |
| 98 | Shape search inside More shapes (#45) | many shapes | rare (12 shapes) | low | low | S | idea |
| 99 | Connector label drag along the path | label covers a box | sometimes | low-medium | medium (format) | M | idea |
| 100 | Mermaid / text-to-diagram import (#76) | text-first users | rare | medium | medium | L | idea |
| 101 | Frames / sections (#75) | large boards | sometimes | medium | high | L | idea |
| 102 | Alt+Arrow selects the connected neighbour | keyboard-only walking | rare | low | low | S | idea |
| 103 | Paste a list of lines as stacked boxes | quick component list | sometimes | medium | low-medium | M | idea |
| 104 | Library content search (#73) | find by label | sometimes | medium | high (loads every file) | L | idea |
| 105 | Tablet long-press menu (#70) | | | | high (touch timing) | | skipped again: #90 gives the same commands without touching gestures |
| 106 | Scribble-to-erase (#17/#48/#78) | | | | high (writing path) | | skipped again |
| 107 | Undo toast naming the action (#42/#79) | | | | high | | skipped again |
| 108 | Eyedropper (#16/#71) | | | | | | skipped again: copy/paste style covers it |

### Acceptance criteria (picked items)
82. **Laser back to the previous tool**: the user is on Rectangle (or any tool), presses X, points, presses X / Esc / picks Laser again → the Rectangle tool is active again (Pen only if Pen was active). While the laser is on, the dock's More button (desktop and tablet) shows an active state and its tooltip says "Laser pointer on (X)".
83. **Connector label size**: with a labelled connector selected, Ctrl+Shift+. / , (and the panel's text size buttons) make its label one step larger/smaller; the label stays centred on the path, gap and hit area follow; saved as `labelFontSize` (omitted at the default), exported to SVG/PNG/PDF, restored after reload; one undo step. Old files unchanged.
84. **Compact Change shape**: right-clicking a box shows one "Change shape" row holding small labelled chips (Rectangle / Diamond / Ellipse, or the HLD shapes) instead of one row per shape; the menu no longer scrolls on a 1024x700 screen; a click on a chip changes the shape as before.
85. **Outline**: handwriting inside HLD boxes is listed as "(handwriting)" for that box; the outline buttons are enabled whenever any page has items.
86. **Step numbers**: with connectors (or boxes and connectors) selected, right-click → "Number steps" (also in the command palette and the tablet panel) labels the selected connectors 1, 2, 3 … following the flow (from boxes nothing points into, then onwards; ties top-to-bottom, left-to-right); an existing label keeps its text after the number ("2. publishes"), old numbers are replaced; "Clear step numbers" removes them. One undo step each; toast "Numbered 5 steps".
87. **My templates**: with items selected, "Save selection as template…" (right-click menu, command palette, and the template chooser) asks for a name and stores the items on this device; the template chooser shows a "My templates" section where the user inserts one (exactly like built-in templates: centred, selected, one undo step) or deletes one (confirm). A toast confirms saving; too-large selections are refused with a clear message. Device-only (local storage), documented in the tooltip.
88. **Page overview**: a "Pages" button in the page controls (and More menu / palette "Page overview") opens a grid of page thumbnails with numbers; clicking one goes to that page; each tile has "Move earlier / Move later" buttons; Esc or a click outside closes. Moving a page keeps its items and its undo history; one-page diagrams show one tile. Works with mouse and touch.
89. **Open from the palette**: in Desktop mode the command palette lists "Open: <title>" for the other diagrams (most recently edited first, folder name as hint); Enter opens it (the current one is saved first, like the Library does).
90. **Tablet panel commands**: on the tablet, the selection panel shows the Change shape choices for boxes, a "Select similar" button for a single item, and Copy style / Paste style buttons; same behaviour and undo as on desktop. Pen writing, pinch and pan unchanged.
91. **Text alignment**: a text label (or the label inside a box) has Left / Centre / Right buttons in the panel (desktop and tablet); multi-line text lines are aligned inside the label box; a new label typed inside a shape (double-click / Enter / sticky note / quick create) is centred. Saved as `align` ('center' | 'right', omitted for left); renderer, sketchy, SVG/PNG/PDF export and the editor overlay honour it; old files unchanged (left).
