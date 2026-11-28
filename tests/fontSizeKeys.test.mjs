import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const input = await loadModule('desktopInput.ts')
const layout = await loadModule('textLayout.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const palette = await loadModule('commandPalette.ts')
const app = await readAppSource()
const press = (extra) => ({ key: '>', code: 'Period', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true, repeat: false, ...extra })

test('Ctrl/Cmd+Shift+. and , map to larger and smaller, with > and < key values too', () => {
  for (const mod of [{ ctrlKey: true }, { ctrlKey: false, metaKey: true }]) {
    assert.deepEqual(input.keyCommand(press({ ...mod }), 'desktop'), { kind: 'fontSize', direction: 1 })
    assert.deepEqual(input.keyCommand(press({ ...mod, key: '.' }), 'desktop'), { kind: 'fontSize', direction: 1 })
    assert.deepEqual(input.keyCommand(press({ ...mod, key: '<', code: 'Comma' }), 'desktop'), { kind: 'fontSize', direction: -1 })
    assert.deepEqual(input.keyCommand(press({ ...mod, key: ',', code: undefined }), 'desktop'), { kind: 'fontSize', direction: -1 })
  }
  // Another layout: the physical key decides.
  assert.deepEqual(input.keyCommand(press({ key: ':', code: 'Period' }), 'desktop'), { kind: 'fontSize', direction: 1 })
})

test('the font size keys need Ctrl/Cmd and Shift, ignore repeats, and are desktop only', () => {
  assert.equal(input.keyCommand(press({ repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(press({}), 'tablet'), null)
  assert.equal(input.keyCommand(press({ shiftKey: false, key: '.' }), 'desktop'), null)
  assert.equal(input.keyCommand({ key: '.', code: 'Period', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false }, 'desktop'), null)
})

test('stepFontSize moves one panel step and stops at the ends', () => {
  assert.deepEqual(layout.TEXT_FONT_SIZES_DESKTOP, [10, 12, 14, 16, 18, 24, 32, 48])
  assert.equal(layout.stepFontSize(24, 1), 32)
  assert.equal(layout.stepFontSize(24, -1), 18)
  assert.equal(layout.stepFontSize(48, 1), null)
  assert.equal(layout.stepFontSize(10, -1), null)
  assert.equal(layout.stepFontSize(20, 1), 24, 'a size between steps goes to the next step up')
  assert.equal(layout.stepFontSize(20, -1), 18, 'and to the next step down')
  assert.equal(layout.stepFontSize(100, -1), 48)
})

test('help and the palette list both shortcuts', () => {
  const rows = shortcuts.DESKTOP_SHORTCUTS.filter((row) => row.label.includes('text (text, shape or arrow labels)'))
  assert.deepEqual(rows.map((r) => r.keys), ['Ctrl+Shift+.', 'Ctrl+Shift+,'])
  for (const row of rows) assert.ok(input.keyCommand({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, key: '', ...row.input }, 'desktop'))
  const entries = palette.shortcutPaletteEntries()
  assert.ok(entries.some((e) => e.label === 'Larger text (text, shape or arrow labels)'))
  assert.ok(entries.some((e) => e.label === 'Smaller text (text, shape or arrow labels)'))
})

test('App applies a step through the panel size path: one undo step, auto-fit off, locked labels refused', () => {
  assert.match(app, /case 'fontSize': return stepSelectedFontSize\(command\.direction\)/)
  assert.match(app, /const stepSelectedFontSize = \(direction: 1 \| -1\): boolean => \{[\s\S]*?const item = selectedTextItem\(\)\s*if \(!item && inputModeRef\.current === .desktop.\) return stepBoxLabelFontSizes\(direction\)\s*if \(!item \|\| isItemLocked\(item\)\) return false\s*const size = stepTextSize\(item\.fontSize, direction\)\s*if \(size === null\) return true\s*pickTextSize\(size\)/)
  // pickTextSize replaces the label with fitOff: true through replaceTextItem, which saves exactly one history step.
  assert.match(app, /replaceTextItem\(buildEditedLabel\(item, item\.text, \{ itemId: item\.id[^}]*fontSize: size[^}]*fitOff: true \}/)
  assert.match(app, /const replaceTextItem = \(updated: TextObject\) => \{\s*saveHistory\(\)/)
})
