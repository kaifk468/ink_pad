import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const shapes = await loadModule('hldShapes.ts')
const box = await loadModule('inkClassBox.ts')
const model = await loadModule('canvasModel.ts')
const format = await loadModule('documentFormat.ts')
const exp = await loadModule('sheetExport.ts')

const p = (x, y) => ({ x, y, pressure: 0.5 })
const line = (id, points, erase = false) => ({ kind: 'stroke', id, points, color: '#202124', width: 4, erase })
const make = (shape, id = 1) => shapes.createHldShape(id, 100, 100, 300, 200, '#111', 3, shape)
const NEW_SHAPES = ['user', 'browser', 'mobile', 'cache', 'loadBalancer', 'cdn']
const FIVE = ['apiGateway', 'server', 'objectStorage', 'stream', 'worker']
const sheet = { width: 1000, height: 800, template: 'blank', backgroundColor: '#fff' }

test('an HLD shape is an ink box with a shape kind and sensible default sizes', () => {
  for (const shape of ['database', 'queue', 'service']) {
    const rect = make(shape)
    assert.equal(rect.hldShape, shape)
    assert.deepEqual(rect.inkBox.ink, [])
    const size = shapes.HLD_DEFAULT_SIZE[shape]
    assert.ok(size.width > 100 && size.height > 80)
    assert.ok(shapes.HLD_SHAPE_LABELS[shape])
  }
  assert.deepEqual([...model.HLD_SHAPES], ['database', 'queue', 'service', ...NEW_SHAPES, ...FIVE])
})

test('outlines: a cylinder has a full top ellipse and curved base, a queue has two caps with arrows, a service is a rounded box', () => {
  const r = { x: 0, y: 0, width: 300, height: 200 }
  const db = shapes.hldOutlinePath(r, 'database')
  assert.equal((db.match(/A/g) ?? []).length, 3)
  assert.ok(db.includes('Z'))
  const queue = shapes.hldOutlinePath(r, 'queue')
  assert.equal((queue.match(/V200/g) ?? []).length >= 2, true, 'two cap lines')
  assert.equal((queue.match(/L/g) ?? []).length, 4, 'two chevrons')
  const service = shapes.hldOutlinePath(r, 'service')
  assert.equal((service.match(/A/g) ?? []).length, 4)
  assert.ok(!/NaN|undefined/.test(db + queue + service))
})

test('HLD shapes have no dividers to grab or move', () => {
  const rect = make('service')
  assert.equal(box.hitInkBoxDivider(rect, p(200, rect.inkBox.top), 10), null)
  assert.equal(box.moveInkBoxDivider(rect, 'top', 150), rect)
  const classBox = box.createInkClassBox(2, 100, 100, 300, 200, '#111', 3)
  assert.equal(box.hitInkBoxDivider(classBox, p(200, classBox.inkBox.top), 10), 'top', 'class boxes still do')
})

test('writing inside a shape is stored in it, grows it, and keeps its kind through move and resize', () => {
  let rect = make('database')
  rect = box.addStrokeToInkBox(rect, line(5, [p(150, 150), p(250, 160)]))
  assert.equal(rect.hldShape, 'database')
  assert.equal(rect.inkBox.ink.length, 1)
  const items = [rect]
  const moved = model.translateSelectedItems(items, new Set(['rectangle:1']), 20, 30)
  assert.equal(moved[0].hldShape, 'database')
  assert.equal(moved[0].inkBox.ink[0].points[0].x, 170)
  const resized = model.resizeRectangleItems(items, 1, { x: 100, y: 100, width: 600, height: 400 })[0]
  assert.equal(resized.hldShape, 'database')
  assert.equal(resized.width, 600)
  assert.ok(resized.inkBox.ink[0].points[1].x > 250, 'the writing scales with the shape')
})

test('connectors attach to a shape as a whole and follow it', () => {
  const db = make('database')
  const snapped = model.snapConnectorEndpoint(p(100, 200), [db])
  assert.equal(snapped.attachment.rectangleId, 1)
  const svc = shapes.createHldShape(2, 600, 100, 300, 200, '#111', 3, 'service')
  const conn = model.createConnector(7, snapped.point, p(600, 200), '#111', 3, snapped.attachment, { rectangleId: 2, offsetX: 0, offsetY: 100 })
  const moved = model.translateSelectedItems([db, svc, conn], new Set(['rectangle:2']), 0, 50)
  assert.equal(moved[2].end.y, 250)
})

test('saved files: the shape kind is optional, needs an ink area, and unknown kinds are dropped', () => {
  const items = [box.addStrokeToInkBox(make('queue'), line(5, [p(150, 150), p(250, 160)])), make('service', 2)]
  const text = format.stringifyDocument(format.createDocument({ title: 't', template: 'blank', background: 'white', items }))
  const back = format.parseDocument(text).document.items
  assert.equal(back[0].hldShape, 'queue')
  assert.equal(back[0].inkBox.ink.length, 1)
  assert.equal(back[1].hldShape, 'service')
  const raw = JSON.parse(text)
  raw.items[0].hldShape = 'cloud'
  assert.equal(format.parseDocument(JSON.stringify(raw)).document.items[0].hldShape, undefined)
  delete raw.items[1].inkBox
  const plain = format.parseDocument(JSON.stringify(raw)).document.items[1]
  assert.equal(plain.hldShape, undefined)
  assert.equal(plain.kind, 'rectangle')
  // older files (no field) open as before
  const old = JSON.parse(text)
  for (const item of old.items) delete item.hldShape
  assert.equal(format.parseDocument(JSON.stringify(old)).document.items[0].hldShape, undefined)
})

test('SVG export draws the outline, keeps the writing clipped, and has no divider lines', () => {
  const written = box.addStrokeToInkBox(make('database'), line(5, [p(150, 150), p(250, 160)]))
  const svg = exp.buildSheetSvg([written], sheet)
  assert.ok(svg.includes(shapes.hldOutlinePath(written, 'database')))
  assert.ok(svg.includes('clip-path'))
  const lines = (svg.match(/<path d="M[\d. ]+H[\d. ]+M/g) ?? [])
  assert.equal(lines.length, 0)
  const classSvg = exp.buildSheetSvg([box.createInkClassBox(3, 100, 100, 300, 200, '#111', 3)], sheet)
  assert.match(classSvg, /<path d="M[\d. ]+H[\d. ]+M/, 'class boxes keep their divider lines')
})

test('the Insert tray and the app create shapes with the ink class flow', async () => {
  const tray = await readFile(new URL('../src/app/InsertTray.tsx', import.meta.url), 'utf8')
  for (const shape of ['database', 'queue', 'service']) assert.match(tray, new RegExp(`shape: '${shape}'`))
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /createHldShape\(nextRectangleIdRef\.current\+\+/)
  assert.match(app, /HLD_DEFAULT_SIZE\[createdShape\]/)
  assert.match(app, /const toggleHldShapeTool = \(shape: HldShape\)/)
  assert.match(app, /soleSelectedRectangle\.hldShape \? \[\]/)
  const renderer = await readFile(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')
  assert.match(renderer, /new Path2D\(hldOutlinePath\(rectangle, rectangle\.hldShape\)\)/)
})

/** Every coordinate (arc end points included; radii and flags skipped) of an absolute-command path. */
function pathPoints(d) {
  const points = []
  const pattern = /([MLHVCAZ])([^MLHVCAZ]*)/g
  let m
  while ((m = pattern.exec(d))) {
    const nums = (m[2].match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number)
    assert.ok(nums.every(Number.isFinite), d)
    if (m[1] === 'H') for (const v of nums) points.push({ x: v })
    else if (m[1] === 'V') for (const v of nums) points.push({ y: v })
    else if (m[1] === 'A') for (let i = 0; i + 6 < nums.length + 0; i += 7) points.push({ x: nums[i + 5], y: nums[i + 6] })
    else if (m[1] !== 'Z') for (let i = 0; i < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] })
  }
  return points
}

test('new HLD shapes: pure outlines are valid paths with finite numbers inside the bounds, at default and small sizes', () => {
  for (const shape of NEW_SHAPES) {
    assert.ok(shapes.HLD_SHAPE_LABELS[shape])
    const def = shapes.HLD_DEFAULT_SIZE[shape]
    assert.ok(def.width >= 140 && def.height >= 150)
    for (const [w, h] of [[def.width, def.height], [90, 90], [400, 120], [120, 400]]) {
      const r = { x: 50, y: 70, width: w, height: h }
      const d = shapes.hldOutlinePath(r, shape)
      assert.match(d, /^M[\d. -]/, shape)
      assert.ok(d.length > 40 && !d.includes('NaN') && !d.includes('Infinity'), shape)
      for (const pt of pathPoints(d)) {
        if (pt.x !== undefined) assert.ok(pt.x >= r.x - 0.01 && pt.x <= r.x + w + 0.01, `${shape} x ${pt.x} ${w}x${h}`)
        if (pt.y !== undefined) assert.ok(pt.y >= r.y - 0.01 && pt.y <= r.y + h + 0.01, `${shape} y ${pt.y} ${w}x${h}`)
      }
    }
  }
  const outlines = new Set(NEW_SHAPES.map((shape) => shapes.hldOutlinePath({ x: 0, y: 0, width: 300, height: 200 }, shape)))
  assert.equal(outlines.size, NEW_SHAPES.length)
})

test('new HLD shapes: each is an ink box that moves, resizes and round-trips through the saved format', () => {
  const items = NEW_SHAPES.map((shape, i) => box.addStrokeToInkBox(make(shape, i + 1), line(50 + i, [p(150, 150), p(250, 160)])))
  const text = format.stringifyDocument(format.createDocument({ title: 't', template: 'blank', background: 'white', items }))
  const back = format.parseDocument(text).document.items
  assert.deepEqual(back.map((item) => item.hldShape), NEW_SHAPES)
  assert.ok(back.every((item) => item.inkBox.ink.length === 1 && item.seed === undefined))
  assert.equal(format.stringifyDocument(format.parseDocument(text).document), text)
  const moved = model.translateSelectedItems(items, new Set(['rectangle:1']), 10, 20)
  assert.equal(moved[0].hldShape, 'user')
  const svg = exp.buildSheetSvg(items, sheet)
  for (const item of items) assert.ok(svg.includes(shapes.hldOutlinePath(item, item.hldShape)))
  // sketchy pages leave the new shapes plain (no seed written)
  const raw = JSON.parse(text)
  raw.page.sketchy = true
  const sk = format.parseDocument(JSON.stringify(raw)).document.items
  assert.ok(sk.every((item) => item.hldShape && item.seed === undefined))
})

test('new HLD shapes: text fit has a positive inner area for each', async () => {
  const fit = await loadModule('textFit.ts')
  for (const shape of NEW_SHAPES) {
    const area = fit.shapeInnerArea(make(shape))
    assert.ok(area.width > 40 && area.height > 20, shape)
  }
})

test('More shapes popover: one desktop dock button, six entries, same handler as Database; tablet tray has the grid', async () => {
  const read = (f) => readFile(new URL(`../src/app/${f}`, import.meta.url), 'utf8')
  const dock = await read('ToolDock.tsx')
  const more = await read('MoreShapesTray.tsx')
  const tray = await read('InsertTray.tsx')
  const desktop = dock.slice(dock.indexOf('if (props.desktop) {'), dock.lastIndexOf('  return ('))
  assert.equal((dock.match(/<MoreShapesTray/g) ?? []).length, 1)
  assert.ok(desktop.includes('<MoreShapesTray hldActive={props.hldShapeActive} onHldShape={props.onHldShape} onSticky={props.onSticky} />'))
  assert.ok(desktop.indexOf('HLD_ENTRIES.map') < desktop.indexOf('<MoreShapesTray') && desktop.indexOf('<MoreShapesTray') < desktop.indexOf('{inkClass}'))
  assert.match(more, /aria-label="More shapes"/)
  assert.match(more, /aria-expanded=\{open\}/)
  assert.match(more, /onHldShape\(shape\); setOpen\(false\)/)
  assert.match(more, /allEntries\.map/)
  assert.match(more, /key !== 'Escape'/)
  assert.match(more, /title=\{`Click or drag to add/)
  for (const shape of NEW_SHAPES) assert.match(tray, new RegExp(`shape: '${shape}'`))
  assert.match(tray, /MORE_HLD_ENTRIES\.map/)
  assert.match(tray, /insert-shape-grid/)
  const hld = tray.slice(tray.indexOf('export const HLD_ENTRIES'), tray.indexOf('export const MORE_HLD_ENTRIES'))
  assert.equal((hld.match(/shape: '/g) ?? []).length, 3, 'the desktop dock keeps its three HLD buttons')
})

/** Endpoints of every drawing command of an outline (absolute M, L, H, V, A and Z only, as hldOutlinePath writes them). */
function pathEndpoints(d) {
  const points = []
  let cx = 0
  let cy = 0
  for (const [, cmd, args] of d.matchAll(/([MLHVAZ])([^MLHVAZ]*)/g)) {
    const v = args.trim() === '' ? [] : args.trim().split(/[\s,]+/).map(Number)
    assert.ok(v.every(Number.isFinite), `finite numbers in ${cmd}${args}`)
    if (cmd === 'M' || cmd === 'L') [cx, cy] = v
    else if (cmd === 'H') cx = v[0]
    else if (cmd === 'V') cy = v[0]
    else if (cmd === 'A') [cx, cy] = [v[5], v[6]]
    else continue
    points.push([cx, cy])
  }
  return points
}

test('new HLD shapes: labels, default sizes, kinds and saved values', () => {
  for (const shape of FIVE) {
    assert.ok(shapes.HLD_SHAPE_LABELS[shape])
    assert.ok(shapes.HLD_DEFAULT_SIZE[shape].width > 0 && shapes.HLD_DEFAULT_SIZE[shape].height > 0)
  }
  assert.deepEqual(FIVE.map((shape) => shapes.HLD_SHAPE_LABELS[shape]), ['API gateway', 'Server', 'Object storage', 'Stream', 'Worker'])
})

test('new HLD shape outlines are valid, non-empty and stay inside the box at several sizes', () => {
  for (const shape of FIVE) {
    for (const [w, h] of [[32, 32], [96, 64], [190, 110], [300, 200], [460, 130], [900, 500]]) {
      const x = 40
      const y = 70
      const d = shapes.hldOutlinePath({ x, y, width: w, height: h }, shape)
      assert.ok(d.length > 20 && d.startsWith('M'), `${shape} ${w}x${h} path`)
      assert.ok(!/NaN|undefined|Infinity/.test(d))
      for (const [px, py] of pathEndpoints(d)) {
        assert.ok(px >= x - 0.01 && px <= x + w + 0.01 && py >= y - 0.01 && py <= y + h + 0.01, `${shape} ${w}x${h} point ${px},${py} inside`)
      }
    }
  }
  const r = { x: 0, y: 0, width: 300, height: 200 }
  assert.equal(new Set(FIVE.map((shape) => shapes.hldOutlinePath(r, shape))).size, 5, 'each shape has its own outline')
})

test('new HLD shapes: icon marks match the shape', () => {
  const r = { x: 0, y: 0, width: 300, height: 200 }
  assert.equal((shapes.hldOutlinePath(r, 'server').match(/H300/g) ?? []).length >= 2, true, 'rack slot lines')
  assert.equal((shapes.hldOutlinePath(r, 'server').match(/A2\.4|A5\.5|A\d/g) ?? []).length >= 4 + 6, true, 'rounded box plus three LEDs')
  assert.equal((shapes.hldOutlinePath(r, 'objectStorage').match(/Z/g) ?? []).length, 1, 'bucket rim')
  assert.equal((shapes.hldOutlinePath(r, 'worker').match(/Z/g) ?? []).length, 3, 'box, gear and hub')
  assert.equal((shapes.hldOutlinePath(r, 'stream').match(/L/g) ?? []).length, 2, 'one arrow head')
})

test('new HLD shapes: label area leaves the icon free', async () => {
  const fit = await loadModule('textFit.ts')
  const area = (shape, w, h) => fit.shapeInnerArea({ kind: 'rectangle', id: 1, x: 0, y: 0, width: w, height: h, strokeColor: '#111', strokeWidth: 2, hldShape: shape, inkBox: { top: 0, mid: 0, ink: [] } })
  const plain = area('service', 300, 200)
  for (const shape of FIVE) {
    const a = area(shape, 300, 200)
    assert.ok(a.width > 0 && a.height > 0, `${shape} still has room`)
    assert.ok(a.width < plain.width + 1e-9 || a.height < plain.height, `${shape} excludes its icon`)
    const insets = shapes.hldIconInsets(shape, 300, 200)
    assert.ok(insets.left + insets.right + insets.top + insets.bottom > 0, `${shape} has insets`)
  }
  assert.ok(area('apiGateway', 300, 200).width < 300 - 20 - 30, 'gate strip excluded')
  assert.ok(area('worker', 300, 200).height < 200 - 20 - 30, 'gear band excluded')
  assert.ok(area('stream', 300, 200).width < 300 - 20 - 25, 'arrow end excluded')
  assert.deepEqual(shapes.hldIconInsets('service', 300, 200), { left: 0, right: 0, top: 0, bottom: 0 })
  for (const shape of FIVE) assert.ok(fit.findFitArea([{ kind: 'rectangle', id: 1, x: 0, y: 0, width: 300, height: 200, strokeColor: '#111', strokeWidth: 2, hldShape: shape, inkBox: { top: 0, mid: 0, ink: [] } }], { x: 150, y: 100 }))
})

test('new HLD shapes: save, reload and unknown values', () => {
  const items = FIVE.map((shape, i) => make(shape, i + 1))
  const text = format.stringifyDocument(format.createDocument({ template: 'blank', background: 'white', items }))
  const parsed = format.parseDocument(text)
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.document.items.map((item) => item.hldShape), FIVE)
  assert.equal(JSON.parse(text).version, format.DOCUMENT_VERSION)
  const raw = JSON.parse(text)
  raw.items[0].hldShape = 'cloud'
  assert.equal(format.parseDocument(JSON.stringify(raw)).document.items[0].hldShape, undefined, 'unknown values are dropped as before')
  for (const item of parsed.document.items) assert.equal(item.angle, undefined)
})


test('five more HLD shapes: wired into trays, command palette, change shape and the saved format', async () => {
  const tray = await readFile(new URL('../src/app/InsertTray.tsx', import.meta.url), 'utf8')
  for (const shape of FIVE) assert.match(tray, new RegExp(`shape: '${shape}'`))
  const more = tray.slice(tray.indexOf('export const MORE_HLD_ENTRIES'))
  assert.equal((more.match(/shape: '/g) ?? []).length, 11, 'six round-1 shapes plus the five new ones share the More grid')
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /HLD_SHAPES\.map\(\(shape\) => \(\{ id: `hld:\$\{shape\}`/)
  const change = await loadModule('changeShape.ts')
  const choices = change.changeShapeChoices([make('apiGateway', 1)].map((r) => box.addStrokeToInkBox(r, line(9, [p(150, 150), p(250, 160)]))), new Set(['rectangle:1']))
  assert.deepEqual(choices.choices.map((c) => c.id), [...model.HLD_SHAPES].filter((id) => id !== 'apiGateway'))
  assert.ok(FIVE.filter((shape) => shape !== 'apiGateway').every((shape) => choices.choices.some((c) => c.id === shape)))
  assert.deepEqual([...model.HLD_SHAPES].slice(-5), FIVE)
})
