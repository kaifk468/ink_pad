import assert from 'node:assert/strict'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const exp = await loadModule('sheetExport.ts')

const p = (x, y, pressure = 0.5) => ({ x, y, pressure })
const opts = { width: 2500, height: 1500, template: 'blank', backgroundColor: '#ffffff' }
const ink = { kind: 'stroke', id: 1, points: [p(10, 10), p(50, 40), p(90, 20)], color: '#202124', width: 4, erase: false }
const eraser = { kind: 'stroke', id: 2, points: [p(40, 30), p(60, 30)], color: '#000', width: 20, erase: true }
const rect = { kind: 'rectangle', id: 1, x: 100, y: 100, width: 200, height: 80, strokeColor: '#111', strokeWidth: 3 }
const conn = (relationshipType, reversed = false) => ({ kind: 'connector', id: 1, start: p(300, 140, 0), end: p(600, 140, 0), strokeColor: '#111', strokeWidth: 3, relationshipType, reversed })

test('svg has sheet size, background and well-formed markup for every item kind', () => {
  const types = ['association', 'directed-association', 'inheritance', 'realization', 'dependency', 'aggregation', 'composition']
  const svg = exp.buildSheetSvg([ink, rect, ...types.map((t) => conn(t))], opts)
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="2500" height="1500" viewBox="0 0 2500 1500">/)
  assert.match(svg, /<rect width="2500" height="1500" fill="#ffffff"\/>/)
  assert.ok(svg.endsWith('</svg>'))
  assert.equal((svg.match(/<rect /g) || []).length, 2)
  assert.match(svg, /stroke-dasharray/)
  assert.match(svg, /fill="#111"/) // filled diamond
})

test('lined and dotted add a repeating pattern; blank and transparent do not', () => {
  assert.match(exp.buildSheetSvg([], { ...opts, template: 'lined' }), /<pattern id="template" width="32" height="32"[^>]*><path d="M0 31\.5H32"/)
  assert.match(exp.buildSheetSvg([], { ...opts, template: 'dotted' }), /<circle cx="2" cy="2" r="1\.65"/)
  assert.doesNotMatch(exp.buildSheetSvg([], opts), /pattern/)
  const transparent = exp.buildSheetSvg([ink], { ...opts, template: 'dotted', transparent: true })
  assert.doesNotMatch(transparent, /pattern|fill="#ffffff"/)
})

test('erasers become masks over the earlier items only', () => {
  const later = { ...ink, id: 3, color: '#ff0000' }
  const svg = exp.buildSheetSvg([ink, eraser, later], opts)
  assert.match(svg, /<mask id="erase-1"/)
  const masked = svg.match(/<g mask="url\(#erase-1\)">(.*?)<\/g><g stroke="#ff0000"/s)
  assert.ok(masked, 'earlier ink is inside the mask group and later ink is outside')
  assert.match(masked[1], /#202124/)
  assert.doesNotMatch(masked[1], /#ff0000/)
})

test('consecutive erasers share one mask; separate runs nest', () => {
  const svg = exp.buildSheetSvg([ink, eraser, { ...eraser, id: 4 }, { ...ink, id: 5 }, { ...eraser, id: 6 }], opts)
  assert.equal((svg.match(/<mask /g) || []).length, 2)
})

test('colors are escaped so a hostile file cannot inject markup', () => {
  const svg = exp.buildSheetSvg([{ ...rect, strokeColor: '"/><script>x</script>' }], opts)
  assert.doesNotMatch(svg, /<script/)
})

test('single-point strokes render as dots and pressure scales width', () => {
  const dot = exp.buildSheetSvg([{ ...ink, points: [p(5, 5, 1)] }], opts)
  assert.match(dot, /<circle cx="5" cy="5" r="2\.5"/)
})

test('content bounds pad, clamp to the sheet and ignore erasers; empty gives null', () => {
  assert.equal(exp.getContentBounds([], { width: 2500, height: 1500 }), null)
  assert.equal(exp.getContentBounds([eraser], { width: 2500, height: 1500 }), null)
  const b = exp.getContentBounds([rect], { width: 2500, height: 1500 })
  assert.deepEqual(b, { x: 57, y: 57, width: 286, height: 166 })
  const edge = exp.getContentBounds([{ ...rect, x: 0, y: 0, width: 5000, height: 5000 }], { width: 2500, height: 1500 })
  assert.deepEqual(edge, { x: 0, y: 0, width: 2500, height: 1500 })
})

test('cropSvg changes size and viewBox only', () => {
  const svg = exp.cropSvg(exp.buildSheetSvg([rect], opts), { x: 50, y: 60, width: 300, height: 200 })
  assert.match(svg, /width="300" height="200" viewBox="50 60 300 200"/)
  assert.match(svg, /<rect x="100"/)
})
