import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const input = await loadModule('desktopInput.ts')
const panels = await readFile(new URL('../src/app/desktop-panels.css', import.meta.url), 'utf8')

const hld = ['database', 'queue', 'service', 'user', 'browser', 'mobile', 'cache'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }))
const busy = { hasSelection: true, clipboardHasItems: true, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false, canCopyStyle: true, canPasteStyle: true, canSetDefaultStyle: true, canSelectSimilar: true, canGroup: true, canUngroup: true, changeShapes: hld, canNumberSteps: true, canSameSize: true, canSwap: true, canFlip: true, canSelectConnected: true, lineShape: 'straight', arrowEnds: 'both', corners: 'round', movePages: [{ action: 'movePage:1', chip: 'Page 2', label: 'Move to Page 2' }] }

test('every chip caption in one menu is unique, and no caption repeats in a different block', () => {
  for (const state of [busy, { ...busy, lineShape: null, arrowEnds: null }, { ...busy, arrowEnds: 'one', corners: 'sharp', changeShapesExpanded: true }]) {
    const captions = input.contextMenuRows(input.contextMenuEntries(state)).filter((row) => row.chips).map((row) => row.chips[0].chipGroup)
    assert.equal(new Set(captions).size, captions.length, captions.join(' | '))
  }
})

test('the connector captions are plain: Style, Line, Arrowheads', () => {
  const entries = input.contextMenuEntries(busy)
  const group = (action) => entries.find((e) => e.action === action).chipGroup
  assert.equal(group('copyStyle'), 'Style')
  assert.equal(group('lineCurved'), 'Line')
  assert.equal(group('arrowBothEnds'), 'Arrowheads')
  assert.equal(group('exportPng'), 'Save as')
})

test('captions fit the fixed 84px caption column (long captions wrap by word)', () => {
  // 11px uppercase with .06em tracking is about 7.6px per capital letter.
  for (const e of input.contextMenuEntries(busy).filter((e) => e.chipGroup)) {
    const longestWord = Math.max(...e.chipGroup.split(' ').map((word) => word.length))
    assert.ok(longestWord * 7.6 <= input.CHIP_CAPTION_COLUMN, e.chipGroup)
  }
})

test('menu height uses 32px actions, 28px chips, 4px gaps and 9px separators', () => {
  const one = input.contextMenuEntries({ hasSelection: false, clipboardHasItems: false, pageHasItems: false, canEditText: false, lockedTarget: false, anyLocked: false })
  const rows = input.contextMenuRows(one)
  const actions = rows.filter((r) => r.entry).length
  const chips = rows.filter((r) => r.chips).reduce((sum, r) => sum + input.chipBlockHeight(r.chips), 0)
  const separators = rows.filter((r) => r.separator).length
  assert.equal(input.contextMenuHeight(one), 14 + actions * 32 + chips + separators * 9 + (rows.length - 1) * 4)
  assert.equal(input.chipBlockHeight([one.find((e) => e.chip)]), 28)
})

test('clampMenuPosition keeps the top 68px clear of the top bar when the menu fits below it', () => {
  const top = input.CONTEXT_MENU_TOP_CLEARANCE
  assert.equal(top, 68)
  assert.deepEqual(input.clampMenuPosition(900, 40, 296, 300, 1440, 800, top), { x: 900, y: 68 })
  assert.deepEqual(input.clampMenuPosition(900, 200, 296, 300, 1440, 800, top), { x: 900, y: 200 })
  // Bottom clamp still wins over the pointer, then the top clearance still holds.
  assert.deepEqual(input.clampMenuPosition(900, 790, 296, 300, 1440, 800, top), { x: 900, y: 500 })
  // Fits the window but not below the clearance: still never above it (it scrolls, see contextMenuMaxHeight).
  assert.deepEqual(input.clampMenuPosition(100, 10, 296, 560, 1024, 600, top), { x: 100, y: 68 })
  // Taller than the window: same, 68.
  assert.deepEqual(input.clampMenuPosition(100, 300, 296, 690, 1024, 600, top), { x: 100, y: 68 })
  // Without minTop (tablet or older callers) nothing changes.
  assert.deepEqual(input.clampMenuPosition(900, 40, 296, 300, 1440, 800), { x: 900, y: 40 })
})

test('stylesheet: chip captions in a fixed column, scroll shadow, reduced-motion safe open animation', () => {
  assert.match(panels, /\.canvas-context-chips \{[^}]*grid-template-columns: 84px minmax\(0, 1fr\)/)
  assert.match(panels, /\.canvas-context-menu \{[^}]*linear-gradient\(var\(--ip-surface\) 30%, transparent\) top[^}]*local/)
  assert.match(panels, /@keyframes ip-context-menu-in \{ from \{ opacity: 0; transform: scale\(\.98\); \} to \{ opacity: 1; transform: scale\(1\); \} \}/)
  assert.match(panels, /prefers-reduced-motion: reduce\) \{ \.app-shell\[data-input-mode="desktop"\] \.canvas-context-menu \{ animation: none; \} \}/)
})

test('desktop clamp: the top is never above 68, even when the menu is taller than the window (it sits at 68 and scrolls)', () => {
  const top = input.CONTEXT_MENU_TOP_CLEARANCE
  // Taller than what is left below the top clearance: sits at the clearance, never at 8.
  assert.deepEqual(input.clampMenuPosition(100, 300, 296, 690, 1024, 600, top), { x: 100, y: 68 })
  assert.deepEqual(input.clampMenuPosition(100, 10, 296, 540, 1024, 600, top), { x: 100, y: 68 })
  // Exactly fits below the clearance.
  assert.deepEqual(input.clampMenuPosition(100, 400, 296, 532, 1024, 600, top), { x: 100, y: 68 })
  // Without minTop (tablet) the old rule stays.
  assert.deepEqual(input.clampMenuPosition(100, 300, 296, 690, 1024, 600), { x: 100, y: 8 })
  for (const h of [100, 400, 700, 1200]) for (const y of [0, 40, 300, 900]) assert.ok(input.clampMenuPosition(50, y, 296, h, 1024, 700, top).y >= top, `h=${h} y=${y}`)
})

test('contextMenuMaxHeight ends the menu above the dock (or the 8px margin) and never collapses', () => {
  const { contextMenuMaxHeight: max, CONTEXT_MENU_BOTTOM_CLEARANCE: dock } = input
  assert.equal(max(68, 700, dock), 700 - 68 - 100)
  assert.equal(max(68, 900, 0), 900 - 68 - 8)
  assert.equal(max(68, 700, 3), 700 - 68 - 8) // tiny clearance still keeps the window margin
  assert.equal(max(68, 150, dock), 120) // very short window: a usable minimum
  // top + height never passes the dock line
  for (const h of [600, 700, 900]) assert.ok(68 + max(68, h, dock) <= h - dock)
})

test('chip width estimate is 6.8px per character plus 12px padding (two 11-character chips no longer count as one line)', () => {
  const chip = (text) => ({ chip: text, label: text, action: 'x', hint: '', section: 'shape', disabled: false })
  // 11 chars: ceil(74.8) + 12 = 87 each; 87 + 4 + 87 = 178 > the 170px chip column (the old 6.4 estimate gave 83 + 4 + 83 = 170).
  assert.equal(input.chipBlockLayout([chip('x'.repeat(11)), chip('x'.repeat(11))]).lines, 2)
  assert.equal(input.chipBlockLayout([chip('x'.repeat(10)), chip('x'.repeat(10))]).lines, 1)
})

test('corners has its own caption, and every caption fits in two lines of the caption column', () => {
  const entries = input.contextMenuEntries(busy)
  assert.equal(entries.find((e) => e.action === 'cornersRound').chipGroup, 'Corners')
  assert.equal(input.contextMenuEntries({ ...busy, corners: 'sharp' }).find((e) => e.action === 'cornersSharp').chipGroup, 'Corners')
  for (const state of [busy, { ...busy, arrowEnds: 'one', corners: 'sharp' }, { hasSelection: false, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }]) {
    for (const e of input.contextMenuEntries(state).filter((e) => e.chipGroup)) assert.ok(input.captionLineCount(e.chipGroup) <= 2, `${e.chipGroup} needs ${input.captionLineCount(e.chipGroup)} lines`)
  }
  assert.equal(input.captionLineCount('Step numbers'), 2)
  assert.equal(input.captionLineCount('Style'), 1)
  assert.ok(input.captionLineCount('A very long caption indeed') > 2)
  assert.doesNotMatch(panels.match(/\.canvas-context-chips-caption \{[^}]*\}/)[0], /max-height|overflow: hidden/)
})

test('menu: inline max-height from the clamp numbers, ArrowLeft/Right between chips, token-based scroll shadow', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const maxHeight = contextMenuMaxHeight\(position\.y, window\.innerHeight, menuBottomClearance\(position\.x, CONTEXT_MENU_WIDTH, dockRange\(\)\)\)/)
  assert.match(app, /style=\{\{ left: position\.x, top: position\.y, maxHeight, transformOrigin: origin \}\}/)
  assert.match(app, /Math\.max\(CONTEXT_MENU_TOP_CLEARANCE, rect\.top - overflow\)/)
  assert.doesNotMatch(app, /Math\.max\(8, rect\.top - overflow\)/)
  assert.match(app, /event\.key === 'ArrowLeft' \|\| event\.key === 'ArrowRight'[^]*?canvas-context-chips-row/)
  assert.doesNotMatch(panels.match(/\.canvas-context-menu \{[^}]*\}/)[0], /rgba\(0, 0, 0/)
  assert.match(panels.match(/\.canvas-context-menu \{[^}]*\}/)[0], /color-mix\(in srgb, var\(--ip-text\) 14%, transparent\)/)
})
