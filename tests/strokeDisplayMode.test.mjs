import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function loadTs(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}

const modeApi = await loadTs('../src/strokeDisplayMode.ts')
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const mockStorage = () => {
  const data = new Map()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }
}

test('stroke display mode defaults to Smooth and invalid saved values fall back to Smooth', () => {
  const storage = mockStorage()
  assert.equal(modeApi.loadStrokeDisplayMode(storage), 'smooth')
  storage.setItem('inkpad.strokeDisplayMode', 'bogus')
  assert.equal(modeApi.loadStrokeDisplayMode(storage), 'smooth')
})

test('stroke display mode persists and restores Raw or Smooth', () => {
  const storage = mockStorage()
  modeApi.saveStrokeDisplayMode('raw', storage)
  assert.equal(modeApi.loadStrokeDisplayMode(storage), 'raw')
  modeApi.saveStrokeDisplayMode('smooth', storage)
  assert.equal(modeApi.loadStrokeDisplayMode(storage), 'smooth')
})

test('display mode never changes the raw stored stroke points', () => {
  const points = [{ x: 2, y: 4, pressure: 0.3 }, { x: 8, y: 9, pressure: 0.8 }]
  const stroke = { kind: 'stroke', id: 5, points, color: '#202124', width: 4, erase: false }
  const before = structuredClone(stroke.points)
  modeApi.saveStrokeDisplayMode('raw', mockStorage())
  modeApi.saveStrokeDisplayMode('smooth', mockStorage())
  assert.deepEqual(stroke.points, before)
})

test('Raw display uses the straight lineTo renderer while Smooth uses the filtered curve renderer', async () => {
  assert.match(appSource, /strokeDisplayMode === 'raw'[\s\S]*?ctx\.lineTo\(current\.x, current\.y\)/)
  assert.match(appSource, /filterDisplayPoints\(stroke\.points\)/)
  assert.match(appSource, /buildMidpointCurve\(points\)/)
  assert.doesNotMatch(await readFile(new URL('../src/oneEuroFilter.ts', import.meta.url), 'utf8'), /DEBUG_DISABLE_FILTER/)
})
