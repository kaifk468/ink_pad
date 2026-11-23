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
| 1 | Connector endpoint handles | Re-attaching a connector to another side/box means delete and redraw | everyone, every diagram | high | medium (select pointer paths) | M | **picked** |
| 2 | Shortcut badges on dock + number keys 1-0 | Tool keys are invisible; reaching tools needs the mouse | desktop, constantly | medium-high | low | S | **picked** |
| 3 | Library: recent row, rename card, breadcrumb, feedback, empty-folder CTA, `/` search, Ctrl+O | Finding and organising diagrams is slow and silent | everyone, daily | high | low | M | **picked** |
| 4 | Labels on connectors | Arrow labels drift away when boxes move | HLD users, every diagram | high | medium (new field, editor) | M | **picked** |
| 5 | HLD icon shapes (user, browser, mobile, cache, load balancer, CDN) | Common HLD parts must be hand drawn | HLD users, every diagram | high | low-medium (new hldShape values) | M | **picked** |
| 6 | Group / ungroup (Ctrl+G) | A box + its labels/icons can't move as one unit | growing diagrams, often | high | high (all selection paths, paste) | L | **picked (last; skip if risky)** |
| 7 | Empty-canvas hint | New users don't know keys/gestures | first use, each new diagram | medium | low | S | **picked** |
| 8 | Copy / paste style | Restyling many items is repetitive | desktop, often | medium | low | S | **picked** |
| 9 | Labels inside a box follow its resize | Resizing leaves labels outside the box | everyone, often | medium | medium | S-M | **picked** |
| 10 | Ctrl+drag duplicates | Duplicating then moving is two steps | desktop, often | medium | low-medium | S | **picked** |
| 11 | Alt+drag duplicate (Excalidraw) | same as 10 | | | Alt already = no snapping / look through code | | skipped: would rework round 2026-11-19 Alt meaning; Ctrl+drag instead |
| 12 | Elbow bend handle (drag the middle segment) | Elbow paths can't be adjusted | LLD users | medium | medium (new saved bend field) | M | idea (this round: middle dot toggles straight/elbow) |
| 13 | Command palette Ctrl+K | Commands hidden in menus | power users | medium | low | M | idea |
| 14 | Duplicate a diagram from the library | Reusing an interview template | sometimes | medium | medium (store, Drive) | M | idea |
| 15 | Drag diagrams onto folders | Move dialog is a detour | sometimes | low-medium | medium (touch DnD) | M | idea |
| 16 | Eyedropper | match a colour | sometimes | low | low | S | idea (copy/paste style covers most) |
| 17 | Scribble-to-erase pen gesture | erase without switching tools | tablet, often | medium | high (writing path) | M | skipped: touches the pen writing path; needs device testing |
| 18 | Shape recognition on desktop | | rare on desktop | low | low | S | skipped: desktop has direct shape tools |
| 19 | Diagram starter templates (client-server-db) | Interview warm-up | sometimes | medium | low | M | idea |
| 20 | Snap target highlight while drawing connectors | Unsure where the end attaches | everyone | medium | low | S | part of 1 |
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
