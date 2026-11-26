import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const app = await readAppSource()
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })

test('every shortcut with a key press maps to a command in desktop mode and to nothing in tablet mode', () => {
  let driven = 0
  for (const entry of shortcuts.DESKTOP_SHORTCUTS) {
    const event = shortcuts.shortcutKeyInput(entry)
    if (!event) continue
    driven += 1
    assert.ok(input.keyCommand(event, 'desktop'), `${entry.group}: ${entry.label} (${entry.keys})`)
    assert.equal(input.keyCommand(event, 'tablet'), null, `${entry.label} is desktop only`)
  }
  assert.ok(driven > 30)
  for (const group of shortcuts.SHORTCUT_GROUPS) assert.ok(shortcuts.shortcutsInGroup(group).length > 0, group)
  assert.deepEqual(new Set(shortcuts.DESKTOP_SHORTCUTS.map((e) => e.group)), new Set(shortcuts.SHORTCUT_GROUPS))
})

test('Shift+1, Shift+2, Ctrl+0, PageUp, PageDown and ? map to their commands', () => {
  assert.deepEqual(input.keyCommand(key('!', { code: 'Digit1', shiftKey: true }), 'desktop'), { kind: 'zoomFit' })
  assert.deepEqual(input.keyCommand(key('@', { code: 'Digit2', shiftKey: true }), 'desktop'), { kind: 'zoomSelection' })
  assert.deepEqual(input.keyCommand(key('&', { code: 'Digit1', shiftKey: true }), 'desktop'), { kind: 'zoomFit' }, 'other layouts')
  assert.deepEqual(input.keyCommand(key('1', { code: 'Digit1' }), 'desktop'), { kind: 'tool', tool: 'select' }, 'a bare 1 is now the Select tool')
  assert.equal(input.keyCommand(key('!', { code: 'Digit1', shiftKey: true, ctrlKey: true }), 'desktop'), null)
  assert.deepEqual(input.keyCommand(key('0', { ctrlKey: true }), 'desktop'), { kind: 'zoomReset' })
  assert.deepEqual(input.keyCommand(key('PageUp'), 'desktop'), { kind: 'pagePrev' })
  assert.deepEqual(input.keyCommand(key('PageDown'), 'desktop'), { kind: 'pageNext' })
  assert.equal(input.keyCommand(key('PageDown', { repeat: true }), 'desktop'), null)
  assert.deepEqual(input.keyCommand(key('?', { shiftKey: true }), 'desktop'), { kind: 'help' })
  assert.equal(input.keyCommand(key('?', { shiftKey: true, ctrlKey: true }), 'desktop'), null)
  for (const k of ['PageUp', 'PageDown']) assert.equal(input.keyCommand(key(k), 'tablet'), null)
})

test('wiring: zoom and page commands, help dialog, hidden tablet-only controls and tooltips', () => {
  assert.match(app, /case 'zoomFit': zoomToFitDesktop\(\)/)
  assert.match(app, /case 'zoomSelection': zoomToSelection\(\)/)
  assert.match(app, /case 'zoomReset': zoomToActualSize\(\)/)
  assert.match(app, /case 'pagePrev': goToPage\(pageIndexRef\.current - 1\)/)
  assert.match(app, /case 'pageNext': goToPage\(pageIndexRef\.current \+ 1\)/)
  assert.match(app, /case 'help': setShortcutHelpOpen/)
  assert.match(app, /shortcutHelpOpen && inputMode === 'desktop' && <ShortcutHelp/)
  assert.match(app, /zoomLockActive = navigationSettings\.zoomLocked && inputMode !== 'desktop'/)
  assert.match(app, /\{!desktop && <button type="button" className=\{`zoom-lock/, 'zoom lock hidden on desktop')
  assert.match(app, /props\.inputMode !== 'desktop' && <button className="menu-row menu-switch-row" type="button" role="switch" aria-checked=\{props\.oneFingerPan\}/)
  assert.match(app, /props\.inputMode === 'desktop' && props\.onShortcutHelp/)
  assert.match(app, /Undo \(Ctrl\+Z\)/)
  assert.match(app, /Redo \(Ctrl\+Y\)/)
  assert.match(app, /Zoom in \(Ctrl\+\+\)/)
  assert.match(app, /Zoom out \(Ctrl\+-\)/)
  assert.match(app, /onZoomChoice=\{applyZoomChoice\}/)
  assert.match(app, /Escape/)
  assert.match(app, /event\.target === event\.currentTarget\) onClose\(\)/)
})
