import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const { splitCommandLabel, groupPaletteEntries } = await loadModule('commandPalette.ts')
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const css = await read('../src/app/desktop-panels.css')
const palette = await read('../src/app/CommandPalette.tsx')
const help = await read('../src/app/ShortcutHelp.tsx')

test('splitCommandLabel: no parenthesis keeps the label whole', () => {
  assert.deepEqual(splitCommandLabel('Zoom in'), { title: 'Zoom in', detail: '' })
  assert.deepEqual(splitCommandLabel('Fit(all)'), { title: 'Fit(all)', detail: '' })
})

test('splitCommandLabel: one parenthetical becomes the detail', () => {
  assert.deepEqual(splitCommandLabel('Laser pointer (a red trail that fades; nothing is saved; Esc leaves it)'), { title: 'Laser pointer', detail: 'a red trail that fades; nothing is saved; Esc leaves it' })
})

test('splitCommandLabel: nested and trailing text', () => {
  assert.deepEqual(splitCommandLabel('Zoom (fit (all)) to page'), { title: 'Zoom to page', detail: 'fit (all)' })
  assert.deepEqual(splitCommandLabel('Copy (selection) as PNG'), { title: 'Copy as PNG', detail: 'selection' })
  assert.deepEqual(splitCommandLabel('Broken (never closed'), { title: 'Broken', detail: 'never closed' })
})

test('groupPaletteEntries makes groups contiguous in first-seen order', () => {
  const out = groupPaletteEntries([{ id: 'a', label: 'a', group: 'X' }, { id: 'b', label: 'b', group: 'Y' }, { id: 'c', label: 'c', group: 'X' }])
  assert.deepEqual(out.map((g) => [g.group, g.entries.map((e) => e.id)]), [['X', ['a', 'c']], ['Y', ['b']]])
})

test('palette markup: search icon, placeholder, Esc chip, overlines only without a query, empty text, aria kept', () => {
  assert.match(palette, /command-palette-search-icon/)
  assert.match(palette, /placeholder="Search commands and diagrams"/)
  assert.match(palette, /command-palette-esc[^>]*>Esc</)
  assert.match(palette, /\{groups && <div className="command-palette-group-title"/)
  assert.match(palette, /\{!groups && <span className="command-palette-group-chip"/)
  assert.match(palette, /No commands match “/)
  for (const attr of ['role="dialog"', 'aria-modal="true"', 'role="listbox"', 'role="option"', 'aria-activedescendant', 'aria-selected']) assert.ok(palette.includes(attr), attr)
  assert.match(help, /shortcut-help-groups/)
})

test('desktop dialog CSS is desktop-scoped, animates transform/opacity only, honours reduced motion', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const chunk of bare.split('}')) {
    const selector = chunk.split('{')[0].trim()
    if (!selector || selector.startsWith('@') || selector === 'from' || selector === 'to' || chunk.indexOf('{') < 0) continue
    for (const piece of selector.split(',')) assert.match(piece.trim(), /^(\.app-shell\[data-input-mode="desktop"\]|from|to|\d+%)/, piece)
  }
  assert.match(css, /\.command-palette \{ width: min\(600px/)
  assert.match(css, /border-radius: var\(--ip-radius-sheet\)/)
  assert.match(css, /box-shadow: var\(--ip-shadow-3\)/)
  assert.match(css, /@keyframes ip-dialog-in \{ from \{ opacity: 0; transform: scale\(\.98\); \} to \{ opacity: 1; transform: scale\(1\); \} \}/)
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^@]*animation: none/)
  assert.match(css, /min-width: 1100px[\s\S]*column-count: 2/)
  assert.match(css, /canvas-context-chips-row \{ display: flex; flex-wrap: wrap; gap: 4px; \}/)
  assert.match(css, /canvas-context-chip \{ padding: 0 6px; font-size: 12px; \}/)
})
