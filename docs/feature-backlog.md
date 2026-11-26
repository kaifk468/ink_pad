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
| 82 | Laser returns to the previous tool + dock laser state (round 3 follow-up) | After pointing, the user is dropped into Pen and must re-pick the tool | interviews, every use of the laser | medium | low | S | **done** 75495e0 (+X toggles off cad6398) |
| 83 | Connector label font size (`labelFontSize`, additive) + font keys + panel sizes (round 3 follow-up) | Arrow labels are fixed-size: tiny on large HLDs, font keys skip them | HLD users, every diagram with labels | medium-high | medium (new saved field) | M | **done** 155fbf4 (+f200d5a) |
| 84 | Compact "Change shape" row in the right-click menu (round 3 follow-up) | 8 rows make the HLD menu tall and scroll | desktop, often | medium | low | S | **done** 1c6cc65 (+ddb6830, cad6398) |
| 85 | Outline follow-ups: count ink in HLD boxes, buttons enabled when any page has content | NotebookLM outline misses handwriting; buttons look broken on an empty page | NotebookLM users | low-medium | low | S | **done** 4c49ed7 |
| 86 | Number flow steps on connectors (#68) | Request-flow order is typed into every arrow label by hand | HLD users, interviews | medium-high | low (labels only) | S-M | **done** a5d7d3a (+strict numbers f200d5a) |
| 87 | My templates: save the selection as a template, insert it from the chooser (#72/#53) | Own skeletons must be copied from old diagrams | interview prep, weekly | high | low-medium (local storage size) | M | **done** f051e99 (+3678d69) |
| 88 | Page overview: thumbnails of every page, jump, move a page earlier/later (#67 without names) | Many pages are just "2 / 5"; pages cannot be reordered | multi-page users, often | medium-high | medium (page undo history) | M | **done** 150e418 (+3678d69) |
| 89 | Open a diagram from the command palette by name | Switching diagrams always goes through the Library | desktop, daily | medium-high | low | S-M | **done** 51b7225 (+3678d69) |
| 90 | Tablet selection panel: Change shape, Select similar, Copy/Paste style | These are desktop right-click only | tablet, often | medium | low (buttons only, no new gestures) | S-M | **done** 7dccb30 (+f200d5a) (instead of long-press #70) |
| 91 | Text alignment (left / centre / right) for text labels; new labels typed inside a shape are centred | Multi-line labels in boxes look ragged | everyone, every multi-line label | medium-high | medium (new saved field `align`) | M | **done** 520ee23 (+f200d5a, 637fb63) |
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

### Round 4 result (2026-11-24)
All 10 picked items built (#82-#91); #92 (hover outline) was already built. Independent Opus review: 13 findings (4 medium, 9 low, none high), 12 fixed in cad6398 / f200d5a / 3678d69, one needed no change (no Enter/quick-create label path exists). Headless walk fixes in 637fb63 (template labels centred; desktop minimised UML button overlapped the taller page strip). Details and checklist: project-context.md, 2026-11-24 round 4 entry.

Follow-ups found this round (ideas for the next round):
- Right-click menu with one HLD box AND connectors selected (Step numbers chips shown) is ~714 px: still scrolls slightly at 1024x700.
- Step-number pattern: a bare 1-2 digit label ("7", "12") counts as a step number; "404" or "200 OK" do not.
- Page overview: Move earlier/later use < > arrows (tooltips say what they do); page names (#94) would make tiles clearer.
- Label size / alignment buttons in the panel have no visible heading (tooltips and aria-labels only), like the existing text size buttons.
- At 1440x900 an open minimap sits partly under the dock's right end (pre-existing, not changed).
- Labels from older templates/diagrams have no `align`: editing them to two lines keeps them left-aligned (use the Centre button).
- Older InkPad builds drop `labelFontSize` and `align` on save (like earlier round fields): keep the tablet PWA updated.
- Palette refreshes the library list on every Ctrl+K (a network list call with Drive).

## Round 5 — 2026-11-25 (branch desktop-20x)

### User journeys walked (friction found, on top of rounds 1-4)
1. Start a new diagram: developers often already have the design as text (a Mermaid flowchart from a README, notes or an AI chat) and must redraw every box and arrow by hand; pasting plain text onto the canvas does nothing.
2. Export and share: the outline (round 3) is prose; a README, GitHub issue or NotebookLM note wants the diagram as Mermaid text that renders again elsewhere.
3. Tablet writing: undo/redo means moving the pen to the top bar every time; GoodNotes, Notability and Procreate users expect a two-finger tap to undo and a three-finger tap to redo.
4. Rearrange and tidy: making five service boxes the same size means resizing each by eye; drawing a VPC / region / "Payments domain" boundary means drawing a dashed rectangle, sending it back and adding a label in four steps; moving a whole subsystem means shift-clicking every box and arrow.
5. Connector labels sit at the middle of the path and cover a box or another label on short or crossing connectors; there is no way to slide them along.
6. Library: tidying up after an interview season means moving or deleting diagrams one at a time.
7. Paper cuts from round 4: the palette re-lists the library on every Ctrl+K (a network call with Drive); the right-click menu with step-number chips still scrolls at 1024x700; at 1440x900 an open minimap sits partly under the dock; text size / alignment panel buttons have no heading.

### Candidates (problem · who/how often · benefit · risk · size · decision)
| # | Idea | User problem | Who / how often | Benefit | Risk | Size | Decision |
|---|---|---|---|---|---|---|---|
| 109 | Import Mermaid flowchart (dialog: More menu, palette, template chooser; Ctrl+V of Mermaid text on desktop) (was #100) | Design already exists as text; redrawn by hand | developers, often | high | low (creates ordinary items via the paste path) | M | **done** 820c994 (+dad0af2) |
| 110 | Paste plain text as a text label (desktop, internal clipboard empty) | Pasting text onto the canvas does nothing | desktop, often | medium | low-medium (paste path) | S | **done** 820c994 (+dad0af2) |
| 111 | Copy as Mermaid (Export panel, palette) | Diagram can't be pasted into README/issues/NotebookLM as renderable text | developers, weekly | medium-high | low (pure module) | S-M | **done** 93ce880 (+dad0af2) |
| 112 | Two-finger tap undo, three-finger tap redo (tablet, setting) | Undo needs a trip to the top bar | tablet, constantly | high | medium (touch navigator; pinch/pan must not change) | M | **done** b221d0a (+dad0af2) |
| 113 | Make same size (width / height / both) | Equal boxes by eye | everyone, often | medium | low | S | **done** e8cfd3f |
| 114 | Add boundary around the selection (dashed labelled container sent behind) | VPC/region/domain boundary takes four steps | HLD users, most diagrams | medium-high | low (ordinary rectangle + label) | S | **done** e8cfd3f (+b834e23 boundary interior click-through) |
| 115 | Select connected (box + its connectors and neighbours; whole subsystem) | Moving a subsystem means shift-clicking everything | growing diagrams, often | medium | low | S | **done** e8cfd3f |
| 116 | Drag a connector label along its path (saved `labelPosition`) (was #99) | Label covers a box or another label | HLD users, often | medium-high | medium (new saved field, select pointer path) | M | **done** 0cdf917 (+dad0af2) |
| 117 | Library multi-select: bulk Move and Delete (with Undo) (was #74/#96) | Organising many diagrams one at a time | everyone, occasionally | medium | medium (pending delete queue) | M | **done** 0e1058b |
| 118 | Round 4 paper cuts: palette library cache, menu height, minimap vs dock, panel headings | small friction | | low-medium | low | S | **done** a253bbd, e9f1f54, 629e1fa, 0bcc4d2 (+b828266 panel squash) |
| 119 | Page names (#94) | pages have no titles | sometimes | medium | medium (page-level saved key, documentFormat drops page keys today) | M | idea |
| 120 | Last-used style for new shapes (Excalidraw) | restyling every new box | desktop | medium | medium (tablet pen colours interplay) | M | idea |
| 121 | Snap to grid toggle | neat alignment | desktop | low-medium | medium (all drag/resize paths); smart guides exist | M | idea |
| 122 | Move folders into folders (#97) | restructure | rare | low | medium (Drive) | M | idea |
| 123 | Curved connectors (#95) | nicer arrows | sometimes | low-medium | medium-high | M-L | idea |
| 124 | Frames / sections (#101) | large boards | sometimes | medium | high | L | idea (boundary #114 covers the drawing part) |
| 125 | Alt+Arrow selects the connected neighbour (#102) | keyboard walking | rare | low | low | S | idea |
| 126 | Elbow bend clamp (#93) | | rare | low | medium | S | idea |
| 127 | Shape search in More shapes (#98) | | rare | low | low | S | idea |
| 128 | Library content search (#104) | find by label | sometimes | medium | high (loads every file) | L | idea |
| 129 | Images on the canvas (paste a screenshot) | reference screenshots | sometimes | medium | high (new item kind, storage size, Drive) | L | idea |
| 130 | Zoom presets menu on the % readout | | rare | low | low | S | idea (Shift+1/2, Ctrl+0 exist) |
| 131 | Export PNG scale (#80) | | rare | low | low | S | idea |
| 132 | Scribble-to-erase (#17/#48/#78/#106) | | | | high (writing path) | | skipped again |
| 133 | Undo toast naming the action (#42/#79/#107) | | | | high | | skipped again |
| 134 | Tablet long-press menu (#70/#105) | | | | high | | skipped again (tablet panel has the commands) |

### Acceptance criteria (picked items)
109. **Mermaid import**: "Insert from Mermaid…" (More menu both modes, command palette, template chooser) opens a dialog with a text area (and a Paste button); the user pastes `flowchart LR` / `graph TD` text and presses Insert; the nodes become boxes (`A[Text]` rectangle, `A(Text)`/`A([Text])` rounded→rectangle, `A((Text))` ellipse, `A{Text}` diamond, `A[(Text)]` Database HLD shape, `A[[Text]]` Service) with centred labels, edges `-->`, `---`, `-.->`, `==>` become attached connectors (arrow / plain / dashed), `-->|label|` and `-- label -->` become connector labels; laid out left-to-right or top-to-bottom as the header says; placed in the middle of the view, selected, one undo step, view fits it. Unknown lines are ignored and the dialog says how many; text with no edges or nodes shows an error and inserts nothing. On desktop, Ctrl+V of text that starts with `graph`/`flowchart` (internal clipboard empty) does the same.
110. **Text paste**: on desktop with the internal clipboard empty, Ctrl+V of plain text (not Mermaid) creates a text label at the pointer (or view centre) with that text (first 2000 characters), selected; one undo step. Internal clipboard paste unchanged.
111. **Copy as Mermaid**: Export panel "Copy as Mermaid" and the palette copy the current page as `flowchart LR` text: one node per box (label text, shape bracket by kind: diamond `{}`, ellipse `(())`, database `[()]`, others `[]`), one edge per connector between two boxes (label as `|text|`, dashed `-.->`, no arrow `---`); a toast confirms with the count; free text and ink are skipped (toast says so). Re-importing it with #109 gives the same boxes and links.
112. **Tap undo/redo**: on the tablet, a quick two-finger tap (both fingers down and up within ~300 ms, hardly moved, no zoom applied) undoes one step and a three-finger tap redoes; a small toast says "Undo" / "Redo". A setting in the menu ("Two-finger tap to undo", on by default, remembered) turns it off. Pinch zoom, three-finger pan, pen writing and palm rejection behave exactly as before; nothing fires while the pen is down or near.
113. **Same size**: with 2+ boxes selected, right-click → "Same size" chips (Width / Height / Both), the panel's arrange section and the palette make every selected box take the size of the largest selected box (Both = width and height), keeping each box's centre; connectors follow, labels inside follow; one undo step; locked items untouched.
114. **Boundary**: with items selected, right-click → "Add boundary", the panel and the palette add a dashed, unfilled rounded rectangle around them with padding, sent behind everything, and a label "Boundary" at its top-left that opens for typing on desktop; one undo step. It is an ordinary rectangle and text label (no new kind).
115. **Select connected**: right-click a box → "Select connected" (and the palette) selects the box, every connector touching it and the boxes at their other ends; pressing it again (or Shift variant "Select all linked") grows to everything reachable. No undo entry.
116. **Label along the path**: with the Select tool, dragging a connector label slides it along the connector (stays on the path, 5%-95%), it stays there when the boxes move; one undo step; Esc cancels. Saved as `labelPosition` (0.05..0.95, omitted at 0.5); renderer, sketchy, SVG/PNG/PDF export follow. Old files unchanged.
117. **Library multi-select**: the Library has a "Select" button; in select mode each card shows a checkbox, a bar shows "3 selected · Move… · Delete · Cancel"; Move moves all to one folder (one toast); Delete hides them at once with one "Deleted 3 diagrams · Undo" toast (same deferred delete as round 3). Works with touch and mouse. Esc leaves select mode.
118. **Paper cuts**: Ctrl+K reuses the library list fetched in the last 30 s; the right-click menu fits at 1024x700 with step chips; the open minimap does not sit under the dock at 1440x900; the panel shows small headings "Text size" and "Align" above those buttons.

### Round 5 result (2026-11-25)
All 10 picked items built (#109-#118). Independent Opus review: 4 medium + 10 low findings, 12 fixed in dad0af2 (paste guards, Mermaid cut at 2000 chars, `A-- text -->B` forms, tap undo under an open editor, `End` keyword, NBSP, entity round trip, paste error text, front matter / case-sensitive header, dialog insert failure, `<-->`/`x--x`, label drag per-move routing); 2 were notes (boundary exported as a node; tap/drag behaviour changes to confirm on device). Headless walk fixes: a boundary's interior grabbed the boundary on click/drag (b834e23: unfilled plain rectangles that hold other items are picked by their edge band or label only); long desktop panels squashed their buttons (b828266). Details and checklist: project-context.md, 2026-11-25 entry.

Follow-ups found this round (ideas for the next round):
- Right-click menu with Ungroup + Connected + Step numbers + Size chips is ~709 px: still scrolls slightly at 700 px.
- Mermaid import: subgraphs are skipped (could become boundaries via #114), long labels are not wrapped, `classDef`/`style` ignored; no two-headed connector type (`<-->` imports as a plain line).
- Copy as Mermaid exports a boundary rectangle as a node; could emit it as a `subgraph`.
- Label drag only starts on an already-selected connector (first press selects).
- Tap-undo thresholds (300 ms, 12 px, 150 ms stagger) are untuned guesses: tune on the Galaxy Tab.
- At 1440x900 the zoom control's + button sits under the dock's left end (pre-existing).
- Connector label size buttons in the panel have no "Text size" heading (text labels do).
- Older InkPad builds drop `labelPosition` on save (like earlier round fields): keep the tablet PWA updated.

## Round 6 — 2026-11-26 (branch desktop-20x)

### User journeys walked (friction found, on top of rounds 1-5)
1. LLD study: an AI chat or a README gives a Mermaid `classDiagram` (classes, fields, methods, inheritance/composition); InkPad's Mermaid import (round 5) reads only flowcharts, so every class box is typed by hand. Sequence diagrams (`sequenceDiagram`, the other interview staple) are drawn line by line.
2. HLD from text: flowchart `subgraph` blocks (VPC, region, "Payments") are skipped on import; Copy as Mermaid writes a boundary as a box and class boxes as plain boxes, so the text does not round-trip.
3. Drawing HLD: bidirectional links (WebSocket, replication, sync calls) need two arrows or a plain line; common parts (API gateway, server/VM, object storage, event stream, worker) are still drawn as plain boxes with a typed name.
4. Multi-page diagrams (HLD / LLD / API on separate pages) show only "2 / 5"; the page overview (round 4) has thumbnails but no names.
5. Growing a diagram: renaming a component ("OrderSvc" → "Order service") everywhere means finding and editing each label (Find, round 2, only finds).
6. Writing requirements (functional / non-functional lists on a sticky note): every bullet "- " or "1." is typed by hand on each line.
7. Round 5 paper cuts: label drag only on an already-selected connector; right-click menu with all chips ~709 px at 700 px; connector label sizes have no "Text size" heading; zoom + under the dock's left end at 1440x900.

### Candidates (problem · who/how often · benefit · risk · size · decision)
| # | Idea | User problem | Who / how often | Benefit | Risk | Size | Decision |
|---|---|---|---|---|---|---|---|
| 135 | Mermaid `classDiagram` import → typed class boxes + UML relationship connectors | LLD class diagrams from text typed by hand | LLD users, weekly | high | low (ordinary items, insert path) | M | **done** e0f1f45 (+e0af513) |
| 136 | Mermaid flowchart `subgraph` → boundary on import | Grouping lost on import | HLD users from text | medium | low | S | **done** e0f1f45 (+e0af513 membership by mention, 6c923c8 non-members kept out) |
| 137 | Copy as Mermaid: boundary → `subgraph`, class boxes → `classDiagram` | Text export doesn't round-trip groups/classes | developers, weekly | medium | low (pure module) | S-M | **done** 2c0df29 (+e0af513 annotations, names, two-way, dashed) |
| 138 | Mermaid `sequenceDiagram` import → participants, lifelines, message arrows | Sequence diagrams drawn line by line | LLD/interviews, often | medium-high | low (ordinary items) | M | **done** 71195e5 (+e0af513 self-message room) |
| 139 | Two-way arrow connectors (head at both ends; `<-->` import/export) | Bidirectional links need two arrows | HLD users, most diagrams | medium-high | medium (new saved field) | M | **done** 3b82769 |
| 140 | More HLD shapes: API gateway, Server, Object storage, Stream, Worker | Common parts drawn as plain boxes | HLD users, every diagram | high | low-medium (new hldShape values) | M | **done** 16aea15 (+e0af513 symmetric insets) |
| 141 | Page names (rename in page overview, shown in strip/overview/palette) (#119) | Pages are just "2 / 5" | multi-page users, often | medium-high | medium (top-level saved key) | M | **done** 2fe754e |
| 142 | Find & replace (Replace field in the Find bar, Ctrl+H) | Renaming a component everywhere | growing diagrams, often | medium-high | low-medium (text re-fit, per-page undo) | M | **done** eb083b1 (+e0af513 HLD label refit) |
| 143 | List continuation in labels (Enter after "- ", "• ", "1." continues; Enter on an empty bullet ends the list) | Bullets typed on every line | requirements notes, every interview | medium | low (editor only) | S | **done** 7fb9f42 (+e0af513 double-apply guard) |
| 144 | Round 5 paper cuts: label drag on an unselected connector, menu ≤ 700 px, connector "Text size" heading, zoom + vs dock at 1440 | small friction | | low-medium | low | S | **done** 5073cf2, 3093bae (+e0af513 groups, 649dbc6 menu clamp after layout) |
| 145 | Last-used fill / dash for new shapes (Excalidraw) (#120) | restyling every new box | desktop | medium | medium (pen colour interplay, surprise) | M | idea |
| 146 | Snap to grid (#121) | | desktop | low-medium | medium | M | idea |
| 147 | Move folders into folders (#122) | | rare | low | medium (Drive) | M | idea |
| 148 | Curved connectors (#123) | | sometimes | low-medium | medium-high | M-L | idea |
| 149 | Focus mode: fade everything not connected to the selection while presenting | Explaining one flow in an interview | interviews | medium | medium (renderer) | M | idea |
| 150 | Mermaid `classDef`/`style` fill colours on import | colours lost | rare | low | low | S | idea |
| 151 | Alt+Arrow selects the connected neighbour (#125) | | rare | low | low | S | idea |
| 152 | Shape search in More shapes (#127) | | rare | low | low | S | idea |
| 153 | Elbow bend clamp (#126) | | rare | low | medium | S | idea |
| 154 | Library content search (#128) | | sometimes | medium | high | L | idea |
| 155 | Images on the canvas (#129) | | sometimes | medium | high | L | idea |
| 156 | Export PNG scale | | | | | | skipped: 1x / 2x PNG already exist |
| 157 | Zoom presets menu (#130) | | rare | low | low | S | idea |
| 158 | Insert table (rows/cols) for API/DB schema notes | schemas typed as text | LLD sometimes | medium | medium (new kind or many items) | L | idea |
| 159 | ER diagram import (`erDiagram`) | DB schema from text | sometimes | medium | low | M | idea (after 135/138) |
| 160 | Scribble-to-erase / undo toast naming the action / tablet long-press menu (#132-#134) | | | | high | | skipped again (writing path / every history site / touch timing) |

### Acceptance criteria (picked items)
135. **classDiagram import**: pasting `classDiagram` text into "Insert from Mermaid…" (or desktop Ctrl+V) creates one typed class box per class (name; attributes and methods from `class A { ... }` bodies and `A : +field` lines; `<<interface>>` shown in the name line as «interface»), and connectors for `<|--` (inheritance), `<|..` (realization), `*--` (composition), `o--` (aggregation), `-->` (directed association), `..>` (dependency), `--` / `..` (association), with labels after `:`; laid out with the tidy layout; one undo step; toast "Inserted N classes and M links". Unknown lines counted.
136. **Subgraphs**: `subgraph id [Title]` … `end` around flowchart nodes becomes a boundary (dashed rectangle, sent behind, labelled with the title) around those nodes after layout; nested subgraphs become nested boundaries; empty subgraphs are skipped.
137. **Copy as Mermaid**: a boundary rectangle (container per round 5) is written as `subgraph` around the boxes inside it (titled by its label); a page whose boxes are all class boxes is copied as `classDiagram` (members and relationship arrows); re-import gives the same boxes, links and groups.
138. **sequenceDiagram import**: `participant`/`actor` (with `as` aliases) and participants first named in messages become boxes in a row with dashed vertical lifelines; `->>`, `->`, `-->>`, `-->`, `-x`, `--x` messages become horizontal arrows (dashed for `--`) top to bottom with the message text above; `Note over/left of/right of` becomes a sticky-style label; `loop`/`alt`/`opt`/`end`/`activate` lines are counted as ignored; one undo step; toast with counts.
139. **Two-way arrow**: an arrow connector (directed association) can have a head at both ends: the panel's connector section (both modes) and the right-click menu offer "Both ends", saved as `twoWay: true` only on directed associations; renderer, sketchy, SVG/PNG/PDF export draw both heads; Mermaid `<-->` imports as two-way and Copy as Mermaid writes `<-->`. One undo step. Old files unchanged.
140. **More HLD shapes**: API gateway, Server, Object storage, Stream and Worker appear next to the existing HLD shapes (insert tray / HLD tools, both modes) with tooltips; each draws its own outline (canvas, sketchy, SVG), keeps the ink/label area clear of the icon, works with connectors, change shape, templates and export; saved as new `hldShape` values.
141. **Page names**: in the page overview each thumbnail has a name field (placeholder "Page 3"); the page strip shows "2 / 5 · API" and its tooltip; the palette lists "Go to page: API"; names move with Move earlier/later, Duplicate page ("API copy") and delete; saved as top-level `pageNames` only when a page is named; old files unchanged; renaming saves the diagram.
142. **Find & replace**: the Find bar has a "Replace" toggle (desktop Ctrl+H opens it) with a replacement field, "Replace" (current match) and "Replace all" (all pages); text labels, connector labels and class box text are changed case-insensitively; labels re-fit; each changed page gets one undo step; a toast says "Replaced 6 in 4 items"; locked items untouched; code blocks skipped.
143. **Lists**: in a text label or sticky note editor, Enter on a line starting with "- ", "* ", "• " or "1. " / "1) " starts the next line with the same bullet (numbers count up); Enter on a line that is only the bullet removes it and ends the list; Shift+Enter unaffected where it already means something; works with the tablet on-screen keyboard.
144. **Paper cuts**: pressing on the label of an unselected connector with the Select tool and dragging slides the label (one undo step; a plain click still just selects); the right-click menu with all chip rows fits a 1024x700 window without scrolling; connector label sizes have a "Text size" heading; at 1440x900 the zoom + button is not covered by the dock.

### Round 6 result (2026-11-26)
All 10 picked items built (#135-#144). Two agents first built on a stale base (old `main`) and were redone on the round head (only the redo was merged). Independent Opus review: 0 high, 2 medium (Replace did not re-fit labels in HLD shapes; class export lost «annotations» and display names), 8 low; all 10 fixed in e0af513. Headless walk fixes: right-click menu ran 30 px past the bottom at 1024x700 (649dbc6, clamp after layout); subgraph boundaries overlapped non-member boxes (6c923c8). Details and checklist: project-context.md, 2026-11-26 entry.

Follow-ups found this round (ideas for the next round):
- Page names show as "API de…" in the narrow page strip (tooltip has the full name); a wider strip label or a hover card could help.
- Sequence import: participants and lifelines are separate items (moving a participant leaves its lifeline); `loop`/`alt` frames are skipped (could become boundaries); `-x` / `-)` heads drawn as normal arrows.
- classDiagram: `namespace` blocks could become boundaries; notes skipped; cardinalities dropped.
- Change-shape chip row has 14 HLD chips (5 lines in the right-click menu).
- Two-way arrows: no hit-test on the second head (selection uses the line).
- Tablet Insert tray now scrolls at 800 px tall with 14 HLD shapes.
- Find & replace skips a page waiting in the "Page deleted" undo bar.

## Round 7 — 2026-11-26 (branch desktop-20x)

### User journeys walked (friction found, on top of rounds 1-6)
1. LLD class diagrams: multiplicities ("1", "*", "0..1") at each end of an association can only be faked with free text labels that do not follow the boxes; Mermaid `A "1" --> "*" B` drops them; `namespace` blocks and `note for` lines are skipped.
2. DB schema / LLD: `erDiagram` (entities, attributes with PK/FK, crow's-foot relationships) — the other text format AI chats and READMEs produce — is not read at all; state machines (`stateDiagram-v2`, order or payment lifecycles, a common LLD interview question) neither.
3. Sequence diagrams from text: moving a participant leaves its lifeline behind; `loop` / `alt` / `opt` frames (retry, success/failure) are dropped, though they carry the meaning of the flow.
4. Switching tools: diagrams already drawn in Excalidraw (the most common whiteboard in interviews) cannot be brought in; copying shapes from excalidraw.com and pasting does nothing.
5. Drawing HLD: services are usually drawn as rounded boxes; InkPad has only sharp rectangles. Finding "Redis" or "Kafka" among 14 HLD shapes means knowing InkPad's generic names (Cache, Stream); the tablet Insert tray scrolls.
6. Explaining a design in an interview: there is no way to make one component and its links stand out while talking about it (everything else stays at full strength).
7. Round 6 paper cuts: the right-click Change shape row has 14 HLD chips (five lines); page names truncate to "API de…" in the page strip; the second arrowhead of a two-way arrow is not clickable.

### Candidates (problem · who/how often · benefit · risk · size · decision)
| # | Idea | User problem | Who / how often | Benefit | Risk | Size | Decision |
|---|---|---|---|---|---|---|---|
| 161 | Connector end labels (multiplicity / cardinality at each end, `startLabel` / `endLabel`) | Multiplicities faked with loose text that does not follow boxes | LLD users, every class/ER diagram | high | medium (new saved fields, renderer) | M | **done** f8975da (+df7b283, c82b651, d4457dc) |
| 162 | Rounded corners for rectangles (`rounded: true`, Sharp / Round) | Service boxes cannot be drawn rounded | HLD users, most diagrams | medium | medium (new saved field, renderer) | S-M | **done** 77b4c44 (+df7b283) |
| 163 | Mermaid `erDiagram` import (entities, attributes, crow's-foot cardinalities as end labels) | DB schema from text typed by hand | LLD users, often | high | low (ordinary items) | M | **done** 294ccb1 (+fc548dd, d1b885c) |
| 164 | Mermaid `stateDiagram` import (states, start/end, transitions with events, composite states as boundaries, choice) | State machines drawn by hand | LLD interviews, sometimes | medium-high | low | M | **done** a4ba5f5 (+fc548dd, d1b885c) |
| 165 | Sequence import: lifeline moves with its participant (grouped); `loop`/`alt`/`opt`/`par`/`critical`/`break` frames as labelled boundaries with `else` dividers | Moving a participant breaks the diagram; frames lost | sequence users, every import | medium-high | low | S-M | **done** 6225ea5 |
| 166 | classDiagram import: cardinalities, `namespace` → boundary, `note for` → sticky; Copy as Mermaid writes cardinalities; Mermaid `(x)` ↔ rounded rectangle | Class text loses parts on import/export | LLD users | medium | low | S-M | **done** 461a2ac (+d1b885c) |
| 167 | Excalidraw import: paste from excalidraw.com (desktop Ctrl+V) and open a `.excalidraw` file (both modes) | Existing Excalidraw diagrams cannot be brought in | people switching tools, interviews | high | low-medium (ordinary items, paste path) | M | **done** 9104635 (+fc548dd) |
| 168 | Shape search with tech names (Redis → Cache, Kafka → Stream, S3 → Object storage…) in More shapes, Insert tray and palette | Finding the right HLD shape among 14 | everyone, every diagram | medium | low | S | **done** 752d5cf (+e478a04) |
| 169 | Focus mode: fade everything not linked to the selection (view only, Esc exits) (#149) | Making one component stand out while explaining | interviews, presenting | medium | medium (renderer cache) | M | **done** 8ba874c (+e478a04) |
| 170 | Round 6 paper cuts: compact HLD change-shape row, page strip names, second arrowhead hit-test | small friction | | low-medium | low | S | **done** e304787 (+598ac28) |
| 171 | Last-used fill / corners for new shapes (#145) | restyling every new box | desktop | medium | medium (tablet colour interplay) | M | idea ("Line style for new shapes" exists; extend later) |
| 172 | Copy as Mermaid for sequence pages | sequence round-trip | sometimes | medium | medium (detect lifelines) | M | idea (needs 165 groups first) |
| 173 | Move selection to another page | splitting a growing diagram | sometimes | medium | medium (per-page undo) | M | idea (cut / paste works) |
| 174 | Snap to grid (#146) | | desktop | low-medium | medium | M | idea |
| 175 | Move folders into folders (#147) | | rare | low | medium (Drive) | M | idea |
| 176 | Curved connectors (#148) | | sometimes | low-medium | medium-high | M-L | idea |
| 177 | Mermaid `classDef` / `style` fills (#150) | colours lost | rare | low | low | S | idea |
| 178 | Alt+Arrow selects the connected neighbour (#151) | | rare | low | low | S | idea |
| 179 | Library content search (#154) | find "the one with Kafka" | sometimes | medium | high (loads every file) | L | idea |
| 180 | Images on the canvas (#155) | screenshots | sometimes | medium | high (new kind, storage, Drive) | L | idea |
| 181 | Insert table for API / DB schema (#158) | | sometimes | medium | medium | L | idea (163 covers schemas) |
| 182 | Excalidraw export (.excalidraw) | share with Excalidraw users | sometimes | medium | low-medium | M | idea (after 167) |
| 183 | Dark UI theme | night study | sometimes | low-medium | medium (all CSS) | L | idea |
| 184 | Sequence `-x` / `-)` arrow heads | | rare | low | low | S | idea |
| 185 | Tidy layout | | | | | | skipped: already built (Tidy selected / Tidy all) |
| 186 | Scribble-to-erase / tablet long-press menu / undo toast naming the action (#160) | | | | high | | skipped again (writing path / touch timing / every history site) |

### Acceptance criteria (picked items)
161. **End labels**: with an attached connector selected, the panel (both modes) has "End labels" with two short fields (start, end; placeholder "1", "*"); typing "1" and "0..*" shows them next to each end, just outside the box and beside the line, in the connector's colour; they follow when boxes move or the connector reroutes (straight and elbow); visible in sketchy mode and SVG/PNG/PDF export; one undo step per committed edit; clearing a field removes it. Saved as `startLabel` / `endLabel` (trimmed, ≤ 24 chars, omitted when empty). Old files unchanged.
162. **Rounded corners**: a plain rectangle (not class, ink or HLD boxes) can be switched Sharp / Round in the panel (both modes), the right-click Style row and the palette; the corners are round on canvas, in sketchy style and in exports; hit-testing unchanged; one undo step; saved as `rounded: true`.
163. **erDiagram**: pasting `erDiagram` text into "Insert from Mermaid…" (or desktop Ctrl+V) creates one class-style box per entity (name; attribute lines like "PK id: int"), relationship connectors labelled with the verb, cardinality end labels from the crow's-foot ends (`||` 1, `|o`/`o|` 0..1, `}|`/`|{` 1..*, `}o`/`o{` 0..*), dashed for `..`; tidy layout; one undo step; toast "Inserted 3 entities and 2 relationships".
164. **stateDiagram**: `stateDiagram` / `stateDiagram-v2` text creates rounded state boxes, a small filled start circle for `[*] -->`, an end circle for `--> [*]`, arrows with the event label, `state "Long" as A`, `state X { … }` as a boundary around its states, `<<choice>>` as a small diamond, notes as sticky notes; tidy layout; one undo step; toast with counts.
165. **Sequence**: after importing, dragging a participant moves its lifeline with it (they are one group); `loop`, `alt`, `opt`, `par`, `critical`, `break` blocks become dashed labelled boundaries ("loop: every 5 s") around their messages, `else` / `and` become a dashed divider with its text; nesting works; toast counts frames.
166. **classDiagram**: `A "1" --> "*" B` imports with end labels; `namespace Billing { class Invoice }` becomes a boundary titled Billing; `note for A "text"` becomes a sticky note near A; Copy as Mermaid writes end labels back as `"1"` / `"*"`; flowchart `A(Text)` imports as a rounded rectangle and a rounded rectangle exports as `(Text)`.
167. **Excalidraw**: copying shapes on excalidraw.com and pressing Ctrl+V in Desktop mode inserts them (rectangles, diamonds, ellipses with fill and dashed/dotted style, round corners, text, text inside containers as centred labels, arrows bound to shapes as attached connectors with their labels, other arrows/lines/freedraw as strokes, frames as boundaries); "Import Excalidraw file…" (More menu both modes, palette) opens a `.excalidraw` file the same way; inserted like a template (centred, selected, one undo step); toast "Imported 12 shapes from Excalidraw (2 skipped)". Images and embeds are skipped and counted.
168. **Shape search**: More shapes (desktop) and the tablet Insert tray have a search field; typing "redis", "kafka", "s3", "nginx", "postgres", "lambda" filters to the matching shape(s) and shows the matched word; Enter inserts the first; the palette lists "Insert shape: Cache" findable by the same words.
169. **Focus**: with items selected, "Focus" (right-click, panel both modes, palette, desktop key) fades every item that is not selected, a connector of a selected box, or the box at its other end, to about 20 %; a "Focused · Exit" chip shows at the top; Esc, the chip, deleting the focused items or a page/diagram switch exits (decision during review: clearing the selection does NOT exit, because drawing on the tablet clears the selection); nothing is saved or added to undo; drawing still works; exports are unaffected.
170. **Paper cuts**: the right-click Change shape row shows the basic shapes plus at most one line of HLD chips with "More…" opening the rest; the page strip shows up to ~12 characters of the page name and the full name on hover/tooltip; clicking the start arrowhead of a two-way arrow selects the connector.

### Round 7 result (2026-11-26)
All 10 picked items built (#161-#170) by seven Sonnet agents in parallel worktrees (all started from 7a0144d; cherry-picked, three small merge conflicts resolved by hand). Independent Opus review: 0 high, 3 medium (end-label input could commit to the wrong connector after a selection change; desktop shape search missed the dock shapes Database/Queue/Service; Excalidraw parser could throw on a >100k-point freedraw and had no size limits), 11 low (focus redraws after eraser runs, rounded class box outline, Excalidraw outline snap / rotation / text cap / Ctrl+V after an in-app copy, wide end labels over the box, selection bounds without end labels, tray Esc reaching App, small input font on iPad, leftover casts); all fixed in df7b283, fc548dd, e478a04 except item 4 (focus exit on empty selection) which was turned into a documented decision. Walk fixes: end labels hidden under composition diamonds / arrowheads (c82b651), importers piling several connectors on one side midpoint (d1b885c), end labels of diagonal lines inside the box (d4457dc), desktop panel running under the zoom control (598ac28, pre-existing). Details and checklist: project-context.md, 2026-11-26 round 7 entry.

Follow-ups found this round (ideas for the next round):
- State diagram layout: transitions to the shared end circle can cross composite states; large state machines fit at 60 % and still run past the screen edge (fit has a lower zoom clamp).
- ER/class end labels on lines leaving a box's right side downwards sit only ~2 units outside the border.
- Sequence import: Copy as Mermaid for sequence pages (#172) is now possible because participants and lifelines are grouped.
- Excalidraw: bent (3+ point) arrows lose their head (InkPad arrow strokes use two points); hachure fills become solid; Excalidraw export (#182).
- Focus mode: the minimap is not faded.
- Change-shape row shows about 3 HLD chips + More… at the menu's width (one line), not 6.
