import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const editing = await loadModule('codeEditing.ts')
const overlay = (await readFile(new URL('../src/CodeEditorOverlay.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')

// Writes text with a caret marker `|` (or a selection between two `|`), runs one key, and returns the result in the same notation.
const run = (marked, key, language = 'javascript') => {
  const start = marked.indexOf('|')
  const second = marked.indexOf('|', start + 1)
  const end = second === -1 ? start : second - 1
  const text = marked.replace(/\|/g, '')
  const result = editing.codeKeyEdit(text, start, end, key, language)
  if (!result) return null
  const { text: out, start: s, end: e } = result
  return s === e ? out.slice(0, s) + '|' + out.slice(s) : out.slice(0, s) + '|' + out.slice(s, e) + '|' + out.slice(e)
}

test('brackets and quotes close themselves where code can follow', () => {
  assert.equal(run('f|', '('), 'f(|)')
  assert.equal(run('x = |', '['), 'x = [|]')
  assert.equal(run('if (a) |', '{'), 'if (a) {|}')
  assert.equal(run('s = |', '"'), 's = "|"')
  assert.equal(run('s = |', "'"), "s = '|'")
  assert.equal(run('s = |', '`'), 's = `|`')
  assert.equal(run('f(|)', '['), 'f([|])')
  // before a word: no auto-close
  assert.equal(run('|abc', '('), null)
  // an apostrophe after a letter stays a single quote
  assert.equal(run("don|", "'", 'python'), null)
  // a selection is wrapped and stays selected
  assert.equal(run('x = |a + b|', '('), 'x = (|a + b|)')
  assert.equal(run('|name|', '"'), '"|name|"')
})

test('typing the closing character that is already next steps over it', () => {
  assert.equal(run('f(|)', ')'), 'f()|')
  assert.equal(run('[1, 2|]', ']'), '[1, 2]|')
  assert.equal(run('"abc|"', '"'), '"abc"|')
  assert.equal(run('f(|x', ')'), null)
})

test('Backspace inside an empty pair removes both characters', () => {
  assert.equal(run('f(|)', 'Backspace'), 'f|')
  assert.equal(run('"|"', 'Backspace'), '|')
  assert.equal(run('f(x|)', 'Backspace'), null)
})

test('Enter keeps the indent, adds a level after an opening bracket and splits an empty pair', () => {
  assert.equal(run('    let a = 1|', 'Enter'), '    let a = 1\n    |')
  assert.equal(run('if (a) {|', 'Enter'), 'if (a) {\n  |')
  assert.equal(run('  if (a) {|}', 'Enter'), '  if (a) {\n    |\n  }')
  assert.equal(run('call(|)', 'Enter'), 'call(\n  |\n)')
  assert.equal(run('x = [ |', 'Enter'), 'x = [ \n  |')
  // a selection is replaced
  assert.equal(run('  a|bc|d', 'Enter'), '  a\n  |d')
})

test('a closing bracket typed on a blank line goes back one level', () => {
  assert.equal(run('if (a) {\n    x()\n    |', '}'), 'if (a) {\n    x()\n  }|')
  assert.equal(run('  |', ']'), ']|')
  assert.equal(run('a |', '}'), null)
  // on a blank line with the closing bracket already next, it is stepped over
  assert.equal(run('{\n  |}', '}'), '{\n  }|')
})

test('Python and YAML indent after a colon; Python goes back a level after return or pass', () => {
  assert.equal(run('def f(x):|', 'Enter', 'python'), 'def f(x):\n  |')
  assert.equal(run('  if x:  |', 'Enter', 'python'), '  if x:  \n    |')
  assert.equal(run('    return x|', 'Enter', 'python'), '    return x\n  |')
  assert.equal(run('  pass|', 'Enter', 'python'), '  pass\n|')
  assert.equal(run('  returned = 1|', 'Enter', 'python'), '  returned = 1\n  |')
  assert.equal(run('server:|', 'Enter', 'yaml'), 'server:\n  |')
  // other languages do not indent after a colon
  assert.equal(run('case 1:|', 'Enter', 'java'), 'case 1:\n|')
  // no backtick pairs in Python
  assert.equal(run('x = |', '`', 'python'), null)
})

test('plain text only keeps the indent on Enter', () => {
  assert.equal(run('  note {|', 'Enter', 'plaintext'), '  note {\n  |')
  assert.equal(run('a |', '(', 'plaintext'), null)
  assert.equal(run('a(|)', 'Backspace', 'plaintext'), null)
})

test('other keys and modifiers are left to the browser', () => {
  assert.equal(run('a|', 'x'), null)
  assert.equal(run('a|', 'ArrowLeft'), null)
  assert.match(overlay, /if \(event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey \|\| event\.nativeEvent\.isComposing\) return/)
  assert.match(overlay, /codeKeyEdit\(field\.value, field\.selectionStart, field\.selectionEnd, event\.key, item\.language\)/)
  assert.match(overlay, /pendingSelectionRef\.current = \[selectionStart, selectionEnd\]/)
})
