import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')

test('round 7 walk: the desktop selection panel ends above the zoom control (no buttons hidden under it at 1440x900 or 1024x700)', () => {
  const rule = css.match(/\.context-panel\.desktop-left \{[^}]*\}/)?.[0] ?? ''
  assert.match(rule, /max-height: calc\(100vh - 252px\)/)
  assert.match(rule, /overflow-y: auto/)
})
