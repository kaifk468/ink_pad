import { connectorPoints, getConnectorRenderSpec, getConnectorSecondSymbolGeometry, getConnectorSymbolGeometry, strokeHeadGeometry } from './canvasModel'
import type { ConnectorObject, Point, RectangleObject, Stroke } from './canvasModel'

/**
 * Hand-drawn ("sketchy") style: pure geometry, no canvas and no randomness at draw time.
 * Every outline is SVG path data built from a small seeded generator, so the same item with the same seed gives the same
 * wobble on every redraw, reload and device, and while it is resized (the same random numbers are always drawn in the
 * same order; only the box size changes, so the wobble follows the box). The canvas turns the text into a Path2D once
 * per item (see app/sketchyRender.ts); the SVG export puts the same text into a <path>.
 */

/** Small fast seeded generator (mulberry32): returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seed worked out from a kind and an id (for items without a stored seed: lines, arrows, connectors, and shapes made before the style was used). */
export function seedFromId(kind: string, id: number): number {
  let hash = 2166136261
  for (let index = 0; index < kind.length; index += 1) hash = Math.imul(hash ^ kind.charCodeAt(index), 16777619)
  hash = Math.imul(hash ^ (id | 0), 16777619)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0x5bd1e995)
  return (hash ^ (hash >>> 15)) >>> 0
}

/** A fresh stored seed (integer 1..2^31-1). Only called when a shape is created or the style is turned on, never while drawing. */
export function newSketchSeed(random: () => number = Math.random): number {
  return 1 + Math.floor(random() * 2147483646)
}

export function isSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value) && value >= 0 && value <= 4294967295
}

/** Shapes that take the hand-drawn look: plain boxes, diamonds, ellipses, databases and queues. Never a service, class box or ink class box. */
export function isSketchyRectangle(rectangle: RectangleObject): boolean {
  if (rectangle.classBox) return false
  if (rectangle.inkBox) return rectangle.hldShape === 'database' || rectangle.hldShape === 'queue'
  return true
}

/** Shapes that can carry a fill colour (same set as the hand-drawn ones). */
export const isFillableRectangle = isSketchyRectangle

export function rectangleSeed(rectangle: RectangleObject): number {
  return rectangle.seed !== undefined && isSeed(rectangle.seed) ? rectangle.seed : seedFromId('rectangle', rectangle.id)
}

const n = (value: number) => Math.round(value * 100) / 100

/** How far lines wander, in canvas units: grows with the length of the line and is capped, so small boxes stay tidy and big ones look hand-drawn. */
function amplitude(length: number): number {
  return Math.min(2.6, 0.5 + length * 0.011)
}

type Rng = () => number
const signed = (rng: Rng) => rng() * 2 - 1

/** One hand-drawn straight line: a single cubic whose ends and middle are nudged. Always draws 8 random numbers. */
function roughLine(x1: number, y1: number, x2: number, y2: number, rng: Rng, scale = 1): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  const amp = amplitude(length) * scale
  const nx = length > 0 ? -dy / length : 0
  const ny = length > 0 ? dx / length : 0
  const ends = amp * 0.7
  const sx = x1 + signed(rng) * ends
  const sy = y1 + signed(rng) * ends
  const ex = x2 + signed(rng) * ends
  const ey = y2 + signed(rng) * ends
  const bow1 = signed(rng) * amp
  const bow2 = signed(rng) * amp
  const t1 = 0.28 + rng() * 0.1
  const t2 = 0.62 + rng() * 0.1
  return `M${n(sx)} ${n(sy)}C${n(sx + (ex - sx) * t1 + nx * bow1)} ${n(sy + (ey - sy) * t1 + ny * bow1)} ${n(sx + (ex - sx) * t2 + nx * bow2)} ${n(sy + (ey - sy) * t2 + ny * bow2)} ${n(ex)} ${n(ey)}`
}

/** A closed polygon drawn as separate hand-drawn edges (corners overshoot a little), `passes` times. */
function roughPolygon(points: Array<[number, number]>, rng: Rng, passes = 2): string {
  let d = ''
  for (let pass = 0; pass < passes; pass += 1) {
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index]
      const b = points[(index + 1) % points.length]
      d += roughLine(a[0], a[1], b[0], b[1], rng, pass === 0 ? 1 : 0.8)
    }
  }
  return d
}

/** Same vertices as the outline's first pass but as one solid polygon (the fill underneath). */
function jitteredPolygon(points: Array<[number, number]>, rng: Rng): string {
  let d = ''
  points.forEach(([x, y], index) => {
    const amp = 1
    d += `${index === 0 ? 'M' : 'L'}${n(x + signed(rng) * amp)} ${n(y + signed(rng) * amp)}`
  })
  return `${d}Z`
}

const ELLIPSE_POINTS = 14

/** Points around an ellipse (or part of it) with the radius nudged at each point. Always draws the same count of random numbers. */
function ellipsePoints(cx: number, cy: number, rx: number, ry: number, rng: Rng, from: number, to: number, count: number, wobble: number): Array<[number, number]> {
  const points: Array<[number, number]> = []
  const amp = amplitude(Math.max(rx, ry) * 2) * wobble
  for (let index = 0; index < count; index += 1) {
    const angle = from + ((to - from) * index) / (to - from === Math.PI * 2 ? count : count - 1)
    points.push([cx + Math.cos(angle) * (rx + signed(rng) * amp), cy + Math.sin(angle) * (ry + signed(rng) * amp)])
  }
  return points
}

/** A smooth curve through the points (Catmull-Rom turned into cubic Beziers), closed or open. */
function smoothThrough(points: Array<[number, number]>, closed: boolean): string {
  const count = points.length
  if (count < 2) return ''
  const at = (index: number) => (closed ? points[((index % count) + count) % count] : points[Math.max(0, Math.min(count - 1, index))])
  let d = `M${n(points[0][0])} ${n(points[0][1])}`
  const segments = closed ? count : count - 1
  for (let index = 0; index < segments; index += 1) {
    const p0 = at(index - 1)
    const p1 = at(index)
    const p2 = at(index + 1)
    const p3 = at(index + 2)
    d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`
  }
  return closed ? `${d}Z` : d
}

/** Two hand-drawn loops around an ellipse (each starts at its own angle). Returns the outline and the first loop as a fill. */
function roughEllipse(cx: number, cy: number, rx: number, ry: number, rng: Rng): { outline: string; fill: string } {
  const start1 = rng() * Math.PI * 2
  const start2 = rng() * Math.PI * 2
  const first = ellipsePoints(cx, cy, rx, ry, rng, start1, start1 + Math.PI * 2, ELLIPSE_POINTS, 1)
  const second = ellipsePoints(cx, cy, rx, ry, rng, start2, start2 + Math.PI * 2, ELLIPSE_POINTS, 0.8)
  const fill = smoothThrough(first, true)
  return { outline: fill + smoothThrough(second, true), fill }
}

/** The lower half of an ellipse as one open hand-drawn curve (left to right through the bottom). */
function roughLowerArc(cx: number, cy: number, rx: number, ry: number, rng: Rng, wobble: number): string {
  return smoothThrough(ellipsePoints(cx, cy, rx, ry, rng, Math.PI, 0, 9, wobble).map(([x, y], index) => [x, index === 0 || index === 8 ? cy : y] as [number, number]), false)
}

/** The same cylinder dimensions the plain database outline uses (hldShapes.ts). */
function databaseRy(height: number): number {
  return Math.max(6, Math.min(height * 0.16, 34, height / 3))
}

function queueRadius(height: number): number {
  return Math.min(14, height / 3)
}

function queueCap(width: number): number {
  return Math.max(20, Math.min(width * 0.13, 56))
}

export type SketchyShape = { outline: string; fill: string }

/** The hand-drawn outline and fill of a plain box, diamond, ellipse, database or queue. Offsets depend only on the seed, never on the size. */
export function sketchyRectangleShape(rectangle: RectangleObject): SketchyShape {
  const rng = mulberry32(rectangleSeed(rectangle))
  const { x, y, width: w, height: h } = rectangle
  if (rectangle.hldShape === 'database') {
    const ry = databaseRy(h)
    const rx = w / 2
    const top = roughEllipse(x + rx, y + ry, rx, ry, rng)
    const left = roughLine(x, y + ry, x, y + h - ry, rng)
    const right = roughLine(x + w, y + ry, x + w, y + h - ry, rng)
    const bottom = roughLowerArc(x + rx, y + h - ry, rx, ry, rng, 1)
    const bottomFill = roughEllipse(x + rx, y + h - ry, rx, ry, rng).fill
    const body = jitteredPolygon([[x, y + ry], [x + w, y + ry], [x + w, y + h - ry], [x, y + h - ry]], rng)
    return { outline: top.outline + left + right + bottom, fill: top.fill + body + bottomFill }
  }
  if (rectangle.hldShape === 'queue') {
    const r = queueRadius(h)
    const cap = queueCap(w)
    const s = Math.max(5, Math.min(cap * 0.28, h * 0.18))
    const cy = y + h / 2
    const jitter = () => signed(rng) * 0.8
    // Four hand-drawn sides joined by small rounded corners.
    let outline = roughLine(x + r, y, x + w - r, y, rng) + roughLine(x + w, y + r, x + w, y + h - r, rng) + roughLine(x + w - r, y + h, x + r, y + h, rng) + roughLine(x, y + h - r, x, y + r, rng)
    outline += `M${n(x + w - r)} ${n(y)}Q${n(x + w + jitter())} ${n(y + jitter())} ${n(x + w)} ${n(y + r)}M${n(x + w)} ${n(y + h - r)}Q${n(x + w + jitter())} ${n(y + h + jitter())} ${n(x + w - r)} ${n(y + h)}`
      + `M${n(x + r)} ${n(y + h)}Q${n(x + jitter())} ${n(y + h + jitter())} ${n(x)} ${n(y + h - r)}M${n(x)} ${n(y + r)}Q${n(x + jitter())} ${n(y + jitter())} ${n(x + r)} ${n(y)}`
    outline += roughLine(x + cap, y, x + cap, y + h, rng) + roughLine(x + w - cap, y, x + w - cap, y + h, rng)
    for (const cx of [x + cap / 2, x + w - cap / 2]) outline += roughLine(cx - s / 2, cy - s, cx + s / 2, cy, rng, 0.5) + roughLine(cx + s / 2, cy, cx - s / 2, cy + s, rng, 0.5)
    const fill = `M${n(x + r)} ${n(y)}H${n(x + w - r)}Q${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + r)}V${n(y + h - r)}Q${n(x + w)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)}H${n(x + r)}Q${n(x)} ${n(y + h)} ${n(x)} ${n(y + h - r)}V${n(y + r)}Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)}Z`
    return { outline, fill }
  }
  if (rectangle.ellipse) return roughEllipse(x + w / 2, y + h / 2, w / 2, h / 2, rng)
  const corners: Array<[number, number]> = rectangle.diamond
    ? [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]]
    : [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
  const fillRng = mulberry32(rectangleSeed(rectangle) ^ 0x9e3779b9)
  return { outline: roughPolygon(corners, rng, 2), fill: jitteredPolygon(corners, fillRng) }
}

/** The exact (non-sketchy) fill silhouette of a fillable shape, as SVG path data. */
export function plainFillPath(rectangle: RectangleObject): string {
  const { x, y, width: w, height: h } = rectangle
  if (rectangle.hldShape === 'database') {
    const ry = databaseRy(h)
    const rx = w / 2
    const ellipse = (cy: number) => `M${n(x)} ${n(cy)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w)} ${n(cy)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(cy)}Z`
    return ellipse(y + ry) + `M${n(x)} ${n(y + ry)}H${n(x + w)}V${n(y + h - ry)}H${n(x)}Z` + ellipse(y + h - ry)
  }
  if (rectangle.hldShape === 'queue') {
    const r = queueRadius(h)
    return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  }
  if (rectangle.ellipse) {
    const rx = w / 2
    const ry = h / 2
    return `M${n(x)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(y + ry)}Z`
  }
  if (rectangle.diamond) return `M${n(x + w / 2)} ${n(y)}L${n(x + w)} ${n(y + h / 2)}L${n(x + w / 2)} ${n(y + h)}L${n(x)} ${n(y + h / 2)}Z`
  return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`
}

/** A saved fill colour only counts for a shape that can carry one. */
export function rectangleFill(rectangle: RectangleObject): string | null {
  return rectangle.fillColor && isFillableRectangle(rectangle) ? rectangle.fillColor : null
}

// ---- lines, arrows and connectors ----

/** A hand-drawn open line through the points (one hand-drawn piece per segment). */
function roughPolyline(points: Array<{ x: number; y: number }>, rng: Rng): string {
  let d = ''
  for (let index = 1; index < points.length; index += 1) d += roughLine(points[index - 1].x, points[index - 1].y, points[index].x, points[index].y, rng, 0.9)
  return d
}

/** A closed shape of straight edges, one hand-drawn pass. */
function roughClosed(points: Array<{ x: number; y: number }>, rng: Rng): string {
  return roughPolygon(points.map((p) => [p.x, p.y] as [number, number]), rng, 1)
}

/** Path data of a straight line or arrow stroke, in the hand-drawn style. Null for any other stroke. */
export function sketchyStrokePath(stroke: Stroke): string | null {
  const parts = sketchyStrokeParts(stroke)
  return parts ? parts.line + parts.heads : null
}

/** The hand-drawn shaft of an arrow/line stroke and, separately, its arrowheads (so a dash can apply to the shaft only). */
export function sketchyStrokeParts(stroke: Stroke): { line: string; heads: string } | null {
  if ((stroke.shape !== 'arrow' && stroke.shape !== 'line') || stroke.points.length < 2 || stroke.erase) return null
  const rng = mulberry32(seedFromId(`stroke-${stroke.shape}`, stroke.id))
  const [start, end] = stroke.points
  const line = roughPolyline([start, end], rng)
  let heads = ''
  for (const head of strokeHeadGeometry(stroke)) {
    for (const wing of [head.wingA, head.wingB]) heads += roughLine(head.tip.x, head.tip.y, wing.x, wing.y, rng, 0.5)
  }
  return { line, heads }
}

export type SketchyConnector = {
  /** The line itself (open). */
  line: string
  /** The end symbol: a closed shape (`closed`, filled with white or the line colour) or open strokes. */
  head: string | null
  headClosed: boolean
  headFill: 'white' | 'color' | null
}

/** The hand-drawn pieces of a connector, mirroring the symbol rules of the plain renderer. */
export function sketchyConnectorShape(connector: ConnectorObject, width = connector.strokeWidth): SketchyConnector {
  const rng = mulberry32(seedFromId('connector', connector.id))
  const spec = getConnectorRenderSpec(connector)
  const geometry = getConnectorSymbolGeometry(connector, width)
  const tip = geometry?.tip
  const path = connectorPoints(connector)
  const atStart = spec.endpoint === 'start'
  const withEnd = (replacement?: Point) => (!replacement ? path : atStart ? [replacement, ...path.slice(1)] : [...path.slice(0, -1), replacement])
  if (spec.symbol === 'hollow-triangle' && geometry && tip) {
    return { line: roughPolyline(withEnd(geometry.base), rng), head: roughClosed([tip, geometry.sideA, geometry.sideB], rng), headClosed: true, headFill: 'white' }
  }
  if (spec.symbol === 'open-arrow' && geometry && tip) {
    const second = getConnectorSecondSymbolGeometry(connector, width)
    const secondHead = second ? roughPolyline([second.sideA, second.tip, second.sideB], rng) : ''
    return { line: roughPolyline(path, rng), head: roughPolyline([geometry.sideA, tip, geometry.sideB], rng) + secondHead, headClosed: false, headFill: null }
  }
  if ((spec.symbol === 'hollow-diamond' || spec.symbol === 'filled-diamond') && geometry && tip) {
    return { line: roughPolyline(withEnd(geometry.far), rng), head: roughClosed([tip, geometry.sideA, geometry.far, geometry.sideB], rng), headClosed: true, headFill: spec.symbol === 'filled-diamond' ? 'color' : 'white' }
  }
  return { line: roughPolyline(path, rng), head: null, headClosed: false, headFill: null }
}

/** Kind of item that gets a hand-drawn arrow/line look (for callers that must decide before drawing). */
export function isSketchyStroke(stroke: Stroke): boolean {
  return !stroke.erase && (stroke.shape === 'arrow' || stroke.shape === 'line') && stroke.points.length >= 2
}

/** The stored seed assigned to shapes that lack one; returns the same array when nothing needed one. */
export function withSketchSeeds<T extends { kind: string }>(items: T[], random: () => number = Math.random): T[] {
  let changed = false
  const next = items.map((item) => {
    const rectangle = item as unknown as RectangleObject
    if (item.kind !== 'rectangle' || !isSketchyRectangle(rectangle) || (rectangle.seed !== undefined && isSeed(rectangle.seed))) return item
    changed = true
    return { ...rectangle, seed: newSketchSeed(random) } as unknown as T
  })
  return changed ? next : items
}

/** One shape with a seed if it is a hand-drawn kind that lacks one (used when a shape is created while the style is on). */
export function withSketchSeed<T extends { kind: string }>(item: T, random: () => number = Math.random): T {
  return withSketchSeeds([item], random)[0]
}
