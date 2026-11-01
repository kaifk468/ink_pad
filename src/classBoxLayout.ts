import type { ClassBoxContent, RectangleObject } from './canvasModel'
import { TEXT_FONT_FAMILY, TEXT_LINE_HEIGHT, MAX_TEXT_LENGTH, normalizeText, splitTextLines } from './textLayout'

/**
 * UML class box geometry. A class box is a rectangle that carries `classBox` content: a name
 * compartment (centered, bold) over an attributes compartment and a methods compartment.
 * Compartment heights follow the text; the methods compartment absorbs any extra height when the
 * box is resized larger. Canvas drawing, SVG export and the editor all use these numbers.
 */
export const CLASS_BOX_NAME_FONT_SIZE = 22
export const CLASS_BOX_BODY_FONT_SIZE = 18
export const CLASS_BOX_PADDING_X = 14
export const CLASS_BOX_PADDING_Y = 9
export const CLASS_BOX_MIN_WIDTH = 180
export const CLASS_BOX_DEFAULT_STROKE_WIDTH = 3
const BASELINE_IN_EM = 0.8
const ESTIMATED_GLYPH_EM = 0.58

export const EMPTY_CLASS_BOX: ClassBoxContent = { name: '', attributes: '', methods: '' }

/** Width in px of one line of text at a size, bold or regular. Optional: an estimate is used without it. */
export type FontMeasure = (line: string, fontSize: number, bold: boolean) => number

export function classBoxFont(fontSize: number, bold: boolean): string {
  return `${bold ? '700 ' : ''}${fontSize}px ${TEXT_FONT_FAMILY}`
}

export function normalizeClassBoxContent(content: ClassBoxContent): ClassBoxContent {
  return {
    name: normalizeText(content.name),
    attributes: normalizeText(content.attributes),
    methods: normalizeText(content.methods),
  }
}

export function isEmptyClassBox(content: ClassBoxContent): boolean {
  return !content.name.trim() && !content.attributes.trim() && !content.methods.trim()
}

export function sameClassBoxContent(a: ClassBoxContent | undefined, b: ClassBoxContent | undefined): boolean {
  return a?.name === b?.name && a?.attributes === b?.attributes && a?.methods === b?.methods
}

/** Lines of a compartment; an empty compartment still occupies one (blank) line of height. */
function compartmentLines(text: string): string[] {
  return splitTextLines(text)
}

const lineHeight = (fontSize: number) => fontSize * TEXT_LINE_HEIGHT

export type ClassBoxCompartment = {
  lines: string[]
  fontSize: number
  bold: boolean
  align: 'center' | 'left'
  /** Absolute y of each line's baseline. */
  baselines: number[]
  /** Absolute x where the line starts (left) or is centered (center). */
  anchorX: number
}

export type ClassBoxGeometry = {
  nameHeight: number
  attributesHeight: number
  methodsMinHeight: number
  /** Smallest box that shows all text without clipping. */
  minWidth: number
  minHeight: number
  /** Absolute y of the two compartment dividers. */
  dividerY: [number, number]
  name: ClassBoxCompartment
  attributes: ClassBoxCompartment
  methods: ClassBoxCompartment
}

function compartmentHeight(lines: string[], fontSize: number): number {
  return Math.max(1, lines.length) * lineHeight(fontSize) + CLASS_BOX_PADDING_Y * 2
}

function baselinesFor(top: number, lineCount: number, fontSize: number): number[] {
  const lh = lineHeight(fontSize)
  const halfLeading = (lh - fontSize) / 2
  return Array.from({ length: Math.max(1, lineCount) }, (_, index) => top + CLASS_BOX_PADDING_Y + index * lh + halfLeading + fontSize * BASELINE_IN_EM)
}

export function getClassBoxGeometry(box: Pick<RectangleObject, 'x' | 'y' | 'width' | 'height'>, content: ClassBoxContent, measure?: FontMeasure): ClassBoxGeometry {
  const nameLines = compartmentLines(content.name)
  const attributeLines = compartmentLines(content.attributes)
  const methodLines = compartmentLines(content.methods)
  const nameHeight = compartmentHeight(nameLines, CLASS_BOX_NAME_FONT_SIZE)
  const attributesHeight = compartmentHeight(attributeLines, CLASS_BOX_BODY_FONT_SIZE)
  const methodsMinHeight = compartmentHeight(methodLines, CLASS_BOX_BODY_FONT_SIZE)

  const width = (line: string, fontSize: number, bold: boolean) => (measure ? measure(line, fontSize, bold) : line.length * fontSize * ESTIMATED_GLYPH_EM)
  const widest = Math.max(
    ...nameLines.map((line) => width(line, CLASS_BOX_NAME_FONT_SIZE, true)),
    ...attributeLines.map((line) => width(line, CLASS_BOX_BODY_FONT_SIZE, false)),
    ...methodLines.map((line) => width(line, CLASS_BOX_BODY_FONT_SIZE, false)),
    0,
  )
  const minWidth = Math.max(CLASS_BOX_MIN_WIDTH, Math.ceil(widest + CLASS_BOX_PADDING_X * 2))
  const minHeight = Math.ceil(nameHeight + attributesHeight + methodsMinHeight)

  const dividerOne = box.y + nameHeight
  const dividerTwo = dividerOne + attributesHeight
  return {
    nameHeight,
    attributesHeight,
    methodsMinHeight,
    minWidth,
    minHeight,
    dividerY: [dividerOne, dividerTwo],
    name: { lines: nameLines, fontSize: CLASS_BOX_NAME_FONT_SIZE, bold: true, align: 'center', baselines: baselinesFor(box.y, nameLines.length, CLASS_BOX_NAME_FONT_SIZE), anchorX: box.x + box.width / 2 },
    attributes: { lines: attributeLines, fontSize: CLASS_BOX_BODY_FONT_SIZE, bold: false, align: 'left', baselines: baselinesFor(dividerOne, attributeLines.length, CLASS_BOX_BODY_FONT_SIZE), anchorX: box.x + CLASS_BOX_PADDING_X },
    methods: { lines: methodLines, fontSize: CLASS_BOX_BODY_FONT_SIZE, bold: false, align: 'left', baselines: baselinesFor(dividerTwo, methodLines.length, CLASS_BOX_BODY_FONT_SIZE), anchorX: box.x + CLASS_BOX_PADDING_X },
  }
}

export function createClassBox(
  id: number,
  centerX: number,
  centerY: number,
  content: ClassBoxContent,
  strokeColor: string,
  strokeWidth = CLASS_BOX_DEFAULT_STROKE_WIDTH,
  measure?: FontMeasure,
): RectangleObject {
  const clean = normalizeClassBoxContent(content)
  const geometry = getClassBoxGeometry({ x: 0, y: 0, width: 0, height: 0 }, clean, measure)
  return {
    kind: 'rectangle',
    id,
    x: centerX - geometry.minWidth / 2,
    y: centerY - geometry.minHeight / 2,
    width: geometry.minWidth,
    height: geometry.minHeight,
    strokeColor,
    strokeWidth,
    classBox: clean,
  }
}

/**
 * Applies new content to a rectangle and grows it (never shrinks it) to fit. Returns the new
 * bounds so callers can resize attached connectors with the existing rectangle-resize helper.
 */
export function fitClassBoxBounds(box: RectangleObject, content: ClassBoxContent, measure?: FontMeasure): { x: number; y: number; width: number; height: number } {
  const geometry = getClassBoxGeometry(box, normalizeClassBoxContent(content), measure)
  return { x: box.x, y: box.y, width: Math.max(box.width, geometry.minWidth), height: Math.max(box.height, geometry.minHeight) }
}

export { MAX_TEXT_LENGTH as CLASS_BOX_MAX_FIELD_LENGTH }
