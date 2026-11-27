import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { readAppSource } from './helpers/appSource.mjs'

const app = await readAppSource()
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
const viewportSource = await readFile(new URL('../src/viewport.ts', import.meta.url), 'utf8')
const vp = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(viewportSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`)

const W = 1280
const H = 800

test('the view may scroll one desk margin past every edge of the sheet, and no further', () => {
  const m = vp.DESK_MARGIN_PX
  const topLeft = vp.clampViewportToSheet({ scale: 1.1, offsetX: 9999, offsetY: 9999 }, W, H, vp.SHEET_HEIGHT, m)
  assert.equal(topLeft.offsetX, m)
  assert.equal(topLeft.offsetY, m)
  const bottomRight = vp.clampViewportToSheet({ scale: 1.1, offsetX: -99999, offsetY: -99999 }, W, H, vp.SHEET_HEIGHT, m)
  assert.ok(Math.abs(bottomRight.offsetX - (W - vp.SHEET_WIDTH * 1.1 - m)) < 1e-6)
  assert.ok(Math.abs(bottomRight.offsetY - (H - vp.SHEET_HEIGHT * 1.1 - m)) < 1e-6)
})

test('without a margin the old limits are unchanged, and the margin is a thumb wide', () => {
  const v = vp.clampViewportToSheet({ scale: 1, offsetX: 500, offsetY: 500 }, W, H)
  assert.equal(v.offsetX, 0)
  assert.equal(v.offsetY, 0)
  assert.ok(vp.DESK_MARGIN_PX >= 60 && vp.DESK_MARGIN_PX <= 90)
})

test('the margin stays one thumb on screen at any zoom', () => {
  for (const scale of [0.5, 1.1, 2, 3]) {
    const v = vp.clampViewportToSheet({ scale, offsetX: 9999, offsetY: 9999 }, W, H, vp.SHEET_HEIGHT, vp.DESK_MARGIN_PX)
    assert.ok(Math.abs(v.offsetX - vp.DESK_MARGIN_PX) < 1e-6, `scale ${scale}`)
  }
})

test('rubber band: inside the limits the view follows the finger exactly', () => {
  const inside = { scale: 1.1, offsetX: -200, offsetY: -150 }
  assert.deepEqual(vp.rubberBandViewport(inside, W, H, vp.SHEET_HEIGHT, vp.DESK_MARGIN_PX), inside)
})

test('rubber band: past a limit it stretches with resistance and never beyond the maximum', () => {
  const hard = vp.clampViewportToSheet({ scale: 1.1, offsetX: 0, offsetY: -99999 }, W, H, vp.SHEET_HEIGHT, vp.DESK_MARGIN_PX)
  let previous = hard.offsetY
  for (const pull of [10, 40, 120, 400, 5000]) {
    const stretched = vp.rubberBandViewport({ scale: 1.1, offsetX: 0, offsetY: hard.offsetY - pull }, W, H, vp.SHEET_HEIGHT, vp.DESK_MARGIN_PX)
    const moved = hard.offsetY - stretched.offsetY
    assert.ok(moved > 0 && moved <= pull + 1e-9, 'moves, but less than the finger')
    assert.ok(moved <= vp.RUBBER_BAND_MAX_PX, 'stays under the maximum stretch')
    assert.ok(stretched.offsetY <= previous + 1e-9, 'keeps growing with the pull')
    previous = stretched.offsetY
  }
  assert.equal(vp.rubberBandOverscroll(0), 0)
  assert.ok(vp.rubberBandOverscroll(1) > 0.97 && vp.rubberBandOverscroll(1) <= 1, 'starts close to 1:1')
})

test('rubber band keeps zoom hard-clamped', () => {
  const v = vp.rubberBandViewport({ scale: 99, offsetX: 0, offsetY: 0 }, W, H, vp.SHEET_HEIGHT, vp.DESK_MARGIN_PX)
  assert.equal(v.scale, 3)
})

test('the app stretches while a finger drags and springs back on release', () => {
  assert.match(app, /gesture\s*\?\s*rubberBandViewport\(viewport, rect\.width, rect\.height, sheetHeightRef\.current, DESK_MARGIN_PX\)/)
  assert.match(app, /settleViewportGesture\(\)/)
  assert.match(app, /const SPRING_BACK_MS = /)
  assert.match(app, /finishSpringBackNow\(\)/)
})

test('the desk around the page is not writable', () => {
  assert.match(app, /clipSegmentToBounds\(previous, point, sheetBoundsRef\.current\)/)
  assert.match(app, /isPointWithinBounds\(rawPoint, sheetBoundsRef\.current\)/)
  assert.match(app, /isPointWithinBounds\(point, sheetBoundsRef\.current\) \? point : null/)
})

test('the page sits on the desk with an edge shadow', () => {
  assert.match(styles, /\.sheet-layer \{[^}]*box-shadow:[^;]*0 2px 12px/)
})

test('with the screen locked the pen colours stay; only the avatar and reconnect pill hide', async () => {
  const account = await readFile(new URL('../src/app/AccountButton.tsx', import.meta.url), 'utf8')
  assert.match(account, /hideAccount\?: boolean/)
  assert.match(account, /if \(props\.hideAccount && !props\.leading\) return null/)
  assert.match(account, /\{props\.leading\}/)
  assert.match(account, /!props\.hideAccount && props\.needsReconnect/)
  assert.match(account, /\{!props\.hideAccount && \(\s*<button className=\{`account-button/)
  assert.match(app, /hideAccount=\{zoomLockActive\}.*leading=\{inputMode === 'desktop' \? <DesktopStatusCluster[^]*?accountLeading\(penModeActive, inputMode, <PenColors/)
})
