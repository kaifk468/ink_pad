import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { readAppSource } from './helpers/appSource.mjs'

const app = await readAppSource()
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
const viewportSource = await readFile(new URL('../src/viewport.ts', import.meta.url), 'utf8')
const config = await readFile(new URL('../src/app/appConfig.ts', import.meta.url), 'utf8')

test('the app opens at 110% zoom and keeps 100% as the Reset default, with nothing persisted', () => {
  assert.match(viewportSource, /export const INITIAL_ZOOM = 1\.1/)
  assert.match(viewportSource, /export const DEFAULT_ZOOM = 1\n/)
  assert.match(app, /useRef<Viewport>\(\{ scale: INITIAL_ZOOM, offsetX: 0, offsetY: 0 \}\)/)
  assert.match(app, /useState\(Math\.round\(INITIAL_ZOOM \* 100\)\)/)
  assert.match(app, /const resetView = \(\) => \{[\s\S]*?scale: DEFAULT_ZOOM/)
  assert.equal(Math.round(1.1 * 100), 110)
  assert.doesNotMatch(app, /localStorage\.[a-z]+Item\(['"]inkpad\.(zoom|viewport|strokeWidth|width)/i)
})

test('the pen starts at the thinnest preset and the four presets remain', () => {
  assert.match(config, /export const WIDTHS = \[2, 4, 7, 11\]/)
  assert.match(app, /const \[width, setWidth\] = useState\(WIDTHS\[0\]\)/)
  assert.match(app, /onWidth=\{setWidth\}/)
})

test('a stroke width slider sits alongside the presets in the contextual panel', async () => {
  const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
  assert.match(config, /MIN_STROKE_WIDTH = 1/)
  assert.match(config, /MAX_STROKE_WIDTH = 24/)
  assert.match(panel, /aria-label="Stroke width" type="range" min=\{MIN_STROKE_WIDTH\} max=\{MAX_STROKE_WIDTH\} step="1" value=\{props\.width\}/)
  assert.match(panel, /props\.onWidth\(Number\(event\.target\.value\)\)/)
  assert.match(panel, /aria-label="Stroke thickness"/)
  assert.match(panel, /<output htmlFor="stroke-width-range">\{props\.width\} px<\/output>/)
  assert.match(styles, /\.stroke-width-range \{[^}]*height:\s*44px/)
})
