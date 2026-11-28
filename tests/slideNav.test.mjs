import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const nav = await loadModule('slideNav.ts')
const k = (key, extra = {}) => ({ key, ...extra })

test('forward keys: right arrow and PageDown; stop at the last page', () => {
  for (const key of ['ArrowRight', 'PageDown']) {
    assert.equal(nav.slideKeyTarget(k(key), 1, 5), 2, key)
    assert.equal(nav.slideKeyTarget(k(key), 4, 5), 4, `${key} stops at the end`)
  }
})

test('backward keys: left arrow and PageUp; stop at the first page', () => {
  for (const key of ['ArrowLeft', 'PageUp']) {
    assert.equal(nav.slideKeyTarget(k(key), 3, 5), 2, key)
    assert.equal(nav.slideKeyTarget(k(key), 0, 5), 0, `${key} stops at the start`)
  }
})

test('Home and End jump to the first and last page', () => {
  assert.equal(nav.slideKeyTarget(k('Home'), 3, 5), 0)
  assert.equal(nav.slideKeyTarget(k('End'), 1, 5), 4)
  assert.equal(nav.slideKeyTarget(k('End'), 0, 1), 0)
})

test('one page: every slide key stays on page 0', () => {
  for (const key of ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Home', 'End']) assert.equal(nav.slideKeyTarget(k(key), 0, 1), 0, key)
})

test('other keys and modified keys are not slide keys', () => {
  for (const key of ['a', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'Tab']) assert.equal(nav.slideKeyTarget(k(key), 1, 5), null, key)
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) assert.equal(nav.slideKeyTarget(k('ArrowRight', { [mod]: true }), 1, 5), null, mod)
})

test('a held PageDown, PageUp or Space does not run through the pages; a held arrow does', () => {
  assert.equal(nav.slideKeyTarget(k('PageDown', { repeat: true }), 1, 5), 1)
  assert.equal(nav.slideKeyTarget(k('PageUp', { repeat: true }), 1, 5), 1)
  assert.equal(nav.slideKeyTarget(k('ArrowRight', { repeat: true }), 1, 5), 2)
})

test('Space is not a slide key (it pans on the desktop)', () => {
  assert.equal(nav.slideKeyTarget(k(' '), 1, 5), null)
})

test('an out-of-range index is clamped', () => {
  assert.equal(nav.slideKeyTarget(k('ArrowRight'), 9, 3), 2)
  assert.equal(nav.slideKeyTarget(k('ArrowLeft'), -2, 3), 0)
})

test('label, control visibility and button state', () => {
  assert.equal(nav.slideLabel(1, 5), '2 / 5')
  assert.equal(nav.slideLabel(0, 1), '1 / 1')
  assert.equal(nav.slideLabel(0, 0), '1 / 1')
  assert.equal(nav.showSlideControl(true, 2), true)
  assert.equal(nav.showSlideControl(true, 1), false)
  assert.equal(nav.showSlideControl(false, 5), false)
  assert.deepEqual(nav.slideStepEnabled(0, 3), { previous: false, next: true })
  assert.deepEqual(nav.slideStepEnabled(2, 3), { previous: true, next: false })
  assert.deepEqual(nav.slideStepEnabled(1, 3), { previous: true, next: true })
})

test('arrow keys are recognised (they never nudge in present mode)', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) assert.equal(nav.isArrowKey(key), true)
  assert.equal(nav.isArrowKey('a'), false)
})
