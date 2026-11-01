import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const out = ts.transpileModule(await read('testInk.ts'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const ink = await import(`data:text/javascript;base64,${Buffer.from(out).toString('base64')}`)
const view = { x: 400, y: 300, width: 1100, height: 560 }
const page = { x: 0, y: 0, width: 2500, height: 1500 }

test('test ink reaches about the requested number of points, inside the view and the page', () => {
  for (const target of [6000, 30000]) {
    const strokes = ink.createTestInk(view, page, target, 100)
    const total = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0)
    assert.ok(total >= target && total < target + 130, `${target}: got ${total}`)
    for (const stroke of strokes) for (const point of stroke.points) {
      assert.ok(point.x >= view.x && point.x <= view.x + view.width, 'x inside view')
      assert.ok(point.y >= view.y - 20 && point.y <= view.y + view.height, 'y inside view')
      assert.ok(point.pressure > 0 && point.pressure <= 1)
    }
  }
})

test('test ink has unique ids from the first id, a reserved colour, and is recognised and only that', () => {
  const strokes = ink.createTestInk(view, page, 3000, 500)
  assert.equal(new Set(strokes.map((s) => s.id)).size, strokes.length)
  assert.equal(strokes[0].id, 500)
  assert.ok(strokes.every(ink.isTestInk))
  assert.equal(ink.isTestInk({ kind: 'stroke', id: 1, points: [], color: '#202124', width: 4, erase: false }), false)
  assert.equal(ink.isTestInk({ kind: 'rectangle', id: 1 }), false)
  assert.equal(ink.isTestInk({ ...strokes[0], erase: true }), false)
})

test('test ink is repeatable, and a view outside the page or too small gets none', () => {
  assert.deepEqual(ink.createTestInk(view, page, 2000, 1), ink.createTestInk(view, page, 2000, 1))
  assert.deepEqual(ink.createTestInk({ x: 5000, y: 5000, width: 500, height: 500 }, page, 2000, 1), [])
  assert.deepEqual(ink.createTestInk({ x: 0, y: 0, width: 60, height: 20 }, page, 2000, 1), [])
})

test('the menu entries exist only in the developer block and act through undoable history', async () => {
  const bar = await read('app/TopLeftBar.tsx')
  const app = await read('App.tsx')
  const block = bar.slice(bar.indexOf('{props.diagnostics.enabled && <>'))
  for (const label of ['Test ink: light', 'Test ink: dense', 'Remove test ink']) assert.ok(block.includes(label), label)
  assert.equal(bar.slice(0, bar.indexOf('{props.diagnostics.enabled && <>')).includes('Test ink'), false)
  assert.match(app, /const fillTestInk = \(targetPoints: number\) => \{[\s\S]*?saveHistory\(\)\s+strokesRef\.current = \[\.\.\.strokesRef\.current, \.\.\.strokes\]/)
  assert.match(app, /const removeTestInk = \(\) => \{[\s\S]*?saveHistory\(\)\s+strokesRef\.current = kept/)
  assert.match(app, /onFillTestInk: fillTestInk, onRemoveTestInk: removeTestInk/)
  assert.match(bar, /onFillTestInk\(6000\)/)
  assert.match(bar, /onFillTestInk\(30000\)/)
})
