import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const bar = await read('app/TopLeftBar.tsx')
const css = await read('styles.css')
const app = await read('App.tsx')
const panel = bar.slice(bar.indexOf('{menuOpen && <div className="menu-panel"'), bar.indexOf('{props.diagnostics.enabled && <>'))

test('the menu has three labelled groups in order: File, Page, Canvas, then Clear canvas apart', () => {
  const at = (text) => panel.indexOf(text)
  for (const text of ['>File<', '>Page<', '>Canvas<', 'Clear canvas']) assert.ok(at(text) > 0, text)
  assert.ok(at('>File<') < at('>Page<') && at('>Page<') < at('>Canvas<') && at('>Canvas<') < at('Clear canvas'))
  assert.match(panel, /className="menu-row library-row"[^>]*onClick=\{\(\) => \{ props\.onOpenLibrary\(\); setMenuOpen\(false\) \}\}/)
  assert.match(panel, /Export and import/)
  assert.match(panel, /Undo brings it back/)
})

test('each page setting is its own full-width line of equal segments, so nothing reaches the right edge (it once did)', () => {
  assert.match(css, /\.menu-panel \{[^}]*width: min\(340px, calc\(100vw - 32px\)\)/)
  assert.match(css, /\.menu-segments \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.menu-segment \{ min-width: 0;/)
  assert.match(css, /\.menu-swatches \{ display: flex; justify-content: space-between;/)
  assert.match(css, /\.menu-color \{ width: 44px; height: 44px;/)
  assert.equal((panel.match(/className="menu-segments"/g) ?? []).length, 2)
  assert.doesNotMatch(bar + css, /menu-choice/)
})

test('a short screen scrolls the menu instead of cutting it off', () => {
  assert.match(css, /\.menu-panel \{[^}]*max-height: calc\(100dvh - 96px\); overflow-y: auto;/)
})

test('One-finger pan is a real switch; the header shows the save state', () => {
  assert.match(panel, /role="switch" aria-checked=\{props\.oneFingerPan\}/)
  assert.match(panel, /className=\{`menu-switch\$\{props\.oneFingerPan \? ' on' : ''\}`\}/)
  assert.match(panel, /className=\{`menu-save-status\$\{props\.statusOk \? ' ok' : ''\}`\} role="status"/)
  assert.match(app, /statusText=\{statusLabel\(saveStatus, storage\.kind\)\}/)
  assert.match(app, /statusOk=\{saveStatus === 'saved'\}/)
})

test('Slim ink points left the everyday menu and lives with the developer tools', () => {
  assert.doesNotMatch(panel, /Slim ink points/)
  const dev = bar.slice(bar.indexOf('{props.diagnostics.enabled && <>'))
  assert.match(dev, /Slim ink points/)
  assert.match(dev, /props\.onSlimInk\(\)/)
})

test('Clear canvas is red and undoable', () => {
  assert.match(css, /\.menu-panel \.menu-row\.clear-row \{ background: #fdf1f0; color: #b3261e;/)
  assert.match(app, /const clearCanvas = \(\) => \{[\s\S]*?saveHistory\(\)/)
})

test('no old toolbar style makes one menu row look different (Export and import once had a border and 11 px text)', () => {
  assert.doesNotMatch(css, /^\.file-button\b/m)
})
