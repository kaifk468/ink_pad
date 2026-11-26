import type { CanvasItem, LineDash, RectangleObject, TextObject } from './canvasModel'
import { isFillableRectangle } from './sketchy'

/**
 * Mermaid flowchart colours: `classDef name fill:#f9f,stroke:#333,stroke-dasharray:5 5,color:#fff`, `class A,B name`, `A:::name` and
 * `style A fill:...` become the box fill, outline colour, dash and label colour of the imported boxes. Bad values are ignored silently.
 */
export type MermaidNodeStyle = { fill?: string; stroke?: string; dash?: LineDash; color?: string }

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
  pink: '#ffc0cb', gray: '#808080', grey: '#808080', brown: '#a52a2a', cyan: '#00ffff', magenta: '#ff00ff', lightblue: '#add8e6', lightgreen: '#90ee90',
  lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkblue: '#00008b', darkgreen: '#006400', darkred: '#8b0000', gold: '#ffd700', navy: '#000080', teal: '#008080',
}

/** `#rgb`, `#rrggbb` or a known colour name as lowercase `#rrggbb`; null for anything else (including `none`). */
export function parseMermaidColor(raw: string): string | null {
  const value = raw.trim().replace(/\s*!important$/i, '').toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(value)) return value
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
  return Object.prototype.hasOwnProperty.call(NAMED, value) ? NAMED[value] : null
}

function parseDash(raw: string): LineDash | null {
  const numbers = raw.trim().split(/[\s,]+/).map((part) => Number.parseFloat(part))
  if (numbers.length === 0 || numbers.some((value) => !Number.isFinite(value) || value < 0) || Math.max(...numbers) === 0) return null
  return Math.max(...numbers) <= 3 ? 'dotted' : 'dashed'
}

/** The style a property list gives (`fill:#f9f,stroke:#333,...`); only valid properties are kept. Null when none were. */
export function parseMermaidStyleProps(text: string): MermaidNodeStyle | null {
  const style: MermaidNodeStyle = {}
  for (const part of text.split(',')) {
    const colon = part.indexOf(':')
    if (colon < 1) continue
    const key = part.slice(0, colon).trim().toLowerCase()
    const raw = part.slice(colon + 1)
    if (key === 'fill' || key === 'stroke' || key === 'color') {
      const color = parseMermaidColor(raw)
      if (color) style[key] = color
    } else if (key === 'stroke-dasharray') {
      const dash = parseDash(raw)
      if (dash) style.dash = dash
    }
  }
  return Object.keys(style).length > 0 ? style : null
}

export type MermaidStyleSheet = { classDefs: Map<string, MermaidNodeStyle>; assigned: Array<[string, string]>; nodeStyles: Map<string, MermaidNodeStyle> }
export const newMermaidStyleSheet = (): MermaidStyleSheet => ({ classDefs: new Map(), assigned: [], nodeStyles: new Map() })

const ID = String.raw`[\w.\u0080-￿-]+`
const IDS = String.raw`${ID}(?:\s*,\s*${ID})*`
const splitList = (list: string): string[] => list.split(',').map((part) => part.trim()).filter((part) => part !== '')
const merge = (into: Map<string, MermaidNodeStyle>, key: string, style: MermaidNodeStyle) => into.set(key, { ...into.get(key), ...style })
const CLASS_DEF = new RegExp(String.raw`^classDef\s+(${IDS})\s+(.*)$`)
const CLASS_LINE = new RegExp(String.raw`^class\s+(${IDS})\s+([\w-]+)\s*;?$`)
const STYLE_LINE = new RegExp(String.raw`^style\s+(${ID})\s+(.*)$`)

/** Reads one `classDef` / `class` / `style` statement into the sheet. Null when the statement is none of these; true when it set something; false when it has no usable value (counted as ignored). */
export function readMermaidStyleStatement(statement: string, sheet: MermaidStyleSheet): boolean | null {
  let match = CLASS_DEF.exec(statement)
  if (match) {
    const style = parseMermaidStyleProps(match[2].replace(/;$/, ''))
    if (!style) return false
    for (const name of splitList(match[1])) merge(sheet.classDefs, name, style)
    return true
  }
  match = CLASS_LINE.exec(statement)
  if (match) {
    for (const id of splitList(match[1])) sheet.assigned.push([id, match[2]])
    return true
  }
  match = STYLE_LINE.exec(statement)
  if (match) {
    const style = parseMermaidStyleProps(match[2].replace(/;$/, ''))
    if (!style) return false
    merge(sheet.nodeStyles, match[1], style)
    return true
  }
  return null
}

/** The style of a node: the `default` classDef, then its classes in the order they were given, then its own `style`. Undefined when it has none. */
export function resolveNodeStyle(sheet: MermaidStyleSheet, id: string): MermaidNodeStyle | undefined {
  let style: MermaidNodeStyle = { ...sheet.classDefs.get('default') }
  for (const [target, name] of sheet.assigned) if (target === id) style = { ...style, ...sheet.classDefs.get(name) }
  style = { ...style, ...sheet.nodeStyles.get(id) }
  return Object.keys(style).length > 0 ? style : undefined
}

/** Applies a style to a box in place and recolours its label (the text item right after it in `items`). Fill only goes on shapes that can carry one. */
export function applyMermaidNodeStyle(items: CanvasItem[], box: RectangleObject, style: MermaidNodeStyle | undefined): void {
  if (!style) return
  if (style.fill && isFillableRectangle(box)) box.fillColor = style.fill
  if (style.stroke) box.strokeColor = style.stroke
  if (style.dash && !box.classBox) box.dash = style.dash
  if (style.color) {
    const index = items.indexOf(box)
    const label = items[index + 1]
    if (index >= 0 && label && label.kind === 'text') items[index + 1] = { ...(label as TextObject), color: style.color }
  }
}
