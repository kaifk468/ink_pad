import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const laser = await loadModule('laserPointer.ts')
const app = await readAppSource()

test('leaving the laser restores the tool that was active before it', () => {
  const rect = { ...laser.PEN_TOOL_FLAGS, shapeTool: 'rectangle' }
  assert.deepEqual(laser.toolToRestoreAfterLaser(rect), rect)
  assert.deepEqual(laser.toolToRestoreAfterLaser(laser.PEN_TOOL_FLAGS), laser.PEN_TOOL_FLAGS)
  const eraser = { ...laser.PEN_TOOL_FLAGS, eraser: true }
  assert.equal(laser.toolToRestoreAfterLaser(eraser).eraser, true)
  assert.equal(laser.toolToRestoreAfterLaser(eraser).shapeTool, null)
})

test('the laser toggle and Esc remember and restore the previous tool; More shows the laser state', async () => {
  assert.match(app, /laserPreviousToolRef\.current = \{ eraser, shapeMode, shapeTool, selectionMode, lassoMode, connectorMode, textMode, classMode, umlConnectorType \}/)
  assert.match(app, /if \(laserModeRef\.current && !cancelableGesture\) \{ leaveLaser\(\); return true \}/)
  assert.match(app, /if \(laserModeRef\.current\) \{ leaveLaser\(\); return \}/)
  const tray = await readFile(new URL('../src/app/MoreTray.tsx', import.meta.url), 'utf8')
  assert.match(tray, /open \|\| laserActive \? ' selected'/)
  assert.match(tray, /More tools \u2014 Laser pointer on/)
})
