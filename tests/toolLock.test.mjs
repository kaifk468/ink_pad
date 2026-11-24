import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFile } from 'node:fs/promises'

const input = await loadModule('desktopInput.ts')
const app = await readAppSource()
const dock = await readFile(new URL('../src/app/ToolDock.tsx', import.meta.url), 'utf8')
const key = (extra) => ({ key: 'q', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })

test('Q toggles the tool lock in desktop mode only, without modifiers or repeats', () => {
  assert.deepEqual(input.keyCommand(key({}), 'desktop'), { kind: 'toolLock' })
  assert.equal(input.keyCommand(key({}), 'tablet'), null)
  assert.equal(input.keyCommand(key({ repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key({ ctrlKey: true }), 'desktop'), null)
})

test('tool lock is remembered on the device and storage failures fall back to off', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  assert.equal(input.loadToolLock(storage), false)
  input.saveToolLock(true, storage)
  assert.equal(store.get('inkpad.toolLock'), '1')
  assert.equal(input.loadToolLock(storage), true)
  input.saveToolLock(false, storage)
  assert.equal(input.loadToolLock(storage), false)
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(input.loadToolLock(broken), false)
  assert.doesNotThrow(() => input.saveToolLock(true, broken))
})

test('the dock has a pressed-state lock button with the Q tooltip in both modes', () => {
  assert.match(dock, /aria-pressed=\{Boolean\(props\.toolLock\)\}/)
  assert.match(dock, /Keep the tool after drawing \(Q\)/)
  assert.equal((dock.match(/\{lock\}/g) ?? []).length, 2)
})

test('App wires the lock: shapes and arrows keep the tool when on, Select takeover stays when off', () => {
  assert.match(app, /useState<boolean>\(\(\) => loadToolLock\(\)\)/)
  assert.match(app, /case 'toolLock': toggleToolLock\(\); return true/)
  assert.match(app, /if \(toolLockRef\.current\) \{[^}]*setSelectedRectangle\(null\)[^}]*return\s*\}\s*setShapeTool\(null\)\s*setSelectionMode\(true\)\s*setSelectedRectangle\(finished\.rectangleId\)/s)
  assert.match(app, /if \(!toolLockRef\.current\) selectNewConnectorRef\.current\(canvasItemKey\(arrowConnector\)\)/)
})
