import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../src/app/desktop-panels.css', import.meta.url), 'utf8')
const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')

test('desktop-panels.css is desktop-scoped and imported', async () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let checked = 0
  for (const chunk of bare.split('}')) {
    const selector = chunk.split('{')[0].trim()
    if (!selector || selector.startsWith('@') || selector === 'from' || selector === 'to' || chunk.indexOf('{') < 0) continue
    for (const piece of selector.split(',')) { checked++; assert.match(piece.trim(), /^\.app-shell\[data-input-mode="desktop"\]/, piece) }
  }
  assert.ok(checked > 10)
  assert.match(await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'), /desktop-panels\.css/)
})

test('layer buttons use icons only on desktop and keep labels and tablet text', () => {
  assert.match(panel, /props\.desktop \? <svg[^>]*>.*: 'To front'/)
  for (const label of ['Bring to front', 'Bring forward', 'Send backward', 'Send to back']) assert.match(panel, new RegExp(`aria-label="${label}"`))
})
