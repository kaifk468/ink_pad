import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const input = await loadModule('desktopInput.ts')
const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
const css = (await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')

const hld = ['database', 'queue', 'service', 'user', 'browser', 'mobile', 'cache', 'loadBalancer', 'cdn', 'apiGateway', 'server', 'objectStorage', 'stream', 'worker'].map((id) => ({ id, label: ({ loadBalancer: 'Load balancer', apiGateway: 'API gateway', objectStorage: 'Object storage' })[id] ?? id[0].toUpperCase() + id.slice(1) }))
// Five grouped HLD boxes joined by labelled connectors: every optional chip block is on.
const busy = { hasSelection: true, clipboardHasItems: true, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false, canCopyStyle: true, canPasteStyle: true, canSelectSimilar: true, canGroup: true, canUngroup: true, changeShapes: hld, canNumberSteps: true, canSameSize: true, canSelectConnected: true, changeShapesExpanded: true }

test('right-click menu: the busiest selection is about 790 px tall; at 1024x700 it scrolls inside its max-height with the scroll shadow cue', () => {
  const entries = input.contextMenuEntries(busy)
  // Round 7 (menu redesign): 32px action rows, 28px chips and 4px gaps made the busiest menu taller than a 700px window; it scrolls (CSS max-height) and shows a bottom shadow.
  assert.ok(input.contextMenuHeight(entries) <= 840, 'height ' + input.contextMenuHeight(entries))
  assert.ok(input.contextMenuHeight(entries) >= 600)
})
test('right-click menu: Group, Ungroup, Zoom, Lock and Select all became chips, every command is still there', () => {
  const entries = input.contextMenuEntries(busy)
  const rows = input.contextMenuRows(entries)
  const groups = Object.fromEntries(rows.filter((r) => r.chips).map((r) => [r.chips[0].chipGroup, r.chips.map((c) => c.chip)]))
  assert.deepEqual(groups.Selection, ['Group', 'Ungroup', 'Zoom', 'Focus', 'Lock'])
  assert.deepEqual(groups.Select, ['Similar', 'Connected', 'All'])
  for (const action of ['group', 'ungroup', 'zoomSelection', 'focus', 'lock', 'selectAll', 'selectConnected', 'numberSteps', 'clearSteps', 'sameWidth', 'sameHeight', 'sameSize', 'copyPng', 'exportPng', 'exportSvg', 'saveTemplate']) {
    assert.ok(entries.some((e) => e.action === action), action)
  }
  // Labels (tooltips) and shortcut hints stay on the chip entries.
  const group = entries.find((e) => e.action === 'group')
  assert.equal(group.label, 'Group')
  assert.equal(group.hint, 'Ctrl+G')
  assert.equal(entries.find((e) => e.action === 'zoomSelection').label, 'Zoom to selection')
  assert.equal(entries.find((e) => e.action === 'selectAll').hint, 'Ctrl+A')
  // Select all is disabled on an empty page, Zoom without a selection.
  const empty = input.contextMenuEntries({ ...busy, hasSelection: false, pageHasItems: false, canGroup: false, canUngroup: false })
  assert.equal(empty.find((e) => e.action === 'selectAll').disabled, true)
  assert.equal(empty.find((e) => e.action === 'zoomSelection').disabled, true)
  // Unlock stays a normal row.
  assert.equal(input.contextMenuEntries({ ...busy, lockedTarget: true }).find((e) => e.action === 'unlock').chip, undefined)
})

test('connector label size buttons carry a Text size heading', () => {
  assert.match(panel, /\{props\.connectorLabelSize && <span className="panel-label">Text size<\/span>\}\s*\{props\.connectorLabelSize && <div className="tool-group text-size-group" role="group" aria-label="Arrow label size">/)
})

test('desktop 1101-1700px: the zoom control sits above the dock together with the minimap', () => {
  const block = css.match(/@media \(min-width: 1101px\) and \(max-width: 1700px\) \{\n([\s\S]*?)\n\}/)
  assert.ok(block, 'media block')
  assert.match(block[1], /\.app-shell:has\(\.desktop-dock\) \.zoom-controls \{ bottom: calc\(max\(16px, env\(safe-area-inset-bottom\)\) \+ 84px\); \}/)
  assert.match(block[1], /\.app-shell:has\(\.desktop-dock\) \.viewport-navigator \{ bottom: calc\(max\(16px, env\(safe-area-inset-bottom\)\) \+ 84px\); \}/)
})

test('right-click menu is moved up after layout when it runs past the bottom edge', async () => {
  const { readAppSource } = await import('./helpers/appSource.mjs')
  const source = await readAppSource()
  assert.match(source, /useLayoutEffect\(\(\) => \{\s*const menu = contextMenuElementRef\.current[\s\S]*?rect\.bottom - \(window\.innerHeight - (?:8|menuBottomClearance\([^)]*\))\)|const clearance = menuBottomClearance[\s\S]*?menu\.style\.top =/)
})
