import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { readAppSource } from './helpers/appSource.mjs'

const app = await readAppSource()
const panel = readFileSync(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('the Group / Ungroup panel props are no longer desktop-only', () => {
  const start = app.indexOf('group={(canGroup(')
  assert.ok(start > 0, 'group prop present without an inputMode gate')
  const body = app.slice(start, start + 450)
  assert.doesNotMatch(body, /inputMode === 'desktop'/)
  assert.match(body, /onGroup: \(\) => \{ groupSelection\(\) \}/)
  assert.match(body, /onUngroup: \(\) => \{ ungroupSelection\(\) \}/)
})

test('the tablet tooltips do not advertise Ctrl shortcuts; the buttons use the 44px touch size', () => {
  assert.match(panel, /title=\{props\.desktop \? "Group the selected items[^"]*\(Ctrl\+G\)" : "Group the selected items[^"(]*"\}/)
  assert.match(panel, /title=\{props\.desktop \? "Take the selected items[^"]*\(Ctrl\+Shift\+G\)" : "Take the selected items[^"(]*"\}/)
  assert.match(css, /\.context-panel \.selection-actions button \{ flex: 1 1 auto; min-height: 44px; \}/)
})
