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
  // Fits the window but not below the clearance: old behaviour (no extra clamp).
  assert.deepEqual(input.clampMenuPosition(100, 10, 296, 560, 1024, 600, top), { x: 100, y: 10 })
  // Taller than the window: top margin of 8 and the menu scrolls.
  assert.deepEqual(input.clampMenuPosition(100, 300, 296, 690, 1024, 600, top), { x: 100, y: 8 })
  // Without minTop (tablet or older callers) nothing changes.
  assert.deepEqual(input.clampMenuPosition(900, 40, 296, 300, 1440, 800), { x: 900, y: 40 })
})

test('stylesheet: chip captions in a fixed column, scroll shadow, reduced-motion safe open animation', () => {
  assert.match(panels, /\.canvas-context-chips \{[^}]*grid-template-columns: 84px minmax\(0, 1fr\)/)
  assert.match(panels, /\.canvas-context-menu \{[^}]*linear-gradient\(var\(--ip-surface\) 30%, transparent\) top[^}]*local/)
  assert.match(panels, /@keyframes ip-context-menu-in \{ from \{ opacity: 0; transform: scale\(\.98\); \} to \{ opacity: 1; transform: scale\(1\); \} \}/)
  assert.match(panels, /prefers-reduced-motion: reduce\) \{ \.app-shell\[data-input-mode="desktop"\] \.canvas-context-menu \{ animation: none; \} \}/)
})
