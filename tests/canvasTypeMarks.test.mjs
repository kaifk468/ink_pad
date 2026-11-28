import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFile } from 'node:fs/promises'

const t = await loadModule('pageTemplates.ts')
const grid = await loadModule('gridSnap.ts')
const exp = await loadModule('sheetExport.ts')
const app = await readAppSource()
const documents = await readFile(new URL('../src/app/useDocuments.ts', import.meta.url), 'utf8')
const viewport = { scale: 1, offsetX: 0, offsetY: 0 }
const layers = (css) => css.backgroundImage.split(/,\s*(?=linear-gradient|radial-gradient)/).length
const sizes = (css) => css.backgroundSize.split(', ')

test('old template types produce exactly the CSS they always did', () => {
  assert.deepEqual(t.getPageTemplateCss('blank'), { backgroundImage: 'none', backgroundSize: 'auto' })
  assert.deepEqual(t.getPageTemplateCss('lined'), { backgroundImage: 'linear-gradient(to bottom, transparent 30.875px, #aebfd8 30.875px)', backgroundSize: '32px 32px' })
  assert.deepEqual(t.getPageTemplateCss('dotted', 'narrow'), { backgroundImage: 'radial-gradient(circle at 2px 2px, #788392 1.5px, transparent 1.9px)', backgroundSize: '25.6px 25.6px' })
  for (const type of ['blank', 'lined', 'dotted']) {
    const state = t.getSheetLayerState(type, '#fff', viewport)
    assert.deepEqual(Object.keys(state).sort(), ['backgroundColor', 'backgroundImage', 'backgroundSize', 'transform'])
    assert.deepEqual(state, t.getSheetLayerState(type, '#fff', viewport, 'standard', t.PAGE_MARKS_LIGHT))
  }
})

test('grid: thin and strong lines in two directions, four layers, strong every 5th', () => {
  const css = t.getPageTemplateCss('grid')
  assert.equal(layers(css), 4)
  assert.deepEqual(sizes(css), ['160px 160px', '160px 160px', '32px 32px', '32px 32px'])
  assert.match(css.backgroundImage, /#8197bb/)
  assert.match(css.backgroundImage, /#aebfd8/)
  assert.deepEqual(sizes(t.getPageTemplateCss('grid', 'wide')), ['192px 192px', '192px 192px', '38.4px 38.4px', '38.4px 38.4px'])
})

test('isometric: two dot layers on a triangular lattice (tile spacing x 2 rows, odd rows offset half a spacing)', () => {
  const css = t.getPageTemplateCss('isometric')
  assert.equal(layers(css), 2)
  assert.deepEqual(sizes(css), ['32px 55.426px', '32px 55.426px'])
  assert.equal(t.isometricRowHeight(32), 27.713)
  assert.equal(css.backgroundPosition, '-2px -2px, 14px 25.713px')
  assert.match(css.backgroundImage, /^radial-gradient\(circle at 2px 2px, #788392 1\.5px, transparent 1\.9px\), radial-gradient/)
})

test('cornell: ruled lines plus cue column, header and summary at fixed sheet units', () => {
  const css = t.getPageTemplateCss('cornell')
  assert.equal(layers(css), 3)
  assert.deepEqual(sizes(css), ['100% 100%', '100% 100%', '32px 32px'])
  assert.match(css.backgroundImage, /to right, transparent 700px, #8197bb 700px, #8197bb 702px/)
  assert.match(css.backgroundImage, /to bottom, transparent 160px, #8197bb 160px, #8197bb 162px, transparent 162px, transparent 1200px, #8197bb 1200px, #8197bb 1202px/)
  assert.match(css.backgroundImage, /transparent 30\.875px, #aebfd8 30\.875px\)$/)
  assert.equal(t.CORNELL_SUMMARY_Y, 1200)
})

test('no type uses more than 4 gradient layers, and marks can be replaced', () => {
  for (const type of ['blank', 'dotted', 'lined', 'grid', 'isometric', 'cornell']) assert.ok(layers(t.getPageTemplateCss(type)) <= 4, type)
  const dark = { dot: '#111111', line: '#222222', lineStrong: '#333333' }
  assert.match(t.getPageTemplateCss('grid', 'standard', dark).backgroundImage, /#333333.*#222222/)
  assert.doesNotMatch(t.getPageTemplateCss('grid', 'standard', dark).backgroundImage, /#aebfd8|#8197bb/)
  assert.match(t.getPageTemplateCss('isometric', 'standard', dark).backgroundImage, /#111111/)
})

test('applySheetLayer writes backgroundPosition only when it changes', () => {
  const writes = []
  const style = {}
  for (const name of ['transform', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition']) {
    let value = ''
    Object.defineProperty(style, name, { get: () => value, set: (next) => { value = next; writes.push(name) } })
  }
  const element = { style }
  const applied = {}
  t.applySheetLayer(element, applied, t.getSheetLayerState('isometric', '#fff', viewport))
  assert.ok(writes.includes('backgroundPosition'))
  writes.length = 0
  t.applySheetLayer(element, applied, t.getSheetLayerState('isometric', '#fff', viewport))
  assert.deepEqual(writes, [])
  t.applySheetLayer(element, applied, t.getSheetLayerState('lined', '#fff', viewport))
  assert.deepEqual(writes.sort(), ['backgroundImage', 'backgroundPosition', 'backgroundSize'])
  assert.equal(element.style.backgroundPosition, '')
})

test('gridSpacingFor per canvas type (old signature still works)', () => {
  assert.equal(grid.gridSpacingFor('blank', 'standard'), 20)
  assert.equal(grid.gridSpacingFor('lined', 'wide'), 20)
  assert.equal(grid.gridSpacingFor('cornell', 'narrow'), 20)
  assert.equal(grid.gridSpacingFor('dotted', 'narrow'), 25.6)
  assert.equal(grid.gridSpacingFor('grid', 'standard'), 32)
  assert.equal(grid.gridSpacingFor('grid', 'wide'), 38.4)
  assert.equal(grid.gridSpacingFor('isometric', 'narrow'), 25.6)
  assert.equal(grid.isLatticeCanvas('isometric'), true)
  assert.equal(grid.isLatticeCanvas('grid'), false)
})

test('snapPointToLattice lands on triangular lattice points', () => {
  const u = 32
  const rh = t.isometricRowHeight(u)
  assert.deepEqual(grid.snapPointToLattice(1, 1, u), { x: 0, y: 0 })
  assert.deepEqual(grid.snapPointToLattice(31, 1, u), { x: 32, y: 0 })
  const odd = grid.snapPointToLattice(17, rh + 2, u)
  assert.deepEqual(odd, { x: 16, y: rh })
  const odd2 = grid.snapPointToLattice(40, rh - 1, u)
  assert.equal(odd2.x, 48)
  assert.equal(odd2.y, rh)
  // every result is a lattice point and is at least as close as any other candidate
  for (let i = 0; i < 200; i++) {
    const x = (i * 37.3) % 400 - 50
    const y = (i * 53.7) % 300 - 20
    const p = grid.snapPointToLattice(x, y, u)
    const row = Math.round(p.y / rh)
    assert.ok(Math.abs(p.y - row * rh) < 1e-9)
    const shift = Math.abs(row % 2) === 1 ? u / 2 : 0
    assert.ok(Math.abs((p.x - shift) / u - Math.round((p.x - shift) / u)) < 1e-9)
    for (let r = row - 2; r <= row + 2; r++) {
      const s = Math.abs(r % 2) === 1 ? u / 2 : 0
      const cx = Math.round((x - s) / u) * u + s
      assert.ok(Math.hypot(p.x - x, p.y - y) <= Math.hypot(cx - x, r * rh - y) + 1e-9)
    }
  }
  assert.equal(Object.is(grid.snapPointToLattice(0.2, 0.2, u).x, -0), false)
})

test('lattice mode for moves, new corners, resize edges and nudges', () => {
  const u = 32
  const rh = t.isometricRowHeight(u)
  const move = grid.snapMoveDelta({ x: 0, y: 0 }, 17, rh + 1, u, true)
  assert.deepEqual(move, { dx: 16, dy: rh })
  assert.deepEqual(grid.snapMoveDelta({ x: 10, y: 10 }, 5, 5, 20), { dx: 10, dy: 10 }, 'square mode unchanged')
  assert.deepEqual(grid.snapPoint({ x: 17, y: 5 }, 20), { x: 20, y: 0 })
  assert.deepEqual(grid.snapPoint({ x: 17, y: rh + 2 }, u, true), { x: 16, y: rh })
  const resized = grid.snapResizeBounds({ x: 0, y: 0, width: 150, height: 130 }, 'se', u, true)
  assert.equal(resized.width, 144) // right edge on a half-spacing column (16 * 9)
  assert.ok(Math.abs(resized.height / rh - Math.round(resized.height / rh)) < 1e-9)
  assert.deepEqual(grid.snapResizeBounds({ x: 0, y: 0, width: 150, height: 130 }, 'se', 20), { x: 0, y: 0, width: 160, height: 140 })
  const nudge = grid.gridNudgeDelta({ x: 0, y: 0 }, 1, 0, u, true)
  assert.deepEqual(nudge, { dx: 32, dy: 0 })
  const down = grid.gridNudgeDelta({ x: 0, y: 0 }, 0, 1, u, true)
  assert.deepEqual(down, { dx: 16, dy: rh })
  const back = grid.gridNudgeDelta({ x: 16, y: rh }, 0, -1, u, true)
  assert.deepEqual(back, { dx: -16, dy: -rh })
})

test('SVG export: pattern per canvas type, none when transparent or blank', () => {
  const opts = { width: 2500, height: 1500, template: 'blank', backgroundColor: '#ffffff' }
  const svg = (template, extra = {}) => exp.buildSheetSvg([], { ...opts, template, ...extra })
  assert.doesNotMatch(svg('blank'), /pattern/)
  assert.match(svg('lined'), /<pattern id="template" width="32" height="32"[^>]*><path d="M0 31\.5H32"/)
  const g = svg('grid')
  assert.match(g, /<pattern id="template" width="160" height="160"/)
  assert.match(g, /stroke="#8197bb" stroke-width="1\.5"/)
  assert.match(g, /stroke="#aebfd8" stroke-width="1"/)
  const iso = svg('isometric')
  assert.match(iso, /<pattern id="template" x="-2" y="-2" width="32" height="55\.426"/)
  assert.equal((iso.match(/<circle /g) ?? []).length, 2)
  const cornell = svg('cornell')
  assert.match(cornell, /<pattern id="template" width="32" height="32"[^>]*><path d="M0 31\.5H32"/)
  assert.match(cornell, /<rect x="700" y="0" width="2" height="1500"/)
  assert.match(cornell, /y="160" width="2500" height="2"/)
  assert.match(cornell, /y="1200" width="2500" height="2"/)
  assert.doesNotMatch(svg('cornell', { height: 3000 }), /y="1500"/)
  for (const type of ['dotted', 'grid', 'isometric', 'cornell']) {
    assert.doesNotMatch(svg(type, { transparent: true }), /pattern|#8197bb/, type)
  }
})

test('App uses the effective canvas type for sheet, minimap, export and snapping', () => {
  assert.match(app, /const canvasType = effectiveCanvasType\(pageTemplate, pageCanvas\)/)
  assert.match(app, /drawPageTemplateOverview\(ctx, canvasType,/)
  assert.match(app, /benchmarkBackground\?\.template \?\? canvasType/)
  assert.match(app, /gridSpacingFor\(effectiveCanvasType\(pageTemplateRef\.current, pageCanvasRef\.current\)/)
  assert.match(documents, /template: effectiveCanvasType\(page\.template, page\.canvas\)/)
})
