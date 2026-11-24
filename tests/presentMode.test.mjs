import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const palette = await loadModule('commandPalette.ts')
const app = await readAppSource()
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })

test('Alt+Z is the present-mode command: physical key, no other modifier, no repeat, desktop only', () => {
  assert.deepEqual(input.keyCommand(key('z', { altKey: true, code: 'KeyZ' }), 'desktop'), { kind: 'presentMode' })
  assert.deepEqual(input.keyCommand(key('Ω', { altKey: true, code: 'KeyZ' }), 'desktop'), { kind: 'presentMode' }, 'Mac Alt changes key, code decides')
  assert.equal(input.keyCommand(key('z', { altKey: true, code: 'KeyZ', repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('z', { altKey: true, code: 'KeyZ' }), 'tablet'), null)
  assert.equal(input.keyCommand(key('z', { altKey: true, code: 'KeyZ', shiftKey: true }), 'desktop'), null)
  assert.notDeepEqual(input.keyCommand(key('z', { altKey: true, code: 'KeyZ', ctrlKey: true }), 'desktop'), { kind: 'presentMode' })
  assert.deepEqual(input.keyCommand(key('z', { ctrlKey: true, code: 'KeyZ' }), 'desktop'), { kind: 'undo' }, 'Ctrl+Z still undoes')
})

test('Alt+Z has a help row that maps to the command, and so a palette entry', () => {
  const row = shortcuts.DESKTOP_SHORTCUTS.find((entry) => entry.keys === 'Alt+Z')
  assert.ok(row && /toolbars/i.test(row.label))
  assert.deepEqual(input.keyCommand(shortcuts.shortcutKeyInput(row), 'desktop'), { kind: 'presentMode' })
  assert.ok(palette.shortcutPaletteEntries().some((entry) => entry.keys === 'Alt+Z'))
})

test('wiring: one class on the app root, nothing unmounted, plain state (not saved)', async () => {
  assert.match(app, /<main className=\{`app-shell\$\{presentMode \? ' ui-hidden' : ''\}`\}>/)
  assert.match(app, /const \[presentMode, setPresentMode\] = useState\(false\)/)
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  const rule = css.slice(css.indexOf('.app-shell.ui-hidden .tool-dock'), css.indexOf('.show-toolbars-pill {'))
  for (const part of ['.tool-dock', '.top-left-bar', '.history-bar', '.context-panel', '.zoom-controls', '.viewport-navigator']) assert.ok(rule.includes(`.ui-hidden ${part}`), part)
  assert.match(rule, /pointer-events: none/)
  assert.doesNotMatch(app.slice(app.indexOf('const togglePresentMode'), app.indexOf('const toggleLaserTool')), /saveHistory|scheduleAutosave|strokesRef/)
})

test('wiring: key, pill, More entry; Esc exits only when nothing else takes it', () => {
  assert.match(app, /case 'presentMode': togglePresentMode\(\); return true/)
  assert.match(app, /\{presentMode && <button className="show-toolbars-pill"[^>]*onClick=\{\(\) => setPresentMode\(false\)\}>Show toolbars<\/button>\}/)
  assert.match(app, /onPresent=\{togglePresentMode\}/)
  const start = app.indexOf("if (command.kind === 'deselect') {\n      // Esc leaves the laser")
  assert.ok(start > 0)
  const esc = app.slice(start, app.indexOf("case 'undo': undo()"))
  assert.ok(esc.indexOf('cancelGesture') < esc.indexOf('setPresentMode(false)'), 'cancel a drag first')
  assert.ok(esc.indexOf('setLaserMode(false)') < esc.indexOf('setPresentMode(false)'), 'laser first')
  assert.match(esc, /presentModeRef\.current && !gestureActive && touchNav\.touchCount\(\) === 0/)
  assert.match(esc, /if \(action === 'none'\) \{[\s\S]*setPresentMode\(false\)[\s\S]*return false/)
})

test('wiring: the More tray has a pressed "Hide toolbars" entry in both modes', async () => {
  const more = await readFile(new URL('../src/app/MoreTray.tsx', import.meta.url), 'utf8')
  assert.match(more, /aria-label="Hide toolbars" aria-pressed=\{Boolean\(presentActive\)\}/)
  const dock = await readFile(new URL('../src/app/ToolDock.tsx', import.meta.url), 'utf8')
  assert.equal((dock.match(/<MoreTray [^>]*onPresent=\{props\.onPresent\}/g) ?? []).length, 2)
})
