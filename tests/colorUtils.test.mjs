import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const c = await loadModule('colorUtils.ts')
const picker = await readFile(new URL('../src/app/ColorPicker.tsx', import.meta.url), 'utf8')

test('parseHex accepts 3/6 digits with or without #, lowercases, rejects junk', () => {
  assert.equal(c.parseHex('#FFAA00'), '#ffaa00')
  assert.equal(c.parseHex('ffaa00'), '#ffaa00')
  assert.equal(c.parseHex('#fa0'), '#ffaa00')
  assert.equal(c.parseHex(' F0a '), '#ff00aa')
  for (const bad of ['', '#', '#12', '#1234', '#12345', '#1234567', '#ggg', 'zzzzzz', '##fff']) assert.equal(c.parseHex(bad), null, bad)
})

test('hsv round-trips within 1 unit over a grid of colours', () => {
  const steps = [0, 17, 64, 128, 200, 255]
  for (const r of steps) for (const g of steps) for (const b of steps) {
    const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
    const { h, s, v } = c.hexToHsv(hex)
    assert.ok(h >= 0 && h <= 360 && s >= 0 && s <= 1 && v >= 0 && v <= 1)
    const back = c.hsvToHex(h, s, v)
    for (const i of [1, 3, 5]) assert.ok(Math.abs(parseInt(hex.slice(i, i + 2), 16) - parseInt(back.slice(i, i + 2), 16)) <= 1, `${hex} -> ${back}`)
  }
  assert.equal(c.hsvToHex(0, 1, 1), '#ff0000')
  assert.equal(c.hsvToHex(360, 1, 1), '#ff0000')
  assert.equal(c.hsvToHex(120, 1, 1), '#00ff00')
  assert.equal(c.hsvToHex(240, 1, 1), '#0000ff')
})

test('isDarkColor', () => {
  assert.equal(c.isDarkColor('#000000'), true)
  assert.equal(c.isDarkColor('#ffffff'), false)
})

test('addRecentColor dedupes, puts newest first, caps, and is pure', () => {
  const base = ['#111111', '#222222', '#333333']
  const next = c.addRecentColor(base, '#222222')
  assert.deepEqual(next, ['#222222', '#111111', '#333333'])
  assert.deepEqual(base, ['#111111', '#222222', '#333333'])
  assert.deepEqual(c.addRecentColor(base, 'ABC'), ['#aabbcc', ...base])
  let list = []
  for (let i = 0; i < 12; i++) list = c.addRecentColor(list, '#' + String(i).padStart(2, '0').repeat(3))
  assert.equal(list.length, 8)
  assert.equal(list[0], '#111111')
  assert.deepEqual(c.addRecentColor(base, 'nope'), base)
  assert.equal(c.addRecentColor(base, '#444444', 2).length, 2)
})

test('recent storage round-trips and tolerates failures', () => {
  const saved = globalThis.localStorage
  try {
    const store = new Map()
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
    c.saveRecentColors(['#aabbcc', '#112233'])
    assert.equal(store.has('inkpad.recentColors'), true)
    assert.deepEqual(c.loadRecentColors(), ['#aabbcc', '#112233'])
    store.set('inkpad.recentColors', '{bad json')
    assert.deepEqual(c.loadRecentColors(), [])
    store.set('inkpad.recentColors', '["#abc", 5, "x"]')
    assert.deepEqual(c.loadRecentColors(), ['#aabbcc'])
    globalThis.localStorage = { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } }
    assert.deepEqual(c.loadRecentColors(), [])
    assert.doesNotThrow(() => c.saveRecentColors(['#000000']))
    delete globalThis.localStorage
    assert.deepEqual(c.loadRecentColors(), [])
    assert.doesNotThrow(() => c.saveRecentColors(['#000000']))
  } finally {
    if (saved === undefined) delete globalThis.localStorage
    else globalThis.localStorage = saved
  }
})

test('ColorPicker source: commits on pointer-up/Enter/recent click, has aria roles', () => {
  assert.match(picker, /onPointerUp:[\s\S]{0,300}commitCurrent\(\)/)
  assert.match(picker, /e\.key === 'Enter'[\s\S]{0,80}commitText\(\)/)
  assert.match(picker, /onClick=\{[\s\S]{0,400}commit\(c\)/)
  assert.match(picker, /setPointerCapture/)
  assert.equal((picker.match(/role="slider"/g) ?? []).length, 2)
  assert.equal((picker.match(/aria-valuetext=/g) ?? []).length, 2)
  assert.match(picker, /<button\b/)
  assert.match(picker, /<input\b/)
  assert.match(picker, /<label\b/)
  assert.match(picker, /loadRecentColors/)
  assert.match(picker, /saveRecentColors/)
  assert.match(picker, /addRecentColor/)
})
