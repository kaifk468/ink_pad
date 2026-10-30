import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/oneEuroFilter.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const filter = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const path = (coords) => coords.map(([x, y], index) => ({ x, y, pressure: index / Math.max(1, coords.length - 1) }))

test('one euro filter keeps straight line samples on the same line', () => {
  const result = filter.filterDisplayPoints(path([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]))
  assert.ok(result.every((point) => Math.abs(point.x - point.y) < 1e-9))
})

test('stationary coordinates stay stationary and sample count is preserved', () => {
  const input = path([[7, 9], [7, 9], [7, 9], [7, 9]])
  const result = filter.filterDisplayPoints(input)
  assert.equal(result.length, input.length)
  assert.ok(result.every(({ x, y }) => x === 7 && y === 9))
})

test('filter output is deterministic and preserves exact endpoints', () => {
  const input = path([[0, 0], [0.5, 1], [1, 0.5], [2, 2], [4, 3]])
  assert.deepEqual(filter.filterDisplayPoints(input), filter.filterDisplayPoints(input))
  assert.deepEqual(filter.filterDisplayPoints(input)[0], input[0])
  assert.deepEqual(filter.filterDisplayPoints(input).at(-1), input.at(-1))
})

test('filter creates derived points without modifying raw stored samples', () => {
  const input = path([[0, 0], [1, 0.4], [2, 1], [3, 0]])
  const snapshot = structuredClone(input)
  const result = filter.filterDisplayPoints(input)
  assert.deepEqual(input, snapshot)
  assert.notEqual(result, input)
  assert.notEqual(result[1], input[1])
})

test('small handwriting-sized strokes bypass filtering', () => {
  const input = path([[10, 10], [11, 13], [12, 9], [14, 12], [16, 10]])
  assert.deepEqual(filter.filterDisplayPoints(input), input)
})

test('sharp corners retain the raw corner and its neighboring samples', () => {
  const input = path([[0, 0], [20, 0], [40, 0], [40, 20], [40, 40], [60, 40], [80, 40]])
  const result = filter.filterDisplayPoints(input)
  for (const index of [1, 2, 3, 4, 5]) assert.deepEqual(result[index], input[index])
})
