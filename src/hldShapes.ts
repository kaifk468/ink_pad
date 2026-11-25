import { createInkClassBox } from './inkClassBox'
import type { HldShape, RectangleBounds, RectangleObject } from './canvasModel'

export { HLD_SHAPES } from './canvasModel'
export type { HldShape } from './canvasModel'

/**
 * HLD (system design) shapes: Database, Queue, Service, User, Browser, Mobile, Cache, Load balancer, CDN, API gateway, Server, Object storage, Stream and Worker. Each is one rectangle with an ink area (the same object as an
 * ink class box, without the three sections) and an `hldShape` kind that only changes how the outline is drawn. So
 * writing, moving, resizing, lasso, erasers, connector snapping, export and saving all work as they do for class boxes.
 * The outline is one SVG path string shared by the canvas (Path2D) and the SVG/PNG export.
 */
export const HLD_SHAPE_LABELS: Record<HldShape, string> = {
  database: 'Database', queue: 'Queue', service: 'Service',
  user: 'User', browser: 'Browser', mobile: 'Mobile', cache: 'Cache', loadBalancer: 'Load balancer', cdn: 'CDN',
  apiGateway: 'API gateway', server: 'Server', objectStorage: 'Object storage', stream: 'Stream', worker: 'Worker',
}
/** Size of a shape made by a plain tap. */
export const HLD_DEFAULT_SIZE: Record<HldShape, { width: number; height: number }> = {
  database: { width: 300, height: 240 },
  queue: { width: 420, height: 140 },
  service: { width: 360, height: 180 },
  user: { width: 140, height: 180 },
  browser: { width: 360, height: 240 },
  mobile: { width: 150, height: 240 },
  cache: { width: 300, height: 160 },
  loadBalancer: { width: 320, height: 150 },
  cdn: { width: 320, height: 190 },
  apiGateway: { width: 380, height: 180 },
  server: { width: 300, height: 200 },
  objectStorage: { width: 260, height: 240 },
  stream: { width: 460, height: 130 },
  worker: { width: 340, height: 170 },
}

/** A finger tap moves a pixel or two, which counts as a drag and left the shape at its minimum size: growing less than this many screen pixels is still a tap. */
export const HLD_TAP_SLOP_PX = 10
export function isHldTapCreate(original: { width: number; height: number }, final: { width: number; height: number }, scale: number): boolean {
  return Math.max(Math.abs(final.width - original.width), Math.abs(final.height - original.height)) * scale < HLD_TAP_SLOP_PX
}

export function createHldShape(id: number, x: number, y: number, width: number, height: number, strokeColor: string, strokeWidth: number, shape: HldShape): RectangleObject {
  return { ...createInkClassBox(id, x, y, width, height, strokeColor, strokeWidth), hldShape: shape }
}

const n = (value: number) => Math.round(value * 100) / 100

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  return `M${n(x + radius)} ${n(y)}H${n(x + w - radius)}A${n(radius)} ${n(radius)} 0 0 1 ${n(x + w)} ${n(y + radius)}V${n(y + h - radius)}`
    + `A${n(radius)} ${n(radius)} 0 0 1 ${n(x + w - radius)} ${n(y + h)}H${n(x + radius)}A${n(radius)} ${n(radius)} 0 0 1 ${n(x)} ${n(y + h - radius)}`
    + `V${n(y + radius)}A${n(radius)} ${n(radius)} 0 0 1 ${n(x + radius)} ${n(y)}Z`
}

/** A right-pointing arrow from (x1, cy) to (x2, cy) with an open head. */
function arrowRight(x1: number, x2: number, cy: number, s: number): string {
  return `M${n(x1)} ${n(cy)}H${n(x2)}M${n(x2 - s)} ${n(cy - s)}L${n(x2)} ${n(cy)}L${n(x2 - s)} ${n(cy + s)}`
}

// Geometry of the marks on the newer HLD shapes. Each helper is used by the outline and by hldIconInsets (text fit), so
// the label area and the drawn icon cannot drift apart.
const gatewayStrip = (w: number) => Math.max(18, Math.min(w * 0.14, 56))
const serverSlots = (h: number) => (h >= 90 ? 3 : 2)
const serverLedX = (w: number) => Math.max(9, Math.min(w * 0.06, 22))
const bucketRy = (h: number) => Math.max(5, Math.min(h * 0.13, 28, h / 3))
const bucketInset = (w: number) => w * 0.1
const streamArrow = (w: number) => Math.max(24, Math.min(w * 0.11, 52))
const streamTick = (h: number) => Math.min(h * 0.2, 18)
const workerRadius = (w: number, h: number) => Math.max(8, Math.min(Math.min(w, h) * 0.13, 22))
const workerCorner = (w: number, h: number) => Math.min(Math.min(w, h) * 0.22, 36)
const workerGearCentre = (w: number, h: number) => workerRadius(w, h) + workerCorner(w, h) * 0.3 + 6

/** Space the icon of a newer HLD shape takes inside the box: label text should stay out of it. Labels are centred in the box, so insets are symmetric (each side takes the larger one). */
export function hldIconInsets(shape: HldShape, width: number, height: number): { left: number; right: number; top: number; bottom: number } {
  const none = { left: 0, right: 0, top: 0, bottom: 0 }
  switch (shape) {
    case 'apiGateway': { const side = gatewayStrip(width); return { ...none, left: side, right: side } }
    case 'server': { const side = serverLedX(width) * 2; return { ...none, left: side, right: side } }
    case 'objectStorage': {
      const ry = bucketRy(height)
      return { left: bucketInset(width), right: bucketInset(width), top: ry * 1.5, bottom: ry * 1.5 }
    }
    case 'stream': { const side = streamArrow(width); return { ...none, left: side, right: side, top: streamTick(height), bottom: streamTick(height) } }
    case 'worker': { const band = workerGearCentre(width, height) + workerRadius(width, height); return { ...none, top: band, bottom: band } }
    default: return none
  }
}

/** The outline of the shape as SVG path data, drawn with the box's stroke colour and width and no fill. */
export function hldOutlinePath(rectangle: RectangleBounds, shape: HldShape): string {
  const { x, y, width: w, height: h } = rectangle
  if (shape === 'database') {
    // A cylinder: a full ellipse on top, straight sides, and the lower half of an ellipse at the bottom.
    const ry = Math.max(6, Math.min(h * 0.16, 34, h / 3))
    const rx = w / 2
    return `M${n(x)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(y + ry)}Z`
      + `M${n(x)} ${n(y + ry)}V${n(y + h - ry)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + w)} ${n(y + h - ry)}V${n(y + ry)}`
  }
  if (shape === 'queue') {
    // A rounded box with a cap at each end; the arrow in each cap shows which way the line moves.
    const cap = Math.max(20, Math.min(w * 0.13, 56))
    const s = Math.max(5, Math.min(cap * 0.28, h * 0.18))
    const cy = y + h / 2
    const chevron = (cx: number) => `M${n(cx - s / 2)} ${n(cy - s)}L${n(cx + s / 2)} ${n(cy)}L${n(cx - s / 2)} ${n(cy + s)}`
    return roundedRectPath(x, y, w, h, Math.min(14, h / 3))
      + `M${n(x + cap)} ${n(y)}V${n(y + h)}M${n(x + w - cap)} ${n(y)}V${n(y + h)}`
      + chevron(x + cap / 2) + chevron(x + w - cap / 2)
  }
  if (shape === 'user') {
    const g = userGeometry(w, h)
    return circlePath(x + g.cx, y + g.cy, g.r)
      + `M${n(x + w * 0.08)} ${n(y + h)}V${n(y + h * 0.8)}C${n(x + w * 0.08)} ${n(y + h * 0.62)} ${n(x + w * 0.3)} ${n(y + h * 0.56)} ${n(x + w / 2)} ${n(y + h * 0.56)}`
      + `C${n(x + w * 0.7)} ${n(y + h * 0.56)} ${n(x + w * 0.92)} ${n(y + h * 0.62)} ${n(x + w * 0.92)} ${n(y + h * 0.8)}V${n(y + h)}Z`
  }
  if (shape === 'browser') {
    const bar = browserBar(h)
    let dots = ''
    for (let i = 0; i < 3; i += 1) dots += circlePath(x + 16 + i * 14, y + bar / 2, Math.min(3.5, bar / 6))
    return roundedRectPath(x, y, w, h, Math.min(14, h / 4)) + `M${n(x)} ${n(y + bar)}H${n(x + w)}` + dots
  }
  if (shape === 'mobile') {
    const slotHalf = Math.min(w * 0.12, 22)
    return roundedRectPath(x, y, w, h, Math.min(w * 0.16, 28))
      + `M${n(x + w / 2 - slotHalf)} ${n(y + MOBILE_TOP / 2)}H${n(x + w / 2 + slotHalf)}`
      + circlePath(x + w / 2, y + h - MOBILE_BOTTOM / 2, Math.min(5, w * 0.05))
  }
  if (shape === 'cache') {
    const s = cacheBolt(w, h)
    const bx = x + 14
    const by = y + 12
    const p = (px: number, py: number) => `${n(bx + px * s)} ${n(by + py * s)}`
    return roundedRectPath(x, y, w, h, Math.min(Math.min(w, h) * 0.2, 28))
      + `M${p(0.6, 0)}L${p(0, 0.58)}L${p(0.45, 0.58)}L${p(0.35, 1)}L${p(1, 0.4)}L${p(0.55, 0.4)}Z`
  }
  if (shape === 'loadBalancer') {
    const m = balancerMark(h)
    const cx = x + w / 2
    const top = y + 8
    const fork = top + m * 0.4
    const endY = top + m
    const d = m * 0.9
    const a = Math.max(3, m * 0.12)
    let marks = `M${n(cx)} ${n(top)}V${n(fork)}`
    for (const dx of [-d, 0, d]) {
      const ex = cx + dx
      const len = Math.hypot(dx, endY - fork)
      const ux = dx / len
      const uy = (endY - fork) / len
      // arrowhead: two short strokes back from the tip
      const hx = (sx: number) => ex - a * (ux * 0.9 + sx * -uy * 0.6)
      const hy = (sx: number) => endY - a * (uy * 0.9 + sx * ux * 0.6)
      marks += `M${n(cx)} ${n(fork)}L${n(ex)} ${n(endY)}M${n(hx(1))} ${n(hy(1))}L${n(ex)} ${n(endY)}L${n(hx(-1))} ${n(hy(-1))}`
    }
    return roundedRectPath(x, y, w, h, Math.min(h * 0.2, 24)) + marks
  }
  if (shape === 'cdn') {
    const p = (px: number, py: number) => `${n(x + px * w)} ${n(y + py * h)}`
    return `M${p(0.22, 0.88)}C${p(0.08, 0.88)} ${p(0.02, 0.66)} ${p(0.12, 0.52)}C${p(0.12, 0.4)} ${p(0.24, 0.32)} ${p(0.34, 0.36)}`
      + `C${p(0.38, 0.14)} ${p(0.62, 0.08)} ${p(0.72, 0.26)}C${p(0.9, 0.22)} ${p(0.98, 0.44)} ${p(0.9, 0.56)}C${p(0.98, 0.72)} ${p(0.92, 0.88)} ${p(0.78, 0.88)}Z`
  }
  if (shape === 'apiGateway') {
    // A rounded box with a gate bar on the left; two arrows run into the bar.
    const strip = gatewayStrip(w)
    const s = Math.max(2.5, Math.min(strip * 0.16, h * 0.07, 7))
    return roundedRectPath(x, y, w, h, Math.min(Math.min(w, h) * 0.2, 26))
      + `M${n(x + strip)} ${n(y)}V${n(y + h)}`
      + arrowRight(x + strip * 0.18, x + strip * 0.78, y + h * 0.34, s) + arrowRight(x + strip * 0.18, x + strip * 0.78, y + h * 0.66, s)
  }
  if (shape === 'server') {
    // A rack: slots divided by lines, each with an LED dot on the left.
    const slots = serverSlots(h)
    const slotH = h / slots
    const led = Math.max(2, Math.min(slotH * 0.12, 5.5))
    let path = roundedRectPath(x, y, w, h, Math.min(10, h / 4))
    for (let i = 1; i < slots; i += 1) path += `M${n(x)} ${n(y + slotH * i)}H${n(x + w)}`
    for (let i = 0; i < slots; i += 1) path += circlePath(x + serverLedX(w), y + slotH * (i + 0.5), led)
    return path
  }
  if (shape === 'objectStorage') {
    // A bucket: an elliptical rim on top, sides narrowing to a curved base.
    const ry = bucketRy(h)
    const inset = bucketInset(w)
    const rx = w / 2
    const bx = rx - inset
    return `M${n(x)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(y + ry)}Z`
      + `M${n(x)} ${n(y + ry)}L${n(x + inset)} ${n(y + h - ry)}A${n(bx)} ${n(ry)} 0 0 0 ${n(x + w - inset)} ${n(y + h - ry)}L${n(x + w)} ${n(y + ry)}`
  }
  if (shape === 'stream') {
    // A log: ticks along the top and bottom edges mark the segments, an arrow at the right end shows the direction.
    const arrow = streamArrow(w)
    const tick = streamTick(h)
    const s = Math.max(4, Math.min(arrow * 0.26, h * 0.14))
    const cy = y + h / 2
    const body = w - arrow
    let path = roundedRectPath(x, y, w, h, Math.min(14, h / 3))
    for (let i = 1; i <= 3; i += 1) {
      const tx = x + (body * i) / 4
      path += `M${n(tx)} ${n(y)}V${n(y + tick)}M${n(tx)} ${n(y + h)}V${n(y + h - tick)}`
    }
    return path + arrowRight(x + w - arrow * 0.85, x + w - arrow * 0.2, cy, s)
  }
  if (shape === 'worker') {
    // A rounded box with a gear in the top-left corner.
    const r = workerRadius(w, h)
    const c = workerGearCentre(w, h)
    const inner = r * 0.72
    let gear = ''
    for (let i = 0; i < 8; i += 1) {
      const a = (i * Math.PI) / 4
      for (const [radius, delta] of [[inner, -0.34], [r, -0.2], [r, 0.2], [inner, 0.34]] as const) {
        gear += `${gear ? 'L' : 'M'}${n(x + c + radius * Math.cos(a + delta))} ${n(y + c + radius * Math.sin(a + delta))}`
      }
    }
    return roundedRectPath(x, y, w, h, workerCorner(w, h)) + gear + 'Z' + circlePath(x + c, y + c, r * 0.3)
  }
  return roundedRectPath(x, y, w, h, Math.min(Math.min(w, h) * 0.28, 44))
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)}Z`
}

const MOBILE_TOP = 28
const MOBILE_BOTTOM = 32
/** Head of the user figure, relative to the box. */
function userGeometry(w: number, h: number) {
  const r = Math.max(2, Math.min(w * 0.2, h * 0.17))
  return { cx: w / 2, cy: h * 0.04 + r, r }
}
/** Height of the browser title bar. */
export const browserBar = (h: number) => Math.max(18, Math.min(h * 0.14, 34))
/** Size of the lightning bolt in the cache corner. */
export const cacheBolt = (w: number, h: number) => Math.max(12, Math.min(Math.min(w, h) * 0.22, 28))
/** Height of the fan-out mark at the top of a load balancer. */
export const balancerMark = (h: number) => Math.max(18, Math.min(h * 0.28, 40))
export const hldMobileMargins = { top: MOBILE_TOP, bottom: MOBILE_BOTTOM }
