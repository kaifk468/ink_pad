import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const { continueList, minimalEdit } = await loadModule('listContinuation.ts')
const overlay = (await readFile(new URL('../src/TextEditorOverlay.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')

const run = (marked) => {
  const start = marked.indexOf('|')
  const second = marked.indexOf('|', start + 1)
  const end = second === -1 ? start : second - 1
  const r = continueList(marked.replace(/\|/g, ''), start, end)
  return r && r.value.slice(0, r.caret) + '|' + r.value.slice(r.caret)
}

test('continues bullets and numbers with the same indentation', () => {
  assert.equal(run('- one|'), '- one\n- |')
  assert.equal(run('  * one|'), '  * one\n  * |')
  assert.equal(run('• a|'), '• a\n• |')
  assert.equal(run('– a|'), '– a\n– |')
  assert.equal(run('1. one|'), '1. one\n2. |')
  assert.equal(run('9) one|'), '9) one\n10) |')
  assert.equal(run('x\n\t3. c|\ny'), 'x\n\t3. c\n\t4. |\ny')
})

test('splits the line when the caret is mid-line', () => {
  assert.equal(run('- ab|cd'), '- ab\n- |cd')
})

test('an empty item ends the list', () => {
  assert.equal(run('- one\n- |'), '- one\n|')
  assert.equal(run('  - |'), '  |')
  assert.equal(run('3. |'), '|')
})

test('no list means default Enter', () => {
  assert.equal(run('plain|'), null)
  assert.equal(run('-no space|'), null)
  assert.equal(run('1.5 apples|'), null)
  assert.equal(run('|- one'), null)
  assert.equal(run('-| one'), null)
  assert.equal(run('- o|ne|'), null)
  assert.equal(run('1234. x|'), null)
})

test('minimalEdit yields one replacement', () => {
  assert.deepEqual(minimalEdit('- a', '- a\n- '), { from: 3, to: 3, text: '\n- ' })
  assert.deepEqual(minimalEdit('- a\n- ', '- a\n'), { from: 4, to: 6, text: '' })
})

test('editor wiring: plain Enter and beforeinput share one guarded path', () => {
  assert.match(overlay, /continueList\(field\.value, field\.selectionStart, field\.selectionEnd\)/)
  assert.match(overlay, /event\.key === 'Enter' && \(event\.ctrlKey \|\| event\.metaKey\)\) \{ event\.preventDefault\(\); onCommit\(\)/)
  assert.match(overlay, /addEventListener\('beforeinput'/)
  assert.match(overlay, /insertLineBreak/)
  assert.match(overlay, /insertParagraph/)
  assert.match(overlay, /skipBeforeInput/)
  assert.match(overlay, /connectorId === undefined && applyListEnter/)
  assert.match(overlay, /editorRef\.current\.connectorId !== undefined/)
  assert.match(overlay, /execCommand\('insertText'/)
})
