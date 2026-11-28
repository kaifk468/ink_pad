import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const app = await readAppSource()

test('snappingSuspended: Alt with a mouse in Desktop mode only', () => {
  assert.equal(input.snappingSuspended({ altKey: true, pointerType: 'mouse' }, 'desktop'), true)
  assert.equal(input.snappingSuspended({ altKey: false, pointerType: 'mouse' }, 'desktop'), false)
  assert.equal(input.snappingSuspended({ pointerType: 'mouse' }, 'desktop'), false)
  assert.equal(input.snappingSuspended({ altKey: true, pointerType: 'pen' }, 'desktop'), false)
  assert.equal(input.snappingSuspended({ altKey: true, pointerType: 'touch' }, 'desktop'), false)
  assert.equal(input.snappingSuspended({ altKey: true, pointerType: 'mouse' }, 'tablet'), false)
})

test('the ? list mentions Alt while dragging', () => {
  assert.ok(shortcuts.DESKTOP_SHORTCUTS.some((row) => row.keys === 'Alt + drag' && /place freely/.test(row.label) && !row.input))
})

test('wiring: grid, guides and equal gaps all go through snappingSuspended; Ctrl-drag duplicate untouched', () => {
  assert.match(app, /const gridActive = \(event: \{ pointerType: string; altKey\?: boolean \}\): number \| null =>\s*!snappingSuspended\(event, inputModeRef\.current\) && gridSnapApplies\(gridSnapRef\.current, inputModeRef\.current, event\.pointerType\)/)
  assert.match(app, /if \(!snappingRef\.current \|\| snappingSuspended\(event, inputModeRef\.current\)\) \{\s*guidesRef\.current = \[\]\s*gridOverlayRef\.current = null/)
  assert.ok((app.match(/gridActive\(event\)/g) ?? []).length >= 5, 'drag, resize, new box, class box and free connector ends share the gate')
  assert.match(app, /drag\.duplicate/)
})
