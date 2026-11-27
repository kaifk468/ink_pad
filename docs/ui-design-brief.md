# InkPad desktop design brief

Living document. Every UI round builds against it and updates it when a decision changes.
Scope: **Desktop mode only** (`inputMode === 'desktop'`). Tablet mode is frozen and must not change.
Created: 2026-11-27 (UI round 1). Owner can reverse any decision; reasons are recorded so that is easy.

## 1. Personality: calm, hand-made, precise

- **Calm**: the canvas is the hero. Chrome is quiet, low-contrast at rest, clear on hover/focus. No loud gradients, no busy borders.
- **Hand-made**: InkPad is pen-first. A small handwritten accent (the bundled Excalifont, plus slightly irregular "ink" strokes in illustrations) appears in empty states and the welcome moment only, never in controls.
- **Precise**: system-design diagrams need trust. Alignment, spacing and type are exact; every control states its shortcut.

How we differ from Excalidraw: warm paper neutrals instead of cool white, an ink-blue accent (not violet), a single slide-in sheet for navigation instead of a dropdown, labelled tool groups, and a highlighter-yellow "delight" colour used only for moments (save tick, snap pulse, welcome).

## 2. Colour tokens

Tokens live in `src/app/tokens.css` as CSS custom properties, scoped to `.app-shell[data-input-mode="desktop"]` (and the library/home screen on desktop) so tablet styles are untouched.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ip-bg` | `#f7f6f2` | `#15171c` | app background outside panels |
| `--ip-surface` | `#ffffff` | `#1e2128` | panels, menus, dock |
| `--ip-surface-2` | `#f1f0ec` | `#262a33` | hover rows, segmented-control track |
| `--ip-line` | `#e4e2dc` | `#323743` | hairlines, panel borders |
| `--ip-text` | `#1f2126` | `#eceef2` | primary text (contrast ≥ 12:1) |
| `--ip-muted` | `#62666f` | `#a3a9b6` | secondary text (≥ 4.5:1 on surface) |
| `--ip-faint` | `#8d919a` | `#7b8190` | shortcut hints only (non-essential text) |
| `--ip-accent` | `#2f54d6` | `#7d97ff` | ink blue: active tool, primary button, focus |
| `--ip-accent-soft` | `#e8edff` | `#27304f` | selected row / active tool fill |
| `--ip-on-accent` | `#ffffff` | `#0f1220` | text on accent |
| `--ip-delight` | `#f5c242` | `#f5c242` | highlighter: save tick, snap pulse, welcome underline |
| `--ip-danger` | `#c0362c` | `#ff8a80` | destructive rows |
| `--ip-success` | `#1f8a5b` | `#5ad19a` | saved status dot |

Dark theme: **held back** (round 1 review: only token surfaces turned dark). Ship it only when every desktop surface reads tokens; then chrome follows `prefers-color-scheme`. The paper/canvas colour stays the user's sheet colour; a dark sheet is a later decision (open question for owner).

## 3. Type

- UI: **DM Sans** 400/500/600 (already loaded). Brand word and big headings: **Manrope** 700/800.
- Hand accent: **Excalifont** (bundled, offline-safe) for empty-state headlines and welcome only.
- Scale (px): 11 (shortcut keys, overlines) · 12 (hints) · 13 (secondary rows) · 14 (body / menu rows) · 16 (panel titles) · 20 (dialog titles) · 28 (empty-state headline).
- Overlines: 11px, 600, letter-spacing .06em, uppercase, `--ip-muted`.
- Never let a label wrap under a control: rows use grid with the control in its own column (this was the hamburger overlap bug).
- Fonts must not depend on the network to look right: fallback stack `'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif`. (Google Fonts import is blocked offline; bundling DM Sans is a held-back item.)

## 4. Spacing, radius, elevation

- Spacing scale (px): 2, 4, 8, 12, 16, 20, 24, 32, 48. Panel padding 12; row height 36 (desktop, mouse) with 8px icon gap.
- Radius: 6 (chips, keys), 10 (buttons, rows), 14 (panels, menus, dock), 20 (dialogs, sheets), 999 (pills, toasts).
- Elevation (shadows are static, never animated on the canvas path):
  - `--ip-shadow-1`: `0 1px 2px rgba(20,22,28,.06), 0 1px 1px rgba(20,22,28,.04)` floating buttons.
  - `--ip-shadow-2`: `0 8px 24px rgba(20,22,28,.10), 0 2px 6px rgba(20,22,28,.06)` panels, dock, menus.
  - `--ip-shadow-3`: `0 24px 60px rgba(20,22,28,.18)` sheets and dialogs.
  - Dark: same offsets, black at 2.5× opacity, plus a 1px `--ip-line` border.
- No `backdrop-filter` blur over the canvas (repaint cost while drawing). Scrims are flat colour.

## 5. Motion

- Durations: 120ms (hover, press), 180ms (menus, popovers, toasts), 240ms (sheets, dialogs). Nothing longer than 250ms.
- Easing: `--ip-ease-out: cubic-bezier(.2,.8,.2,1)` for entering; `--ip-ease-in: cubic-bezier(.4,0,1,1)` for leaving (leave is ~20% faster).
- Animate **only `transform` and `opacity`**. Never animate width/height/top/left or anything on the canvas element.
- Patterns: popovers scale from 0.97 + fade from their anchor; sheets slide 16px + fade; toasts rise 8px + fade; press = scale(.97).
- `prefers-reduced-motion: reduce` → all `--ip-dur-*` become 0.01ms and transforms are dropped (fade only, instant). Implemented once in tokens.css.

## 6. Icons

- 24px grid, 1.75px stroke, round caps and joins, `currentColor`, no fills except the active state. Matches the existing inline SVG icons; new icons follow the same rules.
- Every icon-only button has `aria-label` and a tooltip with the shortcut (`title="Rectangle (R)"` style until a custom tooltip lands).

## 7. Focus and accessibility

- Focus ring: `outline: 2px solid var(--ip-accent); outline-offset: 2px;` on `:focus-visible` only. Never remove outlines without a replacement.
- Contrast: text ≥ 4.5:1, large headline ≥ 3:1. The old empty-canvas hint (#c3c7ce on white) failed and was fixed in round 1.
- Keyboard: every menu/sheet is reachable, Esc closes, focus returns to the opener.

## 8. Layout principles by area

### Navigation sheet (replaces the hamburger dropdown)
- Opens as a left **sheet** (width 320, top 72 / bottom 90 to clear the top bar and dock, radius 20), slides in 240ms. Transparent click-catcher (no dim over canvas).
- Header: brand mark + save status pill.
- **Search field** at top ("Search menu"): filters rows by label and keywords; Enter runs the first safe match (never Clear canvas).
- Sections: **Diagram** (Library, Export and import, Storage) · **Page** (Style, Spacing, Sheet colour) · **Preferences** (Desktop mode, Hand-drawn style, Snap and guides) · **Help** (Keyboard shortcuts, Command palette). Clear canvas sits alone at the bottom in danger colour.
- Each row: icon | label (+ one-line description that truncates with ellipsis, full text in title) | trailing control or shortcut `kbd`. Grid layout guarantees no overlap.
- Tablet-only rows (One-finger pan, Two-finger tap) do not appear in Desktop mode.

### Library / folder explorer
- Thumbnail cards (4:3) with title, relative time, folder chip; Starred and Recent rows at the top; rename in place; drag cards onto folders.
- Empty state: hand-written headline, two big actions (New blank diagram, Start from a template), one tip line. Never a lone grey sentence.

### Top bar
- Left: ONE 44px surface: menu | library | divider | editable title (ellipsis 280/360px) | divider | undo, redo (32px icons). Top-centre history pill is tablet-only.
- Right: save status pill (dot: success / delight / danger, single 180ms pulse on save) + Export button (opens export dialog) + account. Pill stays in focus mode. The bottom-right status text is hidden on desktop. (Built round 2.)

### Tool dock
- **Icon-only** (round 2): 40px buttons, 20px icons, no text labels or corner digits; groups (Select · Draw · Shapes · Connect · System shapes · More) separated by a small gap and a 1x20px tick. Dock is 54px tall, centred, token surface, shadow-2.
- Tooltip (`DockTip`): dark pill above the button after 400ms hover or at once on keyboard focus: name + key chips, optional muted second line (e.g. "Shift: square"). Active tool: accent-soft fill + accent icon. Native titles dropped on desktop.
- Zoom controls and right clusters sit on the dock row (bottom 16) and lift only when they would overlap it.

### Canvas
- Dot grid at rest; selection handles 8px squares with 1.5px accent border and white fill; hover outline 1px accent at 40% opacity. Toasts sit **above** the dock, never over it.

### Options panel, context menu, palette, dialogs, toasts
- Same surface, radius 14, shadow-2, 12px padding, overline section titles, `kbd` chips for shortcuts.
- Options panel (round 2): 240px, 32px controls on surface-2 without borders, related choices as segmented controls with equal segments, layer as icons, one-row 28px swatches, max-height above the zoom controls with a scroll shadow.
- Context menu (round 2): 32px rows at 14px, shortcuts 12px mono faint, 28px chips, accent focus ring; keeps 100px clear of the bottom only when it would cover the dock.

### Interaction rules (round 2)
- Desktop starts on the Select tool. Enter on one selected shape opens its label; Esc in the label editor commits (restores if an existing label was blanked). Export success shows a toast.

## 9. Round log

| Round | Date | Built against brief | Changed in brief |
|---|---|---|---|
| 1 | 2026-11-27 | tokens, navigation sheet with search, empty canvas, toast placement, library empty state | brief created; dark theme held back (only new surfaces went dark); sheet sits top 72 / bottom 90 to clear the dock |
| 2 | 2026-11-27 | top bar, icon-only dock + tooltips, options panel, context menu, canvas chrome, first-time label flow | dock changed from labelled to icon-only; status pill moved to top bar (removed from sheet header); Esc commits labels; Select is the desktop start tool |

## 10. Unfinished / next rounds
Next: Library redesign (cards, recent/pinned, open affordance), Ctrl+S / save feedback, export dialog order, tool-reset hint, contextual mini toolbar, command palette + shortcut dialog restyle, bundle DM Sans, dark theme. See the newest `docs/progress/inkpad-ui-round-*.md` "Held back" section.
