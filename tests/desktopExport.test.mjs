import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const src = await readFile(new URL('../src/FilePanel.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/app/desktop-panels.css', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

const start = src.indexOf('if (props.desktop) {')
const tabletStart = src.indexOf('return (\n    <div className="file-panel-backdrop"', start)
const desktopBranch = src.slice(start, tabletStart)
const tabletBranch = src.slice(tabletStart)

test('desktop export dialog shows Image before Diagram file, then the disclosure', () => {
  assert.ok(start > 0 && tabletStart > start)
  const image = desktopBranch.indexOf('>Image<')
  const file = desktopBranch.indexOf('>Diagram file<')
  const more = desktopBranch.indexOf('<details className="export-more">')
  assert.ok(image > 0 && image < file && file < more)
  assert.match(desktopBranch, />Export<\/h2>/)
  assert.doesNotMatch(desktopBranch, /<details[^>]*\bopen\b/)
})

test('PNG and SVG tiles call the existing handlers; scale defaults to 2x', () => {
  assert.match(src, /useState<1 \| 2>\(2\)/)
  assert.match(desktopBranch, /onClick=\{\(\) => props\.onExportPng\(pngScale\)\}>[\s\S]*?>PNG</)
  assert.match(desktopBranch, /onClick=\{props\.onExportSvg\}>[\s\S]*?>SVG</)
  assert.match(desktopBranch, /props\.onTransparentChange/)
  for (const handler of ['onExportDocument', 'onNew', 'onCopyOutline', 'onCopyMermaid', 'onDownloadOutline', 'onDownloadExcalidraw', 'onCopyExcalidraw', 'onExportNotebookLm']) assert.match(desktopBranch, new RegExp(`props\\.${handler}`))
})

test('title field is tablet-only', () => {
  assert.doesNotMatch(desktopBranch, /diagram-title-input|Save title/)
  assert.match(tabletBranch, /diagram-title-input/)
  assert.match(tabletBranch, /aria-label="Save title"/)
  assert.match(tabletBranch, /Export image/)
  assert.match(app, /desktop=\{inputMode === 'desktop'\}\n\s*\/>\}\n\s*\{PERFORMANCE/)
})

test('export dialog CSS is desktop-scoped and respects reduced motion', () => {
  const block = css.slice(css.indexOf('/* ---------- Export dialog (desktop)'))
  const bare = block.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(bare, /@keyframes export-dialog-in/)
  assert.match(bare, /prefers-reduced-motion: reduce[\s\S]*animation: none/)
  assert.match(bare, /translateY\(8px\)/)
  for (const chunk of bare.split('}')) {
    const selector = chunk.split('{')[0].trim()
    if (!selector || selector.startsWith('@') || selector === 'from' || selector === 'to' || chunk.indexOf('{') < 0) continue
    for (const piece of selector.split(',')) assert.match(piece.trim(), /^\.app-shell\[data-input-mode="desktop"\]/, piece)
  }
})

test('desktop export: Options (scale + transparent) come before the PNG/SVG tiles, which name their files', async () => {
  const options = desktopBranch.indexOf('>Options<')
  const image = desktopBranch.indexOf('>Image<')
  assert.ok(options > 0 && options < image)
  assert.ok(desktopBranch.indexOf('export-scale-label') < image && desktopBranch.indexOf('role="switch"') < image)
  assert.match(desktopBranch, /exportFileName\(props\.title, 'png', pngScale\)/)
  assert.match(desktopBranch, /exportFileName\(props\.title, 'svg'\)/)
  assert.match(desktopBranch, /ref=\{firstTileRef\}[^]*?>PNG</)
})

test('exportFileName mirrors the download names (@2x only on PNG at 2x)', async () => {
  const { loadModule } = await import('./helpers/loadModule.mjs')
  const { exportFileName } = await loadModule('exportOptions.ts')
  assert.equal(exportFileName('Untitled diagram', 'png', 2), 'Untitled-diagram@2x.png')
  assert.equal(exportFileName('Untitled diagram', 'png', 1), 'Untitled-diagram.png')
  assert.equal(exportFileName('Untitled diagram', 'svg'), 'Untitled-diagram.svg')
})
