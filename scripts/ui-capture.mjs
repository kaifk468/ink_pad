#!/usr/bin/env node
// Playwright capture of InkPad UI states (best effort). Needs a built dist/ served on INKPAD_URL.
// Usage: node scripts/ui-capture.mjs <outDir> [--mode desktop|tablet]
//   Start the server first:  npx vite preview --port 4173 --strictPort
// Writes <outDir>/<width>-<state>.png per state and <outDir>/console.txt (console errors and page errors per state).
// States that cannot be reached log "SKIP <name>: reason" and the run continues.

import fs from 'node:fs/promises'
import path from 'node:path'

const { chromium } = await import('playwright').catch(() =>
  import(process.env.PLAYWRIGHT_PATH ?? '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs'))

const args = process.argv.slice(2)
const outArg = args.find((arg) => !arg.startsWith('--'))
if (!outArg) {
  console.error('usage: node scripts/ui-capture.mjs <outDir> [--mode desktop|tablet]')
  process.exit(2)
}
const modeIndex = args.indexOf('--mode')
const MODE = modeIndex >= 0 ? args[modeIndex + 1] : 'desktop'
if (MODE !== 'desktop' && MODE !== 'tablet') {
  console.error(`unknown mode "${MODE}"`)
  process.exit(2)
}
const OUT = path.resolve(outArg)
const URL_BASE = process.env.INKPAD_URL ?? 'http://localhost:4173/'
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1024, height: 700 }]
const TOOL_LABELS = ['Pen', 'Eraser', 'Select', 'Lasso', 'Connector', 'Text', 'Class box']
const TIMEOUT = 8000

await fs.mkdir(OUT, { recursive: true })

const skips = []
const consoleByState = new Map() // state -> Set of messages
let currentState = 'setup'
const record = (text) => {
  if (!consoleByState.has(currentState)) consoleByState.set(currentState, new Set())
  consoleByState.get(currentState).add(text)
}
const skip = (name, reason) => {
  const line = `SKIP ${name}: ${reason}`
  skips.push(line)
  console.log(line)
}
const shot = async (page, width, name, opts = {}) => {
  const file = path.join(OUT, `${width}-${name}.png`)
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false })
  console.log(`saved ${path.relative(process.cwd(), file)}`)
  return file
}
/** Runs one state; a throw is logged as a SKIP and never stops the others. */
const state = async (name, fn) => {
  currentState = name
  try {
    await fn()
  } catch (error) {
    skip(name, String(error?.message ?? error).split('\n')[0])
  }
}
const wait = (page, ms = 300) => page.waitForTimeout(ms)

/** Box drag rectangles (fractions of the canvas) for the mixed diagram; narrow viewports shift right so no drag starts under the 240px options panel. */
function mixedRects(w) {
  const off = MODE === 'desktop' && w < 1200 ? 0.12 : 0 // tablet shots keep the original layout
  return [
    [[0.22 + off, 0.30], [0.36 + off, 0.42]],
    [[0.50 + off, 0.30], [0.64 + off, 0.42]],
    [[0.36 + off, 0.60], [0.50 + off, 0.72]],
  ]
}

/** Drag with the mouse on the canvas, in page coordinates relative to the canvas box. */
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
  await wait(page, 150)
}
const canvasBox = async (page) => {
  const box = await page.locator('canvas.drawing-canvas').boundingBox()
  if (!box) throw new Error('canvas.drawing-canvas not visible')
  return box
}
const at = (box, fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })

const browser = await chromium.launch()

for (const viewport of VIEWPORTS) {
  const w = viewport.width
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript((mode) => {
    try { window.localStorage.setItem('inkpad.inputMode', mode) } catch { /* storage blocked */ }
  }, MODE)
  const page = await context.newPage()
  page.on('console', (msg) => { if (msg.type() === 'error') record(`console.error: ${msg.text()}`) })
  page.on('pageerror', (error) => record(`pageerror: ${error.message}`))
  currentState = `setup-${w}`

  await page.goto(URL_BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.home-screen, canvas.drawing-canvas', { timeout: 15000 })

  // Library / home screen, then into a new diagram.
  if (MODE === 'desktop') {
    await state(`${w}-library`, async () => {
      // The app opens on a canvas: Ctrl+O (Library shortcut) opens the Library over it.
      if (!(await page.locator('.home-screen').count())) await page.keyboard.press('Control+o')
      await page.waitForSelector('.home-screen', { timeout: TIMEOUT })
      await wait(page, 400)
      await shot(page, w, 'library')
    })
  }
  if (await page.locator('.home-screen').count()) {
    await state(`${w}-new-diagram`, async () => {
      await page.locator('.home-primary', { hasText: '+ New diagram' }).click()
      await page.locator('[role="menuitem"]').first().click()
      await page.waitForSelector('canvas.drawing-canvas', { timeout: TIMEOUT })
    })
  }

  // Empty page.
  await state(`${w}-empty-page`, async () => {
    await page.waitForSelector('canvas.drawing-canvas', { timeout: TIMEOUT })
    await wait(page, 500)
    await shot(page, w, 'empty-page')
  })

  // Menu open (button aria-label="Menu").
  await state(`${w}-menu-open`, async () => {
    await page.locator('[aria-label="Menu"]').first().click()
    await page.waitForSelector('.menu-panel, .ms-sheet', { timeout: TIMEOUT })
    await wait(page, 300)
    await shot(page, w, 'menu-open')
    await page.locator('[aria-label="Menu"]').first().click() // toggle closed
    await wait(page, 200)
  })

  if (MODE === 'desktop') {
    // Toolbar / dock with each tool selected.
    for (const label of TOOL_LABELS) {
      await state(`${w}-toolbar-${label.toLowerCase().replace(/\s+/g, '-')}`, async () => {
        const button = page.locator(`.tool-dock [aria-label="${label}"]`).first()
        if (!(await button.count())) throw new Error(`no .tool-dock [aria-label="${label}"]`)
        await button.click()
        await wait(page, 200)
        await shot(page, w, `toolbar-${label.toLowerCase().replace(/\s+/g, '-')}`, { fullPage: true })
      })
    }
    await state(`${w}-toolbar-default`, async () => {
      await page.keyboard.press('Escape')
      await page.locator('.tool-dock [aria-label="Select"]').first().click()
      await wait(page, 200)
    })
  }

  // Mixed diagram: 3 rectangles (R + drag), 1 arrow (A + drag), 1 label (T + click).
  await state(`${w}-mixed-diagram`, async () => {
    const box = await canvasBox(page)
    const rects = mixedRects(w)
    for (const [a, b] of rects) {
      await page.keyboard.press('r')
      await drag(page, at(box, a[0], a[1]), at(box, b[0], b[1]))
    }
    await page.keyboard.press('a')
    await drag(page, at(box, rects[0][1][0], 0.36), at(box, rects[1][0][0], 0.36))
    await page.keyboard.press('t')
    await page.mouse.click(at(box, rects[0][0][0] + 0.02, 0.80).x, at(box, rects[0][0][0] + 0.02, 0.80).y)
    await page.keyboard.type('Label')
    await page.keyboard.press('Escape')
    await page.keyboard.press('v') // Select tool, so nothing stays armed
    await wait(page, 400)
    await shot(page, w, 'mixed-diagram')
  })

  if (MODE === 'desktop') {
    // Properties panel with a shape selected (Select tool, click the first box).
    await state(`${w}-panel-shape-selected`, async () => {
      const box = await canvasBox(page)
      await page.keyboard.press('v')
      // centre of the first box, computed from the drag coordinates used above for this viewport
      const [a, b] = mixedRects(w)[0]
      const centre = at(box, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
      await page.mouse.click(centre.x, centre.y)
      await wait(page, 400)
      await shot(page, w, 'panel-shape-selected')
    })

    // Right-click context menu on the second box.
    await state(`${w}-context-menu`, async () => {
      const box = await canvasBox(page)
      await page.mouse.click(at(box, 0.57, 0.36).x, at(box, 0.57, 0.36).y, { button: 'right' })
      await page.waitForSelector('.canvas-context-menu', { timeout: TIMEOUT })
      await wait(page, 200)
      await shot(page, w, 'context-menu')
      await page.keyboard.press('Escape')
      await wait(page, 200)
    })

    // Command palette (Ctrl+K).
    await state(`${w}-command-palette`, async () => {
      await page.keyboard.press('Control+k')
      await page.waitForSelector('.ms-sheet, [role="dialog"][aria-label*="ommand" i]', { timeout: TIMEOUT })
      await wait(page, 300)
      await shot(page, w, 'command-palette')
      await page.keyboard.press('Escape')
      await wait(page, 200)
    })

    // Keyboard shortcuts dialog (?).
    await state(`${w}-shortcuts`, async () => {
      await page.keyboard.press('Shift+?')
      await page.waitForSelector('[role="dialog"][aria-label="Keyboard shortcuts"]', { timeout: TIMEOUT })
      await wait(page, 300)
      await shot(page, w, 'shortcuts')
      await page.keyboard.press('Escape')
      await wait(page, 200)
    })

    // Export and import panel (Menu > Export and import; desktop menu is DesktopMenuSheet, .ms-sheet).
    await state(`${w}-export-panel`, async () => {
      await page.locator('[aria-label="Menu"]').first().click()
      await page.waitForSelector('.ms-sheet', { timeout: TIMEOUT })
      await page.locator('.ms-sheet').getByText('Export and import', { exact: true }).first().click()
      await page.waitForSelector('[role="dialog"][aria-label="Diagrams and export"]', { timeout: TIMEOUT })
      await wait(page, 300)
      await shot(page, w, 'export-panel')
      await page.keyboard.press('Escape')
      await wait(page, 200)
    })

    // Toast: undo usually confirms with a toast; best effort.
    await state(`${w}-toast`, async () => {
      await page.keyboard.press('Control+z')
      await page.waitForSelector('.app-toast-visible', { timeout: 2000 })
      await shot(page, w, 'toast')
      await page.keyboard.press('Control+y')
    })
  }

  await context.close()
}

await browser.close()

// console.txt: per state, unique messages, then the overall unique list.
const lines = ['# Console errors and page errors by state', `# mode: ${MODE}`, `# url: ${URL_BASE}`, '']
const all = new Set()
for (const [name, messages] of consoleByState) {
  if (messages.size === 0) continue
  lines.push(`## ${name}`)
  for (const message of messages) { lines.push(`- ${message}`); all.add(message) }
  lines.push('')
}
lines.push('## all unique messages')
for (const message of all) lines.push(`- ${message}`)
if (all.size === 0) lines.push('(none)')
lines.push('', '## skips', ...(skips.length ? skips.map((line) => `- ${line}`) : ['(none)']), '')
await fs.writeFile(path.join(OUT, 'console.txt'), lines.join('\n'))
console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, 'console.txt'))}; ${skips.length} skip(s)`)
