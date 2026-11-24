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
| 28 | Command palette (Ctrl+K) | Commands hidden in menus; shortcuts must be memorised | desktop, daily | high | low (overlay, reuses key commands) | M | **picked** |
| 29 | Find on canvas (Ctrl+F) | Finding a label in a big diagram means panning | everyone with big diagrams | high | low (pure search + zoom) | M | **picked** |
| 30 | Diagram templates (insert a starter layout) | Same skeleton drawn every interview | HLD/LLD users, every new diagram | high | low (plain items via paste path) | M | **picked** (was #19) |
| 31 | Sticky note (N) | No quick note for requirements/assumptions | everyone, often | medium | low (filled rectangle + label, no new kind) | S | **picked** (was #22) |
| 32 | Elbow bend handle | Elbow middle segment cannot be moved; overlapping elbows | LLD users, often | medium-high | medium (new saved field) | M | **picked** (was #12, + label/middle-dot overlap follow-up) |
| 33 | Connectors snap to side midpoints + anchor dots | Arrow ends slightly off-centre, crooked lines | everyone, every connector | high | low-medium (snap behaviour, tablet too) | S | **picked** |
| 34 | Quick-connect buttons around a selected shape | Ctrl+Arrow is undiscoverable | desktop, every diagram | high | medium (select pointer path) | M | **picked** |
| 35 | Library: Make a copy | Reusing a diagram needs export+import | sometimes, interview prep | medium-high | medium (store/Drive create) | M | **picked** (was #14) |
| 36 | Library: sort by edited / name / created | Only "last edited" order | many diagrams | medium | low | S | **picked** |
| 37 | Select similar (right-click) | Restyling all connectors/boxes means clicking each | desktop, often | medium | low | S | **picked** |
| 38 | Tablet Group / Ungroup buttons | Groups can't be made on the tablet | tablet, sometimes | medium | low | S | **picked** (round 1 follow-up) |
| 39 | Refit text after a box shrinks | Text spills out of a box made smaller | everyone, often | medium | medium (resize path) | S-M | **picked** (round 1 follow-up) |
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
