import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const laser = await loadModule('laserPointer.ts')
const app = await readAppSource()

test('a touch-down never ends a pen or mouse laser trail (resting palm)', () => {
  assert.equal(laser.laserOnTouchDown('pen', 1, true), 'keep')
  assert.equal(laser.laserOnTouchDown('pen', 2, true), 'keep')
  assert.equal(laser.laserOnTouchDown('mouse', 2, false), 'keep')
})

test('touch laser: first finger starts, second finger ends it', () => {
  assert.equal(laser.laserOnTouchDown(null, 1, false), 'start')
  assert.equal(laser.laserOnTouchDown('touch', 2, false), 'clear')
  assert.equal(laser.laserOnTouchDown(null, 1, true), 'clear')
})

test('laser wiring: the laser pointer type is remembered and used on touch-down', () => {
  assert.match(app, /laserPointerTypeRef\.current = event\.pointerType/)
  assert.match(app, /laserOnTouchDown\(laserPointerRef\.current === null/)
})
