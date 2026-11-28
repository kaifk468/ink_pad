import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const lanes = await loadModule('canvasLanes.ts')
const t = await loadModule('pageTemplates.ts')
const types = await loadModule('canvasTypes.ts')
const doc = await loadModule('documentFormat.ts')
const exp = await loadModule('sheetExport.ts')
const picker = await loadModule('boardPicker.ts')
const grid = await loadModule('gridSnap.ts')
const app = await readAppSource()
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const layers = (css) => css.backgroundImage.split(/,\s*(?=linear-gradient|radial-gradient)/).length

// ---------------------------------------------------------------- canvas types

test('Lanes and Notebook are canvas types that save with the closest older template', () => {
  assert.deepEqual(types.CANVAS_TYPES.slice(-2).map((c) => [c.id, c.label, c.description]), [
    ['lanes', 'Lanes', 'Swimlanes for flows and sequences'],
    ['notebook', 'Notebook', 'Ruled lines with a margin'],
  ])
  assert.deepEqual(types.canvasFieldsFor('lanes'), { template: 'blank', canvas: 'lanes' })
  assert.deepEqual(types.canvasFieldsFor('notebook'), { template: 'lined', canvas: 'notebook' })
  assert.equal(types.effectiveCanvasType('blank', 'lanes'), 'lanes')
  assert.equal(types.effectiveCanvasType('lined', 'notebook'), 'notebook')
  // Snapping: default behaviour (20 units), like blank and lined.
  assert.equal(grid.gridSpacingFor('lanes', 'standard'), grid.gridSpacingFor('lined', 'standard'))
  assert.equal(grid.gridSpacingFor('notebook', 'wide'), grid.gridSpacingFor('lined', 'wide'))
  assert.equal(grid.isLatticeCanvas('lanes'), false)
})

// ---------------------------------------------------------------- lane geometry

test('lane accessors: rows unless columns, count 2..8 default 4, names padded, fit on unless false', () => {
  assert.equal(lanes.laneDir(undefined), 'rows')
  assert.equal(lanes.laneDir({ dir: 'columns' }), 'columns')
  assert.equal(lanes.laneDir({ dir: 'diagonal' }), 'rows')
  assert.equal(lanes.laneCount(undefined), 4)
  assert.equal(lanes.laneCount({ count: 1 }), 2)
  assert.equal(lanes.laneCount({ count: 20 }), 8)
  assert.equal(lanes.laneCount({ count: 5 }), 5)
  assert.equal(lanes.laneCount({ count: 'x' }), 4)
  assert.equal(lanes.laneCount({ count: NaN }), 4)
  assert.deepEqual(lanes.laneNames({ count: 3, names: ['A', 7, 'C', 'D'] }), ['A', '', 'C'])
  assert.deepEqual(lanes.laneNames({ count: 2 }), ['', ''])
  assert.equal(lanes.laneFit(undefined), true)
  assert.equal(lanes.laneFit({ fit: false }), false)
  assert.equal(lanes.laneSize({ count: 5 }), 300)
  assert.equal(lanes.laneSize({ dir: 'columns', count: 5 }), 500)
})

test('rows lanes: 1500 / count tall, 180-unit header column, repeating down a grown sheet with cyclic names', () => {
  const first = lanes.laneRects({ count: 4, names: ['Client', 'API'] }, 2500, 1500)
  assert.equal(first.length, 4)
  assert.deepEqual(first[0].lane, { x: 0, y: 0, width: 2500, height: 375 })
  assert.deepEqual(first[0].header, { x: 0, y: 0, width: 180, height: 375 })
  assert.deepEqual(first[0].body, { x: 180, y: 0, width: 2320, height: 375 })
  assert.deepEqual(first[3].lane, { x: 0, y: 1125, width: 2500, height: 375 })
  assert.deepEqual(first.map((r) => r.name), ['Client', 'API', '', ''])
  const grown = lanes.laneRects({ count: 4, names: ['Client', 'API'] }, 2500, 3000)
  assert.equal(grown.length, 8)
  assert.equal(grown[4].lane.y, 1500)
  assert.equal(grown[4].index, 0)
  assert.equal(grown[4].name, 'Client')
  assert.equal(grown[5].name, 'API')
  assert.equal(grown[7].lane.y + grown[7].lane.height, 3000)
  // Every grown height (1500, 2000, 2500, 3000) continues the lanes; a height that is not a whole number of lanes cuts the last lane at the sheet edge.
  for (const height of [1500, 2000, 2500, 3000]) {
    const rects = lanes.laneRects({ count: 5 }, 2500, height)
    assert.equal(rects.length, Math.ceil(height / 300))
    for (const [i, r] of rects.entries()) assert.ok(Math.abs(r.lane.y - i * 300) < 1e-9)
    const last = rects[rects.length - 1]
    assert.ok(Math.abs(last.lane.y + last.lane.height - height) < 1e-9)
    assert.ok(Math.abs(last.header.height - last.lane.height) < 1e-9)
  }
  assert.equal(lanes.laneRects({ count: 5 }, 2500, 2000)[6].lane.height, 200)
})

test('columns lanes: 2500 / count wide, full height, 120-unit header band', () => {
  const rects = lanes.laneRects({ dir: 'columns', count: 5, names: ['a', 'b', 'c', 'd', 'e'] }, 2500, 2000)
  assert.equal(rects.length, 5)
  assert.deepEqual(rects[1].lane, { x: 500, y: 0, width: 500, height: 2000 })
  assert.deepEqual(rects[1].header, { x: 500, y: 0, width: 500, height: 120 })
  assert.deepEqual(rects[1].body, { x: 500, y: 120, width: 500, height: 1880 })
  assert.deepEqual(rects.map((r) => r.name), ['a', 'b', 'c', 'd', 'e'])
})

test('laneAt finds the lane holding a point; lanes never overlap and cover the sheet', () => {
  const s = { count: 3, names: ['x', 'y', 'z'] }
  assert.equal(lanes.laneAt(s, 2500, 1500, 100, 10).index, 0)
  assert.equal(lanes.laneAt(s, 2500, 1500, 100, 500).index, 1)
  assert.equal(lanes.laneAt(s, 2500, 1500, 100, 1499).index, 2)
  assert.equal(lanes.laneAt(s, 2500, 1500, 100, 1500), null)
  assert.equal(lanes.laneAt(s, 2500, 3000, 100, 1600).slot, 3)
  assert.equal(lanes.laneAt({ dir: 'columns', count: 4 }, 2500, 1500, 700, 10).index, 1)
  for (const count of [2, 3, 4, 5, 6, 7, 8]) {
    for (const dir of ['rows', 'columns']) {
      const rects = lanes.laneRects({ dir, count }, 2500, 1500)
      const area = rects.reduce((sum, r) => sum + r.lane.width * r.lane.height, 0)
      assert.ok(Math.abs(area - 2500 * 1500) < 1e-6, `${dir} ${count}`)
    }
  }
})

test('lane labels: rotated in a rows header, upright in a columns header, shrunk then cut with an ellipsis', () => {
  const rows = lanes.laneRects({ count: 4, names: ['Client', '', 'x'.repeat(40)] }, 2500, 1500)
  const a = lanes.laneLabel(rows[0], 'rows')
  assert.deepEqual([a.text, a.rotate, a.x, a.y, a.fontSize], ['Client', -90, 90, 187.5, 34])
  assert.equal(lanes.laneLabel(rows[1], 'rows'), null)
  const long = lanes.laneLabel(rows[2], 'rows')
  assert.ok(long.text.endsWith('…') && long.text.length < 40)
  assert.ok(long.fontSize >= 20 && long.fontSize < 34)
  const cols = lanes.laneRects({ dir: 'columns', count: 4, names: ['Web'] }, 2500, 1500)
  const b = lanes.laneLabel(cols[0], 'columns')
  assert.deepEqual([b.text, b.rotate, b.x, b.y], ['Web', 0, 312.5, 60])
  assert.equal(lanes.sameLanes({ count: 4 }, { count: 4, dir: 'rows' }), true)
  assert.equal(lanes.sameLanes({ count: 4 }, { count: 5 }), false)
  assert.equal(lanes.sameLanes({ names: ['a'] }, { names: ['b'] }), false)
})

// ---------------------------------------------------------------- CSS layer

test('old canvas types keep exactly their CSS after the new options were added', () => {
  assert.deepEqual(t.getPageTemplateCss('lined'), { backgroundImage: 'linear-gradient(to bottom, transparent 30.875px, #aebfd8 30.875px)', backgroundSize: '32px 32px' })
  assert.equal(layers(t.getPageTemplateCss('cornell')), 3)
  assert.equal(layers(t.getPageTemplateCss('grid')), 4)
  assert.deepEqual(t.getSheetLayerState('lined', '#fff', { scale: 1, offsetX: 0, offsetY: 0 }, 'standard', t.PAGE_MARKS_LIGHT, undefined), t.getSheetLayerState('lined', '#fff', { scale: 1, offsetX: 0, offsetY: 0 }))
})

test('notebook: ruled lines, a margin line at x 160 and a header line at y 96 (three layers)', () => {
  const css = t.getPageTemplateCss('notebook')
  assert.equal(layers(css), 3)
  assert.deepEqual(css.backgroundSize.split(', '), ['100% 100%', '100% 100%', '32px 32px'])
  assert.match(css.backgroundImage, /to right, transparent 160px, #e8a0a0 160px, #e8a0a0 162px, transparent 162px/)
  assert.match(css.backgroundImage, /to bottom, transparent 96px, #8197bb 96px, #8197bb 98px, transparent 98px/)
  assert.match(css.backgroundImage, /transparent 30\.875px, #aebfd8 30\.875px/)
  assert.deepEqual(t.getPageTemplateCss('notebook', 'narrow').backgroundSize.split(', ')[2], '25.6px 25.6px')
  // Dark boards pass their own muted red.
  const dark = t.getPageTemplateCss('notebook', 'standard', { dot: '#1', line: '#2', lineStrong: '#3', margin: '#6e4a52' })
  assert.match(dark.backgroundImage, /#6e4a52 160px/)
})

test('lanes rows: header strip tint, thin lineStrong borders every 1500 / count units (two layers)', () => {
  const css = t.getPageTemplateCss('lanes', 'standard', t.PAGE_MARKS_LIGHT, { count: 4 })
  assert.equal(layers(css), 2)
  assert.deepEqual(css.backgroundSize.split(', '), ['100% 100%', '100% 375px'])
  assert.match(css.backgroundImage, /to right, rgba\(174, 191, 216, 0\.22\) 180px, #8197bb 180px, #8197bb 181\.5px, transparent 181\.5px/)
  assert.match(css.backgroundImage, /to bottom, transparent 373\.5px, #8197bb 373\.5px/)
  // No lanes settings = the defaults (rows, 4); an unknown dir draws as rows.
  assert.deepEqual(t.getPageTemplateCss('lanes'), css)
  assert.deepEqual(t.getPageTemplateCss('lanes', 'standard', t.PAGE_MARKS_LIGHT, { dir: 'zigzag', count: 4 }), css)
  assert.equal(t.getPageTemplateCss('lanes', 'standard', t.PAGE_MARKS_LIGHT, { count: 6 }).backgroundSize.split(', ')[1], '100% 250px')
})

test('lanes columns: header band of 120, borders every 2500 / count', () => {
  const css = t.getPageTemplateCss('lanes', 'standard', t.PAGE_MARKS_LIGHT, { dir: 'columns', count: 5 })
  assert.equal(layers(css), 2)
  assert.deepEqual(css.backgroundSize.split(', '), ['100% 100%', '500px 100%'])
  assert.match(css.backgroundImage, /to bottom, rgba\(174, 191, 216, 0\.22\) 120px, #8197bb 120px, #8197bb 121\.5px/)
  assert.match(css.backgroundImage, /to right, transparent 498\.5px, #8197bb 498\.5px/)
})

test('the sheet layer state carries the lane settings', () => {
  const state = t.getSheetLayerState('lanes', '#fff', { scale: 1, offsetX: 0, offsetY: 0 }, 'standard', t.PAGE_MARKS_LIGHT, { dir: 'columns', count: 2 })
  assert.deepEqual(state.backgroundSize.split(', '), ['100% 100%', '1250px 100%'])
})

// ---------------------------------------------------------------- mark strength

test('adjustMarks: faint blends halfway to the sheet, bold 40% toward the ink, normal and unknown change nothing', () => {
  const marks = { dot: '#788392', line: '#aebfd8', lineStrong: '#8197bb', margin: '#e8a0a0' }
  assert.equal(t.adjustMarks(marks, 'normal', '#ffffff'), marks)
  assert.equal(t.adjustMarks(marks, undefined, '#ffffff'), marks)
  assert.equal(t.adjustMarks(marks, 'neon', '#ffffff'), marks)
  const faint = t.adjustMarks(marks, 'faint', '#ffffff')
  assert.deepEqual(faint, { dot: '#bcc1c9', line: '#d7dfec', lineStrong: '#c0cbdd', margin: '#f4d0d0' })
  const bold = t.adjustMarks(marks, 'bold', '#ffffff', '#202124')
  assert.equal(bold.dot, '#555c66')
  // On a dark sheet faint moves toward the dark colour and bold toward the light ink.
  const darkFaint = t.adjustMarks({ dot: '#5b636e', line: '#3a414b', lineStrong: '#4d5663' }, 'faint', '#1e2126')
  assert.equal(darkFaint.line, '#2c3139')
  const darkBold = t.adjustMarks({ dot: '#5b636e', line: '#3a414b', lineStrong: '#4d5663' }, 'bold', '#1e2126', '#e6e8eb')
  assert.equal(darkBold.line, '#7f848b')
  // Faint is always closer to the sheet, bold always further from it, for every channel.
  const lum = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
  assert.ok(lum(faint.dot) > lum(marks.dot) && lum(bold.dot) < lum(marks.dot))
  // Not a hex colour: left as it is.
  assert.equal(t.adjustMarks({ dot: 'red', line: 'rgb(1,2,3)', lineStrong: '#8197bb' }, 'faint', '#ffffff').dot, 'red')
  assert.equal(t.markStrength('bold'), 'bold')
  assert.equal(t.markStrength('neon'), 'normal')
  assert.deepEqual(t.MARK_STRENGTHS.map((m) => m.label), ['Faint', 'Normal', 'Bold'])
})

test('effectiveMarks: normal keeps the board marks (or none), a strength adjusts them', () => {
  assert.equal(t.effectiveMarks(undefined, undefined, '#ffffff', '#202124'), undefined)
  assert.equal(t.effectiveMarks(undefined, 'faint', '#ffffff', '#202124').dot, '#bcc1c9')
  const dark = { dot: '#5b636e', line: '#3a414b', lineStrong: '#4d5663', margin: '#6e4a52' }
  assert.equal(t.effectiveMarks(dark, 'normal', '#1e2126', '#e6e8eb'), dark)
  assert.notEqual(t.effectiveMarks(dark, 'bold', '#1e2126', '#e6e8eb').line, dark.line)
})

test('the CSS uses the adjusted marks', () => {
  const faint = t.adjustMarks(t.PAGE_MARKS_LIGHT, 'faint', '#ffffff')
  assert.match(t.getPageTemplateCss('dotted', 'standard', faint).backgroundImage, /#bcc1c9/)
  assert.match(t.getPageTemplateCss('notebook', 'standard', faint).backgroundImage, /#f4d0d0/)
})

// ---------------------------------------------------------------- saved format

const base = { template: 'blank', background: 'white', items: [] }
const stamp = '2026-11-28T00:00:00.000Z'
const roundTrip = (input) => {
  const parsed = doc.parseDocument(JSON.stringify(doc.createDocument(input, stamp)))
  assert.equal(parsed.ok, true)
  return parsed
}
const fileWith = (page) => JSON.stringify({ format: 'inkpad-document', version: 1, title: 'x', createdAt: 'a', updatedAt: 'b', page: { template: 'blank', background: 'white', ...page }, items: [] })

test('old files without marks / lanes load and re-save byte for byte the same', () => {
  const created = JSON.stringify(doc.createDocument({ ...base, template: 'lined', canvas: 'cornell', board: 'dark' }, stamp))
  const parsed = doc.parseDocument(created)
  assert.equal('marks' in parsed.document.page, false)
  assert.equal('lanes' in parsed.document.page, false)
  assert.equal(doc.isLossyParse(parsed.document), false)
  assert.equal(JSON.stringify(doc.createDocument({ ...base, template: 'lined', canvas: 'cornell', board: 'dark' }, stamp)), created)
  assert.equal(parsed.document.version, 1)
  // The page object of a document without the new fields has no new keys.
  assert.deepEqual(Object.keys(doc.createDocument(base, stamp).page), ['template', 'background'])
})

test('lanes and marks round-trip with the file version unchanged', () => {
  const input = { ...base, canvas: 'lanes', marks: 'faint', lanes: { dir: 'columns', count: 5, names: ['Web', '', 'DB'], fit: false } }
  const parsed = roundTrip(input)
  assert.deepEqual(parsed.document.page.lanes, { dir: 'columns', count: 5, names: ['Web', '', 'DB'], fit: false })
  assert.equal(parsed.document.page.marks, 'faint')
  assert.equal(parsed.document.page.canvas, 'lanes')
  assert.equal(parsed.document.version, 1)
  assert.equal(doc.isLossyParse(parsed.document), false)
  const again = roundTrip({ ...base, canvas: parsed.document.page.canvas, marks: parsed.document.page.marks, lanes: parsed.document.page.lanes })
  assert.deepEqual(again.document.page, parsed.document.page)
  // Names are cleaned like page names (collapsed spaces, 40 characters, at most 8).
  const cleaned = roundTrip({ ...base, lanes: { names: ['  A   B  ', 'x'.repeat(60)] } }).document.page.lanes
  assert.equal(cleaned.names[0], 'A B')
  assert.equal(cleaned.names[1].length, 40)
})

test('unknown marks word and unknown lanes dir are kept, not lossy', () => {
  const parsed = doc.parseDocument(fileWith({ canvas: 'lanes', marks: 'ultra', lanes: { dir: 'diagonal', count: 3 } }))
  assert.equal(parsed.document.page.marks, 'ultra')
  assert.equal(parsed.document.page.lanes.dir, 'diagonal')
  assert.equal(doc.isLossyParse(parsed.document), false)
  const again = roundTrip({ ...base, marks: parsed.document.page.marks, lanes: parsed.document.page.lanes })
  assert.equal(again.document.page.marks, 'ultra')
  assert.equal(again.document.page.lanes.dir, 'diagonal')
  // Drawn as the defaults.
  assert.equal(t.markStrength('ultra'), 'normal')
  assert.equal(lanes.laneDir({ dir: 'diagonal' }), 'rows')
})

test('invalid lane values are dropped and make the parse lossy; valid siblings stay', () => {
  for (const bad of [{ count: 9 }, { count: 1 }, { count: 3.5 }, { count: '4' }, { dir: 'Rows!' }, { dir: 4 }, { names: 'a,b' }, { fit: 'no' }, { fit: 0 }]) {
    const parsed = doc.parseDocument(fileWith({ canvas: 'lanes', lanes: { ...bad, names: bad.names ?? ['keep'] } }))
    assert.equal(doc.isLossyParse(parsed.document), true, JSON.stringify(bad))
    const key = Object.keys(bad)[0]
    assert.equal(key in (parsed.document.page.lanes ?? {}) && key !== 'names', false, JSON.stringify(bad))
    if (key !== 'names') assert.deepEqual(parsed.document.page.lanes.names, ['keep'])
  }
  assert.equal(doc.isLossyParse(doc.parseDocument(fileWith({ lanes: 'rows' })).document), true)
  assert.equal(doc.isLossyParse(doc.parseDocument(fileWith({ marks: '<b>' })).document), true)
  assert.equal('marks' in doc.parseDocument(fileWith({ marks: '<b>' })).document.page, false)
  // Too many names, a non-text name: lossy, the rest is kept.
  const many = doc.parseDocument(fileWith({ lanes: { names: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] } }))
  assert.equal(many.document.page.lanes.names.length, 8)
  assert.equal(doc.isLossyParse(many.document), true)
  const odd = doc.parseDocument(fileWith({ lanes: { names: ['a', 5, 'c'] } }))
  assert.deepEqual(odd.document.page.lanes.names, ['a', '', 'c'])
  assert.equal(doc.isLossyParse(odd.document), true)
  // fit: true is the default: dropped quietly, nothing lost.
  const fit = doc.parseDocument(fileWith({ lanes: { count: 3, fit: true } }))
  assert.deepEqual(fit.document.page.lanes, { count: 3 })
  assert.equal(doc.isLossyParse(fit.document), false)
})

test('unknown lane sub-keys: safe primitives are kept verbatim, anything else is dropped as lossy', () => {
  const kept = doc.parseDocument(fileWith({ lanes: { count: 3, shade: 'soft', depth: 2, wide: true } }))
  assert.deepEqual(kept.document.page.lanes, { count: 3, shade: 'soft', depth: 2, wide: true })
  assert.equal(doc.isLossyParse(kept.document), false)
  assert.deepEqual(roundTrip({ ...base, lanes: kept.document.page.lanes }).document.page.lanes, kept.document.page.lanes)
  const nested = doc.parseDocument(fileWith({ lanes: { count: 3, extra: { a: 1 }, list: [1] } }))
  assert.deepEqual(nested.document.page.lanes, { count: 3 })
  assert.equal(doc.isLossyParse(nested.document), true)
  assert.equal(doc.isLossyParse(doc.parseDocument(fileWith({ lanes: {} })).document), false)
})

test('the autosave signature notices marks and lanes changes', () => {
  const sig = { title: 't', template: 'blank', background: 'white', items: [] }
  assert.equal(doc.sameSignature(sig, { ...sig }), true)
  assert.equal(doc.sameSignature(sig, { ...sig, marks: 'bold' }), false)
  assert.equal(doc.sameSignature({ ...sig, marks: 'bold' }, { ...sig, marks: 'bold' }), true)
  assert.equal(doc.sameSignature(sig, { ...sig, lanes: { count: 3 } }), false)
  assert.equal(doc.sameSignature({ ...sig, lanes: { count: 3 } }, { ...sig, lanes: { count: 3 } }), true)
  assert.equal(doc.sameSignature({ ...sig, lanes: { count: 3 } }, { ...sig, lanes: { count: 3, names: ['a'] } }), false)
  assert.equal(doc.sameSignature({ ...sig, lanes: { count: 3, names: ['a'] } }, { ...sig, lanes: { count: 3, names: ['b'] } }), false)
  assert.equal(doc.sameSignature(sig, { ...sig, lanes: {} }), true)
})

// ---------------------------------------------------------------- SVG export

const svgOf = (extra) => exp.buildSheetSvg([], { width: 2500, height: 1500, template: 'lanes', backgroundColor: '#ffffff', ...extra })

test('SVG export of Lanes draws the header strips, borders and the lane names as text', () => {
  const svg = svgOf({ lanes: { count: 3, names: ['Client', 'Gateway & Auth', ''] } })
  assert.match(svg, /<text[^>]*transform="rotate\(-90 90 250\)"[^>]*>Client<\/text>/)
  assert.match(svg, />Gateway &amp; Auth<\/text>/)
  assert.equal((svg.match(/<text/g) ?? []).length, 2)
  assert.match(svg, /<rect x="0" y="0" width="180" height="500" fill="rgba\(174, 191, 216, 0\.22\)"\/>/)
  assert.match(svg, /<rect x="0" y="498\.5" width="2500" height="1\.5" fill="#8197bb"\/>/)
  assert.doesNotMatch(svg, /url\(#template\)/)
  const columns = svgOf({ lanes: { dir: 'columns', count: 2, names: ['Web'] } })
  assert.match(columns, /<text x="625" y="60"[^>]*>Web<\/text>/)
  assert.doesNotMatch(columns, /rotate\(-90/)
  assert.match(columns, /<rect x="0" y="120" width="1250" height="1\.5" fill="#8197bb"\/>/)
  // Grown sheet: lanes continue and names repeat.
  const grown = exp.buildSheetSvg([], { width: 2500, height: 3000, template: 'lanes', backgroundColor: '#ffffff', lanes: { count: 2, names: ['A', 'B'] } })
  assert.equal((grown.match(/>A<\/text>/g) ?? []).length, 2)
  // A transparent export has no sheet marks.
  assert.doesNotMatch(svgOf({ transparent: true, lanes: { names: ['A'] } }), /<text/)
})

test('SVG export of Lanes on the dark board uses the board ink and marks', () => {
  const svg = svgOf({ board: 'dark', lanes: { count: 2, names: ['A'] } })
  assert.match(svg, /fill="#e6e8eb" fill-opacity="0.75"/)
  assert.match(svg, /fill="#4d5663"/)
})

test('SVG export of Notebook has ruled lines, the margin line at x 160 and the header line at y 96', () => {
  const svg = exp.buildSheetSvg([], { width: 2500, height: 1500, template: 'notebook', backgroundColor: '#ffffff' })
  assert.match(svg, /<pattern id="template"[^>]*><path d="M0 31\.5H32"/)
  assert.match(svg, /<rect x="160" y="0" width="2" height="1500" fill="#e8a0a0"\/>/)
  assert.match(svg, /<rect x="0" y="96" width="2500" height="2" fill="#8197bb"\/>/)
  const dark = exp.buildSheetSvg([], { width: 2500, height: 1500, template: 'notebook', backgroundColor: '#ffffff', board: 'chalk' })
  assert.match(dark, /fill="#7b5a58"/)
})

test('SVG export marks strength: faint and bold change dots, lines and lane borders; normal and unknown do not', () => {
  const dots = (marks) => exp.buildSheetSvg([], { width: 400, height: 400, template: 'dotted', backgroundColor: '#ffffff', ...(marks ? { marks } : {}) })
  assert.match(dots(), /fill="#788392"/)
  assert.equal(dots('normal'), dots())
  assert.equal(dots('ultra'), dots())
  assert.match(dots('faint'), /fill="#bcc1c9"/)
  assert.match(dots('bold'), /fill="#555c66"/)
  assert.match(svgOf({ marks: 'faint' }), /fill="#c0cbdd"/)
  // The marks of one build never leak into the next.
  svgOf({ marks: 'bold' })
  assert.match(dots(), /fill="#788392"/)
  // Dark board: faint moves toward the board's sheet.
  const dark = exp.buildSheetSvg([], { width: 400, height: 400, template: 'dotted', backgroundColor: '#ffffff', board: 'dark', marks: 'faint' })
  assert.match(dark, /fill="#3d424a"/)
})

// ---------------------------------------------------------------- minimap

test('minimap overview draws lane bands and the notebook margin without a DOM pattern', () => {
  const calls = []
  const ctx = new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, ...args]); return name === 'createPattern' ? {} : undefined }, set: () => true })
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) }
  t.drawPageTemplateOverview(ctx, 'lanes', { x: 0, y: 0, width: 250, height: 150 }, undefined, { count: 3 })
  const rects = calls.filter((c) => c[0] === 'fillRect')
  assert.ok(rects.length >= 3 + 3 * 2)
  assert.deepEqual(rects[0].slice(1), [0, 0, 18, 50])
  assert.ok(!calls.some((c) => c[0] === 'createPattern'))
  calls.length = 0
  t.drawPageTemplateOverview(ctx, 'notebook', { x: 0, y: 0, width: 250, height: 150 }, undefined)
  assert.ok(calls.some((c) => c[0] === 'fillRect' && c[1] === 16 && c[3] === 1 && c[4] === 150))
  delete globalThis.document
})

// ---------------------------------------------------------------- picker model

test('board picker: lanes show the lane settings and hide spacing; previews exist for the new types', () => {
  const s = (template, canvas) => picker.boardPickerState(undefined, false, template, canvas)
  assert.equal(s('blank', 'lanes').showLanes, true)
  assert.equal(s('blank', 'lanes').showSpacing, false)
  assert.equal(s('lined', 'notebook').showLanes, false)
  assert.equal(s('lined', 'notebook').showSpacing, true)
  assert.equal(s('blank', undefined).showLanes, false)
  const notebook = picker.canvasPreviewMarks('notebook')
  assert.ok(notebook.lines && notebook.margin && notebook.strong)
  const laneMarks = picker.canvasPreviewMarks('lanes')
  assert.ok(laneMarks.lines && laneMarks.strong)
  assert.deepEqual(picker.canvasPreviewMarks('blank'), { dots: '', lines: '', strong: '' })
  const labels = picker.boardCommands('clean', false).map((c) => c.label)
  assert.ok(labels.includes('Canvas: Lanes') && labels.includes('Canvas: Notebook'))
})

// ---------------------------------------------------------------- wiring

test('wiring: the page fields flow through the open diagram, saves, exports and the sheet layer', async () => {
  const documents = await read('app/useDocuments.ts')
  assert.match(app, /marks: pageMarksRef\.current, lanes: pageLanesRef\.current/)
  assert.match(app, /pageMarksRef\.current = loaded\.page\.marks[\s\S]{0,80}setPageMarks\(loaded\.page\.marks\)/)
  assert.match(app, /pageLanesRef\.current = loaded\.page\.lanes[\s\S]{0,80}setPageLanes\(loaded\.page\.lanes\)/)
  assert.match(documents, /marks: page\.marks,\s*lanes: page\.lanes,/)
  assert.match(documents, /canvas: page\.canvas, marks: page\.marks, lanes: page\.lanes, items:/)
  assert.match(documents, /\.\.\.\(page\.marks \? \{ marks: page\.marks \} : \{\}\)/)
  assert.match(documents, /\.\.\.\(page\.lanes \? \{ lanes: page\.lanes \} : \{\}\)/)
  // A new diagram inherits the lanes only together with the canvas.
  assert.match(documents, /template === undefined \? \{ canvas: page\.canvas, lanes: page\.lanes \} : \{\}/)
  // The benchmark keeps its plain background.
  assert.match(app, /benchmarkBackground \? undefined : pageLanesRef\.current/)
  // Settings changes are not history steps and do autosave.
  assert.match(app, /useEffect\(\(\) => \{\s*renderAll\(\)\s*scheduleAutosave\(\)\s*\}, \[pageMarks, pageLanes, renderAll\]\)/)
  const update = app.slice(app.indexOf('const updateLanes ='), app.indexOf('const rotatableForPanel'))
  assert.doesNotMatch(update, /saveHistory/)
  const choose = app.slice(app.indexOf('const chooseMarkStrength ='), app.indexOf('const updateLanes ='))
  assert.doesNotMatch(choose, /saveHistory/)
})

test('wiring: lane names are React children of the sheet layer, rendered from laneLabel in sheet units only for Lanes', () => {
  assert.match(app, /className="sheet-layer"[^>]*>\s*\{canvasType === 'lanes' && laneHeaderLabels\}\s*<\/div>/)
  assert.match(app, /laneRects\(pageLanes, SHEET_WIDTH, sheetHeight\)/)
  assert.match(app, /className="lane-label"/)
})

test('wiring: both menus show Marks, and the lane settings on the Lanes canvas, with touch sized controls', async () => {
  const top = await read('app/TopLeftBar.tsx')
  const sheet = await read('app/DesktopMenuSheet.tsx')
  const controls = await read('app/LaneControls.tsx')
  const css = await read('styles.css')
  assert.match(top, /picker\.showLanes && <LaneControls variant="menu"/)
  assert.match(top, /picker\.canvas !== 'blank' && <MarksControl variant="menu"/)
  assert.match(sheet, /id: 'board-lanes'/)
  assert.match(sheet, /id: 'board-marks'/)
  assert.match(sheet, /<LaneControls key=\{row\.id\} variant="ms"/)
  assert.match(app, /marks=\{pageMarks\}\s*onMarks=\{chooseMarkStrength\}\s*lanes=\{pageLanes\}\s*onLanes=\{updateLanes\}/)
  assert.match(controls, /Lane direction/)
  assert.match(controls, /Number of lanes/)
  assert.match(controls, /LANE_MAX_COUNT/)
  assert.match(controls, /onBlur=\{commit\}/)
  assert.match(controls, /event\.key === 'Enter'/)
  assert.match(css, /\.menu-segments\.lane-touch \.menu-segment \{ height: 44px; \}/)
  assert.match(css, /\.lane-stepper button \{ height: 44px;/)
  assert.match(css, /\.lane-name-input \{[^}]*height: 44px;/)
  assert.match(app, /Marks: \$\{strength\[0\]\.toUpperCase\(\)\}/)
})
