import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const rc = await loadModule('roundedCorners.ts')
const doc = await loadModule('documentFormat.ts')
const exp = await loadModule('sheetExport.ts')
const shape = await loadModule('changeShape.ts')
const styles = await loadModule('styleClipboard.ts')
const sketchy = await loadModule('sketchy.ts')
const input = await loadModule('desktopInput.ts')
const app = await readAppSource()
const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
const renderer = await readFile(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')

const rect = (extra = {}, id = 1) => ({ kind: 'rectangle', id, x: 10, y: 20, width: 200, height: 100, strokeColor: '#111', strokeWidth: 3, ...extra })
const file = (items) => JSON.stringify({ format: 'inkpad-document', version: 1, title: 't', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', page: { template: 'blank', background: 'white' }, items })
const loaded = (items) => {
  const result = doc.parseDocument(file(items))
  assert.equal(result.ok, true)
  return result.document.items
}
const inkBox = { top: 40, mid: 60, ink: [] }

test('radius is min(16, w/4, h/4)', () => {
  assert.equal(rc.ROUNDED_CORNER_RADIUS, 16)
  assert.equal(rc.roundedCornerRadius(200, 100), 16)
  assert.equal(rc.roundedCornerRadius(40, 100), 10)
  assert.equal(rc.roundedCornerRadius(200, 20), 5)
})

test('format: rounded round-trips on a plain rectangle, old files identical', () => {
  assert.equal(JSON.stringify(loaded([rect()])), JSON.stringify([rect()]))
  const items = loaded([rect({ rounded: true })])
  assert.equal(items[0].rounded, true)
  assert.deepEqual(loaded(items), items)
  for (const bad of [false, 1, 'true', null]) assert.equal('rounded' in loaded([rect({ rounded: bad })])[0], false)
})

test('format: rounded is dropped on ellipse, diamond, class, ink and HLD boxes', () => {
  assert.equal('rounded' in loaded([rect({ rounded: true, ellipse: true })])[0], false)
  assert.equal('rounded' in loaded([rect({ rounded: true, diamond: true })])[0], false)
  assert.equal('rounded' in loaded([rect({ rounded: true, classBox: { name: 'RedisClient', attributes: '- redis: Redis', methods: '+ get()' } })])[0], false)
  assert.equal('rounded' in loaded([rect({ rounded: true, inkBox })])[0], false)
  assert.equal('rounded' in loaded([rect({ rounded: true, inkBox, hldShape: 'service' })])[0], false)
})

test('setRoundedCorners applies to every selected plain rectangle only, is a no-op when unchanged', () => {
  const items = [rect({}, 1), rect({ ellipse: true }, 2), rect({ locked: true }, 3), rect({}, 4)]
  const keys = new Set(['rectangle:1', 'rectangle:2', 'rectangle:3'])
  const next = rc.setRoundedCorners(items, keys, true)
  assert.equal(next[0].rounded, true)
  assert.equal('rounded' in next[1], false)
  assert.equal('rounded' in next[2], false)
  assert.equal('rounded' in next[3], false)
  assert.equal(rc.setRoundedCorners(next, keys, true), next)
  assert.equal('rounded' in rc.setRoundedCorners(next, keys, false)[0], false)
  assert.equal(rc.cornersChoice(items, keys), 'round')
  assert.equal(rc.cornersChoice(next, keys), 'sharp')
  assert.equal(rc.cornersChoice([rect({ ellipse: true })], new Set(['rectangle:1'])), null)
})

test('SVG export: rx/ry on a rounded rectangle, none on a sharp one, fill follows the outline', () => {
  const opts = { width: 800, height: 600, template: 'blank', backgroundColor: '#ffffff' }
  const svg = exp.buildSheetSvg([rect({ rounded: true, fillColor: '#abcdef' })], opts)
  assert.match(svg, /<rect [^>]*rx="16" ry="16"/)
  assert.match(svg, /fill="#abcdef"/)
  assert.match(svg, /<path d="M26 20H194A16 16 0 0 1 210 36/)
  assert.doesNotMatch(exp.buildSheetSvg([rect()], opts), /rx=/)
  const small = exp.buildSheetSvg([rect({ rounded: true, width: 40, height: 100 })], opts)
  assert.match(small, /rx="10" ry="10"/)
})

test('sketchy shape of a rounded rectangle has curved corners and a rounded fill', () => {
  const shapeData = sketchy.sketchyRectangleShape(rect({ rounded: true }))
  assert.match(shapeData.outline, /Q/)
  assert.match(shapeData.fill, /A16 16/)
  assert.equal(sketchy.plainFillPath(rect({ rounded: true })), rc.roundedRectanglePath(rect()))
})

test('changeShape away from rectangle drops rounded', () => {
  const box = rect({ rounded: true })
  const diamond = shape.changeBoxShape(box, 'diamond')
  assert.equal('rounded' in diamond, false)
  const ellipse = shape.changeBoxShape(box, 'ellipse')
  assert.equal('rounded' in ellipse, false)
})

test('copy / paste style carries rounded between plain rectangles', () => {
  const style = styles.captureStyle(rect({ rounded: true }))
  assert.equal(style.rounded, true)
  const items = [rect({}, 2), rect({ ellipse: true }, 3)]
  const next = styles.applyStyle(items, new Set(['rectangle:2', 'rectangle:3']), style)
  assert.equal(next[0].rounded, true)
  assert.equal('rounded' in next[1], false)
  assert.equal(styles.captureStyle(rect({ ellipse: true })).rounded, undefined)
})

test('context menu: Round / Sharp chip in the Style group', () => {
  const state = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }
  const round = input.contextMenuEntries({ ...state, corners: 'round' }).find((e) => e.action === 'cornersRound')
  assert.equal(round.chip, 'Round')
  assert.equal(round.chipGroup, 'Style')
  assert.equal(input.contextMenuEntries({ ...state, corners: 'sharp' }).find((e) => e.action === 'cornersSharp').chip, 'Sharp')
  assert.equal(input.contextMenuEntries(state).some((e) => e.action === 'cornersRound' || e.action === 'cornersSharp'), false)
})

test('wiring: panel toggle, menu actions, palette entries, renderer', () => {
  assert.match(panel, /aria-label="Rectangle corners"/)
  assert.match(panel, /props\.corners\?\.onChange\(false\)\}>Sharp/)
  assert.match(panel, /props\.corners\?\.onChange\(true\)\}>Round/)
  assert.match(app, /case 'cornersRound': setSelectedCorners\(true\)/)
  assert.match(app, /case 'cornersSharp': setSelectedCorners\(false\)/)
  assert.match(app, /label: 'Corners: round'/)
  assert.match(app, /label: 'Corners: sharp'/)
  assert.match(app, /corners: cornersChoice\(strokesRef\.current, currentSelectionKeys\(\)\)/)
  assert.match(app, /const setSelectedCorners[\s\S]{0,300}saveHistory\(\)/)
  assert.match(renderer, /roundRect\(rectangle\.x, rectangle\.y, rectangle\.width, rectangle\.height, roundedCornerRadius/)
})

test('a rectangle turned into a class box drops rounded and no renderer rounds a non-plain box', () => {
  assert.match(app, /\(\{ rounded: _rounded, \.\.\.rest \}\) => \(\{ \.\.\.rest, classBox: clean \}\)/)
  const opts = { width: 800, height: 600, template: 'blank', backgroundColor: '#ffffff' }
  const stale = rect({ rounded: true, classBox: { name: 'A', attributes: '', methods: '' } })
  assert.doesNotMatch(exp.buildSheetSvg([stale], opts), /<rect [^>]*rx=/)
  assert.doesNotMatch(sketchy.sketchyRectangleShape(stale).outline, /Q/)
  assert.match(renderer, /rectangle\.rounded && isPlainRectangle\(rectangle\)/)
})
