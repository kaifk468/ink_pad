import type { ConnectorRelationshipType } from '../canvasModel'

export const COLORS = [
  { name: 'Ink black', value: '#202124' },
  { name: 'Cobalt blue', value: '#3568d4' },
  { name: 'Coral red', value: '#e45b55' },
  { name: 'Leaf green', value: '#38845b' },
  { name: 'Violet', value: '#8856c7' },
]
export const WIDTHS = [2, 4, 7, 11]
export const MIN_STROKE_WIDTH = 1
export const MAX_STROKE_WIDTH = 24
export const ERASER_SIZES = [14, 28, 48, 72]
export const SHAPE_HOLD_JITTER_PX = 7
export const PERFORMANCE_DIAGNOSTICS_ENABLED = import.meta.env.DEV
export const UML_CONNECTOR_TOOLS: Array<{ type: ConnectorRelationshipType; label: string }> = [
  { type: 'association', label: 'Association' },
  { type: 'directed-association', label: 'Directed association' },
  { type: 'inheritance', label: 'Inheritance' },
  { type: 'realization', label: 'Realization' },
  { type: 'aggregation', label: 'Aggregation' },
  { type: 'composition', label: 'Composition' },
  { type: 'dependency', label: 'Dependency' },
]

