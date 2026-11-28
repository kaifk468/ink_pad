import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { loadModule } from './helpers/loadModule.mjs'

const sticky = await loadModule('stickyNote.ts')
const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const doc = await loadModule('documentFormat.ts')
const sketchy = await loadModule('sketchy.ts')

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const WS = { x: 0, y: 0, width: 2500, height: 1500 }

test('a sticky note is a plain filled rectangle of about 180x120', () => {
  const note = sticky.createStickyNote(7, { x: 500, y: 400 }, 3, WS)
  assert.deepEqual(note, { kind: 'rectangle', id: 7, x: 410, y: 340, width: 180, height: 120, strokeColor: '#e0b400', strokeWidth: 3, fillColor: '#fff3a3' })
  assert.equal(sketchy.isFillableRectangle(note), true)
})

test('a sticky note near the edge is moved back inside the workspace', () => {
  const note = sticky.createStickyNote(1, { x: 5, y: 2490 }, 3, WS)
  assert.equal(note.x, 0)
  assert.equal(note.y, 1500 - 120)
})

test('a sticky note survives save and load unchanged (no new field)', () => {
  const note = sticky.createStickyNote(1, { x: 500, y: 400 }, 3, WS)
  const text = doc.stringifyDocument(doc.createDocument({ title: 't', template: 'blank', background: 'white', items: [note] }))
  const parsed = doc.parseDocument(text)
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.document.items, [note])
})

test('N is the sticky key and has a shortcut row', () => {
  assert.deepEqual(input.keyCommand({ key: 'n', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false }, 'desktop'), { kind: 'tool', tool: 'sticky' })
  const row = shortcuts.DESKTOP_SHORTCUTS.find((entry) => entry.keys === 'N')
  assert.ok(row)
  assert.match(row.label, /Sticky note/)
})

test('wiring: App inserts the note in one undo step, trays have the entry, N opens the editor inside', async () => {
  const app = await read('App.tsx')
  assert.match(app, /case 'sticky': insertStickyNote\(\)/)
  assert.match(app, /onSticky=\{insertStickyNote\}/)
  const body = app.slice(app.indexOf('const insertStickyNote'), app.indexOf('const changeCode'))
  assert.equal((body.match(/saveHistory\(\)/g) ?? []).length, 1)
  assert.match(body, /cursorPointRef\.current/)
  assert.match(body, /createStickyNote\(/)
  assert.match(body, /if \(desktop\) \{[\s\S]*openTextEditor\(\{[\s\S]*centerOn/)
  assert.match(await read('app/InsertTray.tsx'), /aria-label="Sticky note"[\s\S]*onClick=\{choose\(onSticky\)\}/)
  assert.match(await read('app/MoreShapesTray.tsx'), /aria-label="Sticky note"[\s\S]*onSticky\(\)/)
  assert.match(await read('app/ToolDock.tsx'), /<MoreShapesTray [^>]*onSticky=\{props\.onSticky\}/)
  assert.match(await read('app/ToolDock.tsx'), /onSticky=\{props\.onSticky\}\n\s+\/>/)
})
