import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { zoomMenuItems, ZOOM_MENU_LEVELS } = await loadModule('zoomMenu.ts')
const app = await readAppSource()
const controls = await readFile(new URL('../src/app/ZoomControls.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')

test('zoom menu offers 50/100/150/200, Fit drawing and Fit selection in order', () => {
  assert.deepEqual([...ZOOM_MENU_LEVELS], [50, 100, 150, 200])
  const items = zoomMenuItems({ locked: false, hasSelection: true, desktop: false })
  assert.deepEqual(items.map((item) => item.label), ['50%', '100%', '150%', '200%', 'Fit drawing', 'Fit selection'])
  assert.deepEqual(items[1].choice, { kind: 'level', percent: 100 })
  assert.ok(items.every((item) => !item.disabled))
})

test('Fit selection is disabled without a selection; hints show on desktop only', () => {
  const items = zoomMenuItems({ locked: false, hasSelection: false, desktop: true })
  assert.equal(items.find((item) => item.id === 'zoom:fit-selection').disabled, true)
  assert.equal(items.find((item) => item.id === 'zoom:fit-drawing').disabled, false)
  assert.equal(items.find((item) => item.id === 'zoom:fit-drawing').hint, 'Shift+1')
  assert.equal(items.find((item) => item.id === 'zoom:fit-selection').hint, 'Shift+2')
  assert.ok(zoomMenuItems({ locked: false, hasSelection: true, desktop: false }).every((item) => item.hint === undefined))
})

test('the zoom lock disables every zoom choice', () => {
  assert.ok(zoomMenuItems({ locked: true, hasSelection: true, desktop: false }).every((item) => item.disabled))
})

test('the % readout is a menu button in both modes, closes on Esc and outside press', () => {
  assert.match(controls, /className="zoom-indicator zoom-indicator-button"[^>]*aria-haspopup="menu"[^>]*title="Zoom options"/)
  assert.doesNotMatch(controls, /<output/)
  assert.match(controls, /event\.key === 'Escape'/)
  assert.match(controls, /addEventListener\('pointerdown'/)
  assert.match(controls, /setOpen\(false\); onZoomChoice\(item\.choice\)/)
  assert.match(controls, /\{!desktop && <button type="button" className=\{`zoom-lock/)
  assert.match(styles, /\.zoom-controls \.zoom-menu button\.menu-row \{[^}]*min-height: 44px/)
})

test('App wires the menu to the existing fit handlers and keeps Ctrl+0', () => {
  assert.match(app, /onZoomChoice=\{applyZoomChoice\}/)
  assert.match(app, /hasSelection=\{currentSelectionKeys\(\)\.size > 0\}/)
  assert.match(app, /const applyZoomChoice = [\s\S]*?zoomToFitDesktop\(\)[\s\S]*?fitDrawingView\(\)[\s\S]*?zoomToSelection\(\)/)
  assert.match(app, /const zoomToPercent = [\s\S]*?navigationSettingsRef\.current\.zoomLocked\) return[\s\S]*?rect\.width \/ 2/)
  assert.match(app, /case 'zoomReset': zoomToActualSize\(\)/)
})
