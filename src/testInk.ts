import type { CanvasItem, Stroke } from './canvasModel'

/**
 * Development helper: handwriting-like strokes that fill the current view, so dense pages can be tested without writing.
 * They use a reserved ink colour (not in the palette) so they can be told apart from real ink and removed again.
 */
export const TEST_INK_COLOR = '#1f2023'
export const TEST_INK_WIDTH = 3

type Area = { x: number; y: number; width: number; height: number }

export function isTestInk(item: CanvasItem): boolean {
  return item.kind === 'stroke' && !item.erase && item.color === TEST_INK_COLOR
}

/**
 * Lines of "words", each word one connected stroke of loops with varying pressure, laid out inside `view` (kept within `page`)
 * until about `targetPoints` points have been produced. Deterministic for a given seed.
 */
export function createTestInk(view: Area, page: Area, targetPoints: number, firstId: number, seed = 0x2f6e2b1): Stroke[] {
  let state = seed >>> 0
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000 }
  const left = Math.max(view.x, page.x) + 24
  const right = Math.min(view.x + view.width, page.x + page.width) - 24
  const top = Math.max(view.y, page.y) + 30
  const bottom = Math.min(view.y + view.height, page.y + page.height) - 20
  if (right - left < 80 || bottom - top < 30) return []
  const strokes: Stroke[] = []
  let points = 0
  let pass = 0
  while (points < targetPoints && pass < 12) {
    const lineGap = 34
    for (let baseline = top + (pass % 3) * 9; baseline <= bottom && points < targetPoints; baseline += lineGap) {
      let x = left + random() * 20
      while (x < right - 60 && points < targetPoints) {
        const letters = 3 + Math.floor(random() * 5)
        const wordWidth = Math.min(right - x, letters * (10 + random() * 6))
        const count = 70 + Math.floor(random() * 50)
        const loops = letters * (0.8 + random() * 0.4)
        const height = 5 + random() * 6
        const phase = random() * Math.PI * 2
        const stroke: Stroke = { kind: 'stroke', id: firstId + strokes.length, points: [], color: TEST_INK_COLOR, width: TEST_INK_WIDTH, erase: false }
        for (let index = 0; index < count; index += 1) {
          const t = index / (count - 1)
          const angle = t * loops * Math.PI * 2 + phase
          stroke.points.push({
            x: x + t * wordWidth + Math.cos(angle) * 2.4,
            y: baseline + Math.sin(angle) * height * (0.55 + 0.45 * Math.sin(t * Math.PI)) + random() * 0.8,
            pressure: 0.35 + 0.5 * Math.abs(Math.sin(t * 5 + phase)),
          })
        }
        strokes.push(stroke)
        points += count
        x += wordWidth + 12 + random() * 14
      }
    }
    pass += 1
  }
  return strokes
}
