/**
 * Canvas types (round 11): what a diagram's page is ruled with.
 *
 * Stored per diagram (like the template, spacing and sketchy style). The first three types are the existing `template`
 * field; the newer ones are the additive page field `canvas`, written together with the closest template so an older
 * InkPad still shows something similar (grid and isometric as dots, Cornell as lined). Unknown `canvas` values from a
 * newer InkPad are kept and drawn as the template.
 */
import type { PageTemplate } from './pageTemplates'

export type CanvasType = 'blank' | 'dotted' | 'lined' | 'grid' | 'isometric' | 'cornell'
export type ExtraCanvasType = Exclude<CanvasType, PageTemplate>

export const CANVAS_TYPES: ReadonlyArray<{ id: CanvasType; label: string; description: string }> = [
  { id: 'blank', label: 'Blank', description: 'Plain paper' },
  { id: 'dotted', label: 'Dots', description: 'Dot grid for boxes and arrows' },
  { id: 'lined', label: 'Lined', description: 'Ruled lines for handwritten notes' },
  { id: 'grid', label: 'Grid', description: 'Graph paper for LLD and tables' },
  { id: 'isometric', label: 'Isometric', description: 'Triangle dots for 3D sketches' },
  { id: 'cornell', label: 'Cornell', description: 'Cue column, notes and summary' },
]

const EXTRA: readonly ExtraCanvasType[] = ['grid', 'isometric', 'cornell']
const FALLBACK_TEMPLATE: Record<ExtraCanvasType, PageTemplate> = { grid: 'dotted', isometric: 'dotted', cornell: 'lined' }

export function isExtraCanvasType(value: unknown): value is ExtraCanvasType {
  return typeof value === 'string' && (EXTRA as readonly string[]).includes(value)
}

/** The type a diagram draws with: a known `canvas` wins, otherwise the template. */
export function effectiveCanvasType(template: PageTemplate, canvas: string | undefined): CanvasType {
  return isExtraCanvasType(canvas) ? canvas : template
}

/** The saved fields for a picked type. */
export function canvasFieldsFor(type: CanvasType): { template: PageTemplate; canvas: string | undefined } {
  return isExtraCanvasType(type) ? { template: FALLBACK_TEMPLATE[type], canvas: type } : { template: type, canvas: undefined }
}
