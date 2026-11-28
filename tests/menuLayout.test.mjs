import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const bar = await read('app/TopLeftBar.tsx')
const css = await read('styles.css')
const app = await read('App.tsx')
const panel = bar.slice(bar.indexOf('{menuOpen && <div className="menu-panel"'), bar.indexOf('{props.diagnostics.enabled && <>'))

test('the menu has labelled groups in order: File, Board, Canvas, then Clear canvas apart', () => {
  const at = (text) => panel.indexOf(text)
  for (const text of ['>File<', '>Board<', '>Canvas<', 'Clear canvas']) assert.ok(at(text) > 0, text)
  assert.ok(at('>File<') < at('>Board<') && at('>Board<') < at('>Canvas<') && at('>Canvas<') < at('Clear canvas'))
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
  assert.equal((panel.match(/className="menu-segments"/g) ?? []).length, 1)
  assert.match(panel, /className="menu-segments two" role="group" aria-label="Board theme"/)
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

test('Change shape: HLD chips collapse to one line plus More…, which expands them in place; basic shapes stay as they are', async () => {
  const { loadModule } = await import('./helpers/loadModule.mjs')
  const input = await loadModule('desktopInput.ts')
  const hld = await loadModule('hldShapes.ts')
  const base = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }
  const choices = hld.HLD_SHAPES.slice(1).map((id) => ({ id, label: hld.HLD_SHAPE_LABELS[id] }))
  const chips = (state) => input.contextMenuEntries({ ...base, ...state }).filter((e) => e.chipGroup === 'Change shape')
  const collapsed = chips({ changeShapes: choices })
  assert.ok(choices.length >= 10)
  const shapeChips = collapsed.filter((e) => e.action.startsWith('shape:'))
  assert.ok(shapeChips.length >= 2 && shapeChips.length <= 6)
  assert.deepEqual(shapeChips.map((e) => e.action), choices.slice(0, shapeChips.length).map((c) => `shape:${c.id}`))
  assert.equal(collapsed.at(-1).action, 'shapesMore')
  assert.ok(input.chipBlockLayout(collapsed).lines <= 2, 'the collapsed shapes use at most two chip lines')
  const expanded = chips({ changeShapes: choices, changeShapesExpanded: true })
  assert.equal(expanded.length, choices.length)
  assert.ok(!expanded.some((e) => e.action === 'shapesMore'))
  const plain = chips({ changeShapes: [{ id: 'diamond', label: 'Diamond' }, { id: 'ellipse', label: 'Ellipse' }] })
  assert.deepEqual(plain.map((e) => e.action), ['shape:diamond', 'shape:ellipse'])
  assert.match(app, /action === 'shapesMore'/)
  assert.match(app, /changeShapesExpanded: contextMenu\.shapesExpanded === true/)
})
