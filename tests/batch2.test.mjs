import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { readAppSource } from './helpers/appSource.mjs'

const app = await readAppSource()
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
const menu = await readFile(new URL('../src/app/TopLeftBar.tsx', import.meta.url), 'utf8')
const tray = await readFile(new URL('../src/app/InsertTray.tsx', import.meta.url), 'utf8')
const viewportSource = await readFile(new URL('../src/viewport.ts', import.meta.url), 'utf8')
const vp = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(viewportSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`)

test('tool options close on any tap outside the options, dock and popover, and on Escape', () => {
  assert.match(app, /closest\?\.\('\.context-panel, \.eraser-popover, \.tool-dock'\)/)
  assert.match(app, /window\.addEventListener\('pointerdown', onPointerDown\)/)
  assert.match(app, /event\.key === 'Escape'\) setOptionsFor\(null\)/)
  assert.match(app, /const eraserMenuOpen = optionsFor === 'eraser'/)
})

test('single tap selects a tool and a double tap opens its options', () => {
  assert.match(app, /const DOUBLE_TAP_MS = 400/)
  assert.match(app, /const tapPenTool = \(\) => \{[\s\S]*?setOptionsFor\(double \? 'pen' : null\)/)
  assert.match(app, /const tapEraserTool = \(\) => \{\s*if \(isDoubleTap\('eraser'\)\)[\s\S]*?setOptionsFor\('eraser'\)[\s\S]*?setOptionsFor\(null\)/)
  assert.match(app, /onTextOptions=\{openTextOptions\}/)
  assert.match(tray, /textActive && now - lastTapRef\.current <= 400/)
  assert.doesNotMatch(app, /showStyle=\{!eraser/)
})

test('the sheet fills the screen: zoom-out stops where the sheet exactly fits', () => {
  const cover = vp.getCoverScale(1280, 800)
  assert.equal(cover, Math.max(1280 / vp.SHEET_WIDTH, 800 / vp.SHEET_HEIGHT))
  const tooSmall = vp.clampViewportToSheet({ scale: 0.1, offsetX: 500, offsetY: 500 }, 1280, 800)
  assert.equal(tooSmall.scale, cover)
  for (const [w, h] of [[1280, 800], [800, 1280], [1920, 1080]]) {
    for (const scale of [0.05, 0.5, 1, 1.1, 3]) {
      for (const [ox, oy] of [[-9999, -9999], [9999, 9999], [0, 0]]) {
        const v = vp.clampViewportToSheet({ scale, offsetX: ox, offsetY: oy }, w, h)
        assert.ok(v.offsetX <= 1e-6 && v.offsetX + vp.SHEET_WIDTH * v.scale >= w - 1e-6, 'no gray horizontally')
        assert.ok(v.offsetY <= 1e-6 && v.offsetY + vp.SHEET_HEIGHT * v.scale >= h - 1e-6, 'no gray vertically')
      }
    }
  }
  assert.match(app, /clampViewportToSheet\(viewport, rect\.width, rect\.height, sheetHeightRef\.current, DESK_MARGIN_PX\)/)
  assert.match(app, /return \{ \.\.\.sheetBoundsRef\.current \}/)
})

test('fresh app and opened diagrams start at 110% centered on the sheet; Fit drawing remains', () => {
  const v = vp.getInitialViewport(1280, 800)
  assert.equal(v.scale, 1.1)
  assert.ok(Math.abs(v.offsetX + (vp.SHEET_WIDTH / 2) * v.scale - 640) < 1e-6)
  assert.ok(Math.abs(v.offsetY + (vp.SHEET_HEIGHT / 2) * v.scale - 400) < 1e-6)
  assert.match(app, /renderAll\(\)\s*openAtDefaultView\(\)\s*\},\s*\}\)/)
  assert.match(app, /<button type="button" onClick=\{fitDrawingView\}>Fit drawing<\/button>/)
})

test('the menu is a clean icon list with dividers, page choices and sheet color swatches', () => {
  assert.match(menu, /className="menu-divider"/)
  assert.match(menu, /aria-label="Page template"/)
  assert.match(menu, /aria-label="Sheet background color"/)
  assert.match(menu, /Export and import/)
  assert.match(menu, /Clear canvas/)
  assert.doesNotMatch(menu, /<select/)
  assert.doesNotMatch(menu, /page-color-swatch/)
  assert.match(styles, /\.menu-row \{[^}]*min-height: 48px/)
  assert.match(styles, /\.menu-divider/)
})
