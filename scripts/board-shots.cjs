const { chromium } = require('playwright')
const out = process.argv[2]
const fs = require('fs'); fs.mkdirSync(out, { recursive: true })
const errors = []
async function palette(page, text) {
  await page.keyboard.press('Control+k'); await page.waitForTimeout(250)
  await page.keyboard.type(text, { delay: 10 }); await page.waitForTimeout(250)
  await page.keyboard.press('Enter'); await page.waitForTimeout(500)
}
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console ' + m.text()) })
  await page.addInitScript(() => { if (!localStorage.getItem('inkpad.inputMode')) localStorage.setItem('inkpad.inputMode', 'desktop') })
  await page.goto('http://localhost:4173/'); await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/desktop-empty.png` })
  await palette(page, 'Insert template'); await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/desktop-template-chooser.png` })
  // pick first template button in dialog
  const t = page.locator('[role="dialog"] button').filter({ hasText: /Client/ }).first()
  if (await t.count()) await t.click(); else await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  await page.keyboard.press('Escape')
  // sticky note
  await page.mouse.move(1150, 650); await page.keyboard.press('n'); await page.waitForTimeout(300); await page.keyboard.type('Rate limit 100 rps'); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // logos via palette dialog
  for (const q of ['kafka', 'redis', 'kubernetes', 'github']) {
    await palette(page, 'Insert logo'); await page.waitForTimeout(400)
    const search = page.locator('[role="dialog"] input[type="search"], [role="dialog"] input').first()
    await search.fill(q); await page.waitForTimeout(300)
    if (q === 'kafka') await page.screenshot({ path: `${out}/desktop-logo-dialog.png` })
    const btn = page.locator('[role="dialog"] button.logo-button, [role="dialog"] [data-logo]').first()
    if (await btn.count()) await btn.click(); else { const any = page.locator('[role="dialog"] button[title]').first(); if (await any.count()) await any.click() }
    await page.waitForTimeout(400); await page.keyboard.press('Escape')
    const targets = { kafka: [460, 560], redis: [620, 600], kubernetes: [1180, 170], github: [1350, 480] }
    const [tx, ty] = targets[q]
    await page.mouse.move(726, 360); await page.mouse.down(); await page.mouse.move(tx, ty, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(200)
    await page.keyboard.press('Escape')
  }
  await page.mouse.click(100, 800); await page.keyboard.press('Escape')
  // pen stroke in default ink
  await page.keyboard.press('p'); await page.waitForTimeout(200)
  await page.mouse.move(300, 740); await page.mouse.down(); for (let i = 0; i < 30; i++) await page.mouse.move(300 + i * 8, 740 + Math.sin(i / 3) * 20); await page.mouse.up()
  await page.keyboard.press('v'); await page.keyboard.press('Escape')
  await palette(page, 'Fit drawing').catch(() => {})
  const boards = [['clean', 'Board: Clean'], ['sketch', 'Board: Sketch'], ['chalk', 'Board: Chalkboard']]
  const canvases = ['Dots', 'Grid', 'Isometric', 'Cornell', 'Lined', 'Blank']
  for (const [id, cmd] of boards) {
    await palette(page, cmd)
    await palette(page, 'Board: Light theme').catch(() => {})
    await page.mouse.click(30, 870).catch(() => {}); await page.keyboard.press('Escape')
    await page.screenshot({ path: `${out}/desktop-${id}-light.png` })
    if (id !== 'chalk') { await palette(page, 'Board: Dark theme'); await page.keyboard.press('Escape'); await page.screenshot({ path: `${out}/desktop-${id}-dark.png` }); await palette(page, 'Board: Light theme') }
  }
  await palette(page, 'Board: Clean')
  for (const c of canvases) { await palette(page, `Canvas: ${c}`); await page.keyboard.press('Escape'); await page.screenshot({ path: `${out}/desktop-canvas-${c.toLowerCase()}.png` }) }
  await palette(page, 'Board: Chalkboard'); await palette(page, 'Canvas: Grid'); await page.keyboard.press('Escape')
  await page.screenshot({ path: `${out}/desktop-chalk-grid.png` })
  // menu sheet
  await page.locator('button[aria-label="Menu"]').click(); await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/desktop-menu-board.png` })
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  // export dialog check: SVG via page.evaluate not needed; open export dialog screenshot
  // tablet
  await page.evaluate(() => localStorage.setItem('inkpad.inputMode', 'tablet'))
  const tp = page
  await page.setViewportSize({ width: 1280, height: 800 })
  await tp.reload(); await tp.waitForTimeout(1500)
  await tp.screenshot({ path: `${out}/tablet-chalk-grid.png` })
  await tp.locator('button[aria-label="Menu"]').click(); await tp.waitForTimeout(400)
  await tp.screenshot({ path: `${out}/tablet-menu.png` })
  for (const [label, file] of [['Clean', 'clean'], ['Sketch', 'sketch']]) {
    const tile = tp.locator('.menu-panel button', { hasText: label }).first()
    await tile.click(); await tp.waitForTimeout(300)
    await tp.mouse.click(900, 700); await tp.waitForTimeout(300)
    await tp.screenshot({ path: `${out}/tablet-${file}.png` })
    await tp.locator('button[aria-label="Menu"]').click(); await tp.waitForTimeout(300)
  }
  const dots = tp.locator('.menu-panel button', { hasText: 'Dots' }).first(); await dots.click()
  const ch = tp.locator('.menu-panel button', { hasText: 'Chalkboard' }).first(); await ch.click(); await tp.waitForTimeout(300)
  await tp.mouse.click(900, 700); await tp.waitForTimeout(300)
  await tp.screenshot({ path: `${out}/tablet-chalk-dots.png` })
  // insert tray
  const ins = tp.locator('button[aria-label*="Insert"]').first(); if (await ins.count()) { await ins.click(); await tp.waitForTimeout(400); await tp.screenshot({ path: `${out}/tablet-insert-tray.png` }) }
  console.log(JSON.stringify(errors, null, 1))
  await browser.close()
})()
